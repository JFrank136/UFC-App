import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "merge_fighters", Path(__file__).resolve().parent.parent / "supabase" / "merge_fighters.py"
)
merge_fighters = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(merge_fighters)
dedupe = merge_fighters.dedupe_fight_entries


def fight(**kw):
    base = {"fighter_id": "f1", "opponent": "Henry Cejudo", "fight_date": "2025-12-06",
            "result": "win", "method": "DEC", "round": None, "time": None}
    return {**base, **kw}


def test_decision_keeps_row_without_junk_round_and_time():
    rows = [fight(round="1", time="0:19"), fight(), fight(round="1", time="0:19")]
    assert dedupe(rows) == [fight()]


def test_finish_keeps_row_with_round():
    rows = [fight(method="TKO"), fight(method="TKO", round="2", time="1:46")]
    assert dedupe(rows) == [fight(method="TKO", round="2", time="1:46")]


def test_exact_duplicates_collapse():
    rows = [fight(method="SUB", round="2", time="1:46")] * 2
    assert len(dedupe(rows)) == 1


def test_different_opponent_date_or_fighter_kept():
    rows = [fight(), fight(opponent="Felipe Lima"), fight(fight_date="2025-06-28"), fight(fighter_id="f2")]
    assert len(dedupe(rows)) == 4


def test_undated_rows_are_not_merged():
    rows = [fight(fight_date=None), fight(fight_date=None)]
    assert len(dedupe(rows)) == 2


def test_order_preserved():
    rows = [fight(opponent="A"), fight(opponent="B"), fight(opponent="A", round="1", time="0:10")]
    assert [r["opponent"] for r in dedupe(rows)] == ["A", "B"]
