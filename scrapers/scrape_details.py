import json
import requests
from bs4 import BeautifulSoup
import time
import uuid
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from functools import lru_cache
from uuid import UUID
import re
from typing import Dict, List, Optional
import logging


def download_image(url, save_path):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.ufc.com/"
        }
        res = requests.get(url, stream=True, headers=headers, timeout=10)
        if res.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(1024):
                    f.write(chunk)
            logger.info(f"✅ Downloaded image: {save_path}")
            return True
        else:
            logger.warning(f"❌ Image download failed: HTTP {res.status_code} for {url}")
    except Exception as e:
        logger.error(f"❌ Failed to download image: {e}")
    return False

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SessionManager:
    """Thread-safe session with connection pooling and rate limiting"""
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        })
        # Enhanced connection pooling
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=20,
            pool_maxsize=20,
            max_retries=3
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        self.lock = threading.Lock()
        self.request_times = []
        self.min_delay = 0.5  # Minimum delay between requests
    
    def get(self, url, **kwargs):
        with self.lock:
            # Rate limiting
            now = time.time()
            self.request_times = [t for t in self.request_times if now - t < 60]  # Keep last minute
            
            if len(self.request_times) > 30:  # Max 30 requests per minute
                sleep_time = 60 - (now - self.request_times[0])
                if sleep_time > 0:
                    time.sleep(sleep_time)
            
            # Ensure minimum delay
            if self.request_times:
                last_request = self.request_times[-1]
                time_since_last = now - last_request
                if time_since_last < self.min_delay:
                    time.sleep(self.min_delay - time_since_last)
            
            self.request_times.append(time.time())
        
        return self.session.get(url, **kwargs)

# Global session manager
session_manager = SessionManager()


