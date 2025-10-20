# UFC Scrapers - Complete Guide

This README provides step-by-step instructions for running all UFC data scrapers in this project.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Individual Scrapers](#individual-scrapers)
- [Automated Pipelines](#automated-pipelines)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Python 3.8+**
- **Google Chrome** (for Selenium-based scrapers)
- **ChromeDriver** (installed automatically by undetected-chromedriver)

### Required Environment Variables
Create a `.env` file in the project root with:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

---

## Installation

### 1. Clone the Repository
```bash
cd /home/user/UFC-App
```

### 2. Install Python Dependencies
```bash
pip install -r requirements.txt
```

**Core dependencies:**
- `beautifulsoup4` - HTML parsing
- `requests` - HTTP requests
- `selenium` - Browser automation
- `undetected-chromedriver` - Anti-detection Chrome driver
- `supabase` - Database interactions
- `python-dotenv` - Environment variables
- `Flask` / `flask-cors` - API backend
- `psycopg2` - PostgreSQL adapter

### 3. Verify Installation
```bash
python -c "import selenium, bs4, requests, supabase; print('All dependencies installed!')"
```

---

## Quick Start

### Run Everything (Recommended)
Use the automated pipeline for a complete data refresh:

```bash
cd scrapers
python pipeline.py
```

**Choose from 4 modes:**
1. **Full Refresh** - Complete rebuild (monthly recommended)
2. **Weekly Update** - Rankings + upcoming fights
3. **Post-Event Update** - After UFC events
4. **Test Mode** - Retry errors only

### Check Data Status
```bash
python status.py
```

This shows file ages, record counts, errors, and recommendations.

---

## Individual Scrapers

### 1. Roster Scraper
**Purpose:** Get basic UFC fighter roster (foundation for all other scrapers)

```bash
cd scrapers
python scrape_roster.py
```

**Options:**
- `1` - Full scrape from UFC.com (~800+ fighters)
- `2` - Add only hardcoded UFC_ROSTER entries

**Output:** `data/ufc_fighters_raw.json`

**Runtime:** 3-5 minutes

---

### 2. Details Scraper
**Purpose:** Enrich fighters with stats and images

```bash
python scrape_details.py
```

**Options:**
- `1` - Full scrape (all active fighters)
- `2` - Retry from errors only
- `3` - Update ranked fighter images

**Advanced flags:**
```bash
python scrape_details.py --workers=8     # Use 8 concurrent threads
python scrape_details.py --sequential    # Disable threading
```

**Output:**
- `data/ufc_details.json`
- `/ufc-tracker/public/images/` - Fighter images

**Runtime:** 15-30 minutes (depending on workers)

---

### 3. Sherdog Scraper
**Purpose:** Add fight history from Sherdog.com

```bash
python scrape_sherdog.py
```

**Options:**
- `1` - Full scrape (all active fighters)
- `2` - Retry failed fighters only

**Output:** `data/sherdog_fighters.json`

**Runtime:** 20-40 minutes

**Note:** Uses name matching algorithm with 70%+ similarity threshold. Check `sherdog_failures.json` for unmatched fighters and add entries to `utils/name_fixes.py` if needed.

---

### 4. Rankings Scraper
**Purpose:** Get current UFC rankings

```bash
python scrape_rankings.py
```

**Options:**
- `1` - Full scrape (all divisions)
- `2` - Fix missing UUIDs only

**Output:** `data/ufc_rankings.json`

**Runtime:** 2-3 minutes

---

### 5. Upcoming Fights Scraper
**Purpose:** Get upcoming UFC events from Tapology

```bash
python scrape_upcoming_fights.py
```

**Options:**
- `1` - Full scrape (all upcoming events)
- `2` - Fix missing UUIDs only
- `3` - Retry failed events

**Output:**
- `data/upcoming_fights.json`
- Fight card images

**Runtime:** 5-10 minutes

---

### 6. Betting Scraper (Experimental)
**Purpose:** Get betting odds from sportsbooks

```bash
python scrape_betting.py
# or
python scrape_betting_simple.py
```

**Status:** In development - use with caution

---

## Data Processing & Upload

### Merge Data
Combine all scraped data into final dataset:

```bash
cd supabase
python merge_fighters.py
```

**Output:** `data/fighters.json` (consolidated fighter data)

### Upload to Database

**Upload all data:**
```bash
python supabase/upload_all.py
```

**Upload individually:**
```bash
python supabase/upload_fighters.py          # Fighter profiles
python supabase/upload_rankings.py          # Rankings
python supabase/upload_upcoming_fights.py   # Upcoming events
python supabase/upload_fight_history.py     # Fight history
```

---

## Automated Pipelines

### pipeline.py - Master Orchestration

```bash
python pipeline.py
```

**Mode 1: Full Refresh** (Monthly)
```
scrape_roster → scrape_details → scrape_sherdog
  → scrape_rankings → scrape_upcoming_fights
  → merge_fighters → upload_all
```

**Mode 2: Weekly Update**
```
scrape_rankings → scrape_upcoming_fights
  → retry_errors → upload_updates
```

**Mode 3: Post-Event Update** (After UFC events)
```
update_ranked_images → scrape_rankings
  → scrape_upcoming_fights → update_sherdog
```

**Mode 4: Test Mode**
```
retry_all_errors → no_uploads
```

---

## Recommended Execution Schedule

### After UFC Events (Sunday/Monday)
```bash
python pipeline.py  # Choose Mode 3: Post-Event Update
```

### 2-3x Per Week
```bash
python scrape_upcoming_fights.py  # Option 1: Full scrape
python supabase/upload_upcoming_fights.py
```

### Monthly Maintenance
```bash
python pipeline.py  # Choose Mode 1: Full Refresh
```

### Error Cleanup (As Needed)
```bash
python status.py                   # Check errors
python scrape_details.py           # Option 2: Retry errors
python scrape_sherdog.py           # Option 2: Retry errors
```

---

## Data Flow

```
1. scrape_roster.py
   ↓ ufc_fighters_raw.json

2. scrape_details.py
   ↓ ufc_details.json + fighter images

3. scrape_sherdog.py
   ↓ sherdog_fighters.json

4. scrape_rankings.py
   ↓ ufc_rankings.json

5. scrape_upcoming_fights.py
   ↓ upcoming_fights.json

6. merge_fighters.py
   ↓ fighters.json (consolidated)

7. upload_*.py
   ↓ Supabase Database
```

---

## Output Files

All data files are stored in `scrapers/data/`:

| File | Description | Source Scraper |
|------|-------------|----------------|
| `ufc_fighters_raw.json` | Base roster | scrape_roster.py |
| `ufc_details.json` | Fighter stats & images | scrape_details.py |
| `sherdog_fighters.json` | Fight history | scrape_sherdog.py |
| `ufc_rankings.json` | Current rankings | scrape_rankings.py |
| `upcoming_fights.json` | Upcoming events | scrape_upcoming_fights.py |
| `fighters.json` | Merged final dataset | merge_fighters.py |
| `fight_history.json` | Flat fight history | merge_past_fights.py |

### Error Files (for retries)
- `roster_errors.json`
- `details_errors.json`
- `sherdog_failures.json`
- `rankings_errors.json`
- `upcoming_errors.json`

---

## Troubleshooting

### ChromeDriver Issues
**Error:** "Chrome version not supported" or "ChromeDriver not found"

**Solution:**
```bash
pip install --upgrade undetected-chromedriver
```

The package automatically downloads the correct ChromeDriver version.

---

### Missing Fighter Images
**Error:** Images not downloading or 404 errors

**Solution:**
1. Run `scrape_details.py` with Option 3 (update ranked images)
2. Check `/ufc-tracker/public/images/` directory exists
3. Verify fighter profile URLs in `ufc_fighters_raw.json`

---

### Sherdog Name Matching Failures
**Error:** Many fighters in `sherdog_failures.json`

**Solution:**
1. Check `sherdog_failures.json` for failed names
2. Add mappings to `utils/name_fixes.py`:
   - `NAME_FIXES` - UFC to Sherdog name corrections
   - `URL_OVERRIDES` - Direct Sherdog profile URLs
3. Re-run `scrape_sherdog.py` with Option 2 (retry)

**Example:**
```python
NAME_FIXES = {
    "JOSE ALDO": "JOSE ALDO JUNIOR",
    "JIRI PROCHAZKA": "JIŘÍ PROCHÁZKA"
}

URL_OVERRIDES = {
    "KHABIB NURMAGOMEDOV": "https://www.sherdog.com/fighter/Khabib-Nurmagomedov-56035"
}
```

---

### Tapology UUID Mismatches
**Error:** Fighters in `upcoming_errors.json` with missing UUIDs

**Solution:**
1. Check if fighters exist in `ufc_fighters_raw.json`
2. Add name fixes to `utils/name_fixes.py` → `TAPOLOGY_FIXES`
3. Re-run `scrape_upcoming_fights.py` with Option 2

---

### Supabase Upload Errors
**Error:** "Authentication failed" or "Table not found"

**Solution:**
1. Verify `.env` file has correct credentials:
   ```bash
   cat .env
   ```
2. Check Supabase table schemas match expected structure
3. Review upload script logs for specific errors

---

### Rate Limiting / IP Blocking
**Error:** 429 errors or CAPTCHAs

**Solution:**
1. Reduce worker count: `python scrape_details.py --workers=2`
2. Add delays between requests (edit scraper file)
3. Use `--sequential` flag for single-threaded execution
4. Run scrapers during off-peak hours

---

### Stale Data
**Error:** Data hasn't updated in weeks

**Solution:**
1. Check status: `python status.py`
2. Run full refresh: `python pipeline.py` → Mode 1
3. Set up cron job for automated updates

---

## Advanced Configuration

### config.py Settings
Edit `config.py` to customize:

```python
# Scraping configuration
DETAIL_WORKERS = 4           # Concurrent threads
SHERDOG_WORKERS = 8          # Concurrent threads
REQUEST_TIMEOUT = 30         # Timeout in seconds
MAX_RETRIES = 3              # Retry attempts

# Paths
DATA_DIR = "scrapers/data/"
IMAGE_DIR = "/ufc-tracker/public/images/"

# Database
BATCH_SIZE = 100             # Upload batch size
```

---

## Additional Resources

- **Comprehensive Documentation:** `scrapers_guide.md`
- **Health Dashboard:** `python status.py`
- **Name Fixes:** `utils/name_fixes.py`
- **Pipeline Orchestration:** `pipeline.py`

---

## Common Workflows

### Adding a New Fighter
```bash
# 1. Add to UFC_ROSTER in utils/name_fixes.py
# 2. Run quick pipeline
python run_all/new_fighter.py
```

### Updating After Event
```bash
python pipeline.py  # Mode 3
```

### Fixing Missing Stats
```bash
python scrape_details.py    # Option 2 (retry errors)
python scrape_sherdog.py    # Option 2 (retry errors)
```

### Complete Data Rebuild
```bash
python pipeline.py          # Mode 1
# Or manually:
python scrape_roster.py     # Option 1
python scrape_details.py    # Option 1
python scrape_sherdog.py    # Option 1
python scrape_rankings.py   # Option 1
python scrape_upcoming_fights.py  # Option 1
python supabase/merge_fighters.py
python supabase/upload_all.py
```

---

## Notes

- **Runtime:** Full pipeline takes 1-2 hours depending on network speed
- **Storage:** Fighter images can reach 500MB+
- **Browser:** Scrapers will open Chrome windows (normal behavior)
- **Errors:** Error files are expected - use retry options to clean up
- **Updates:** Run rankings + upcoming 2-3x per week for freshness

---

## Support

For issues or questions:
1. Check `status.py` for data health
2. Review error files in `data/` directory
3. Consult `scrapers_guide.md` for detailed documentation
4. Check scraper logs for specific error messages

---

**Last Updated:** 2025-10-20
