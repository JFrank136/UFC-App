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
