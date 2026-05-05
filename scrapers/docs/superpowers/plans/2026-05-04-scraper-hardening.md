# Scraper Pipeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backup/validate/notify/schedule automation to the UFC scraper pipeline without modifying any existing scripts.

**Architecture:** Each automated run calls `run_scheduled.py --task <name>`, which backs up current data files, runs the relevant scrapers, validates output against count/schema thresholds, and emails results. A pre-upload Supabase count check prevents the delete-then-upload pattern from wiping production data with bad output. All existing scripts run unchanged for manual use.

**Tech Stack:** Python 3.x, smtplib (stdlib), pytest, requests (already installed), python-dotenv (already installed), Windows Task Scheduler (PowerShell)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `scrapers/notifier.py` | Email sending via Gmail SMTP + email formatters |
| Create | `scrapers/validator.py` | File count/schema/drop checks, Supabase pre-check, unmatched tracking |
| Create | `scrapers/run_scheduled.py` | Backup/restore, subprocess runner, four task functions, main CLI entry |
| Create | `scrapers/tests/__init__.py` | Empty package marker |
| Create | `scrapers/tests/conftest.py` | sys.path setup so test imports resolve |
| Create | `scrapers/tests/test_notifier.py` | Tests for notifier.py |
| Create | `scrapers/tests/test_validator.py` | Tests for validator.py |
| Create | `scrapers/tests/test_run_scheduled.py` | Tests for run_scheduled.py |
| Create/Update | `scrapers/.gitignore` | Exclude logs/ and data/staging/ |

---

### Task 1: Scaffold — directories, .gitignore, pytest

**Files:**
- Create: `scrapers/tests/__init__.py`
- Create: `scrapers/tests/conftest.py`
- Create: `scrapers/.gitignore`

- [ ] **Step 1: Install pytest**

```powershell
.venv\Scripts\pip.exe install pytest
```

Expected output ends with: `Successfully installed pytest-...`

- [ ] **Step 2: Create test package**

Create `scrapers/tests/__init__.py` as an empty file.

Create `scrapers/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
```

- [ ] **Step 3: Create .gitignore**

Create `scrapers/.gitignore`:

```
logs/
data/staging/
__pycache__/
*.pyc
```

- [ ] **Step 4: Create log and staging directories**

```powershell
New-Item -ItemType Directory -Force -Path scrapers\logs
New-Item -ItemType Directory -Force -Path scrapers\data\staging
```

- [ ] **Step 5: Verify pytest runs**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/ -v
```

Expected: `no tests ran`, exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add scrapers/tests/ scrapers/.gitignore scrapers/logs/.gitkeep scrapers/data/staging/.gitkeep
git commit -m "chore: scaffold test directory and gitignore for pipeline hardening"
```

---

### Task 2: notifier.py — email via Gmail SMTP

**Files:**
- Create: `scrapers/notifier.py`
- Create: `scrapers/tests/test_notifier.py`

- [ ] **Step 1: Write failing tests**

Create `scrapers/tests/test_notifier.py`:

```python
import pytest
from unittest.mock import patch, MagicMock


def test_send_email_skips_when_not_configured(monkeypatch):
    monkeypatch.delenv("NOTIFY_EMAIL_FROM", raising=False)
    monkeypatch.delenv("NOTIFY_EMAIL_TO", raising=False)
    monkeypatch.delenv("NOTIFY_EMAIL_APP_PASSWORD", raising=False)
    from notifier import send_email
    assert send_email("Subject", "Body") is False


def test_send_email_success(monkeypatch):
    monkeypatch.setenv("NOTIFY_EMAIL_FROM", "from@gmail.com")
    monkeypatch.setenv("NOTIFY_EMAIL_TO", "to@gmail.com")
    monkeypatch.setenv("NOTIFY_EMAIL_APP_PASSWORD", "app_pass")
    mock_server = MagicMock()
    with patch("smtplib.SMTP_SSL") as mock_cls:
        mock_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_cls.return_value.__exit__ = MagicMock(return_value=False)
        from notifier import send_email
        result = send_email("Subject", "Body")
    assert result is True
    mock_server.login.assert_called_once_with("from@gmail.com", "app_pass")


def test_format_failure_email():
    from notifier import format_failure_email
    subject, body = format_failure_email("rankings", "Count dropped 50%", "log line 1\nlog line 2")
    assert "FAILED" in subject
    assert "rankings" in subject
    assert "Count dropped 50%" in body
    assert "log line 1" in body


def test_format_mismatch_email_blocked():
    from notifier import format_mismatch_email
    subject, body = format_mismatch_email(
        "weekly_fighters",
        new_mismatches=["Fighter A"],
        persistent_mismatches=["Fighter B"] * 25,
        blocked=True,
    )
    assert "weekly_fighters" in subject
    assert "Fighter A" in body
    assert "New this run" in body
    assert "Persistent" in body
    assert "Upload blocked" in body


def test_format_mismatch_email_informational():
    from notifier import format_mismatch_email
    subject, body = format_mismatch_email(
        "weekly_fighters",
        new_mismatches=["Fighter A"],
        persistent_mismatches=["Fighter B"],
        blocked=False,
    )
    assert "Upload proceeded" in body


def test_format_success_email():
    from notifier import format_success_email
    subject, body = format_success_email("upcoming", "500 fights loaded")
    assert "upcoming" in subject
    assert "✅" in subject
    assert "500 fights loaded" in body


def test_format_crash_email():
    from notifier import format_crash_email
    subject, body = format_crash_email("rankings", "Traceback...\nValueError: bad value")
    assert "CRASH" in subject
    assert "ValueError" in body
```