def _scrape_details(profile_url_ufc):
    """Scrape detailed fighter information from UFC profile"""
    try:
        res = session_manager.get(profile_url_ufc, timeout=15)
        if res.status_code != 200:
            logger.warning(f"Failed to load profile: {profile_url_ufc} (Status: {res.status_code})")
            return {}

        soup = BeautifulSoup(res.text, "html.parser")
        data = {}

        # Use full-body profile image instead of unreliable headshot
        fighter_slug = profile_url_ufc.rstrip('/').split('/')[-1]

        # Target UFC full-body image with multiple selectors
        image_url = None
        image_el = (soup.select_one("img.hero-profile__image") or 
                   soup.select_one("img[class*='hero-profile']") or
                   soup.select_one("img[class*='athlete_bio_full_body']") or
                   soup.select_one(".hero-profile img"))
        if image_el and image_el.get("src"):
            src = image_el["src"].strip()
            if src.startswith("//"):
                image_url = "https:" + src
            elif src.startswith("/"):
                image_url = "https://www.ufc.com" + src
            else:
                image_url = src

            # Accept any valid UFC image URL
            if "ufc.com" not in image_url.lower():
                logger.warning(f"⚠️ Non-UFC image URL for {fighter_slug}: {image_url}")
                image_url = None
        else:
            # Try additional selectors
            backup_selectors = [
                "img[src*='athlete_bio']",
                "img[src*='fighter']", 
                ".hero-profile img",
                ".c-hero img",
                "img[alt*='Fighter']"
            ]
            
            for selector in backup_selectors:
                backup_el = soup.select_one(selector)
                if backup_el and backup_el.get("src"):
                    src = backup_el["src"].strip()
                    if src.startswith("//"):
                        image_url = "https:" + src
                    elif src.startswith("/"):
                        image_url = "https://www.ufc.com" + src
                    else:
                        image_url = src
                    logger.info(f"🔍 Found backup image for {fighter_slug}: {selector}")
                    break
            
            if not image_url:
                logger.warning(f"⚠️ Could not find any image for {fighter_slug}")

        
        if image_url:
            image_dir = os.path.join("static", "fighter_images")
            os.makedirs(image_dir, exist_ok=True)
            image_path = os.path.join(image_dir, f"{fighter_slug}.jpg")

            if os.path.exists(image_path):
                logger.info(f"Image already exists for {fighter_slug}, skipping download.")
                data["image_local_path"] = image_path
            else:
                logger.info(f"Downloading image for {fighter_slug}: {image_url}")
                success = download_image(image_url, image_path)
                if success:
                    data["image_local_path"] = image_path
                else:
                    logger.warning(f"Failed to download image for {fighter_slug}")
            data["image_url"] = image_url
            data["image_verified"] = True
            logger.info(f"✅ Image verified for {fighter_slug}")

        else:
            # Use fallback
            data["image_url"] = "/static/images/placeholder.jpg"
            data["image_local_path"] = "static/images/placeholder.jpg"
            logger.info(f"📷 Using placeholder for {fighter_slug}")
            data["image_verified"] = False

        # Bio extraction - more robust
        bio_labels = soup.select("div.c-bio__label")
        bio_data = {}
        for label_el in bio_labels:
            label = label_el.get_text(strip=True)
            value_el = label_el.find_next_sibling("div")
            if value_el:
                value = value_el.get_text(strip=True)
                bio_data[label] = value

        # Enhanced bio extraction
        data.update({
            "height": bio_data.get("Height"),
            "weight": bio_data.get("Weight"), 
            "reach": bio_data.get("Reach"),
        })

        # Main stats with error handling
        stats = soup.select(".c-stat-3bar__value")
        if len(stats) >= 5:
            data.update({
                "strikes_landed_per_min": stats[0].text.strip(),
                "strikes_absorbed_per_min": stats[1].text.strip(), 
                "takedown_avg": stats[2].text.strip(),
                "submission_avg": stats[3].text.strip(),
                "striking_defense": stats[4].text.strip()
            })

        # Additional stats
        stat_blocks = soup.find_all("div", class_="c-stat-compare__number")
        if len(stat_blocks) >= 2:
            data.update({
                "knockdown_avg": stat_blocks[0].text.strip(),
                "avg_fight_time": stat_blocks[1].text.strip()
            })

        # Sig. strikes by target - enhanced
        target_group = soup.find("div", class_="c-body--athlete-body")
        if target_group:
            target_rows = target_group.select("div.c-stat-body__row")
            target_stats = {}
            for row in target_rows:
                label_el = row.select_one(".c-stat-body__label")
                value_el = row.select_one(".c-stat-body__value")
                if label_el and value_el:
                    target_stats[label_el.text.strip().lower()] = value_el.text.strip()
            
            if target_stats:
                data["sig_strikes_by_target"] = target_stats

        # Fight history summary
        record_element = soup.select_one(".c-hero__headline-suffix")
        if record_element:
            data["record"] = record_element.get_text(strip=True)

        return data
        
    except Exception as e:
        logger.error(f"Error scraping {profile_url_ufc}: {e}")
        return {}

@lru_cache(maxsize=1000)
def scrape_details(profile_url_ufc):
    """Public interface - uses caching"""
    return _scrape_details(profile_url_ufc)
    
def process_fighter(fighter_info):
    """Process a single fighter with enhanced error handling"""
    idx, total, fighter = fighter_info
    
    # Validate UUID
    try:
        UUID(fighter["id"])
    except (ValueError, KeyError):
        logger.error(f"Invalid UUID for {fighter.get('name', 'Unknown')}: {fighter.get('id', 'Missing')}")
        return None

    fighter_name = fighter.get('name', 'Unknown')
    logger.info(f"[{idx}/{total}] Processing {fighter_name} ({total - idx} remaining)")

    # Skip if image already verified AND file exists
    if (fighter.get("image_verified") is True and 
        fighter.get("image_local_path") and 
        os.path.exists(fighter.get("image_local_path", ""))):
        logger.info(f"🛑 Skipping {fighter_name} (image already verified and exists)")
        return fighter


    # Get profile URL - handle both possible keys
    profile_url_ufc = fighter.get("profile_url_ufc") or fighter.get("profile_url_ufc")
    if not profile_url_ufc:
        logger.warning(f"No profile URL for {fighter_name}")
        return None

    # Scrape detailed profile information
    details = scrape_details(profile_url_ufc)
    if not details:
        logger.warning(f"Failed to scrape profile details for {fighter_name}")
        return None

    
    # Create enriched fighter data
    enriched_fighter = fighter.copy()
    enriched_fighter.update(details)

    
    # Add scraping metadata
    enriched_fighter["last_updated"] = time.time()
    
    logger.info(f"✅ Successfully enriched: {fighter_name}")
    return enriched_fighter

