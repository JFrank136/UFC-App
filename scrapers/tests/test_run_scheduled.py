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
