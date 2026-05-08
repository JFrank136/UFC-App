import argparse
import logging
import shutil
import subprocess
import sys
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

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


def run_script(script: Path, choice: Optional[str], logger: logging.Logger) -> bool:
    """Run a Python script, capturing stdout/stderr to logger. Returns True on success."""
    logger.info(f"▶ Running {script.name}")
    result = subprocess.run(
        [sys.executable, str(script)],
        input=(choice + "\n") if choice else None,
        cwd=str(script.parent),
        text=True,
        capture_output=True,
        timeout=1800,
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
    result = validate_file(data_file)
    return _upload_with_guard(
        SUPABASE_DIR / "upload_rankings.py", "rankings", result.record_count, ctx
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