def thread_safe_save(enriched, output_file):
    """Thread-safe save function with backup"""
    backup_file = f"{output_file}.backup"
    output_dir = os.path.dirname(output_file) or "."
    os.makedirs(output_dir, exist_ok=True)

    with session_manager.lock:
        try:
            # Create backup if existing file
            if os.path.exists(output_file):
                os.rename(output_file, backup_file)

            # ✅ This actually saves the file
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(enriched, f, indent=2, ensure_ascii=False)

            # Clean up backup
            if os.path.exists(backup_file):
                os.remove(backup_file)

            logger.info(f"✅ File saved at: {os.path.abspath(output_file)}")

        except Exception as e:
            logger.error(f"Error saving data: {e}")
            if os.path.exists(backup_file):
                os.rename(backup_file, output_file)
            raise

def enrich_roster(input_file="data/ufc_fighters_raw.json", output_file="data/ufc_details.json", max_workers=4):
    """Enhanced main function with better error handling and progress tracking"""
    
    # Load existing data
    try:
        with open(input_file, "r", encoding="utf-8") as f:
            roster = json.load(f)
    except FileNotFoundError:
        logger.error(f"Input file not found: {input_file}")
        return
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in input file: {input_file}")
        return

    # Filter active fighters
    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
    total = len(active_fighters)
    
    if not active_fighters:
        logger.warning("No active fighters found in input data")
        return
    
    logger.info(f"🚀 Processing {total} active fighters with {max_workers} concurrent workers...")
    
    
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_file) or "."
    os.makedirs(output_dir, exist_ok=True)

    # Prepare fighter processing list
    fighters_to_process = [
        (idx, total, fighter) 
        for idx, fighter in enumerate(active_fighters, start=1)
    ]
    
    enriched = []
    failed_fighters = []
    batch_save_interval = 10  # Save every 10 successful scrapes
    
    # Process fighters concurrently
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_fighter = {
            executor.submit(process_fighter, fighter_info): fighter_info 
            for fighter_info in fighters_to_process
        }
        
        for future in as_completed(future_to_fighter):
            try:
                enriched_fighter = future.result(timeout=30)
                
                if enriched_fighter:
                    enriched.append(enriched_fighter)
                    
                    # Batch save for progress preservation
                    if len(enriched) % batch_save_interval == 0:
                        thread_safe_save(enriched, output_file)
                        logger.info(f"💾 Batch saved {len(enriched)} records...")
                else:
                    fighter_info = future_to_fighter[future]
                    failed_fighters.append(fighter_info)
                    
            except Exception as e:
                fighter_info = future_to_fighter[future]
                fighter_name = fighter_info[2].get('name', 'Unknown')
                logger.error(f"Exception processing {fighter_name}: {e}")
                failed_fighters.append(fighter_info)

    # Handle retries for failed fighters
    max_retries = 2
    retry_count = 0
    
    while failed_fighters and retry_count < max_retries:
        retry_count += 1
        logger.info(f"🔄 Retry attempt {retry_count}/{max_retries} for {len(failed_fighters)} failed fighters...")
        
        current_failures = failed_fighters.copy()
        failed_fighters = []
        
        # Use fewer workers for retries
        retry_workers = min(2, len(current_failures))
        
        with ThreadPoolExecutor(max_workers=retry_workers) as executor:
            future_to_fighter = {
                executor.submit(process_fighter, fighter_info): fighter_info 
                for fighter_info in current_failures
            }
            
            for future in as_completed(future_to_fighter):
                try:
                    enriched_fighter = future.result(timeout=45)
                    
                    if enriched_fighter:
                        enriched.append(enriched_fighter)
                        logger.info(f"✅ Retry success: {enriched_fighter['name']}")
                    else:
                        fighter_info = future_to_fighter[future]
                        failed_fighters.append(fighter_info)
                        
                except Exception as e:
                    fighter_info = future_to_fighter[future]
                    fighter_name = fighter_info[2].get('name', 'Unknown')
                    logger.error(f"Retry exception for {fighter_name}: {e}")
                    failed_fighters.append(fighter_info)

    # Final save
    thread_safe_save(enriched, output_file)
    
    # Generate summary report
    success_count = len(enriched)
    failure_count = len(failed_fighters)
    success_rate = (success_count / total) * 100 if total > 0 else 0
    
    logger.info(f"\n📊 SUMMARY REPORT")
    logger.info(f"✅ Successfully processed: {success_count}/{total} fighters ({success_rate:.1f}%)")
    
    if failed_fighters:
        logger.warning(f"❌ Failed to process: {failure_count} fighters")
        
        # Save failed fighters in simple retry format
        failures_file = "data/errors/details_errors.json"
        os.makedirs(os.path.dirname(failures_file), exist_ok=True)

        failed_data = [
            {
                "name": fighter[2].get('name', 'Unknown'),
                "uuid": fighter[2].get('id', 'Unknown'),
                "profile_url_ufc": fighter[2].get('profile_url_ufc') or fighter[2].get('profile_url_ufc', 'Unknown'),
                "reason": "scrape failed"
            }
            for fighter in failed_fighters
        ]
        
        with open(failures_file, "w", encoding="utf-8") as f:
            json.dump(failed_data, f, indent=2, ensure_ascii=False)

        
        logger.info(f"💾 Failed fighters report saved to {failures_file}")

    logger.info(f"📁 Final data saved to {output_file}")

