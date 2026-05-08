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
