import requests
from bs4 import BeautifulSoup
import json
import time
import logging
import traceback
import requests.exceptions
import uuid

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "utils"))
from name_fixes import UFC_ROSTER, POWER_SLAP

# Progress tracking helpers
def print_progress_bar(current, total, prefix='Progress', length=50):
    """Print a simple progress bar"""
    percent = 100 * (current / float(total))
    filled_length = int(length * current // total)
    bar = '█' * filled_length + '-' * (length - filled_length)
    print(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})', end='', flush=True)

# --- configure error logging ---
logging.basicConfig(
    filename='data/errors/roster_errors.log',
    filemode='a',
    level=logging.ERROR,
    format='%(asctime)s %(levelname)s: %(message)s'
)

# collect per-card error details
error_details = []


def scrape_ufc_fighters():
    print("🚀 Starting UFC roster scrape...")
    url = "https://www.ufc.com/athletes/all"

    # --- Browser setup ---
    options = Options()
    # options.add_argument("--headless=new")  # disabled so you can see the browser
    options.add_experimental_option("detach", True)  # keeps window open after script ends
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    driver.get(url)

    # --- Load all fighters by repeatedly clicking "Load More" ---
    print("📄 Loading fighter cards...")
    prev_count = 0
    stall_count = 0
    max_stalls = 3
    load_more_misses = 0
    max_load_more_misses = 3

    while True:
        try:
            # Scroll to bottom
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

            # Try to find and click the Load More button
            load_more = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "a.button[rel='next'], .button--load-more"))
            )
            load_more_misses = 0
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", load_more)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", load_more)
            time.sleep(3)

            # Wait for more cards to appear
            cards = driver.find_elements(By.CSS_SELECTOR, "li.l-flex__item div.c-listing-athlete-flipcard__back")
            new_count = len(cards)

            if new_count == prev_count:
                stall_count += 1
                if stall_count >= max_stalls:
                    break
            else:
                stall_count = 0
                prev_count = new_count

        except Exception as e:
            # The Load More button may just not have rendered yet (page still
            # hydrating) — give it a few short retries before concluding
            # pagination is actually done, instead of bailing on the first miss.
            load_more_misses += 1
            if load_more_misses >= max_load_more_misses:
                break
            time.sleep(2)

    # --- Wait for all back-side flipcards inside the list items ---
    WebDriverWait(driver, 15).until(
        EC.presence_of_all_elements_located((
            By.CSS_SELECTOR,
            "li.l-flex__item div.c-listing-athlete-flipcard__back"
        ))
    )


    # --- Dump HTML for manual inspection if needed ---
    with open("debug_ufc_page.html", "w", encoding="utf-8") as f:
        f.write(driver.page_source)

    # --- Select every back-side flipcard inside its list item ---
    cards = driver.find_elements(
        By.CSS_SELECTOR,
        "li.l-flex__item div.c-listing-athlete-flipcard__back"
    )


    print(f"   Loaded {len(cards)} fighter cards")
    print("⏳ Processing fighter profiles...")
    
    fighters = []
    timeout_count = 0
    consecutive_errors = 0
    
    for idx, card in enumerate(cards, start=1):
        # Show progress every 50 fighters
        if idx % 50 == 0 or idx == len(cards):
            print_progress_bar(idx, len(cards), "Processing")

        try:
            # Force the flip (if any styling still hides the back)
            driver.execute_script("arguments[0].classList.add('is-flipped')", card)

            # .text can come back empty if read mid-flip-transition, before the
            # element is considered "visible" — wait briefly for real text
            # instead of trusting a flat sleep.
            name_el = card.find_element(By.CLASS_NAME, "c-listing-athlete__name")
            try:
                WebDriverWait(driver, 2).until(lambda d: name_el.text.strip() != "")
            except Exception:
                pass
            name = name_el.text.strip()
            profile_url = card.find_element(By.CLASS_NAME, "e-button--black").get_attribute("href")

            if not name or not profile_url:
                raise ValueError(f"Blank name or profile_url after flip (card {idx})")

            # Fetch profile page and grab status with retry
            status = "unknown"
            retries = 3
            for attempt in range(retries):
                try:
                    profile_res = requests.get(profile_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
                    if profile_res.status_code == 200:
                        profile_soup = BeautifulSoup(profile_res.text, "html.parser")
                        status_el = profile_soup.find("div", class_="c-bio__label", string="Status")
                        if status_el:
                            status_val = status_el.find_next_sibling("div")
                            status = status_val.get_text(strip=True) if status_val else "unknown"
                        break  # success, exit retry loop
                except requests.exceptions.Timeout:
                    timeout_count += 1
                    time.sleep(1)  # slight pause before retry
                except Exception as e:
                    logging.error(f"Failed to fetch status for {name}: {e}")
                    break  # don't retry on unexpected errors

            # Override if fighter is known Power Slap
            if name.upper() in POWER_SLAP:
                status = "Power Slap"

            fighters.append({
                "name": name,
                "profile_url_ufc": profile_url,
                "status": status,
                "id": str(uuid.uuid4())
            })
            
            consecutive_errors = 0  # Reset on success

        except Exception as e:
            consecutive_errors += 1
            # log full stacktrace
            logging.error(f"Error parsing card {idx}: {e}\n" + traceback.format_exc())
            # save a summary for JSON output
            error_details.append({
                "card_index": idx,
                "error": str(e)
            })
            
            # Warn if too many consecutive errors
            if consecutive_errors >= 5:
                print(f"\n⚠️ Warning: {consecutive_errors} consecutive errors. Check connection or site changes.")
                consecutive_errors = 0  # Reset warning counter
            
            continue  # skip to next card
    
    print()  # New line after progress bar


    driver.quit()

    # Add hardcoded fallback fighters from UFC_ROSTER
    existing_names = {f["name"].lower() for f in fighters}
    missing_names = [name for name in UFC_ROSTER if name.lower() not in existing_names]
    roster_added = 0

    for name in missing_names:
        profile_url = UFC_ROSTER[name]
        if name.upper() == "TESTY TEST":
            status = "Retired"
        elif name.upper() in POWER_SLAP:
            status = "Power Slap"
        else:
            status = "Active"

        fighters.append({
            "name": name,
            "profile_url_ufc": profile_url,
            "status": status,
            "id": str(uuid.uuid4())
        })
        roster_added += 1

    # --- Merge with existing JSON (preserving existing IDs) ---
    output_file = "data/ufc_fighters_raw.json"

    try:
        with open(output_file, "r", encoding="utf-8") as f:
            existing_fighters = json.load(f)
    except FileNotFoundError:
        existing_fighters = []

    # Index by name (lowercase) for fast lookup, preserving existing IDs
    existing_map = {f["name"].lower(): f for f in existing_fighters}

    # Merge: update status if exists, add new if not (PRESERVE EXISTING IDs)
    for new_fighter in fighters:
        key = new_fighter["name"].lower()
        if key in existing_map:
            # Update status but keep existing ID
            existing_map[key]["status"] = new_fighter["status"]
            existing_map[key]["profile_url_ufc"] = new_fighter["profile_url_ufc"]  # Update URL too
        else:
            existing_map[key] = new_fighter  # add new entry with new ID

    # Save updated dataset
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(list(existing_map.values()), f, indent=2, ensure_ascii=False)

    # Print condensed summary
    print("\n📊 SCRAPING SUMMARY:")
    print(f"✅ Successfully scraped: {len(fighters) - roster_added} fighters")
    if timeout_count > 0:
        print(f"⚠️  Timeout/retry issues: {timeout_count} requests")
    if len(error_details) > 0:
        print(f"❌ Parse failures: {len(error_details)} fighters")
    if roster_added > 0:
        print(f"📁 Added from UFC_ROSTER: {roster_added} fighters")
    print(f"💾 Saved to: {output_file}")

    # write detailed error summary if any failures occurred
    if error_details:
        with open("data/errors/roster_errors.json", "w", encoding="utf-8") as ef:
            json.dump(error_details, ef, indent=2, ensure_ascii=False)
        print(f"\n⚠️  Error details saved to:")
        print(f"   • data/errors/roster_errors.log (full details)")
        print(f"   • data/errors/roster_errors.json (retry format)")

def inject_new_ufc_roster_entries(output_file="data/ufc_fighters_raw.json"):
    print("🔍 Checking for new UFC_ROSTER fighters...")
    
    try:
        with open(output_file, "r", encoding="utf-8") as f:
            existing = json.load(f)
    except FileNotFoundError:
        existing = []

    existing_names = {f["name"].lower() for f in existing}
    existing_uuids = {f.get("id") for f in existing if f.get("id")}
    new_entries = []
    new_error_entries = []  # Collect error-style log of injected fighters

    # Check what's new
    new_fighter_names = []
    for name in UFC_ROSTER:
        if name.lower() not in existing_names:
            new_fighter_names.append(name)

    if new_fighter_names:
        print(f"📥 Found {len(new_fighter_names)} new fighters to inject:")
        for name in new_fighter_names[:5]:  # Show first 5
            print(f"   • {name}")
        if len(new_fighter_names) > 5:
            print(f"   • ... and {len(new_fighter_names) - 5} more")
        print()

    for name in new_fighter_names:
        profile_url = UFC_ROSTER[name]
        fighter_id = str(uuid.uuid4())
        new_entry = {
            "name": name,
            "profile_url_ufc": profile_url,
            "status": "Active",
            "id": fighter_id
        }
        new_entries.append(new_entry)

        new_error_entries.append({
            "name": name,
            "uuid": fighter_id,
            "profile_url_ufc": profile_url,
            "reason": "manual add"
        })

    if new_entries:
        existing.extend(new_entries)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print(f"✅ Successfully injected {len(new_entries)} fighters")
        print(f"📁 Updated: {output_file}")
    else:
        print("✅ No new fighters found in UFC_ROSTER")
        return
    
    # Update error files - deduplicate by UUID and remove successfully added fighters
    if new_error_entries:
        print("🔄 Updating error files for downstream scrapers:")
        
        error_log_file = "data/errors/roster_errors.json"
        
        # Load existing errors and deduplicate by UUID
        try:
            with open(error_log_file, "r", encoding="utf-8") as ef:
                existing_errors = json.load(ef)
        except FileNotFoundError:
            existing_errors = []
        
        # Create a map of existing errors by UUID for deduplication
        error_map = {}
        for error in existing_errors:
            uuid_key = error.get("uuid")
            if uuid_key:
                error_map[uuid_key] = error
        
        # Add new errors (will overwrite if UUID already exists)
        for new_error in new_error_entries:
            uuid_key = new_error.get("uuid")
            if uuid_key:
                error_map[uuid_key] = new_error
        
        # Remove any errors for fighters that are now successfully in the roster
        filtered_errors = []
        for error in error_map.values():
            error_uuid = error.get("uuid")
            # Only keep errors for fighters NOT successfully added to roster
            if error_uuid not in existing_uuids:
                filtered_errors.append(error)
            else:
                print(f"   🧹 Removed {error.get('name', 'Unknown')} from error file (successfully added)")
        
        # Save deduplicated and filtered errors
        with open(error_log_file, "w", encoding="utf-8") as ef:
            json.dump(filtered_errors, ef, indent=2, ensure_ascii=False)
        print(f"   • {error_log_file} (deduplicated and cleaned)")

        # Also prepare retry file for scrape_details (deduplicated)
        details_retry_file = "data/errors/details_errors.json"
        details_entries = [
            {
                "name": entry["name"],
                "uuid": entry["uuid"],
                "profile_url_ufc": entry["profile_url_ufc"],
                "reason": "manual add"
            }
            for entry in filtered_errors  # Use filtered errors to avoid duplicates
        ]
        
        with open(details_retry_file, "w", encoding="utf-8") as df:
            json.dump(details_entries, df, indent=2, ensure_ascii=False)
        print(f"   • {details_retry_file}")


        
        print(f"🎯 Final error file contains {len(filtered_errors)} unresolved fighters")


if __name__ == "__main__":
    print("🔄 Full scrape or just inject new UFC_ROSTER fighters?")
    print("[1] Full scrape")
    print("[2] Only add new fighters from UFC_ROSTER")
    choice = input("Enter 1 or 2: ").strip()

    if choice == "1":
        scrape_ufc_fighters()
    elif choice == "2":
        inject_new_ufc_roster_entries()
    else:
        print("❌ Invalid choice. Exiting.")