- [ ] **Step 2: Run tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_notifier.py -v
```

Expected: `ModuleNotFoundError: No module named 'notifier'`

- [ ] **Step 3: Create notifier.py**

Create `scrapers/notifier.py`:

```python
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_email(subject: str, body: str) -> bool:
    """Send email via Gmail SMTP. Returns True on success, False if not configured or send fails."""
    from_addr = os.getenv("NOTIFY_EMAIL_FROM")
    to_addr = os.getenv("NOTIFY_EMAIL_TO")
    app_password = os.getenv("NOTIFY_EMAIL_APP_PASSWORD")

    if not all([from_addr, to_addr, app_password]):
        print("⚠️  Email not configured — skipping notification")
        return False

    msg = MIMEMultipart()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(from_addr, app_password)
            server.send_message(msg)
        print(f"✅ Email sent: {subject}")
        return True
    except Exception as e:
        print(f"❌ Email send failed: {e}")
        return False


def format_failure_email(task_name: str, reason: str, log_tail: str) -> tuple[str, str]:
    subject = f"[UFC Pipeline] ❌ FAILED — {task_name}"
    body = f"Task: {task_name}\n\nFailure reason:\n{reason}\n\nLast log output:\n{log_tail}"
    return subject, body


def format_success_email(task_name: str, summary: str) -> tuple[str, str]:
    subject = f"[UFC Pipeline] ✅ {task_name} complete"
    body = f"Task: {task_name}\n\n{summary}"
    return subject, body


def format_mismatch_email(
    task_name: str,
    new_mismatches: list[str],
    persistent_mismatches: list[str],
    blocked: bool,
) -> tuple[str, str]:
    total = len(new_mismatches) + len(persistent_mismatches)
    subject = f"[UFC Pipeline] ⚠️ {total} unmatched fighters — {task_name}"

    lines = [f"Task: {task_name}", f"Total unmatched: {total}", ""]

    if new_mismatches:
        lines.append(f"New this run ({len(new_mismatches)}):")
        for name in new_mismatches:
            lines.append(f"  - {name}")
        lines.append("")

    if persistent_mismatches:
        lines.append(f"Persistent ({len(persistent_mismatches)}):")
        for name in persistent_mismatches:
            lines.append(f"  - {name}")
        lines.append("")

    if blocked:
        lines.append(
            "Upload blocked. Add new fighters to utils/name_fixes.py and re-run merge manually."
        )
    else:
        lines.append(
            "Upload proceeded with UFC-only data. Add new fighters to utils/name_fixes.py when convenient."
        )

    return subject, "\n".join(lines)


def format_crash_email(task_name: str, traceback_str: str) -> tuple[str, str]:
    subject = f"[UFC Pipeline] 💥 CRASH — {task_name}"
    body = f"Task: {task_name}\n\nUnhandled exception:\n\n{traceback_str}"
    return subject, body
```

- [ ] **Step 4: Run tests — verify they pass**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_notifier.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/notifier.py scrapers/tests/test_notifier.py
git commit -m "feat: add email notifier with Gmail SMTP support"
```

---

### Task 3: validator.py — file count, drop, and schema checks

**Files:**
- Create: `scrapers/validator.py`
- Create: `scrapers/tests/test_validator.py`

- [ ] **Step 1: Write failing tests**

Create `scrapers/tests/test_validator.py`:

