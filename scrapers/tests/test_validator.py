import json
import pytest
from pathlib import Path
from unittest.mock import patch


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
