---
name: ufc-database
description: Conventions, pipeline, and Supabase schema for the scraper/database side of Jared's UFC fighter tracking app (separate from the frontend, which is covered by the ufc-app skill). Use this whenever working with anything in scrapers/ — running or debugging scrape_roster.py, scrape_details.py, scrape_tapology.py, scrape_rankings.py, or scrape_upcoming_fights.py; adding a new UFC fighter to the roster; investigating a run_scheduled.py task failure; writing or debugging a Supabase query or upload script; or when Jared says he's confused about the database, a table's columns, or how data gets from a scraper into Supabase. Always consult this before writing scraper code or touching the fighters/rankings/fight_history/upcoming_fights/user_favorites tables directly, even if the request doesn't mention "scraper" or "database" explicitly.
---

# UFC Scraper & Database

This is the backend half of the UFC fighter tracking app: Python scrapers that pull fighter
data from UFC.com and Tapology, merge it, and upload it to Supabase. The frontend
(`ufc-tracker/`) is a separate concern — see the `ufc-app` skill for that.

Everything here lives under `scrapers/`.

## Orientation

If you're not sure where something lives or how the pieces fit together, read
[`scrapers/scrapers_guide.md`](../../../scrapers/scrapers_guide.md) first — it's the
maintained source of truth for the pipeline (scraper-by-scraper purpose, inputs/outputs,
the "Adding a New Fighter" workflow, and the error-file → fix-action table). Don't
re-derive the pipeline shape from source alone; the guide already captures institutional
knowledge (like which scraper output feeds which script) that isn't obvious from any single
file.

For the actual CSS selectors, search/matching heuristics, and site-specific quirks each
scraper depends on (UFC.com's flip-card markup, Tapology's fighter-search disambiguation
cascade, etc.), see [`scrapers/docs/DATA.md`](../../../scrapers/docs/DATA.md) — that detail
lives there rather than in this skill file so it can be updated independently.

**Do not trust `pipeline.py` if you ever see it referenced in an old commit, chat log, or
your own memory — it was deleted.** It called `scrape_sherdog.py`, which no longer exists;
the project migrated from Sherdog to Tapology as the fight-history source. The current,
actively maintained entry point is `run_scheduled.py --task <roster|rankings|upcoming|weekly_fighters>`.
If you find a reference to Sherdog anywhere in active code (not old logs), that's a bug —
Tapology replaced it everywhere.

## The pipeline in one sentence

`scrape_roster.py` establishes fighter identity (UUID) → `scrape_details.py` +
`scrape_tapology.py` enrich it → `supabase/merge_fighters.py` combines everything into
`fighters.json` + `fight_history.json` → the `upload_*.py` scripts push to Supabase.
`scrape_rankings.py` and `scrape_upcoming_fights.py` are semi-independent side branches that
both depend on the roster already having a UUID for a given fighter name.

**The one thing to internalize:** almost every failure mode in this pipeline — a name not
matching, an upload being blocked, a fighter missing from a card — traces back to a fighter
not having a UUID yet in `data/ufc_fighters_raw.json`. When something doesn't match, check
the roster before suspecting the matching logic.

## Database schema

Read [`references/db-schema.md`](references/db-schema.md) before writing any Supabase query
or touching upload logic. It has a real example row for every table, and — more
importantly — the gotchas that aren't visible from a schema listing alone:

- Which column is the fighter foreign key varies **per table** (`fighter_id` vs `uuid` vs
  `fighter1_id`/`fighter2_id`) — this is the single most common source of bugs.
- `weight_class` means something different in `fighters` (division name) vs
  `upcoming_fights` (numeric lbs string) despite the identical column name.
- Several stat fields are formatted strings, not numbers (`"56%"`, `"17:35"`,
  `"48% 1271/2639"`) — parse before doing math.
- Upload behavior differs by table, and it's not what the upsert code suggests at a glance:
  `fighters`, `rankings`, and `fight_history` all do a **full delete-then-reinsert** every
  run — a bad local JSON file overwrites the live table wholesale, and a failed upload can
  leave a table empty until the next successful run. `upcoming_fights` is the only one that
  genuinely upserts without wiping anything first.

If a column looks unfamiliar or you suspect the doc has drifted from the real database,
regenerate it rather than guessing:
```bash
python scrapers/generate_supabase_schema.py
```

## Running things

Prefer `run_scheduled.py` over calling individual scrapers directly when the goal is to
actually update the database — it validates output before uploading, backs up and restores
the previous data file on failure, checks the Supabase row count isn't wildly off before
uploading (`validator.check_supabase_count`), and emails a report either way (`notifier.py`).
Calling a scraper script directly is for debugging one stage in isolation, not for routine
updates.

```bash
python run_scheduled.py --task roster           # full roster scrape + validate (rare)
python run_scheduled.py --task rankings         # scrape + validate + upload
python run_scheduled.py --task upcoming         # scrape + validate + upload
python run_scheduled.py --task weekly_fighters  # details + tapology + merge + unmatched check + upload
```

## Adding a new fighter

Full step-by-step is in `scrapers_guide.md`'s "Adding a New Fighter" section. Two things
worth internalizing before you start:

- **Check for an existing roster entry with the same profile URL before adding anyone to
  `UFC_ROSTER`.** If the "new" fighter is actually already in the roster under a different
  display name, the fix is a `NAME_FIXES` entry, not a roster injection — injecting anyway
  creates a duplicate fighter with a second UUID that `upload_fighters.py`'s
  delete-then-reinsert will push straight to production. This has actually happened.
- **Don't reach for `run_scheduled.py --task weekly_fighters`** to backfill a new fighter's
  data — it always does a full scrape of every active fighter (~45+ min). Use the targeted
  retry modes instead: `scrape_roster.py [2]` (inject + auto-queues the new fighter in
  `details_errors.json`), `scrape_details.py [2]` (retry from that queue), `scrape_tapology.py
  [3]` (manual list of just the new names), then `merge_fighters.py` and the upload scripts
  directly, then `run_scheduled.py --task upcoming` to re-match the fight card.

## Name-matching quirks

UFC.com, Tapology, and the roster don't always spell a fighter's name the same way (accents,
suffixes, nickname vs legal name). `utils/name_fixes.py` holds three dicts for this —
`NAME_FIXES` (UFC name → Tapology name, consumed by both `scrape_tapology.py`'s search
and `merge_fighters.py`'s matching cascade), `UFC_ROSTER` (manual roster additions, see
above), and `POWER_SLAP` (a set, not a dict — forces `status="Power Slap"` in
`scrape_roster.py`). If a fighter shows up in `unmatched_fighters.txt` or
`tapology_failures.json`, `NAME_FIXES` is almost always where the fix belongs — check it
before assuming the scraping logic itself is broken. Full selector/matching-logic detail
is in `scrapers/docs/DATA.md`, not repeated here.

## Error files

Every error file in `data/errors/` maps to a specific fix — see the table in
`scrapers_guide.md`. The short version: `*_errors.json` files (details, rankings, upcoming)
usually mean a fighter is missing a UUID; `unmatched_fighters.txt` and
`tapology_failures.json` mean a name-matching problem, fixable via `NAME_FIXES`.