```python
import json
import pytest
from pathlib import Path


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data), encoding="utf-8")


def test_passes_for_valid_ufc_details(tmp_path):
    f = tmp_path / "ufc_details.json"
    write_json(f, [{"id": f"u{i}", "name": f"F {i}"} for i in range(200)])
    from validator import validate_file
    r = validate_file(f)
    assert r.passed is True
    assert r.record_count == 200


def test_fails_below_min_records(tmp_path):
    f = tmp_path / "ufc_details.json"
    write_json(f, [{"id": "u1", "name": "F1"}])
    from validator import validate_file
    r = validate_file(f)
    assert r.passed is False
    assert "Too few records" in r.reason


def test_fails_on_count_drop_above_threshold(tmp_path):
    f = tmp_path / "ufc_details.json"
    b = tmp_path / "ufc_details_backup.json"
    write_json(b, [{"id": f"u{i}", "name": f"F {i}"} for i in range(500)])
    write_json(f, [{"id": f"u{i}", "name": f"F {i}"} for i in range(200)])
    from validator import validate_file
    r = validate_file(f, b)
    assert r.passed is False
    assert "dropped" in r.reason


def test_passes_when_count_drop_within_threshold(tmp_path):
    f = tmp_path / "ufc_details.json"
    b = tmp_path / "ufc_details_backup.json"
    write_json(b, [{"id": f"u{i}", "name": f"F {i}"} for i in range(500)])
    write_json(f, [{"id": f"u{i}", "name": f"F {i}"} for i in range(410)])
    from validator import validate_file
    r = validate_file(f, b)
    assert r.passed is True


def test_fails_on_missing_required_field(tmp_path):
    f = tmp_path / "fighters.json"
    data = [{"id": f"u{i}", "name": f"F {i}"} for i in range(100)]
    data.append({"id": "bad-row"})  # missing name
    write_json(f, data)
    from validator import validate_file
    r = validate_file(f)
    assert r.passed is False
    assert "missing required fields" in r.reason


def test_upcoming_fights_warns_only_when_empty(tmp_path):
    f = tmp_path / "upcoming_fights.json"
    write_json(f, [])
    from validator import validate_file
    r = validate_file(f)
    assert r.warn_only is True
    assert r.passed is False


def test_unknown_file_passes_without_check(tmp_path):
    f = tmp_path / "random_file.json"
    write_json(f, [])
    from validator import validate_file
    r = validate_file(f)
    assert r.passed is True


def test_missing_file_fails(tmp_path):
    from validator import validate_file
    r = validate_file(tmp_path / "ufc_details.json")
    assert r.passed is False
    assert "not found" in r.reason


def test_invalid_json_fails(tmp_path):
    f = tmp_path / "ufc_details.json"
    f.write_text("{not json", encoding="utf-8")
    from validator import validate_file
    r = validate_file(f)
    assert r.passed is False
    assert "Invalid JSON" in r.reason


def test_fight_history_fails_on_null_fighter_id(tmp_path):
    f = tmp_path / "fight_history.json"
    data = [{"fighter_id": f"u{i}", "opponent": "Opp"} for i in range(1000)]
    data.append({"fighter_id": None, "opponent": "Bad"})
    write_json(f, data)
    from validator import validate_file
    r = validate_file(f)
    assert r.passed is False
    assert "missing required fields" in r.reason
```

- [ ] **Step 2: Run tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_validator.py -v
```

Expected: `ModuleNotFoundError: No module named 'validator'`

- [ ] **Step 3: Create validator.py**

Create `scrapers/validator.py`:

```python
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

THRESHOLDS: dict = {
    "ufc_fighters_raw.json": {
        "min_records": 100,
        "max_drop_pct": 20,
        "required_fields": ["id", "name"],
        "warn_only": False,
    },
    "ufc_details.json": {
        "min_records": 100,
        "max_drop_pct": 20,
        "required_fields": ["id", "name"],
        "warn_only": False,
    },
    "tapology_fighters.json": {
        "min_records": 100,
        "max_drop_pct": 20,
        "required_fields": ["name"],
        "warn_only": False,
    },
    "ufc_rankings.json": {
        "min_records": 10,
        "max_drop_pct": 30,
        "required_fields": [],
        "warn_only": False,
    },
    "upcoming_fights.json": {
        "min_records": 1,
        "max_drop_pct": None,
        "required_fields": [],
        "warn_only": True,
    },
    "fighters.json": {
        "min_records": 100,
        "max_drop_pct": 10,
        "required_fields": ["id", "name"],
        "warn_only": False,
    },
    "fight_history.json": {
        "min_records": 1000,
        "max_drop_pct": 20,
        "required_fields": ["fighter_id"],
        "warn_only": False,
    },
}


@dataclass
class ValidationResult:
    passed: bool
    warn_only: bool = False
    reason: str = ""
    record_count: int = 0
    previous_count: int = 0


def validate_file(
    data_path: Path, backup_path: Optional[Path] = None
) -> ValidationResult:
    """Validate a data file against defined thresholds."""
    cfg = THRESHOLDS.get(data_path.name)
    if cfg is None:
        return ValidationResult(passed=True, reason=f"No thresholds for {data_path.name}")

    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ValidationResult(passed=False, reason=f"File not found: {data_path}")
    except json.JSONDecodeError as e:
        return ValidationResult(passed=False, reason=f"Invalid JSON in {data_path.name}: {e}")

    if not isinstance(data, list):
        return ValidationResult(
            passed=False, reason=f"Expected JSON array, got {type(data).__name__}"
        )

    count = len(data)

    if count < cfg["min_records"]:
        return ValidationResult(
            passed=cfg["warn_only"],
            warn_only=cfg["warn_only"],
            reason=f"Too few records: {count} (minimum {cfg['min_records']})",
            record_count=count,
        )

    previous_count = 0
    if backup_path and backup_path.exists() and cfg["max_drop_pct"] is not None:
        try:
            prev = json.loads(backup_path.read_text(encoding="utf-8"))
            previous_count = len(prev) if isinstance(prev, list) else 0
            if previous_count > 0:
                drop_pct = (previous_count - count) / previous_count * 100
                if drop_pct > cfg["max_drop_pct"]:
                    return ValidationResult(
                        passed=cfg["warn_only"],
                        warn_only=cfg["warn_only"],
                        reason=(
                            f"Count dropped {drop_pct:.1f}% "
                            f"(was {previous_count}, now {count}), "
                            f"threshold {cfg['max_drop_pct']}%"
                        ),
                        record_count=count,
                        previous_count=previous_count,
                    )
        except (json.JSONDecodeError, OSError):
            pass

    required = cfg["required_fields"]
    if required:
        bad = [
            i
            for i, row in enumerate(data)
            if not isinstance(row, dict) or any(not row.get(f) for f in required)
        ]
        if bad:
            return ValidationResult(
                passed=False,
                reason=f"{len(bad)} rows missing required fields {required}",
                record_count=count,
                previous_count=previous_count,
            )

    return ValidationResult(
        passed=True,
        warn_only=cfg["warn_only"],
        record_count=count,
        previous_count=previous_count,
    )
