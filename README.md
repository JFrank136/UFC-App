## 🕷 Scraper Overview

This project includes several Python scrapers under `scrapers/` that collect, enrich,
and maintain UFC fighter data, plus a `run_scheduled.py` orchestrator that validates
output, backs up/restores on failure, and uploads to Supabase. All scraper output is
written to `scrapers/data/`.

**Full documentation lives in two places, kept up to date as the pipeline changes —
this section is intentionally just a pointer, not a duplicate:**

- [`scrapers/scrapers_guide.md`](scrapers/scrapers_guide.md) — pipeline shape, every
  scraper's purpose/inputs/outputs, `run_scheduled.py` usage, the "Adding a New Fighter"
  workflow, error-file meanings, and known transient failure modes.
- [`scrapers/docs/DATA.md`](scrapers/docs/DATA.md) — the actual CSS selectors and
  matching logic each scraper depends on (UFC.com, Tapology), and what
  `utils/name_fixes.py`'s config dicts really mean.
- [`.claude/skills/ufc-database/references/db-schema.md`](.claude/skills/ufc-database/references/db-schema.md) —
  Supabase table schemas, FK-naming gotchas, and per-table upload behavior.

Quick reference — the five scrapers and what they touch:

| Script | Purpose | Output |
|---|---|---|
| `scrape_roster.py` | Foundation: full UFC athlete roster from ufc.com | `data/ufc_fighters_raw.json` |
| `scrape_details.py` | Per-fighter stats + image from UFC.com profile pages | `data/ufc_details.json` |
| `scrape_tapology.py` | Fight history + record from Tapology | `data/tapology_fighters.json` |
| `scrape_rankings.py` | Current UFC rankings by division | `data/ufc_rankings.json` |
| `scrape_upcoming_fights.py` | Upcoming event fight cards from Tapology | `data/upcoming_fights.json` |

`supabase/merge_fighters.py` combines details + Tapology + rankings into
`data/fighters.json` and `data/fight_history.json`; the `supabase/upload_*.py` scripts
push each dataset to its Supabase table. Run everything through
`python run_scheduled.py --task <roster|rankings|upcoming|weekly_fighters>` rather than
calling scrapers directly, except when debugging a single stage in isolation.
