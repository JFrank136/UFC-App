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
    url = "https://www.ufc.com/athletes/all"

    # --- Browser setup (visible for debugging) ---
    options = Options()
    # options.add_argument("--headless=new")  # disabled so you can see the browser
    options.add_experimental_option("detach", True)  # keeps window open after script ends
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    driver.get(url)

    # --- Load all fighters by repeatedly clicking “Load More” ---
    prev_count = 0
    stall_count = 0
    max_stalls = 3

    while True:
        try:
            # Scroll to bottom
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

            # Try to find and click the Load More button
            load_more = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "a.button[rel='next'], .button--load-more"))
            )
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", load_more)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", load_more)
            time.sleep(3)

            # Wait for more cards to appear
            cards = driver.find_elements(By.CSS_SELECTOR, "li.l-flex__item div.c-listing-athlete-flipcard__back")
            new_count = len(cards)

            if new_count == prev_count:
                stall_count += 1
                print(f"→ No new fighters (stall {stall_count}/{max_stalls})")
                if stall_count >= max_stalls:
                    print("→ Assuming end of list.")
                    break
            else:
                stall_count = 0
                prev_count = new_count

        except Exception as e:
            print("→ Load More failed or no more fighters.")
            break



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


    fighters = []
    for idx, card in enumerate(cards, start=1):  # track position for error reporting
        if idx % 100 == 0:
            print(f"→ {idx} cards processed so far…", flush=True)

        try:
            # Force the flip (if any styling still hides the back)
            driver.execute_script("arguments[0].classList.add('is-flipped')", card)
            time.sleep(0.2)

            name = card.find_element(By.CLASS_NAME, "c-listing-athlete__name").text.strip()
            profile_url = card.find_element(By.CLASS_NAME, "e-button--black").get_attribute("href")

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
                    print(f"    ⚠️ Timeout (attempt {attempt + 1}) for {name}")
                    time.sleep(1)  # slight pause before retry
                except Exception as e:
                    print(f"    ❌ Error fetching status for {name}: {e}")
                    logging.error(f"Failed to fetch status for {name}: {e}")
                    break  # don't retry on unexpected errors

            # Override if fighter is known Power Slap
            if name.upper() in POWER_SLAP:
                status = "Power Slap"

            fighters.append({
                "name": name,
                "profile_url": profile_url,
                "status": status,
                "id": str(uuid.uuid4())
            })

            print(f"    [+] Scraped: {name} ({status})", flush=True)

        except Exception as e:
            # log full stacktrace
            logging.error(f"Error parsing card {idx}: {e}\n" + traceback.format_exc())
            # save a summary for JSON output
            error_details.append({
                "card_index": idx,
                "error": str(e)
            })
            continue  # skip to next card


    driver.quit()

    # Add hardcoded fallback fighters from UFC_ROSTER
    existing_names = {f["name"].lower() for f in fighters}
    missing_names = [name for name in UFC_ROSTER if name.lower() not in existing_names]

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
            "profile_url": profile_url,
            "status": status,
            "id": str(uuid.uuid4())
        })
        print(f"    [+] Added hardcoded fighter: {name} ({status})")


    # --- Merge with existing JSON ---
    output_file = "data/ufc_fighters_raw.json"

    try:
        with open(output_file, "r", encoding="utf-8") as f:
            existing_fighters = json.load(f)
    except FileNotFoundError:
        existing_fighters = []

    # Index by name (lowercase) for fast lookup
    existing_map = {f["name"].lower(): f for f in existing_fighters}

    # Merge: update status if exists, add new if not
    for new_fighter in fighters:
        key = new_fighter["name"].lower()
        if key in existing_map:
            existing_map[key]["status"] = new_fighter["status"]  # update status
        else:
            existing_map[key] = new_fighter  # add new entry

    # Save updated dataset
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(list(existing_map.values()), f, indent=2, ensure_ascii=False)


    # summarize results
    scraped_count = len(fighters)
    fail_count = len(error_details)
    print(f"Scraped {scraped_count} fighters with {fail_count} errors.")

    # write detailed error summary if any failures occurred
    if error_details:
        with open("data/erros/roster_errors.json", "w", encoding="utf-8") as ef:
            json.dump(error_details, ef, indent=2, ensure_ascii=False)
        print("See 'scrape_errors.log' and 'scrape_errors.json' for full details.")


def inject_new_ufc_roster_entries(output_file="data/ufc_fighters_raw.json"):
    try:
        with open(output_file, "r", encoding="utf-8") as f:
            existing = json.load(f)
    except FileNotFoundError:
        existing = []

    existing_names = {f["name"].lower() for f in existing}
    new_entries = []
    new_error_entries = []  # Collect error-style log of injected fighters

    for name in UFC_ROSTER:
        if name.lower() not in existing_names:
            profile_url = UFC_ROSTER[name]
            fighter_id = str(uuid.uuid4())
            new_entry = {
                "name": name,
                "profile_url": profile_url,
                "status": "Active",
                "id": fighter_id
            }
            new_entries.append(new_entry)
            print(f"    [+] Injected: {name}")

            new_error_entries.append({
                "name": name,
                "uuid": fighter_id,
                "profile_url": profile_url,
                "reason": "manual add"
            })

    if new_entries:
        existing.extend(new_entries)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print(f"✅ Added {len(new_entries)} new UFC_ROSTER entries.")
    else:
        print("✅ No new entries to add.")

    # Log the injected fighters as error_details for scrape_details
    if new_error_entries:
        error_log_file = "data/errors/roster_errors.json"
        # Append to existing log if present
        try:
            with open(error_log_file, "r", encoding="utf-8") as ef:
                existing_errors = json.load(ef)
        except FileNotFoundError:
            existing_errors = []
        existing_errors.extend(new_error_entries)
        with open(error_log_file, "w", encoding="utf-8") as ef:
            json.dump(existing_errors, ef, indent=2, ensure_ascii=False)
        print(f"✅ Logged {len(new_error_entries)} manual adds to {error_log_file}")

        # Also prepare retry file for scrape_details
        details_retry_file = "data/errors/details_errors.json"
        with open(details_retry_file, "w", encoding="utf-8") as df:
            json.dump(new_error_entries, df, indent=2, ensure_ascii=False)
        print(f"✅ Prepared retry file for scrape_details: {details_retry_file}")

        # Also prepare retry file for Sherdog
        sherdog_retry_file = "data/errors/sherdog_failures.json"
        sherdog_entries = [
            {
                "name": entry["name"],
                "reason": "not found in search"
            }
            for entry in new_error_entries
        ]
        with open(sherdog_retry_file, "w", encoding="utf-8") as sf:
            json.dump(sherdog_entries, sf, indent=2, ensure_ascii=False)
        print(f"✅ Prepared retry file for Sherdog: {sherdog_retry_file}")




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