```

- [ ] **Step 4: Run tests — verify they pass**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_validator.py -v
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/validator.py scrapers/tests/test_validator.py
git commit -m "feat: add file validator with count, drop, and schema checks"
```

---

### Task 4: validator.py — Supabase pre-upload count check

**Files:**
- Modify: `scrapers/validator.py` (append functions)
- Modify: `scrapers/tests/test_validator.py` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `scrapers/tests/test_validator.py`:

```python
from unittest.mock import patch


def test_check_supabase_count_passes_when_ratio_ok(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    with patch("validator._fetch_supabase_count", return_value=400):
        from validator import check_supabase_count
        passed, _ = check_supabase_count("fighters", 380)
    assert passed is True


def test_check_supabase_count_blocks_on_large_drop(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    with patch("validator._fetch_supabase_count", return_value=400):
        from validator import check_supabase_count
        passed, reason = check_supabase_count("fighters", 100)
    assert passed is False
    assert "70%" in reason


def test_check_supabase_count_skips_when_not_configured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_HOST", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    from validator import check_supabase_count
    passed, reason = check_supabase_count("fighters", 100)
    assert passed is True
    assert "not configured" in reason


def test_check_supabase_count_skips_when_fetch_fails(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    with patch("validator._fetch_supabase_count", return_value=None):
        from validator import check_supabase_count
        passed, _ = check_supabase_count("fighters", 100)
    assert passed is True


def test_check_supabase_count_allows_first_upload(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    with patch("validator._fetch_supabase_count", return_value=0):
        from validator import check_supabase_count
        passed, _ = check_supabase_count("fighters", 400)
    assert passed is True
```

- [ ] **Step 2: Run new tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_validator.py -v -k "supabase"
```

Expected: `ImportError` for `check_supabase_count`.

- [ ] **Step 3: Append Supabase functions to validator.py**

Append to `scrapers/validator.py`:

```python
_HTTP_TIMEOUT = 10


def _get_supabase_url() -> Optional[str]:
    url = os.getenv("SUPABASE_URL")
    if url:
        return url.rstrip("/")
    host = os.getenv("SUPABASE_DB_HOST", "")
    if host.startswith("db.") and host.endswith(".supabase.co"):
        ref = host[len("db."): -len(".supabase.co")]
        return f"https://{ref}.supabase.co"
    return None


def _get_supabase_headers() -> Optional[dict]:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Prefer": "count=exact",
    }


def _fetch_supabase_count(supabase_url: str, headers: dict, table: str) -> Optional[int]:
    try:
        resp = requests.head(
            f"{supabase_url}/rest/v1/{table}",
            headers=headers,
            params={"select": "id"},
            timeout=_HTTP_TIMEOUT,
        )
        if resp.status_code not in (200, 204):
            return None
        cr = resp.headers.get("Content-Range", "")
        if "/" not in cr:
            return None
        return int(cr.split("/")[-1])
    except Exception:
        return None


def check_supabase_count(table: str, local_count: int) -> tuple[bool, str]:
    """
    Verify local_count is at least 70% of the live Supabase row count.
    Returns (passed, reason). Passes automatically when Supabase is unreachable.
    """
    supabase_url = _get_supabase_url()
    headers = _get_supabase_headers()

    if not supabase_url or not headers:
        return True, "Supabase not configured — skipping pre-upload check"

    remote = _fetch_supabase_count(supabase_url, headers, table)
    if remote is None:
        return True, f"Could not fetch {table} count from Supabase — skipping check"
    if remote == 0:
        return True, f"{table} is empty in Supabase (first upload)"

    ratio = local_count / remote
    if ratio < 0.70:
        return False, (
            f"Local {table} has {local_count} records but Supabase has {remote} "
            f"({ratio * 100:.1f}%). Threshold is 70%. Upload aborted to protect live data."
        )
    return True, f"{table}: local={local_count}, remote={remote} ({ratio * 100:.1f}%)"
```

- [ ] **Step 4: Run all validator tests**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_validator.py -v
```

Expected: all 15 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/validator.py scrapers/tests/test_validator.py
git commit -m "feat: add Supabase pre-upload count check to validator"
```

---

### Task 5: validator.py — unmatched fighter tracking

**Files:**
- Modify: `scrapers/validator.py` (append functions)
- Modify: `scrapers/tests/test_validator.py` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `scrapers/tests/test_validator.py`:

```python
def test_check_unmatched_splits_new_vs_persistent(tmp_path):
    unmatched = tmp_path / "unmatched_fighters.txt"
    baseline = tmp_path / "baseline.json"
    unmatched.write_text(
        "Unmatched UFC fighters\nGenerated: merge_fighters.py\nTotal unmatched: 3\n\n"
        "  1. Fighter A\n  2. Fighter B\n  3. Fighter C\n",
        encoding="utf-8",
    )
    baseline.write_text(json.dumps(["Fighter A", "Fighter B"]), encoding="utf-8")
    from validator import check_unmatched_fighters
    new, persistent, block = check_unmatched_fighters(unmatched, baseline)
    assert new == ["Fighter C"]
    assert sorted(persistent) == ["Fighter A", "Fighter B"]
    assert block is False


