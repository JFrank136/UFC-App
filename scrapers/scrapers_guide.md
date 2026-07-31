# UFC Scrapers Guide

## Pipeline Overview
```
Raw Roster → Details → Tapology → Merge → Upload
     ↓          ↓          ↓         ↓       ↓
  Rankings → Upcoming → Fight History → Database
```

**Main Entry Point**: `run_scheduled.py --task <name>` — orchestrated execution with
validation, backup/restore on failure, Supabase pre-upload count checks, unmatched-fighter
tracking, and email notifications. Individual scrapers below can still be run manually for
debugging.

---

## Individual Scrapers

### 1. scrape_roster.py
**Purpose**: Foundation scraper - gets basic fighter roster from UFC.com

**Options**:
```bash
python scrape_roster.py
# [1] Full scrape - all fighters from UFC athletes page (~800+ fighters)
# [2] Only add new fighters from UFC_ROSTER hardcoded list
```

**When to Run**: Rarely - only for huge roster changes, or to manually inject a new
fighter (see "Adding a New Fighter" below)
**Output**: `data/ufc_fighters_raw.json`, `data/errors/roster_errors.json`
**Follow-up**: None (foundation data)

---

### 2. scrape_details.py
**Purpose**: Enrich fighter profiles with detailed stats and images

**Options**:
```bash
python scrape_details.py
# [1] Full scrape - all active fighters (~400-500)
# [2] Retry from details_errors.json
# [3] Update ranked fighter images - top 5 + champions (~60)
# Optional: --workers=6, --sequential
```

**When to Run**: After UFC events to update stats and new fighter images
**Dependencies**: `data/ufc_fighters_raw.json`
**Output**: `data/ufc_details.json`, `data/errors/details_errors.json`, fighter images
**Follow-up**: `supabase/merge_fighters.py` → `supabase/upload_fighters.py`

---

### 3. scrape_tapology.py
**Purpose**: Add fight history and additional stats from Tapology

**Options**:
```bash
python scrape_tapology.py
# [1] Production mode - all active fighters (then choose sequential or concurrent)
# [2] Retry failed fighters from data/errors/tapology_failures.json
# [3] Manual list - paste specific fighter names, one per line
# [4] Recently fought - re-scrape fighters from recent events by cutoff date
```
`run_scheduled.py --task weekly_fighters` always answers `1` then `1` (production mode,
sequential) — sequential specifically for unattended reliability.

**When to Run**: After UFC events
**Dependencies**: `data/ufc_fighters_raw.json`
**Output**: `data/tapology_fighters.json`, `data/errors/tapology_failures.json`
**Follow-up**: `supabase/merge_fighters.py` → `supabase/upload_fighters.py`
**Selectors/matching logic**: see `docs/DATA.md` — the name-search/disambiguation
cascade in particular is worth reading before touching fighter matching.

---

### 4. scrape_rankings.py
**Purpose**: Get current UFC rankings for all weight classes

**Options**:
```bash
python scrape_rankings.py
# [1] Full scrape - all current rankings
# [2] Only fix fighters with missing UUIDs
```

**When to Run**: After UFC events (rankings update within 24-48 hours)
**Dependencies**: `data/ufc_fighters_raw.json`
**Output**: `data/ufc_rankings.json`, `data/errors/rankings_errors.json`
**Follow-up**: `supabase/upload_rankings.py`

---

### 5. scrape_upcoming_fights.py
**Purpose**: Get upcoming UFC fight cards from Tapology

**Options**:
```bash
python scrape_upcoming_fights.py
# [1] Full scrape - all upcoming UFC events
# [2] Only try missing UUIDs
# [3] Retry failed event cards
```

**When to Run**: Frequently to get latest updates (2-3x per week)
**Dependencies**: `data/ufc_fighters_raw.json`
**Output**: `data/upcoming_fights.json`, `data/errors/upcoming_errors.json`, fight card images
**Follow-up**: `supabase/upload_upcoming_fights.py`

**Note**: Fighters in `upcoming_errors.json` don't have a UUID yet — they're on a fight
card but not in the roster. See "Adding a New Fighter" below.

---

## Data Processing Scripts

