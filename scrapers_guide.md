# UFC Scrapers Guide

## Pipeline Overview
```
Raw Roster → Details → Sherdog → Merge → Upload
     ↓         ↓         ↓        ↓       ↓
Rankings → Upcoming → Fight History → Database
```

**Main Entry Points**:
- `pipeline.py` - Orchestrated multi-script execution
- Individual scrapers - Manual control and debugging

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

**When to Run**: Rarely - only for huge roster changes or errors
**Output**: `ufc_fighters_raw.json`, `roster_errors.json`
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
**Dependencies**: `ufc_fighters_raw.json`
**Output**: `ufc_details.json`, `details_errors.json`, fighter images
**Follow-up**: `merge_fighters.py` → `upload_fighters.py`

---

### 3. scrape_sherdog.py
**Purpose**: Add fight history and additional stats from Sherdog

**Options**:
```bash
python scrape_sherdog.py
# [1] Full scrape - search Sherdog for all active fighters
# [2] Retry failed only
```

**When to Run**: After UFC events
**Dependencies**: `ufc_fighters_raw.json`
**Output**: `sherdog_fighters.json`, `sherdog_failures.json`
**Follow-up**: `merge_fighters.py` → `upload_fighters.py`

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
**Dependencies**: `ufc_fighters_raw.json`
**Output**: `ufc_rankings.json`, `rankings_errors.json`
**Follow-up**: `upload_rankings.py`

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
**Dependencies**: `ufc_fighters_raw.json`
**Output**: `upcoming_fights.json`, `upcoming_errors.json`, fight card images
**Follow-up**: `upload_upcoming_fights.py`

---

## Data Processing Scripts

### merge_fighters.py
**Purpose**: Combine UFC details + Sherdog data + rankings into final dataset
```bash
python merge_fighters.py  # No options
```
**Dependencies**: `ufc_details.json`, `sherdog_fighters.json`, `ufc_rankings.json`
**Output**: `fighters.json`, `unmatched_fighters.txt`

### merge_past_fights.py
**Purpose**: Extract flat fight history from merged fighters
**Dependencies**: `fighters.json`
**Output**: `fight_history.json`

---

## Upload Scripts
- `upload_fighters.py` - Upload fighter data to Supabase
- `upload_fight_history.py` - Upload fight history 
- `upload_rankings.py` - Upload current rankings
- `upload_upcoming_fights.py` - Upload upcoming fights

---

## Automation Scripts

### pipeline.py
**Purpose**: Orchestrated execution with error handling
```bash
python pipeline.py
# [1] Full Refresh - complete rebuild (monthly)
# [2] Weekly Update - rankings + upcoming + error retries
# [3] Post-Event Update - ranked images + current data
# [4] Test Mode - retry errors only, no uploads
```

### new_fighter.py
**Purpose**: Quick pipeline for adding new fighters
- Injects UFC_ROSTER fighters → retries details/sherdog → updates upcoming

### status.py
**Purpose**: Health check dashboard
- Shows file status, ages, record counts, error summaries
- Provides recommendations for next actions

### config.py
**Purpose**: Centralized configuration for paths and settings
```python
from config import Paths, ScrapingConfig
with open(Paths.UFC_FIGHTERS_RAW, 'r') as f:
    data = json.load(f)
```

---

## Recommended Schedule

### 🥊 **After UFC Events** (Sunday/Monday):
```bash
python pipeline.py    # [3] Post-Event Update
# OR manually:
python scrape_details.py     # [3] Update ranked images  
python scrape_rankings.py    # [1] Full scrape (check if updated first)
python scrape_sherdog.py     # [1] Full scrape
python scrape_upcoming_fights.py  # [1] Full scrape
```

### 🔄 **Regular Updates** (2-3x per week):
```bash
python scrape_upcoming_fights.py  # [1] Full scrape
python upload_upcoming_fights.py
```

### 📅 **Monthly Maintenance**:
```bash
python pipeline.py    # [1] Full Refresh
```

### 🔧 **Error Cleanup** (as needed):
```bash
python status.py  # Check what needs fixing
python scrape_details.py     # [2] Retry errors
python scrape_sherdog.py     # [2] Retry errors
```

---

## Error Files Reference

| File | Common Issues | Fix |
|------|---------------|-----|
| `details_errors.json` | Failed profile scrapes | Re-run option [2] |
| `sherdog_failures.json` | Name matching failures | Update `NAME_FIXES` |
| `rankings_errors.json` | Missing UUIDs | Add fighters to roster first |
| `upcoming_errors.json` | Missing UUIDs | Add fighters to roster first |
| `unmatched_fighters.txt` | UFC fighters not in Sherdog | Update `NAME_FIXES` |

---

## Configuration Files

### name_fixes.py
```python
NAME_FIXES = {"UFC_NAME": "SHERDOG_NAME"}     # Name variations
URL_OVERRIDES = {"FIGHTER": "direct_sherdog_url"}  
UFC_ROSTER = {"Fighter Name": "ufc_profile_url"}   # Manual additions
TAPOLOGY_FIXES = {"tapology_name": "fixed_name"}
```

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
1. **🔄 Auto-Upload Integration**
   ```python
   # Add to each scraper:
   if args.upload and successful_scrape:
       run_upload_script()
   ```

2. **🚨 Centralized Error Dashboard**
   - Consolidate all error files into single view
   - Auto-suggest fixes (e.g., "Add NAME_FIXES entry")

3. **📊 Smart Event-Based Scheduling**
   - Auto-detect UFC event dates
   - Run appropriate scrapers at optimal times

#### Priority 2 - Efficiency & Data Quality
4. **🎯 Selective Fighter Updates**
   - Only scrape fighters with recent activity post-fight
   - Priority tiers: active > ranked > recently fought

5. **🏗️ Historic Data Preservation**
   ```python
   # Instead of overwriting, append with timestamps
   data_with_timestamp = {
       "scraped_at": datetime.now(),
       "fighters": fighter_data
   }
   ```

6. **🔍 Intelligent Name Matching**
   - Fuzzy matching with confidence scores
   - Reduce manual NAME_FIXES maintenance

#### Priority 3 - New Features
7. **💰 Betting Data Integration**
   - Odds scraper for multiple sportsbooks
   - Round betting, method betting, props
   - Historical odds movement tracking

8. **📈 Champion Change Detection**
   ```python
   # In scrape_rankings.py
   def detect_title_changes(old_rankings, new_rankings):
       for division in new_rankings:
           old_champ = get_champion(old_rankings, division)
           new_champ = get_champion(new_rankings, division)
           if old_champ != new_champ:
               log_title_change(division, old_champ, new_champ)
   ```

9. **🔐 Enhanced Rate Limiting**
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