def test_check_unmatched_blocks_above_25(tmp_path):
    unmatched = tmp_path / "unmatched_fighters.txt"
    baseline = tmp_path / "baseline.json"
    lines = "\n".join(f"  {i + 1}. Fighter {i}" for i in range(26))
    unmatched.write_text(f"Header\nGenerated\nTotal\n\n{lines}\n", encoding="utf-8")
    baseline.write_text("[]", encoding="utf-8")
    from validator import check_unmatched_fighters
    new, _, block = check_unmatched_fighters(unmatched, baseline)
    assert block is True
    assert len(new) == 26


def test_check_unmatched_no_file_returns_empty(tmp_path):
    from validator import check_unmatched_fighters
    new, persistent, block = check_unmatched_fighters(
        tmp_path / "missing.txt", tmp_path / "baseline.json"
    )
    assert new == [] and persistent == [] and block is False


def test_save_unmatched_baseline_writes_sorted_json(tmp_path):
    baseline = tmp_path / "baseline.json"
    from validator import save_unmatched_baseline
    save_unmatched_baseline(["Fighter B", "Fighter A"], baseline)
    assert json.loads(baseline.read_text()) == ["Fighter A", "Fighter B"]
```

- [ ] **Step 2: Run new tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_validator.py -v -k "unmatched"
```

Expected: `ImportError` for `check_unmatched_fighters`.

- [ ] **Step 3: Append unmatched tracking functions to validator.py**

Append to `scrapers/validator.py`:

```python
def _read_unmatched_file(path: Path) -> list[str]:
    """Parse the numbered list in unmatched_fighters.txt, skipping header lines."""
    names = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and line[0].isdigit() and ". " in line:
                _, name = line.split(". ", 1)
                name = name.strip()
                if name:
                    names.append(name)
    return names


def check_unmatched_fighters(
    unmatched_path: Path,
    baseline_path: Path,
) -> tuple[list[str], list[str], bool]:
    """
    Compare unmatched_fighters.txt against the saved baseline.
    Returns (new_names, persistent_names, should_block).
    should_block is True when total unmatched > 25.
    """
    if not unmatched_path.exists():
        return [], [], False

    current = set(_read_unmatched_file(unmatched_path))

    previous: set[str] = set()
    if baseline_path.exists():
        try:
            previous = set(json.loads(baseline_path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass

    new_names = sorted(current - previous)
    persistent_names = sorted(current & previous)
    return new_names, persistent_names, len(current) > 25


def save_unmatched_baseline(names: list[str], baseline_path: Path) -> None:
    """Persist the current unmatched names as the baseline for the next run."""
    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    baseline_path.write_text(json.dumps(sorted(names)), encoding="utf-8")
```

- [ ] **Step 4: Run all validator tests**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_validator.py -v
```

Expected: all 19 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/validator.py scrapers/tests/test_validator.py
git commit -m "feat: add unmatched fighter tracking to validator"
```

---

### Task 6: run_scheduled.py — utilities (logging, backup/restore, subprocess runner)

**Files:**
- Create: `scrapers/run_scheduled.py`
- Create: `scrapers/tests/test_run_scheduled.py`

- [ ] **Step 1: Write failing tests**

Create `scrapers/tests/test_run_scheduled.py`:

```python
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock


def test_backup_file_copies_existing_file(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "STAGING_DIR", tmp_path / "staging")
    src = tmp_path / "ufc_details.json"
    src.write_text('[{"id": "1", "name": "A"}]', encoding="utf-8")
    backup = run_scheduled.backup_file(src)
    assert backup.exists()
    assert json.loads(backup.read_text()) == [{"id": "1", "name": "A"}]


def test_backup_file_returns_path_when_source_missing(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "STAGING_DIR", tmp_path / "staging")
    backup = run_scheduled.backup_file(tmp_path / "missing.json")
    assert not backup.exists()


def test_restore_file_copies_backup_to_destination(tmp_path):
    from run_scheduled import restore_file
    backup = tmp_path / "backup.json"
    dest = tmp_path / "live.json"
    backup.write_text('[{"id": "1"}]', encoding="utf-8")
    assert restore_file(backup, dest) is True
    assert dest.read_text() == '[{"id": "1"}]'


def test_restore_file_returns_false_when_no_backup(tmp_path):
    from run_scheduled import restore_file
    assert restore_file(tmp_path / "no_backup.json", tmp_path / "dest.json") is False


def test_run_script_returns_true_on_success(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "LOGS_DIR", tmp_path / "logs")
    logger, _ = run_scheduled.setup_logging("test")
    script = tmp_path / "ok.py"
    script.write_text('print("hello")\n', encoding="utf-8")
    assert run_scheduled.run_script(script, choice=None, logger=logger) is True


def test_run_script_returns_false_on_nonzero_exit(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "LOGS_DIR", tmp_path / "logs")
    logger, _ = run_scheduled.setup_logging("test")
    script = tmp_path / "fail.py"
    script.write_text("import sys; sys.exit(1)\n", encoding="utf-8")
    assert run_scheduled.run_script(script, choice=None, logger=logger) is False


def test_run_script_passes_choice_as_stdin(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "LOGS_DIR", tmp_path / "logs")
    logger, _ = run_scheduled.setup_logging("test")
    out_file = tmp_path / "choice.txt"
    script = tmp_path / "read_choice.py"
    script.write_text(
        f"line = input()\nopen(r'{out_file}', 'w').write(line)\n",
        encoding="utf-8",
    )
    run_scheduled.run_script(script, choice="3", logger=logger)
    assert out_file.read_text() == "3"


def test_tail_log_returns_last_n_lines(tmp_path):
    import run_scheduled
    log = tmp_path / "run.log"
    log.write_text("\n".join(f"line {i}" for i in range(100)), encoding="utf-8")
    tail = run_scheduled.tail_log(log, lines=10)
    lines = tail.strip().splitlines()
    assert len(lines) == 10
    assert lines[-1] == "line 99"
```