### supabase/merge_fighters.py
**Purpose**: Combine UFC details + Tapology data + rankings into the final dataset;
also extracts flat fight history
```bash
python supabase/merge_fighters.py  # No options
```
**Dependencies**: `data/ufc_details.json`, `data/tapology_fighters.json`, `data/ufc_rankings.json`
**Output**: `data/fighters.json`, `data/fight_history.json`, `data/errors/unmatched_fighters.txt`

---

## Upload Scripts
- `supabase/upload_fighters.py` - Upload fighter data to Supabase
- `supabase/upload_fight_history.py` - Upload fight history
- `supabase/upload_rankings.py` - Upload current rankings
- `supabase/upload_upcoming_fights.py` - Upload upcoming fights

---

## Automation

### run_scheduled.py
**Purpose**: Orchestrated, production entry point for scheduled/automated runs
```bash
python run_scheduled.py --task roster           # full roster scrape + validate
python run_scheduled.py --task rankings         # scrape + validate + upload
python run_scheduled.py --task upcoming         # scrape + validate + upload
python run_scheduled.py --task weekly_fighters  # details + tapology + merge + unmatched check + upload
```
Each task backs up the data file it's about to overwrite, validates the new output
(`validator.py`), restores the backup on failure, checks the Supabase row count before
uploading (`check_supabase_count`), and emails a success/failure/crash report (`notifier.py`).
There is no single "full refresh" task — running `roster`, `rankings`, `upcoming`, then
`weekly_fighters` in sequence covers the same ground.

### status.py
**Purpose**: Health check dashboard
- Shows file status, ages, record counts, error summaries
- Provides recommendations for next actions

---

### Known transient failure modes

**Chrome launch race after a Chrome auto-update** — `undetected_chromedriver` pins to
the installed Chrome's major version via `utils/chrome_utils.get_chrome_major_version()`.
When Chrome has just auto-updated, UC has to download and patch a fresh driver binary
on the spot, and launching against a binary that was written a moment earlier can fail
with `SessionNotCreatedException: ... chrome not reachable`. `chrome_utils.py` also
exposes `launch_undetected_chrome(options)`, which retries once after a short delay —
`scrape_upcoming_fights.py` and `scrape_tapology.py` both launch through it for this
reason. If a browser-based task fails with "chrome not reachable" and a rerun succeeds
immediately, this is almost certainly why — no further action needed beyond the retry
already in place.

**Roster scrape stuck at page 1 / a fighter with a blank name** — `scrape_roster.py`'s
"Load More" pagination loop now tolerates a few short misses (the button may just not
have rendered yet) before concluding the roster page is fully loaded, and per-card name
reads wait briefly for non-empty text instead of trusting a flat sleep after the CSS
flip. If `roster` still validates with far fewer than ~3,000 cards loaded ("Loaded N
fighter cards" in the console output), check `debug_ufc_page.html` (written each full
scrape) for `button--load-more` / `c-listing-athlete-flipcard__back` element counts —
their absence points to the athletes page not having finished rendering when the
scraper started.

**Scheduled Task logon type matters for diagnosis, not for these fixes** — `run_scheduled.py`
is driven by Windows Task Scheduler entries (`UFC-roster`, `UFC-rankings`, `UFC-upcoming`,
`UFC-weekly-fighters`). Their logon types differ (some `Interactive`, some `Password` —
i.e. runs whether logged on or not). This turned out *not* to be the cause of the Chrome
launch failures above (a `Password`-logon task using the same non-headless `uc.Chrome()`
pattern succeeded the day before), but it's worth checking first (`Get-ScheduledTask`)
whenever a browser-based task only fails when scheduled and not when run manually — it
rules a real class of environment-specific bugs in or out quickly.

