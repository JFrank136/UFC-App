import os
import time
import json
from datetime import datetime
from dateutil import parser
from bs4 import BeautifulSoup
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "https://www.tapology.com/fightcenter?group=ufc"
OUTPUT_PATH = "data/upcoming_fights_raw.json"

def setup_browser():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    return uc.Chrome(options=options, use_subprocess=True)

def get_event_links(driver):
    print("🌐 Fetching UFC event list...")
    driver.get(BASE_URL)
    WebDriverWait(driver, 10).until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a[href^='/fightcenter/events/']"))
    )
    soup = BeautifulSoup(driver.page_source, "html.parser")
    links = soup.select("a[href^='/fightcenter/events/']")
    urls = {
        "https://www.tapology.com" + a["href"]
        for a in links if "ufc" in a["href"].lower()
    }
    print(f"📆 Found {len(urls)} UFC events")
    return list(urls)

def parse_event_datetime(soup):
    try:
        date_span = soup.select_one("span.text-neutral-700")
        raw = date_span.get_text(strip=True)
        dt = parser.parse(raw, ignoretz=True)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")
    except Exception as e:
        print(f"⚠️  Failed to parse date/time: {e}")
        return "TBD", "TBD"

def parse_fights(soup, event_title, event_type, event_date, event_time):
    fight_blocks = soup.select("li[data-controller='table-row-background']")
    if not fight_blocks:
        print("⚠️  No fight blocks found")
        return []

    fights = []
    for idx, block in enumerate(reversed(fight_blocks), start=1):  # reverse so main = 1
        try:
            f1_tag = block.select_one("div.order-1 a.link-primary-red")
            f2_tag = block.select_one("div.order-2 a.link-primary-red")
            if not f1_tag or not f2_tag:
                raise ValueError("One or both fighter tags missing")

            fighter1 = f1_tag.get_text(strip=True)
            fighter2 = f2_tag.get_text(strip=True)

            fight_order = idx  # Use index instead of parsing HTML

            section_tag = block.select_one("a[href^='/fightcenter/bouts/']")
            card_section = section_tag.get_text(strip=True) if section_tag else "Unknown"

            weight_tag = block.select_one("span.bg-tap_darkgold")
            weight_class = weight_tag.get_text(strip=True) if weight_tag else "TBD"

            fights.append({
                "event": event_title,
                "event_type": event_type,
                "event_date": event_date,
                "event_time": event_time,
                "fighter1": fighter1,
                "fighter2": fighter2,
                "fight_order": fight_order,
                "card_section": card_section,
                "weight_class": weight_class,
                "scraped_at": datetime.utcnow().isoformat()
            })

        except Exception as fe:
            print(f"❌ Failed to parse fight block: {fe}")
            continue

    print(f"✅ Scraped {len(fights)} fights")
    return fights

def scrape_event(driver, url):
    print(f"\n🔍 Scraping: {url}")
    driver.get(url)

    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "li[data-controller='table-row-background']"))
        )
    except Exception as e:
        print(f"⚠️  Fight cards did not load: {e}")
        return []

    soup = BeautifulSoup(driver.page_source, "html.parser")

    # Get title
    try:
        title_tag = soup.find("h1") or soup.find("title")
        event_title = title_tag.get_text(strip=True).split("|")[0].strip()
    except Exception as e:
        print(f"❌ Failed to get event title: {e}")
        return []

    # Determine type
    if "fight night" in event_title.lower():
        event_type = "Fight Night"
    elif "ufc" in event_title.lower() and any(char.isdigit() for char in event_title):
        event_type = "PPV"
    else:
        event_type = "TBD"

    event_date, event_time = parse_event_datetime(soup)
    return parse_fights(soup, event_title, event_type, event_date, event_time)

def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    driver = setup_browser()

    all_fights = []
    try:
        links = get_event_links(driver)
        for link in links:
            try:
                fights = scrape_event(driver, link)
                all_fights.extend(fights)
                time.sleep(1)
            except Exception as e:
                print(f"❌ Failed to scrape: {link}\n   {e}")
    finally:
        try:
            driver.quit()
        except Exception as e:
            print(f"⚠️  Chrome quit() failed: {e}")


    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_fights, f, indent=2, ensure_ascii=False)

    print(f"\n🎯 Done. Saved {len(all_fights)} fights to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