- [ ] **Step 2: Run tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_run_scheduled.py -v
```

Expected: `ModuleNotFoundError: No module named 'run_scheduled'`

- [ ] **Step 3: Create run_scheduled.py with utility functions**

Create `scrapers/run_scheduled.py`:

```python
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
```

- [ ] **Step 4: Run tests — verify they pass**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_run_scheduled.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/run_scheduled.py scrapers/tests/test_run_scheduled.py
git commit -m "feat: add run_scheduled utilities — logging, backup/restore, subprocess runner"
```

---

### Task 7: run_scheduled.py — roster, rankings, and upcoming task functions

**Files:**
- Modify: `scrapers/run_scheduled.py` (append)
- Modify: `scrapers/tests/test_run_scheduled.py` (append)

- [ ] **Step 1: Write failing tests**

Append to `scrapers/tests/test_run_scheduled.py`:

```python
def _setup_dirs(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "BASE_DIR", tmp_path)
    monkeypatch.setattr(run_scheduled, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(run_scheduled, "STAGING_DIR", tmp_path / "data" / "staging")
    monkeypatch.setattr(run_scheduled, "SUPABASE_DIR", tmp_path / "supabase")
    monkeypatch.setattr(run_scheduled, "ERRORS_DIR", tmp_path / "data" / "errors")
    monkeypatch.setattr(run_scheduled, "LOGS_DIR", tmp_path / "logs")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data" / "errors").mkdir(exist_ok=True)
    (tmp_path / "supabase").mkdir(exist_ok=True)


def _make_ctx(tmp_path) -> "run_scheduled.RunContext":
    import run_scheduled
    logger, log_file = run_scheduled.setup_logging("test")
    return run_scheduled.RunContext("test", logger, log_file)


def test_run_roster_fails_and_restores_when_scraper_crashes(tmp_path, monkeypatch):
    import run_scheduled
    _setup_dirs(tmp_path, monkeypatch)

    original = [{"id": f"u{i}", "name": f"F {i}"} for i in range(200)]
    data_file = tmp_path / "data" / "ufc_fighters_raw.json"
    data_file.write_text(json.dumps(original), encoding="utf-8")

    fail_script = tmp_path / "scrape_roster.py"
    fail_script.write_text("import sys; sys.exit(1)", encoding="utf-8")

    ctx = _make_ctx(tmp_path)
    result = run_scheduled.run_roster(ctx)

    assert result is False
    assert ctx.errors
    assert json.loads(data_file.read_text()) == original  # restored


def test_run_rankings_uploads_on_success(tmp_path, monkeypatch):
    import run_scheduled
    _setup_dirs(tmp_path, monkeypatch)

    rankings = [{"id": f"u{i}", "name": f"F {i}"} for i in range(50)]
    data_file = tmp_path / "data" / "ufc_rankings.json"

    scraper = tmp_path / "scrape_rankings.py"
    scraper.write_text(
        f"import json, pathlib\n"
        f"pathlib.Path(r'{data_file}').write_text(json.dumps({rankings!r}))\n",
        encoding="utf-8",
    )
    upload = tmp_path / "supabase" / "upload_rankings.py"
    upload.write_text('print("uploaded")\n', encoding="utf-8")

    ctx = _make_ctx(tmp_path)
    with patch("validator.check_supabase_count", return_value=(True, "ok")):
        result = run_scheduled.run_rankings(ctx)

    assert result is True


def test_run_upcoming_proceeds_with_warn_only_validation(tmp_path, monkeypatch):
    import run_scheduled
    _setup_dirs(tmp_path, monkeypatch)

    data_file = tmp_path / "data" / "upcoming_fights.json"

    scraper = tmp_path / "scrape_upcoming_fights.py"
    scraper.write_text(
        f"import json, pathlib\n"
        f"pathlib.Path(r'{data_file}').write_text('[]')\n",  # empty — warn only
        encoding="utf-8",
    )
    upload = tmp_path / "supabase" / "upload_upcoming_fights.py"
    upload.write_text('print("uploaded")\n', encoding="utf-8")

    ctx = _make_ctx(tmp_path)
    with patch("validator.check_supabase_count", return_value=(True, "ok")):
        result = run_scheduled.run_upcoming(ctx)

    assert result is True  # warn-only does not block
    assert any("⚠️" in s for s in ctx.summary)
```