**A page-load timeout can orphan the Chrome process, and orphans cascade** —
`scrape_rankings.py` and `scrape_upcoming_fights.py` used to create the Selenium driver
and only call `driver.quit()` after the scrape logic ran, with no `try/finally`. If a
`driver.get()`/`execute_script()` call raised (e.g. `urllib3.exceptions.ReadTimeoutError`
on a slow page load), the exception skipped cleanup entirely and left the Chrome +
chromedriver process running with nothing left to close it. This dev machine only has
~7.8GB RAM, so each orphaned Chrome process eats into a small budget shared with normal
browser/app usage — and once memory gets tight, Selenium's own commands slow down enough
to time out too, so one failed run made the next one more likely to fail the same way.
Both scripts (including `scrape_upcoming_fights.py`'s mode-3 retry path) now create the
driver inside a `try`/`finally` so `driver.quit()` always runs. If a browser-based task
times out again, check for orphaned `chrome.exe`/`chromedriver.exe`/
`undetected_chromedriver.exe` processes (`Get-CimInstance Win32_Process -Filter
"Name='chrome.exe'"` and look for entries whose `ParentProcessId` no longer exists) and
free system memory before assuming the site or selectors changed.

---

## Adding a New Fighter

When `scrape_upcoming_fights.py` finds a fighter on a card who isn't in the roster yet,
they land in `data/errors/upcoming_errors.json` (name only, no UUID). To add one:

**0. Check they aren't already in the roster under a different name.** Before adding
anyone to `UFC_ROSTER`, check whether their UFC.com profile URL already belongs to an
existing roster entry:
```bash
python -c "import json; raw=json.load(open('data/ufc_fighters_raw.json',encoding='utf-8')); print([f for f in raw if f.get('profile_url_ufc')=='https://www.ufc.com/athlete/fighter-slug'])"
```
If it's already there under a different display name, the real problem is a name
mismatch, not a missing fighter — add a `NAME_FIXES` entry instead (see "Name-matching
quirks" below) and skip the rest of this workflow. Injecting them into `UFC_ROSTER`
anyway creates a **duplicate fighter with a second UUID**, and because
`upload_fighters.py` does a full delete-then-reinsert, that duplicate will silently
land in the live database on the next upload.

1. Find their UFC.com profile URL (`ufc.com/athlete/<slug>`)
2. Add them to `UFC_ROSTER` in `utils/name_fixes.py`:
   ```python
   UFC_ROSTER = {
       "Fighter Name": "https://www.ufc.com/athlete/fighter-slug",
       ...
   }
   ```
3. `python scrape_roster.py` → choose **[2]** (injects just the new `UFC_ROSTER` entries,
   assigns a UUID, and automatically queues them in `data/errors/details_errors.json`
   for a targeted retry) — writes to `data/ufc_fighters_raw.json`
4. `python scrape_details.py` → choose **[2]** (retry from `details_errors.json` — only
   hits the new fighters, not the full ~960-fighter roster)
5. `python scrape_tapology.py` → choose **[3]** (manual list — paste in just the new
   fighter names, one per line, blank line to finish)
6. `python supabase/merge_fighters.py` — check the unmatched count printed at the end;
   if a new fighter shows up unmatched, it's almost always the step-0 name-mismatch
   case, not a real Tapology miss
7. `python supabase/upload_fighters.py` and `python supabase/upload_fight_history.py`
8. `python run_scheduled.py --task upcoming` — re-scrape so the fighter now matches
   on their fight card

**Don't use `run_scheduled.py --task weekly_fighters` for this** — it always does a
*full* scrape of every active fighter (steps 4-5 above are the targeted equivalent),
which takes ~45+ minutes and re-does work that's already correct for the ~940 fighters
who aren't new. Save `weekly_fighters` for the regular post-event refresh where you
actually want everyone re-scraped.

---

## Recommended Schedule

### 🥊 **After UFC Events** (Sunday/Monday):
```bash
python run_scheduled.py --task rankings
python run_scheduled.py --task weekly_fighters
python run_scheduled.py --task upcoming
```

### 🔄 **Regular Updates** (2-3x per week):
```bash
python run_scheduled.py --task upcoming
```

### 🔧 **Error Cleanup** (as needed):
```bash
python status.py  # Check what needs fixing
python scrape_details.py     # [2] Retry errors
python scrape_tapology.py    # [2] Retry errors
```

---

## Error Files Reference

| File | Common Issues | Fix |
|------|---------------|-----|
| `details_errors.json` | Failed profile scrapes | Re-run `scrape_details.py` option [2] |
| `tapology_failures.json` | Name matching failures | Update `NAME_FIXES` in `utils/name_fixes.py` |
| `rankings_errors.json` | Missing UUIDs | Add fighters to roster first (see "Adding a New Fighter") |
| `upcoming_errors.json` | Missing UUIDs | Add fighters to roster first (see "Adding a New Fighter") |
| `unmatched_fighters.txt` | UFC fighters not found in Tapology | Update `NAME_FIXES` |

---

## Configuration Files

### utils/name_fixes.py
```python
NAME_FIXES = {"UFC_NAME": "TAPOLOGY_NAME"}     # Name variations
POWER_SLAP = {"FIGHTER NAME", ...}             # Set, not dict - forces status="Power Slap"
UFC_ROSTER = {"Fighter Name": "ufc_profile_url"}   # Manual additions
```
Three dicts today, not four — `URL_OVERRIDES` and a separate `TAPOLOGY_FIXES` dict don't
exist in the current file; both were folded into `NAME_FIXES` during the Sherdog→Tapology
migration (see the comment at `name_fixes.py:132`). See `docs/DATA.md` for what each dict
is actually consumed by and the "flipped direction" gotcha in `NAME_FIXES`'s tail entries.

### .env
```bash
SUPABASE_DB_NAME=your_db
SUPABASE_DB_USER=your_user
SUPABASE_DB_PASSWORD=your_password
SUPABASE_DB_HOST=your_host
SUPABASE_DB_PORT=5432
```

---

## Development Notes & Improvements

### 🔧 **Current Issues & Fixes Needed**

#### Overall Pipeline
- **Efficiency**: Make scrapers faster and more targeted
- **Historic Data**: Keep more historical snapshots instead of overwriting
- **Selective Updates**: Only update fighters who fought recently after fight nights
- **UUID Preservation**: When re-scraping roster, maintain existing UUIDs

#### scrape_rankings.py Issues
- **Champion Change Tracking**: Currently missing detection when champion changes
- Need to capture and store ranking movement history

#### New Scrapers Needed
- **Odds Data Scraper**: Get betting odds from sportsbooks
- **Betting Data Scraper**: Round betting, moneyline, prop bets
- **Fight Result Scraper**: Post-event results with detailed stats

---

### 💡 **Top Improvement Suggestions**

#### Priority 1 - Quick Wins
1. **🚨 Centralized Error Dashboard**
   - Consolidate all error files into single view
   - Auto-suggest fixes (e.g., "Add NAME_FIXES entry")

2. **📊 Smart Event-Based Scheduling**
   - Auto-detect UFC event dates
   - Run appropriate scrapers at optimal times

#### Priority 2 - Efficiency & Data Quality
3. **🎯 Selective Fighter Updates**
   - Only scrape fighters with recent activity post-fight
   - Priority tiers: active > ranked > recently fought

4. **🏗️ Historic Data Preservation**
   ```python
   # Instead of overwriting, append with timestamps
   data_with_timestamp = {
       "scraped_at": datetime.now(),
       "fighters": fighter_data
   }
   ```

5. **🔍 Intelligent Name Matching**
   - Fuzzy matching with confidence scores
   - Reduce manual NAME_FIXES maintenance

#### Priority 3 - New Features
6. **💰 Betting Data Integration**
   - Odds scraper for multiple sportsbooks
   - Round betting, method betting, props
   - Historical odds movement tracking

7. **📈 Champion Change Detection**
   ```python
   # In scrape_rankings.py
   def detect_title_changes(old_rankings, new_rankings):
       for division in new_rankings:
           old_champ = get_champion(old_rankings, division)
           new_champ = get_champion(new_rankings, division)
           if old_champ != new_champ:
               log_title_change(division, old_champ, new_champ)
   ```

8. **🔐 Enhanced Rate Limiting**
   - Proxy rotation for blocked IPs
   - Intelligent backoff strategies

---

### 📝 **Implementation Tasks**

#### UUID Preservation Fix
```python
# In scrape_roster.py, preserve existing UUIDs:
def merge_with_existing_uuids(new_fighters, existing_file):
    try:
        with open(existing_file, 'r') as f:
            existing = {f['name'].lower(): f['id'] for f in json.load(f)}

        for fighter in new_fighters:
            name_key = fighter['name'].lower()
            if name_key in existing:
                fighter['id'] = existing[name_key]  # Keep existing UUID
    except FileNotFoundError:
        pass  # First run, generate new UUIDs
```

#### Post-Fight Selective Updates
```python
# Create post_fight_updater.py:
def get_recent_fight_participants(days_back=7):
    # Check recent UFC events
    # Return list of fighter UUIDs who fought recently
    pass

def selective_update_after_event(fighter_uuids):
    # Only update these specific fighters
    # Much faster than full scrape
    pass
```
