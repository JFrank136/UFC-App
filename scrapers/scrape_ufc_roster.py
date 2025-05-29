import requests
from bs4 import BeautifulSoup
import json
import time
import logging
import traceback
import requests.exceptions
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "utils"))


from name_fixes import NAME_FIXES, POWER_SLAP
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


# --- configure error logging ---
logging.basicConfig(
    filename='scrape_errors.log',
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

    # --- Load all fighters by clicking the real “Load More” button until no more pages ---
    while True:
        try:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

            next_button = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "a.button[rel='next']"))
            )

            if next_button:
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", next_button)
                time.sleep(0.5)
                driver.execute_script("arguments[0].click();", next_button)
                time.sleep(2)
            else:
                print("→ 'Load More' button not found — finished loading.")
                break

        except Exception as e:
            print("→ No more pages or failed to click Load More.")
            logging.warning(f"Stopped loading more cards: {e}")
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

            original_name = card.find_element(By.CLASS_NAME, "c-listing-athlete__name").text.strip()
            name = NAME_FIXES.get(original_name, original_name)

            profile_url = card.find_element(By.CLASS_NAME, "e-button--black").get_attribute("href")

            # Fetch profile page and grab status with retry
            status = "unknown"
            if name.upper() in POWER_SLAP:
                status = "Power Slap"
            else:
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
                            else:
                                status = "Active"  # Default to active if label is missing
                            break
                    except requests.exceptions.Timeout:
                        print(f"    ⚠️ Timeout (attempt {attempt + 1}) for {name}")
                        time.sleep(1)
                    except Exception as e:
                        print(f"    ❌ Error fetching status for {name}: {e}")
                        logging.error(f"Failed to fetch status for {name}: {e}")
                        break

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

            import uuid

            fighters.append({
                "id": str(uuid.uuid4()),
                "name": name.title(),  # Capitalizes first letter of each word
                "profile_url_ufc": profile_url,
                "status": status
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

    # --- Save results ---
    with open("data/ufc_fighters_raw.json", "w", encoding="utf-8") as f:
        json.dump(fighters, f, indent=2, ensure_ascii=False)

    # summarize results
    scraped_count = len(fighters)
    fail_count = len(error_details)
    print(f"Scraped {scraped_count} fighters with {fail_count} errors.")

    # write detailed error summary if any failures occurred
    if error_details:
        with open("scrape_errors.json", "w", encoding="utf-8") as ef:
            json.dump(error_details, ef, indent=2, ensure_ascii=False)
        print("See 'scrape_errors.log' and 'scrape_errors.json' for full details.")


if __name__ == "__main__":
    scrape_ufc_fighters()