- [ ] **Step 2: Run new tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_run_scheduled.py -v -k "roster or rankings or upcoming"
```

Expected: `AttributeError` — `run_roster` not defined.

- [ ] **Step 3: Append shared helpers and three task functions to run_scheduled.py**

Append to `scrapers/run_scheduled.py`:

```python
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
    passed, reason = check_supabase_count(table, local_count)
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
```

- [ ] **Step 4: Run all tests**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/run_scheduled.py scrapers/tests/test_run_scheduled.py
git commit -m "feat: add roster, rankings, and upcoming task runners"
```

---

### Task 8: run_scheduled.py — weekly_fighters task and main entry point

**Files:**
- Modify: `scrapers/run_scheduled.py` (append)
- Modify: `scrapers/tests/test_run_scheduled.py` (append)

- [ ] **Step 1: Write failing tests**

Append to `scrapers/tests/test_run_scheduled.py`:

```python
def test_run_weekly_fighters_blocks_upload_when_merge_output_too_small(tmp_path, monkeypatch):
    import run_scheduled
    _setup_dirs(tmp_path, monkeypatch)

    for name, script_name in [
        ("ufc_details.json", "scrape_details.py"),
        ("tapology_fighters.json", "scrape_tapology.py"),
    ]:
        data = [{"id": f"u{i}", "name": f"F {i}"} for i in range(200)]
        (tmp_path / "data" / name).write_text(json.dumps(data), encoding="utf-8")
        s = tmp_path / script_name
        s.write_text('print("ok")', encoding="utf-8")

    fighters_path = tmp_path / "data" / "fighters.json"
    history_path = tmp_path / "data" / "fight_history.json"
    merge = tmp_path / "supabase" / "merge_fighters.py"
    tiny = [{"id": f"u{i}", "name": f"F {i}"} for i in range(5)]
    merge.write_text(
        f"import json, pathlib\n"
        f"pathlib.Path(r'{fighters_path}').write_text(json.dumps({tiny!r}))\n"
        f"pathlib.Path(r'{history_path}').write_text('[]')\n",
        encoding="utf-8",
    )

    ctx = _make_ctx(tmp_path)
    with patch("notifier.send_email", return_value=True):
        result = run_scheduled.run_weekly_fighters(ctx)

    assert result is False
    assert ctx.errors


def test_main_exits_1_and_emails_on_task_failure(tmp_path, monkeypatch):
    import run_scheduled
    monkeypatch.setattr(run_scheduled, "LOGS_DIR", tmp_path / "logs")

    failing_task = MagicMock(return_value=False)
    with patch.dict(run_scheduled.TASK_MAP, {"upcoming": failing_task}), \
         patch("notifier.send_email", return_value=True) as mock_send, \
         patch("sys.argv", ["run_scheduled.py", "--task", "upcoming"]):
        with pytest.raises(SystemExit) as exc:
            run_scheduled.main()

    assert exc.value.code == 1
    mock_send.assert_called_once()
    assert "FAILED" in mock_send.call_args[0][0]
```

