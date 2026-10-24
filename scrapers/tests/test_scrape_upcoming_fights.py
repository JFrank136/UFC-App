import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "utils"))
import scrape_upcoming_fights as s  # noqa: E402


def bout(red, blue):
    def corner(side, name):
        given, family = name.split(" ", 1)
        return (
            f'<div class="c-listing-fight__corner-name c-listing-fight__corner-name--{side}"><a>'
            f'<span class="c-listing-fight__corner-given-name">{given}</span>'
            f'<span class="c-listing-fight__corner-family-name">{family}</span></a></div>'
        )
    return f'<div class="c-listing-fight">{corner("red", red)}{corner("blue", blue)}</div>'


UFC_HTML = f"""
<div id="main-card" class="main-card">{bout("Alexander Volkanovski", "Movsar Evloev")}{bout("Lone’er Kavanagh", "Ramazan Temirov")}</div>
<div id="prelims-card" class="fight-card-prelims">{bout("Azamat Murzakanov", "Dominick Reyes")}</div>
<div id="early-prelims" class="fight-card-prelims-early">{bout("Bolaji Oki", "Daniel Santos")}{bout("Kody Steele", "Noah Gugnon")}</div>
"""


def section_for(f1, f2):
    return s.lookup_ufc_section(f1, f2, s.parse_ufc_event_sections(UFC_HTML))


def test_ufc_page_splits_main_prelims_and_early():
    assert section_for("Alexander Volkanovski", "Movsar Evloev") == "main"
    assert section_for("Dominick Reyes", "Azamat Murzakanov") == "prelims"
    assert section_for("Daniel Santos", "Bolaji Oki") == "early"


def test_section_lookup_tolerates_punctuation_and_family_name_spelling():
    assert section_for("Lone'er Kavanagh", "Ramazan Temirov") == "main"  # straight vs curly apostrophe
    assert section_for("D. Santos", "B. Oki") == "early"  # abbreviated given names


def test_unknown_bout_has_no_section():
    assert section_for("Nobody Here", "Also Absent") is None


def test_resolve_keeps_tapology_main_labels_but_overrides_prelims():
    assert s.resolve_card_section("Main Event", "main") == "Main Event"
    assert s.resolve_card_section("Prelim", "main") == "Main Card"
    assert s.resolve_card_section("Prelim", "early") == "Early Prelims"
    assert s.resolve_card_section("Main Card", "prelims") == "Prelim"
    assert s.resolve_card_section("Prelim", None) == "Prelim"


def fight(f1, f2, date="2099-01-01", **kw):
    base = {
        "event": "UFC 999", "event_date": date, "fighter1": f1, "fighter2": f2,
        "fighter1_id": f1.lower(), "fighter2_id": f2.lower(), "card_section": "Prelim",
        "event_status": "upcoming",
    }
    return {**base, **kw}


def test_replaced_opponent_does_not_double_the_fighter():
    existing = [fight("Allen", "Pico"), fight("Aaa", "Bbb")]
    new = [fight("Pico", "Keita"), fight("Aaa", "Bbb")]
    merged, added, updated, unchanged, removed = s.merge_fights(existing, new)
    pairs = {(f["fighter1"], f["fighter2"]) for f in merged}
    assert pairs == {("Pico", "Keita"), ("Aaa", "Bbb")}
    assert [(f["fighter1"], f["fighter2"]) for f in removed] == [("Allen", "Pico")]
    assert (added, updated, unchanged) == (1, 1, 0)


def test_cancelled_fight_is_removed():
    merged, *_, removed = s.merge_fights([fight("A", "B"), fight("C", "D")], [fight("A", "B")])
    assert [f["fighter1"] for f in merged] == ["A"]
    assert len(removed) == 1


def test_fights_on_unscraped_dates_are_kept():
    old = fight("Old", "Card", date="2020-01-01")
    merged, *_, removed = s.merge_fights([old], [fight("A", "B")])
    assert old in merged and removed == []


def test_fight_still_on_ufc_com_is_not_pruned():
    existing = [fight("A", "B"), fight("C", "D")]
    merged, *_, removed = s.merge_fights(existing, [fight("A", "B")], still_listed=lambda f: f["fighter1"] == "C")
    assert len(merged) == 2 and removed == []


def test_no_prune_when_disabled():
    merged, *_, removed = s.merge_fights([fight("A", "B"), fight("C", "D")], [fight("A", "B")], prune=False)
    assert len(merged) == 2 and removed == []


def test_renamed_event_on_same_date_does_not_duplicate():
    existing = [fight("A", "B", event="UFC Fight Night")]
    new = [fight("A", "B", event="UFC Fight Night: A vs. B")]
    merged, *_ = s.merge_fights(existing, new)
    assert len(merged) == 1 and merged[0]["event"] == "UFC Fight Night: A vs. B"


def test_early_prelims_survive_a_run_without_ufc_lookup():
    existing = [fight("A", "B", card_section="Early Prelims")]
    new = [fight("A", "B", card_section="Prelim")]
    merged, *_ = s.merge_fights(existing, new, keep_early_prelims=True)
    assert merged[0]["card_section"] == "Early Prelims"
    merged, *_ = s.merge_fights(existing, new, keep_early_prelims=False)
    assert merged[0]["card_section"] == "Prelim"


def test_merge_refreshes_status_of_events_that_have_happened():
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    merged, *_ = s.merge_fights([fight("A", "B", date=yesterday)], [])
    assert merged[0]["event_status"] == "past"


def test_event_links_exclude_subpages(monkeypatch):
    class Driver:
        page_source = (
            '<a href="/fightcenter/events/146338-ufc-333">x</a>'
            '<a href="/fightcenter/events/146338-ufc-333/predictions-leaderboard">y</a>'
        )
        def get(self, url): pass

    class NoWait:
        def __init__(self, driver, timeout): pass
        def until(self, condition): return True

    monkeypatch.setattr(s, "WebDriverWait", NoWait)
    monkeypatch.setattr(s.EC, "presence_of_all_elements_located", lambda loc: None)
    assert s.get_event_links(Driver()) == ["https://www.tapology.com/fightcenter/events/146338-ufc-333"]
