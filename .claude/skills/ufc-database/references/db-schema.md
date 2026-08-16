# Supabase Schema Reference

Generated from `scrapers/supabase_schema.json` (a live example row per table, refreshed by
`scrapers/generate_supabase_schema.py`) plus the upload scripts in `scrapers/supabase/`.
If a column looks unfamiliar, regenerate that file rather than guessing — it reflects the
real database, not a hand-maintained doc that can drift.

## fighters

Primary key: `id` (UUID). This is *the* fighter identity — every other table that references
a fighter points back to this `id` (sometimes under a different column name, see below).

```json
{
  "id": "f9505251-86c6-4dad-b142-2497c04596d6",
  "name": "Israel Adesanya",
  "nickname": "The Last Stylebender",
  "profile_url_ufc": "https://www.ufc.com/athlete/israel-adesanya",
  "profile_url_tapology": "https://www.tapology.com/fightcenter/fighters/79163-israel-adesanya",
  "height": 76, "weight": 185.0, "reach": 80,
  "country": "Nigeria",
  "age": 37,
  "weight_class": "Middleweight",
  "gender": "Male",
  "status": "Active",
  "wins_total": 24, "losses_total": 5, "draws_total": 0,
  "ufc_wins_total": 13, "ufc_losses_total": 5, "ufc_draws_total": 0,
  "ufc_wins_ko": 5, "ufc_wins_sub": 0, "ufc_wins_dec": 8,
  "ufc_losses_ko": 2, "ufc_losses_sub": 1, "ufc_losses_dec": 2,
  "sig_strikes_landed_per_min": "4.02",
  "sig_strikes_absorbed_per_min": "3.20",
  "takedown_avg_per_15min": "0.05",
  "submission_avg_per_15min": "0.14",
  "sig_str_defense": "56%",
  "takedown_defense": "77%",
  "striking_accuracy": "48% 1271/2639",
  "takedown_accuracy": "11% 1/9",
  "knockdown_avg": 0.62,
  "avg_fight_time": "17:35",
  "sig_strikes_by_position": { "clinch": "64 (5%)", "ground": "37 (3%)", "standing": "1170 (92%)" },
  "sig_strikes_by_target": { "leg": "382 (30%)", "body": "266 (21%)", "head": "623 (49%)" },
  "image_url": "https://ufc.com/images/...",
  "image_local_path": "/images/israel-adesanya.jpg",
  "created_at": "2026-02-23T14:31:54.092253"
}
```

**Gotchas:**
- `sig_str_defense`, `takedown_defense`: percentage *strings* like `"56%"` — strip the `%`
  before doing math, don't assume a 0–1 decimal.
- `striking_accuracy`, `takedown_accuracy`: combined string `"48% 1271/2639"` — percentage
  and raw fraction in one field. Split on whitespace if you need just the percentage.
- `avg_fight_time`: `"MM:SS"` string, not a float.
- `country`: full country name (`"Nigeria"`), not an ISO code — used as-is as a key in the
  frontend's `countryCodes.js`.
- `weight_class` here is the **division name** (`"Middleweight"`) — contrast with
  `upcoming_fights.weight_class`, which is a numeric lbs string (see below). Same column
  name, different meaning, different table. Easy source of bugs if you assume consistency.
- `sig_strikes_by_position` / `sig_strikes_by_target`: stored as JSON objects, not flat columns.
- Populated by `scrape_details.py` (UFC.com profile stats) merged with `scrape_tapology.py`
  (record totals, method breakdowns, country/age/weight_class) via `supabase/merge_fighters.py`.
- **Upload behavior** (`supabase/upload_fighters.py`): **full delete-then-reinsert**, same as
  `rankings` and `fight_history` below — despite using `on_conflict=id` upsert semantics for
  the insert itself, the script deletes every row first. A bad local `fighters.json` (e.g. a
  duplicate fighter from a botched name-matching fix) will fully overwrite the live table on
  the next run, not just add to it — verify local data before running this upload.

---

## fight_history

No listed primary-key column in examples beyond `id`; fighter FK is **`fighter_id`**
(not `uuid`, not `id` — see the cross-table FK-naming gotcha at the bottom of this doc).

```json
{
  "id": "beb49cd9-b69a-406b-96ee-9379169ec1cc",
  "fighter_id": "f9505251-86c6-4dad-b142-2497c04596d6",
  "result": "loss",
  "opponent": "Nassourdine Imavov",
  "fight_date": "2025-02-01",
  "method": "TKO",
  "round": "2",
  "time": "0:30",
  "method_detail": "Overhand Right & Ground Punches",
  "event": "UFC Fight Night",
  "promotion": "UFC",
  "betting_odds": "-165",
  "betting_status": "Slight Favorite",
  "pick_percentage": "77%",
  "weight_class": "Middleweight",
  "fight_id": null
}
```

