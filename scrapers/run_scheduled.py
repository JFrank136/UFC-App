import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Console output (log messages, notifier prints) uses emoji throughout, but
# Windows Task Scheduler runs this with a cp1252 console that can't encode
# them - reconfigure to UTF-8 so those prints/log lines don't crash the run.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR.parent / ".env")

DATA_DIR = BASE_DIR / "data"
STAGING_DIR = DATA_DIR / "staging"
LOGS_DIR = BASE_DIR / "logs"
SUPABASE_DIR = BASE_DIR / "supabase"
ERRORS_DIR = DATA_DIR / "errors"


@dataclass
class RunContext:
    task_name: str
    logger: logging.Logger
    log_file: Path
    summary: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def setup_logging(task_name: str) -> tuple[logging.Logger, Path]:
    LOGS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    log_file = LOGS_DIR / f"{timestamp}_{task_name}.log"

    logger = logging.getLogger(f"{task_name}_{timestamp}")
    logger.setLevel(logging.DEBUG)

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh.setFormatter(fmt)
    ch.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger, log_file


def backup_file(source: Path) -> Path:
    """Copy source to staging dir. Returns backup path (may not exist if source was missing)."""
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    backup = STAGING_DIR / f"{source.stem}_backup{source.suffix}"
    if source.exists():
        shutil.copy2(source, backup)
    return backup


def restore_file(backup: Path, destination: Path) -> bool:
    """Restore destination from backup. Returns False if backup does not exist."""
    if not backup.exists():
        return False
    shutil.copy2(backup, destination)
    return True


def run_script(
    script: Path, choice: Optional[str], logger: logging.Logger, timeout: int = 1800
) -> bool:
    """Run a Python script, capturing stdout/stderr to logger. Returns True on success."""
    logger.info(f"▶ Running {script.name}")
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        [sys.executable, str(script)],
        input=(choice + "\n") if choice else None,
        cwd=str(script.parent),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        env=env,
    )
    if result.stdout:
        logger.debug(result.stdout.rstrip())
    if result.stderr:
        logger.warning(result.stderr.rstrip())
    if result.returncode != 0:
        logger.error(f"{script.name} exited {result.returncode}")
        return False
    logger.info(f"✅ {script.name} complete")
    return True


def tail_log(log_file: Path, lines: int = 50) -> str:
    """Return the last N lines of a log file as a string."""
    try:
        all_lines = log_file.read_text(encoding="utf-8").splitlines()
        return "\n".join(all_lines[-lines:])
    except OSError:
        return ""


import notifier
import validator as validator
from validator import (
    validate_file,
    check_supabase_count,
    check_unmatched_fighters,
    save_unmatched_baseline,
)
from notifier import (
    send_email,
    format_failure_email,
    format_success_email,
    format_mismatch_email,
    format_crash_email,
)


def _validate_and_report(
    data_path: Path, backup_path: Optional[Path], ctx: RunContext
) -> bool:
    """Validate data_path. On warn-only failure, log and continue. On hard failure, restore and return False."""
    result = validate_file(data_path, backup_path)
    if result.warn_only and not result.passed:
        ctx.logger.warning(f"⚠️ {data_path.name}: {result.reason} (warn-only, continuing)")
        ctx.summary.append(f"⚠️ {data_path.name}: {result.reason}")
        return True
    if not result.passed:
        ctx.logger.error(f"❌ {data_path.name}: {result.reason}")
        ctx.errors.append(f"{data_path.name}: {result.reason}")
        if backup_path:
            restore_file(backup_path, data_path)
        return False
    ctx.logger.info(f"✅ {data_path.name}: {result.record_count} records")
    ctx.summary.append(f"✅ {data_path.name}: {result.record_count} records")
    return True


def _upload_with_guard(
    upload_script: Path, table: str, local_count: int, ctx: RunContext
) -> bool:
    """Run Supabase count pre-check, then execute upload script."""
    passed, reason = validator.check_supabase_count(table, local_count)
    ctx.logger.info(f"Pre-upload [{table}]: {reason}")
    if not passed:
        ctx.logger.error(f"❌ Upload blocked for {table}: {reason}")
        ctx.errors.append(reason)
        return False
    return run_script(upload_script, choice=None, logger=ctx.logger)


def run_roster(ctx: RunContext) -> bool:
    data_file = DATA_DIR / "ufc_fighters_raw.json"
    backup = backup_file(data_file)
    if not run_script(BASE_DIR / "scrape_roster.py", choice="1", logger=ctx.logger):
        restore_file(backup, data_file)
        ctx.errors.append("scrape_roster.py failed")
        return False
    return _validate_and_report(data_file, backup, ctx)


def run_rankings(ctx: RunContext) -> bool:
    data_file = DATA_DIR / "ufc_rankings.json"
    backup = backup_file(data_file)
    if not run_script(BASE_DIR / "scrape_rankings.py", choice="1", logger=ctx.logger):
        restore_file(backup, data_file)
        ctx.errors.append("scrape_rankings.py failed")
        return False
    if not _validate_and_report(data_file, backup, ctx):
        return False
    # ufc_rankings.json is a list of divisions, each with a nested fighters
    # list - the Supabase `rankings` table has one row per fighter, so the
    # pre-upload guard needs the flattened fighter count, not the division
    # count validate_file() returns.
    divisions = json.loads(data_file.read_text(encoding="utf-8"))
    fighter_count = sum(len(d.get("fighters", [])) for d in divisions)
    return _upload_with_guard(
        SUPABASE_DIR / "upload_rankings.py", "rankings", fighter_count, ctx
    )


