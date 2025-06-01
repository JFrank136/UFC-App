## 🕷 Scraper Overview

This project includes several Python scrapers that collect, enrich, and maintain UFC fighter data. All outputs are written to the `data/` directory. Most scripts use structured error logging to support reattempts or retries.

---

### `scrape_roster.py`

**Purpose:**  
Scrapes the full UFC roster from [ufc.com/athletes/all](https://www.ufc.com/athletes/all).

**Fields Collected:**  
- `name`, `profile_url`, `status` (Active/Inactive/Unknown), `id` (UUID)

**Interactive Options:**  
- `[1]` Full scrape  
- `[2]` Only inject new hardcoded fighters from `UFC_ROSTER` dict

**Input File:**  
- (Optional) `data/ufc_fighters_raw.json` (for merging with existing data)

**Output File:**  
- `data/ufc_fighters_raw.json`

**Error Files:**  
- `scrape_errors.json` (structured JSON per failed card)  
- `scrape_errors.log` (raw traceback log)

---

### `scrape_details.py`

**Purpose:**  
Enhances roster entries with detailed fighter stats and full-body profile images from UFC.com.

**Fields Added:**  
- Bio: `height`, `weight`, `reach`, `record`  
- Stats: `strikes_landed_per_min`, `takedown_avg`, `submission_avg`, etc.  
- Image: `image_url`, `image_local_path`, `image_verified`  
- Metadata: `last_updated`, `sig_strikes_by_target`

**Input File:**  
- `data/ufc_fighters_raw.json`

**Output File:**  
- `data/ufc_details.json`

**Error File:**  
- `data/errors/ufc_details_failures.json`

**Automatic Retry:**  
- Failed fighters are retried up to 2 times  
- On re-run, failed entries from previous runs are reattempted automatically

---

### `scrape_sherdog.py`

**Purpose:**  
Enriches fighters with nationality, age, weight class, record, and fight history using Sherdog.

**Fields Added:**  
- `country`, `age`, `weight_class`, `Wins`, `Losses`, win/loss breakdown, `fight_history`

**Input File:**  
- `data/ufc_fighters_raw.json`

**Output File:**  
- `data/sherdog_fighters.json`

**Error File:**  
- `data/errors/sherdog_failures.json`

**Interactive Options:**  
- `[1]` Full scrape  
- `[2]` Retry fighters listed in `sherdog_failures.json`

**Special Behavior:**  
- Automatically uses `URL_OVERRIDES` for known fighters to bypass bad search results  
- Logs which overrides were used at the end of the run

---

### `scrape_rankings.py`

**Purpose:**  
Scrapes current UFC rankings by division from [ufc.com/rankings](https://www.ufc.com/rankings).

**Fields Collected:**  
- `division`  
- For each fighter: `rank`, `name`, `profile_url`, `uuid`, `missing`, `change`

**Input File:**  
- `data/ufc_fighters_raw.json` (for UUID matching)

**Output File:**  
- `data/ufc_rankings.json`

---

### `scrape_upcoming_fights.py`

**Purpose:**  
Scrapes upcoming UFC event fight cards from Tapology.

**Fields Collected:**  
- `event`, `event_type`, `event_date`, `event_time`  
- `fighter1`, `fighter2`, `fight_order`, `card_section`, `weight_class`  
- `uuid1`, `uuid2`, `scraped_at`

**Input File:**  
- `data/fighters_raw.json` (used to resolve UUIDs)

**Output File:**  
- `data/upcoming_fights_raw.json`

**Error Handling:**  
- Logs missing UUIDs to console  
- No JSON error file is currently created (optional improvement)

---
