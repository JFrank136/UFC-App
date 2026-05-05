# Scraper Pipeline Hardening Design

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** Add validation gates, safe backups, email notifications, and Windows Task Scheduler automation to the existing UFC scraper pipeline — without modifying any existing scraper, merge, or upload scripts.

---

## Problem Statement

The pipeline currently runs manually and has three critical gaps before automation is safe:

1. `upload_fighters.py` deletes the entire Supabase table before uploading. A scrape that silently returns bad or partial data will wipe production data.
2. No validation occurs between scraping and uploading — count drops, schema errors, and IP-blocking are invisible.
3. Name mismatches accumulate silently with no notification mechanism.

---

## Approach: Wrapper-Based Staging with Validation Gate

All existing scripts (scrapers, merge, upload) remain **completely unchanged**. A new `run_scheduled.py` wrapper handles backup → scrape → validate → upload for automated runs. Manual runs bypass the wrapper entirely and work as today.

---

## Architecture

### Data Flow

```
Manual run (unchanged):
  python scrape_rankings.py
  python merge_fighters.py
  python supabase/upload_all.py

Automated run (via Task Scheduler):
  python run_scheduled.py --task <task_name>
       ↓
  1. Backup current live data file(s) → data/staging/*_backup.json
  2. Run scraper(s) normally (write to data/*.json as always)
  3. Validate new output
  4a. PASS → run upload(s), email summary
  4b. FAIL → restore backup, email failure details, stop
```

### Task Grouping

| Task name | Scripts executed | Schedule |
|---|---|---|
| `roster` | scrape_roster → validate | Monthly or manual trigger |
| `weekly_fighters` | scrape_details → validate → scrape_tapology → validate → merge → validate → upload_fighters + upload_fight_history | Weekly (post-fight night) |
| `rankings` | scrape_rankings → validate → upload_rankings | Weekly |
| `upcoming` | scrape_upcoming → validate → upload_upcoming | 3x/week (Mon/Wed/Fri) |

`roster` does not trigger an upload — it only refreshes `ufc_fighters_raw.json`. The `weekly_fighters` task picks up the updated source naturally on its next run.

---

## Validator (`validator.py`)

A single script called by the wrapper after each scraper output is written. Checks the new file against the previous backup.

### Per-file thresholds

| File | Min records | Drop threshold | Extra checks |
|---|---|---|---|
| `ufc_fighters_raw.json` | 100 | >20% drop → block | `id` + `name` on each row |
| `ufc_details.json` | 100 | >20% drop → block | `id` + `name` on each row |
| `tapology_fighters.json` | 100 | >20% drop → block | `name` on each row |
| `ufc_rankings.json` | 10 | >30% drop → block | at least 1 division present |
| `upcoming_fights.json` | 1 | warn only | at least 1 event present |
| `fighters.json` | 100 | >10% drop → block | unmatched rate check (see below) |
| `fight_history.json` | 1000 | >20% drop → block | no rows with null `fighter_id` |

### Pre-upload Supabase count check

Before any upload script runs, the validator queries the current Supabase row count for the target table via the REST API. If the local file count is less than 70% of the live Supabase count, the upload is aborted and a failure email is sent. The Supabase table is never touched.

### IP-blocking detection

Implicit — a blocked scraper returns far fewer records than expected and trips the count drop threshold.

---

## Name Mismatch Handling

Thresholds applied to `unmatched_fighters.txt` after each merge:

| Unmatched count | Action |
|---|---|
| ≤15 | Upload proceeds. Email sent with full list (informational). |
| 16–25 | Upload proceeds. Email marked "elevated — review soon." |
| >25 | Upload blocked. Email marked "action required." |

### Email format

```
Subject: [UFC Pipeline] ⚠️ 12 unmatched fighters — weekly_fighters

New this run (3):
  - Jhonata Diniz
  - Westin Wilson
  - Jamie Pickett

Persistent (9):
  - [names]

Action: Add new fighters to name_fixes.py and re-run merge manually,
or ignore if they are delisted/inactive.
Upload proceeded with UFC-only data for unmatched fighters.
```

The split between "new" and "persistent" mismatches is what makes the email actionable from a phone — only new entries require attention.

**To fix mismatches:** update `utils/name_fixes.py`, then manually run `merge_fighters.py` + `upload_fighters.py` as today. No re-trigger mechanism required.

---

## Email Notifications (`notifier.py`)

Uses Python's built-in `smtplib` with a Gmail App Password. No external dependencies.

### Configuration (`.env`)

```
NOTIFY_EMAIL_FROM=you@gmail.com
NOTIFY_EMAIL_TO=you@gmail.com
NOTIFY_EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

### Trigger conditions

| Event | Email |
|---|---|
| Validation failure | Subject: `[UFC Pipeline] ❌ FAILED — <task>` with counts, threshold that tripped, and last 50 lines of log |
| New name mismatches | Subject: `[UFC Pipeline] ⚠️ X unmatched fighters — <task>` with new/persistent split |
| Scraper crash / exception | Subject: `[UFC Pipeline] 💥 CRASH — <task>` with traceback |
| Successful run | Subject: `[UFC Pipeline] ✅ <task> complete` with count summary (can be disabled if noisy) |

Every run writes a timestamped log to `logs/YYYY-MM-DD_HH-MM_<task>.log` regardless of outcome.

---

## Error Handling

- One scraper failing inside `weekly_fighters` sends an email and continues — the upload is only blocked if the **final merged output** fails validation.
- If a backup restore fails (e.g., no backup exists on first run), the task aborts without touching Supabase and emails you.
- All subprocess output (stdout + stderr) is captured to the run log — nothing is silently swallowed.

---

## Windows Task Scheduler Setup

Each task is registered as a separate Task Scheduler entry pointing to:

```
Program: C:\Users\jmfra\OneDrive\Documents\UFC\UFC-App\scrapers\.venv\Scripts\python.exe
Arguments: run_scheduled.py --task <task_name>
Start in: C:\Users\jmfra\OneDrive\Documents\UFC\UFC-App\scrapers
```

Logs land in `scrapers/logs/`. Task Scheduler is configured to email on task failure as a secondary alert (optional — the Python notifier is the primary).

---

## New Files

| File | Purpose |
|---|---|
| `run_scheduled.py` | Main wrapper — backup, run, validate, upload, notify |
| `validator.py` | Validation logic — counts, schema, Supabase pre-check |
| `notifier.py` | Email via smtplib |
| `logs/` | Timestamped run logs (gitignored) |
| `data/staging/` | Backup files before each automated run (gitignored) |

No existing files are modified.

---

## Out of Scope

- Proxy rotation or IP management (count drop threshold catches blocking implicitly)
- Rolling data snapshots / historical versioning
- A web dashboard for pipeline status
- Automated fix of name mismatches (remains a manual step by design)