def run_upcoming(ctx: RunContext) -> bool:
    data_file = DATA_DIR / "upcoming_fights.json"
    backup = backup_file(data_file)
    if not run_script(BASE_DIR / "scrape_upcoming_fights.py", choice="1", logger=ctx.logger):
        restore_file(backup, data_file)
        ctx.errors.append("scrape_upcoming_fights.py failed")
        return False
    if not _validate_and_report(data_file, backup, ctx):
        return False
    result = validate_file(data_file)
    return _upload_with_guard(
        SUPABASE_DIR / "upload_upcoming_fights.py", "upcoming_fights", result.record_count, ctx
    )


def run_weekly_fighters(ctx: RunContext) -> bool:
    # Step 1: scrape_details — continue with stale data on failure
    details_file = DATA_DIR / "ufc_details.json"
    details_backup = backup_file(details_file)
    if not run_script(
        BASE_DIR / "scrape_details.py", choice="1", logger=ctx.logger, timeout=7200
    ):
        ctx.logger.warning("scrape_details.py failed — keeping existing data")
        restore_file(details_backup, details_file)
    else:
        _validate_and_report(details_file, details_backup, ctx)

    # Step 2: scrape_tapology — continue with stale data on failure
    tapology_file = DATA_DIR / "tapology_fighters.json"
    tapology_backup = backup_file(tapology_file)
    # scrape_tapology.py prompts twice: top-level mode, then sequential/concurrent —
    # "1\n1" answers both (production mode, then sequential for unattended reliability)
    if not run_script(BASE_DIR / "scrape_tapology.py", choice="1\n1", logger=ctx.logger):
        ctx.logger.warning("scrape_tapology.py failed — keeping existing data")
        restore_file(tapology_backup, tapology_file)
    else:
        _validate_and_report(tapology_file, tapology_backup, ctx)

    # Step 3: merge — backup current outputs before overwriting
    fighters_file = DATA_DIR / "fighters.json"
    history_file = DATA_DIR / "fight_history.json"
    fighters_backup = backup_file(fighters_file)
    history_backup = backup_file(history_file)

    if not run_script(SUPABASE_DIR / "merge_fighters.py", choice=None, logger=ctx.logger):
        ctx.errors.append("merge_fighters.py failed")
        restore_file(fighters_backup, fighters_file)
        restore_file(history_backup, history_file)
        return False

    # Step 4: validate merge outputs (restore on failure to protect against accidental manual upload)
    fighters_result = validate_file(fighters_file, fighters_backup)
    if not fighters_result.passed:
        ctx.logger.error(f"❌ fighters.json: {fighters_result.reason}")
        ctx.errors.append(f"fighters.json: {fighters_result.reason}")
        restore_file(fighters_backup, fighters_file)
        restore_file(history_backup, history_file)
        return False
    ctx.summary.append(f"✅ fighters.json: {fighters_result.record_count} records")

    history_result = validate_file(history_file, history_backup)
    if not history_result.passed:
        ctx.logger.error(f"❌ fight_history.json: {history_result.reason}")
        ctx.errors.append(f"fight_history.json: {history_result.reason}")
        restore_file(history_backup, history_file)
        return False
    ctx.summary.append(f"✅ fight_history.json: {history_result.record_count} records")

    # Step 5: unmatched fighter check
    unmatched_path = ERRORS_DIR / "unmatched_fighters.txt"
    baseline_path = STAGING_DIR / "unmatched_baseline.json"
    new_mm, persistent_mm, blocked = check_unmatched_fighters(unmatched_path, baseline_path)
    total_mm = len(new_mm) + len(persistent_mm)
    if total_mm > 0:
        subject, body = format_mismatch_email(ctx.task_name, new_mm, persistent_mm, blocked)
        send_email(subject, body)
        ctx.logger.warning(f"⚠️ {total_mm} unmatched fighters ({len(new_mm)} new)")
        if blocked:
            ctx.errors.append(f"Upload blocked: {total_mm} unmatched fighters (threshold 25)")
            return False
    save_unmatched_baseline(new_mm + persistent_mm, baseline_path)

    # Step 6: upload with pre-check
    fighters_ok = _upload_with_guard(
        SUPABASE_DIR / "upload_fighters.py", "fighters", fighters_result.record_count, ctx
    )
    history_ok = _upload_with_guard(
        SUPABASE_DIR / "upload_fight_history.py", "fight_history", history_result.record_count, ctx
    )
    return fighters_ok and history_ok


TASK_MAP = {
    "roster": run_roster,
    "rankings": run_rankings,
    "upcoming": run_upcoming,
    "weekly_fighters": run_weekly_fighters,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="UFC pipeline scheduled runner")
    parser.add_argument("--task", required=True, choices=list(TASK_MAP.keys()))
    args = parser.parse_args()

    logger, log_file = setup_logging(args.task)
    ctx = RunContext(task_name=args.task, logger=logger, log_file=log_file)
    logger.info(f"=== Starting task: {args.task} ===")

    try:
        success = TASK_MAP[args.task](ctx)
    except Exception:
        tb = traceback.format_exc()
        logger.error(f"Unhandled exception:\n{tb}")
        subject, body = format_crash_email(args.task, tb)
        notifier.send_email(subject, body)
        sys.exit(1)

    log_tail = tail_log(log_file)
    if success:
        subject, body = format_success_email(args.task, "\n".join(ctx.summary))
        notifier.send_email(subject, body)
        logger.info(f"=== Task {args.task} completed successfully ===")
    else:
        reason = "\n".join(ctx.errors) or "Unknown failure"
        subject, body = format_failure_email(args.task, reason, log_tail)
        notifier.send_email(subject, body)
        logger.error(f"=== Task {args.task} FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
