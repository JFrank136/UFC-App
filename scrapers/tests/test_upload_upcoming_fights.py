import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "upload_upcoming_fights", Path(__file__).resolve().parent.parent / "supabase" / "upload_upcoming_fights.py"
)
upload = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(upload)


def row(f1, f2, date="2099-01-01", id1="x", id2="y", **kw):
    return {"id": f"{f1}-{f2}", "event_date": date, "fighter1": f1, "fighter2": f2,
            "fighter1_id": id1, "fighter2_id": id2, **kw}


def test_replaced_opponent_row_is_stale_and_current_one_is_not():
    db = [row("Allen", "Pico", id1="allen", id2="pico"), row("Pico", "Keita", id1="pico", id2="keita")]
    file = [row("Keita", "Pico", id1="keita", id2="pico")]  # fighter order differs from the DB row
    stale = upload.find_stale_rows(db, file)
    assert [r["id"] for r in stale] == ["Allen-Pico"]


def test_rows_with_missing_ids_match_on_names():
    db = [row("A B", "C D", id1=None, id2=None)]
    file = [row("c d", "a b", id1=None, id2=None)]
    assert upload.find_stale_rows(db, file) == []


def test_same_pair_on_a_different_date_is_stale():
    db = [row("A", "B", date="2099-01-01")]
    file = [row("A", "B", date="2099-02-01")]
    assert len(upload.find_stale_rows(db, file)) == 1