- [ ] **Step 2: Run new tests — verify they fail**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/test_run_scheduled.py -v -k "weekly or main"
```

Expected: `AttributeError` — `run_weekly_fighters` not defined.

- [ ] **Step 3: Append weekly_fighters and main to run_scheduled.py**

Append to `scrapers/run_scheduled.py`:

```python
def run_weekly_fighters(ctx: RunContext) -> bool:
    # Step 1: scrape_details — continue with stale data on failure
    details_file = DATA_DIR / "ufc_details.json"
    details_backup = backup_file(details_file)
    if not run_script(BASE_DIR / "scrape_details.py", choice="1", logger=ctx.logger):
        ctx.logger.warning("scrape_details.py failed — keeping existing data")
        restore_file(details_backup, details_file)
    else:
        _validate_and_report(details_file, details_backup, ctx)

    # Step 2: scrape_tapology — continue with stale data on failure
    tapology_file = DATA_DIR / "tapology_fighters.json"
    tapology_backup = backup_file(tapology_file)
    if not run_script(BASE_DIR / "scrape_tapology.py", choice="1", logger=ctx.logger):
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
        send_email(subject, body)
        sys.exit(1)

    log_tail = tail_log(log_file)
    if success:
        subject, body = format_success_email(args.task, "\n".join(ctx.summary))
        send_email(subject, body)
        logger.info(f"=== Task {args.task} completed successfully ===")
    else:
        reason = "\n".join(ctx.errors) or "Unknown failure"
        subject, body = format_failure_email(args.task, reason, log_tail)
        send_email(subject, body)
        logger.error(f"=== Task {args.task} FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run full test suite**

```powershell
.venv\Scripts\python.exe -m pytest scrapers/tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add scrapers/run_scheduled.py scrapers/tests/test_run_scheduled.py
git commit -m "feat: add weekly_fighters task and main CLI entry point to run_scheduled"
```

---

### Task 9: Windows Task Scheduler registration

**Files:** No code — PowerShell commands and .env configuration only.

- [ ] **Step 1: Add Gmail App Password to .env**

In `.env` at the project root (`UFC-App/.env`), add:

```
NOTIFY_EMAIL_FROM=jmfrank136@gmail.com
NOTIFY_EMAIL_TO=jmfrank136@gmail.com
NOTIFY_EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

To generate the App Password: Google Account → Security → 2-Step Verification → App passwords → create one named "UFC Pipeline". Use the 16-character code shown (spaces are optional).

- [ ] **Step 2: Verify email works**

```powershell
.venv\Scripts\python.exe -c "
from dotenv import load_dotenv; load_dotenv('../.env')
from notifier import send_email
send_email('[UFC Pipeline] Test', 'Email delivery confirmed.')
"
```

Expected: email arrives in inbox within 30 seconds.

- [ ] **Step 3: Register Task Scheduler tasks**

Open PowerShell as Administrator, then run:

```powershell
$python   = "C:\Users\jmfra\OneDrive\Documents\UFC\UFC-App\scrapers\.venv\Scripts\python.exe"
$dir      = "C:\Users\jmfra\OneDrive\Documents\UFC\UFC-App\scrapers"
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -RestartCount 1 `
    -RestartInterval (New-TimeSpan -Minutes 30)

# upcoming — Mon/Wed/Fri at 6am
Register-ScheduledTask -TaskName "UFC-upcoming" -Force `
  -Action  (New-ScheduledTaskAction -Execute $python `
             -Argument "run_scheduled.py --task upcoming" `
             -WorkingDirectory $dir) `
  -Trigger (New-ScheduledTaskTrigger -Weekly `
             -DaysOfWeek Monday,Wednesday,Friday -At "6:00AM") `
  -Settings $settings -RunLevel Highest

# rankings — Tuesday at 8am
Register-ScheduledTask -TaskName "UFC-rankings" -Force `
  -Action  (New-ScheduledTaskAction -Execute $python `
             -Argument "run_scheduled.py --task rankings" `
             -WorkingDirectory $dir) `
  -Trigger (New-ScheduledTaskTrigger -Weekly `
             -DaysOfWeek Tuesday -At "8:00AM") `
  -Settings $settings -RunLevel Highest

# weekly_fighters — Tuesday at 10am (runs after rankings finishes)
Register-ScheduledTask -TaskName "UFC-weekly-fighters" -Force `
  -Action  (New-ScheduledTaskAction -Execute $python `
             -Argument "run_scheduled.py --task weekly_fighters" `
             -WorkingDirectory $dir) `
  -Trigger (New-ScheduledTaskTrigger -Weekly `
             -DaysOfWeek Tuesday -At "10:00AM") `
  -Settings $settings -RunLevel Highest

# roster — every 4 weeks on Monday at 9am
Register-ScheduledTask -TaskName "UFC-roster" -Force `
  -Action  (New-ScheduledTaskAction -Execute $python `
             -Argument "run_scheduled.py --task roster" `
             -WorkingDirectory $dir) `
  -Trigger (New-ScheduledTaskTrigger -Weekly `
             -WeeksInterval 4 -DaysOfWeek Monday -At "9:00AM") `
  -Settings $settings -RunLevel Highest
```

- [ ] **Step 4: Verify tasks are registered**

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like "UFC-*" } | Select-Object TaskName, State
```

Expected: four tasks with `State: Ready`.

- [ ] **Step 5: Dry-run one task manually**

```powershell
Start-ScheduledTask -TaskName "UFC-upcoming"
Start-Sleep -Seconds 10
Get-ScheduledTaskInfo -TaskName "UFC-upcoming" | Select-Object LastRunTime, LastTaskResult
```

`LastTaskResult: 0` = success. Check `scrapers\logs\` for the timestamped log.

- [ ] **Step 6: Commit final state**

```powershell
git add scrapers/
git commit -m "feat: complete scraper pipeline hardening — validator, notifier, scheduler"
```

---

## Spec Coverage

| Spec requirement | Task that implements it |
|---|---|
| Backup before each automated scraper run | Tasks 6, 7, 8 — `backup_file` |
| Restore on validation failure | Tasks 7, 8 — `restore_file` in each task fn |
| Per-file count/drop/schema thresholds | Task 3 — `THRESHOLDS` + `validate_file` |
| Pre-upload Supabase count check (70% threshold) | Task 4 — `check_supabase_count` |
| Unmatched fighter new/persistent split | Task 5 — `check_unmatched_fighters` |
| Block upload when >25 unmatched | Tasks 5 + 8 — `should_block` flag |
| Save unmatched baseline between runs | Tasks 5 + 8 — `save_unmatched_baseline` |
| Gmail email via smtplib | Task 2 — `send_email` |
| Email formatters for failures/crashes/mismatches/success | Task 2 — `format_*` functions |
| Timestamped logs to `logs/` | Task 6 — `setup_logging` |
| Four task groups (roster/rankings/upcoming/weekly_fighters) | Tasks 7 + 8 |
| weekly_fighters: scrapers continue on failure (stale data) | Task 8 — warning + continue logic |
| weekly_fighters: block upload on bad merge output | Task 8 — validate fighters.json + restore |
| weekly_fighters: restore merge outputs to protect manual runs | Task 8 — restore on validation failure |
| Windows Task Scheduler setup with per-task schedules | Task 9 |
| No existing scripts modified | All tasks — only new files created |