**Gotchas:**
- Extracted *from* the merged `fighters.json` (each fighter's embedded fight history) by
  `supabase/merge_fighters.py` — there's no separate scraper for this table.
- **Upload behavior** (`supabase/upload_fight_history.py`): **full delete-then-reinsert**,
  not an upsert. Every run wipes the whole table and rebuilds it from `fight_history.json`.
  If that upload fails partway through, the table can be left empty or truncated — check
  `run_scheduled.py`'s validate → backup → restore guard before assuming a failed run is safe.

---

## rankings

```json
{
  "id": "23293f32-3785-4f8e-9e65-6778fcf64daf",
  "division": "Men's Pound-for-Pound",
  "rank": "11",
  "name": "Joshua Van",
  "uuid": "b7383c43-a51f-43b1-a8f8-194e21d4286f",
  "change": "RANK INCREASED BY 1"
}
```

**Gotchas:**
- **Fighter FK is `uuid`, not `fighter_id`.** This is the single most common trip-up in this
  schema — every other fight-having table uses `fighter_id`.
- `rank` is a string, including for champions (rank `"0"` or similar — check
  `scrape_rankings.py` for the exact champion sentinel rather than assuming).
- `change` is a free-text string like `"RANK INCREASED BY 1"`, not a signed integer — parse
  it if you need a numeric delta.
- Populated by `scrape_rankings.py`; `uuid` is resolved by matching the ranked fighter's name
  against the roster in `ufc_fighters_raw.json`. A fighter who isn't in the roster yet gets
  logged to `data/errors/rankings_errors.json` instead of a row here.
- **Upload behavior** (`supabase/upload_rankings.py`): **full delete-then-reinsert**, same
  as `fight_history`. Rankings change every event, so there's no meaningful "existing row"
  to preserve.

---

## upcoming_fights

```json
{
  "id": "682b4740-7689-4554-beb0-6d3a572a8e1a",
  "event": "UFC Fight Night: Moicano vs. Duncan",
  "event_type": "Fight Night",
  "event_date": "2026-04-04",
  "event_time": "18:00",
  "fighter1": "Virna Jandiroba",
  "fighter2": "Tabatha Ricci",
  "fighter1_id": "cbcd7f67-f4e7-4122-912f-4719099309a8",
  "fighter2_id": "a577ddd0-0e5c-40b0-b623-3f31221b6a37",
  "fight_order": 10,
  "card_section": "Main Card",
  "weight_class": "115",
  "venue": "Meta APEX",
  "location": "Las Vegas, Nevada, United States",
  "fight_card_image_url": "https://images.tapology.com/poster_images/...",
  "fight_card_image_local_path": "/fight_cards/UFC_Fight_Night_Moicano_vs._Duncan.jpg",
  "event_status": "upcoming",
  "fighter_pair": "a577ddd0-0e5c-40b0-b623-3f31221b6a37|cbcd7f67-f4e7-4122-912f-4719099309a8",
  "scraped_at": "2026-02-23T03:11:25.313288+00:00"
}
```

**Gotchas:**
- Fighter FKs are **`fighter1_id` / `fighter2_id`** (two columns, not one) — this table has
  no single `fighter_id`/`uuid` column.
- `weight_class` is a **numeric string in lbs** (`"115"`), unlike `fighters.weight_class`
  which is a division name (`"Middleweight"`). Same column name, different table, different
  meaning — see the note under `fighters` above.
- `fighter_pair` is a synthetic dedup key: the two fighter UUIDs sorted and joined with `|`.
  It exists specifically so the upsert below has something stable to key on regardless of
  which fighter is listed as fighter1 vs fighter2.
- If a fight is scraped before both fighters have UUIDs (a new fighter — see the "Adding a
  New Fighter" workflow in `scrapers/scrapers_guide.md`), it can't be safely upserted and is
  handled as a plain insert instead (see `scrape_upcoming_fights.py`'s missing-UUID path).
- **Upload behavior** (`supabase/upload_upcoming_fights.py`): upsert on the composite key
  `(fighter_pair, event_date)` for rows where both fighter IDs are known; plain insert
  otherwise. **This is the only one of the four upload scripts that doesn't wipe the table
  first** — genuinely safe to re-run without risk of data loss.

---

## user_favorites

```json
{
  "id": "e6ca9e9d-dc71-446e-9166-955a9ba9e04f",
  "user": "Jared",
  "fighter_id": "78837b72-6200-4537-8315-0e7246dfa12c",
  "fighter": "Alex Pereira",
  "priority": "favorite",
  "added_at": "2025-06-02T01:52:48.844"
}
```

**Gotchas:**
- Fighter FK is `fighter_id` (consistent with `fight_history`, unlike `rankings`).
- `user` is a plain name string, not an auth-system ID — this is a single-user app, and
  `"Jared"` is currently the only value in practice.
- `priority` is `"favorite"` or `"interested"` — two watch tiers, not a boolean.
- This table is written by the **frontend** (`src/api/fighters.js`), not by any scraper —
  it's the one table in this schema the scraper pipeline never touches.

---

## Fighter FK naming cheat sheet

The single biggest source of confusion across this schema: **the column name pointing back
to `fighters.id` is different in almost every table.**

| Table | FK column(s) |
|---|---|
| `fight_history` | `fighter_id` |
| `rankings` | `uuid` |
| `upcoming_fights` | `fighter1_id`, `fighter2_id` |
| `user_favorites` | `fighter_id` |

When writing a query or a migration, check this table rather than assuming the FK column
name matches the pattern from whatever table you touched most recently.

---

## Regenerating this reference

If a column here looks stale or you suspect the live schema has drifted, run:
```bash
python scrapers/generate_supabase_schema.py
```
This re-pulls one example row per table into `scrapers/supabase_schema.json`. Diff it
against the examples above before trusting either one blindly — this doc is a snapshot,
not a live view.