def enrich_roster_sequential(input_file="data/ufc_fighters_raw.json", output_file="data/ufc_details.json"):
    """Sequential version for debugging or when concurrent processing causes issues"""
    logger.info("🐌 Running in sequential mode...")
    
    with open(input_file, "r", encoding="utf-8") as f:
        roster = json.load(f)

    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
    total = len(active_fighters)
    enriched = []


    for idx, fighter in enumerate(active_fighters, start=1):
        try:
            UUID(fighter["id"])
        except (ValueError, KeyError):
            logger.error(f"Invalid UUID for {fighter.get('name', 'Unknown')}")
            continue

        result = process_fighter((idx, total, fighter))
        if result:
            enriched.append(result)

        # Save progress every 5 fighters
        if len(enriched) % 5 == 0:
            thread_safe_save(enriched, output_file)

        time.sleep(1)  # Be extra respectful in sequential mode

    thread_safe_save(enriched, output_file)
    logger.info(f"✅ Sequential processing complete. Saved {len(enriched)} fighters to {output_file}")


if __name__ == "__main__":
    import sys
    print("Run mode:\n[1] Full scrape\n[2] Retry from details_errors.json")
    mode = input("Choose 1 or 2: ").strip()

    sequential_mode = "--sequential" in sys.argv
    max_workers = 4
    for arg in sys.argv:
        if arg.startswith("--workers="):
            try:
                max_workers = int(arg.split("=")[1])
                max_workers = max(1, min(max_workers, 10))
            except ValueError:
                logger.warning("Invalid worker count, using default (4)")


    if mode == "1":
        logger.info(f"🚀 Running full scrape with {max_workers} workers...")
        enrich_roster(max_workers=max_workers)

    elif mode == "2":
        retry_file = "data/errors/details_errors.json"
        input_roster_file = "data/ufc_fighters_raw.json"
        output_file = "data/ufc_details.json"

        # Load main roster and error list
        try:
            with open(input_roster_file, "r", encoding="utf-8") as f:
                full_roster = json.load(f)
            with open(retry_file, "r", encoding="utf-8") as f:
                retry_list = json.load(f)
        except Exception as e:
            logger.error(f"❌ Failed to load input files: {e}")
            sys.exit(1)

        # Build a map of current active fighters: name.lower() and uuid => fighter
        active_fighters = { 
            (f.get("name", "").strip().lower(), str(f.get("id", "")).strip()): f 
            for f in full_roster if f.get("status", "").lower() == "active"
        }
        active_names = set(name for (name, uid) in active_fighters.keys())
        active_uuids = set(uid for (name, uid) in active_fighters.keys())

        # Prepare retry list with up-to-date info from roster, or use error file info if missing
        to_retry = []
        for entry in retry_list:
            name = entry.get("name", "").strip()
            uuid_ = str(entry.get("uuid", "")).strip()
            key = (name.lower(), uuid_)
            # Prefer current info from active roster (keeps freshest profile_url_ufc, etc)
            match = active_fighters.get(key)
            if not match:
                # Try matching by name only (in case uuid changed)
                alt_key = next((k for k in active_fighters if k[0] == name.lower()), None)
                if alt_key:
                    match = active_fighters[alt_key]
            if match:
                to_retry.append(match)
            else:
                # Fallback to error entry data if not found in active roster
                # This shouldn't happen unless you have a mismatch, but is safe
                new_fighter = dict(entry)
                new_fighter["id"] = uuid_
                new_fighter["status"] = "active"
                to_retry.append(new_fighter)

        if not to_retry:
            logger.warning("⚠️ No matching fighters found for retry.")
            sys.exit(0)

        # Enrich and merge results (only for to_retry list)
        enriched = []
        for idx, fighter in enumerate(to_retry, 1):
            result = process_fighter((idx, len(to_retry), fighter))
            if result:
                enriched.append(result)
            else:
                logger.warning(f"❌ Retry failed for {fighter.get('name')}")
            time.sleep(1)

        # Merge into existing details, only for active fighters!
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                existing_details = json.load(f)
        except FileNotFoundError:
            existing_details = []

        # Build a map of existing details by both name (lower) and uuid (id)
        details_by_name = {f.get("name", "").strip().lower(): f for f in existing_details}
        details_by_uuid = {str(f.get("id", "")).strip(): f for f in existing_details}

        # Remove any details for fighters no longer active
        active_names_set = set([f.get("name", "").strip().lower() for f in full_roster if f.get("status", "").lower() == "active"])
        active_uuids_set = set([str(f.get("id", "")).strip() for f in full_roster if f.get("status", "").lower() == "active"])
        filtered_existing_details = [
            f for f in existing_details
            if f.get("name", "").strip().lower() in active_names_set and str(f.get("id", "")).strip() in active_uuids_set
        ]

        # Merge/replace enriched fighters into filtered details (no duplicates)
        merged = {str(f.get("id", "")).strip(): f for f in filtered_existing_details}
        for f in enriched:
            merged[str(f.get("id", "")).strip()] = f
            # Also allow name match (in case UUID changed), but UUID is preferred
            merged[f.get("name", "").strip().lower()] = f

        # Final output: unique by UUID, and only for active fighters
        out_fighters = {}
        for key, fighter in merged.items():
            uuid_ = str(fighter.get("id", "")).strip()
            name = fighter.get("name", "").strip().lower()
            # Only include if in active set
            if (name in active_names_set and uuid_ in active_uuids_set):
                out_fighters[uuid_] = fighter

        # Save
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(list(out_fighters.values()), f, indent=2, ensure_ascii=False)
        logger.info(f"✅ Saved retried and refreshed data to {output_file}")
