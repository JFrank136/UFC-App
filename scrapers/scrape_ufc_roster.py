import requests
from bs4 import BeautifulSoup
import json
import time
import logging
import traceback
import requests.exceptions

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def scrape_ufc_fighters():
    base_url = "https://www.ufc.com/athletes/all"
    fighters = []
    page = 0

    while True:
        url = f"{base_url}?page={page}"
        print(f"Fetching page {page}…", end=" ")
        resp = requests.get(url)
        if resp.status_code != 200:
            print(f"→ HTTP {resp.status_code}, stopping.")
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select("li.l-flex__item div.c-listing-athlete-flipcard__back")
        if not cards:
            print("→ no more fighters found, done.")
            break

        for card in cards:
            # name
            name_el = card.select_one("span.c-listing-athlete__name")
            name = name_el.get_text(strip=True) if name_el else None

            # nickname
            nick_el = card.select_one("span.c-listing-athlete__nickname")
            nickname = nick_el.get_text(strip=True) if nick_el else None

            # profile URL (make absolute)
            link_el = card.select_one("a.e-button--black")
            href = link_el["href"] if link_el else None
            profile_url = f"https://www.ufc.com{href}" if href and href.startswith("/") else href

            fighters.append({
                "name": name,
                "nickname": nickname,
                "profile_url": profile_url
            })
            print(f"    [+] Scraped fighter: {name}")

        print(f"→ scraped {len(cards)} fighters on this page.")
        page += 1
        time.sleep(1)  # be polite

    # save to JSON
    with open("ufc_fighters.json", "w", encoding="utf-8") as f:
        json.dump(fighters, f, indent=2, ensure_ascii=False)

        print(f"→ scraped {len(cards)} fighters on this page.")
        print(f"→ total fighters so far: {len(fighters)}")


if __name__ == "__main__":
    scrape_ufc_fighters()

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
    prev_count = -1
    while True:
        # count how many cards are currently on the page
        cards = driver.find_elements(
            By.CSS_SELECTOR,
            "li.l-flex__item div.c-listing-athlete-flipcard__back"
        )
        curr_count = len(cards)
        # if we didn’t load any new cards, exit loop
        if curr_count == prev_count:
            break
        prev_count = curr_count

        try:
            # 1) scroll to bottom to reveal the pager link
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

            # 2) find the “Load More” link by its real selector
            next_link = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "a.button[rel='next']"))
            )

            # 3) scroll it into view and click via JS
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", next_link)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", next_link)

            # 4) wait for the page to append new cards
            WebDriverWait(driver, 10).until(
                lambda d: len(d.find_elements(
                    By.CSS_SELECTOR,
                    "li.l-flex__item div.c-listing-athlete-flipcard__back"
                )) > curr_count
            )
            time.sleep(1)
        except Exception as e:
            logging.error(f"Load-more loop stopped at {curr_count} cards: {e}")
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

            fighters.append({
                "name": name,
                "profile_url": profile_url,
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
