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
import random
import sys
import unicodedata
import requests
import re
from pathlib import Path

def normalize_name(name: str) -> str:
    nfkd_form = unicodedata.normalize('NFKD', name)
    ascii_name = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    return ascii_name.strip().upper()


def apply_name_fixes(name: str) -> str:
    norm = normalize_name(name)
    fixed = TAPOLOGY_FIXES.get(norm, name)
    return fixed


def download_fight_card_image(url, save_path):
    """Download fight card image with proper headers"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.tapology.com/"
        }
        res = requests.get(url, stream=True, headers=headers, timeout=15)
        if res.status_code == 200:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(1024):
                    f.write(chunk)
            print(f"✅ Downloaded fight card image: {save_path}")
            return True
        else:
            print(f"❌ Image download failed: HTTP {res.status_code} for {url}")
    except Exception as e:
        print(f"❌ Failed to download fight card image: {e}")
    return False


def sanitize_filename(name):
    """Convert event title to safe filename"""
    # Remove or replace problematic characters
    safe_name = re.sub(r'[<>:"/\\|?*]', '', name)
    safe_name = re.sub(r'\s+', '_', safe_name.strip())
    return safe_name[:100]  # Limit length


sys.path.append("utils")  # or adjust as needed
try:
    from name_fixes import TAPOLOGY_FIXES as RAW_FIXES
    TAPOLOGY_FIXES = {name.upper(): fixed for name, fixed in RAW_FIXES.items()}
except ImportError:
    print("⚠️ Could not import TAPOLOGY_FIXES. Continuing without it.")
    TAPOLOGY_FIXES = {}


BASE_URL = "https://www.tapology.com/fightcenter?group=ufc"

FIGHTERS_RAW_PATH = "data/ufc_fighters_raw.json"

def load_uuid_lookup():
    try:
        with open(FIGHTERS_RAW_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {
                normalize_name(fighter["name"]): fighter["id"]
                for fighter in data if "name" in fighter and "id" in fighter
            }
    except Exception as e:
        print(f"⚠️ Failed to load fighters_raw: {e}")
        return {}
    
OUTPUT_PATH = "data/upcoming_fights.json"

def setup_browser():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--incognito")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--disable-plugins-discovery")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-infobars")
    options.add_argument("--start-maximized")

    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36")

    # Enable stealth mode
    driver = uc.Chrome(options=options, use_subprocess=True)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


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
        # Find the nearest span with label "Date/Time:"
        label = soup.find("span", string=lambda t: t and "Date/Time:" in t)
        if label and label.find_next_sibling("span"):
            raw = label.find_next_sibling("span").get_text(strip=True)
        else:
            raise ValueError("Could not locate event date/time span")

        dt = parser.parse(raw, ignoretz=True)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")
    except Exception as e:
        print(f"⚠️  Failed to parse date/time: {e}")
        return "TBD", "TBD"


def parse_venue_info(soup):
    """Extract venue name and location from event page"""
    venue = None
    location = None
    
    try:
        # Method 1: Look for venue in spans with "font-bold text-neutral-900" class
        venue_spans = soup.select("span.font-bold.text-neutral-900")
        for span in venue_spans:
            text = span.get_text(strip=True)
            # Check if this looks like a venue (contains common venue words)
            if any(word in text.lower() for word in ['arena', 'center', 'centre', 'stadium', 'dome', 'hall', 'pavilion', 'coliseum']):
                venue = text
                break
        
        # Method 1b: Look for UFC Apex and other venues in "text-neutral-700" spans
        if not venue:
            venue_spans_alt = soup.select("span.text-neutral-700")
            for span in venue_spans_alt:
                text = span.get_text(strip=True)
                # Check for UFC Apex specifically or other venue patterns
                if (text.lower() == "ufc apex" or 
                    any(word in text.lower() for word in ['arena', 'center', 'centre', 'stadium', 'dome', 'hall', 'pavilion', 'coliseum'])):
                    venue = text
                    break
        
        # Method 2: Look for location in links that might contain geographic info
        location_links = soup.select("a[href*='/regions/']")
        for link in location_links:
            text = link.get_text(strip=True)
            # Accept any location text from regions links (expanded beyond just US/common countries)
            if text and len(text) > 2:  # Basic validation - not empty and meaningful length
                location = text
                break
        
        # Method 3: Fallback - look for common venue patterns in text
        if not venue:
            page_text = soup.get_text()
            venue_pattern = r'(?:venue|location)[:\s]*([^,\n]*(?:arena|center|centre|stadium|dome|hall|pavilion|coliseum|apex)[^,\n]*)'
            venue_match = re.search(venue_pattern, page_text, re.IGNORECASE)
            if venue_match:
                venue = venue_match.group(1).strip()
        
        # Method 4: Look for expanded location patterns (international locations)
        if not location:
            page_text = soup.get_text()
            # Broader location patterns for international events
            location_patterns = [
                r'([A-Za-z\s]+,\s*[A-Za-z\s]+,\s*(?:United States|Canada|Brazil|UK|England|Australia|United Arab Emirates|Azerbaijan|France|Germany|Japan|Thailand|Philippines))',
                r'([A-Za-z\s]+,\s*(?:United Arab Emirates|Azerbaijan|France|Germany|Japan|Thailand|Philippines))',
                r'(Abu Dhabi,\s*Dubai,\s*United Arab Emirates)',
                r'(Baku,\s*Azerbaijan)',
                r'([A-Za-z\s]+,\s*[A-Za-z\s]+)'  # Generic city, country pattern as final fallback
            ]
            
            for pattern in location_patterns:
                location_match = re.search(pattern, page_text)
                if location_match:
                    potential_location = location_match.group(1).strip()
                    # Validate it looks like a real location (contains comma, reasonable length)
                    if ',' in potential_location and 3 <= len(potential_location) <= 100:
                        location = potential_location
                        break
    
    except Exception as e:
        print(f"⚠️ Error parsing venue info: {e}")
    
    return venue, location


def download_event_image(soup, event_title):
    """Download fight card image if available"""
    image_url = None
    image_local_path = None
    
    try:
        # Look for fight card image - common selectors
        image_selectors = [
            "img[alt*='UFC']",
            "img[src*='poster']",
            "img[src*='fight']",
            "img.w-4/5",
            "img[alt*='Fight Night']",
            "img[alt*='fight card']"
        ]
        
        for selector in image_selectors:
            img_element = soup.select_one(selector)
            if img_element and img_element.get('src'):
                src = img_element['src'].strip()
                
                # Convert relative URLs to absolute
                if src.startswith('//'):
                    image_url = 'https:' + src
                elif src.startswith('/'):
                    image_url = 'https://www.tapology.com' + src
                elif src.startswith('http'):
                    image_url = src
                else:
                    continue
                
                # Skip small images (likely not fight cards)
                if any(size in src.lower() for size in ['thumb', 'small', 'icon']):
                    continue
                
                print(f"🖼️ Found potential fight card image: {image_url}")
                break
        
        if image_url:
            # Create safe filename from event title
            safe_filename = sanitize_filename(event_title)
            
            # Determine file extension from URL
            file_extension = '.jpg'  # default
            if image_url.lower().endswith('.png'):
                file_extension = '.png'
            elif image_url.lower().endswith('.webp'):
                file_extension = '.webp'
            elif image_url.lower().endswith('.jpeg'):
                file_extension = '.jpeg'
            
            # Create file path
            image_dir = os.path.join("..", "ufc-tracker", "public", "fight_cards")
            image_filename = f"{safe_filename}{file_extension}"
            image_path = os.path.join(image_dir, image_filename)
            
            # Download image
            if download_fight_card_image(image_url, image_path):
                image_local_path = f"/fight_cards/{image_filename}"
                print(f"✅ Fight card image saved: {image_local_path}")
            else:
                print(f"❌ Failed to download fight card image for {event_title}")
    
    except Exception as e:
        print(f"⚠️ Error downloading event image: {e}")
    
    return image_url, image_local_path


def parse_fights(soup, event_title, event_type, event_date, event_time):
    fight_blocks = soup.select("li[data-controller='table-row-background']")
    if not fight_blocks:
        print("⚠️  No fight blocks found")
        return []

    fights = []
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).date()

    # Extract venue and location info
    venue, location = parse_venue_info(soup)
    print(f"🏟️ Venue: {venue if venue else 'Not found'}")
    print(f"📍 Location: {location if location else 'Not found'}")
    
    # Download event image
    image_url, image_local_path = download_event_image(soup, event_title)

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
            if "rumor" in card_section.lower():
                continue  # Skip rumor fights

            weight_tag = block.select_one("span.bg-tap_darkgold")
            weight_class = weight_tag.get_text(strip=True) if weight_tag else "TBD"

            fixed1 = apply_name_fixes(fighter1)
            fixed2 = apply_name_fixes(fighter2)
            print(f"🔎 UUID lookup: '{fighter1}' → fixed: '{fixed1}' → normalized: '{normalize_name(fixed1)}'")
            print(f"     → Matched UUID: {uuid_lookup.get(normalize_name(fixed1))}")
            print(f"🔎 UUID lookup: '{fighter2}' → fixed: '{fixed2}' → normalized: '{normalize_name(fixed2)}'")
            print(f"     → Matched UUID: {uuid_lookup.get(normalize_name(fixed2))}")

            uuid1 = uuid_lookup.get(normalize_name(fixed1))
            uuid2 = uuid_lookup.get(normalize_name(fixed2))

            if not uuid1:
                print(f"❌ Missing UUID for: {fighter1}")
            if not uuid2:
                print(f"❌ Missing UUID for: {fighter2}")

            # Skip past events
            try:
                fight_date_obj = datetime.strptime(event_date, "%Y-%m-%d").date()
                if fight_date_obj < now:
                    continue
            except Exception:
                pass  # If date is TBD or malformed, include it just in case

            fights.append({
                "event": event_title,
                "event_type": event_type,
                "event_date": event_date,
                "event_time": event_time,
                "venue": venue,
                "location": location,
                "fight_card_image_url": image_url,
                "fight_card_image_local_path": image_local_path,
                "fighter1": fighter1,
                "fighter2": fighter2,
                "uuid1": uuid1,
                "uuid2": uuid2,
                "fight_order": fight_order,
                "card_section": card_section,
                "weight_class": weight_class,
                "scraped_at": datetime.now(timezone.utc).isoformat()
            })

        except Exception as fe:
            print(f"❌ Failed to parse fight block: {fe}")
            continue

    print(f"✅ Scraped {len(fights)} fights")
    return fights

def scrape_event(driver, url):
    print(f"\n🔍 Scraping: {url}")
    try:
        driver.get(url)
    except Exception as e:
        print(f"❌ Failed to load event page: {url}\n  → {e}")
        return []

    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "li[data-controller='table-row-background']"))
        )
    except Exception:
        print("⚠️  Fight cards did not load")
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

    global uuid_lookup
    uuid_lookup = load_uuid_lookup()

    all_fights = []
    try:
        links = get_event_links(driver)
        for link in links:
            try:
                fights = scrape_event(driver, link)
                all_fights.extend(fights)
                time.sleep(random.uniform(1.5, 3.5))
            except Exception as e:
                print(f"❌ Failed to scrape: {link}\n   {e}")
                # Log failed events for retry
                error_event = {"url": link, "error": str(e), "timestamp": datetime.now(timezone.utc).isoformat()}
                error_file = "data/errors/upcoming_event_errors.json"
                try:
                    if os.path.exists(error_file):
                        with open(error_file, "r", encoding="utf-8") as f:
                            existing = json.load(f)
                    else:
                        existing = []
                    existing.append(error_event)
                    with open(error_file, "w", encoding="utf-8") as f:
                        json.dump(existing, f, indent=2, ensure_ascii=False)
                except Exception as err:
                    print(f"⚠️ Could not write to event error log: {err}")
    finally:
        try:
            driver.quit()
        except Exception as e:
            print(f"⚠️  Chrome quit() failed: {e}")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_fights, f, indent=2, ensure_ascii=False)

    print(f"\n🎯 Done. Saved {len(all_fights)} fights to {OUTPUT_PATH}")

    # Output a flat, deduped list of missing fighter names (either side)
    missing_names = set()
    for f in all_fights:
        if not f["uuid1"]:
            missing_names.add(f["fighter1"])
        if not f["uuid2"]:
            missing_names.add(f["fighter2"])
    missing_names = sorted(missing_names)

    if missing_names:
        os.makedirs("data/errors", exist_ok=True)
        with open("data/errors/upcoming_errors.json", "w", encoding="utf-8") as f:
            json.dump(missing_names, f, indent=2, ensure_ascii=False)
        print(f"⚠️ Logged {len(missing_names)} fighter names with missing UUIDs to data/errors/upcoming_errors.json")

if __name__ == "__main__":
    print("Select run mode:")
    print("[1] Full scrape")
    print("[2] Only try missing UUIDs")
    print("[3] Retry failed event cards")
    mode = input("Enter 1, 2, or 3: ").strip()

    if mode == "1":
        main()
    elif mode == "2":
        error_file = "data/errors/upcoming_errors.json"
        if not os.path.exists(error_file):
            print("No missing UUID file found.")
            sys.exit(0)

        with open(error_file, "r", encoding="utf-8") as f:
            missing_names = set(normalize_name(name.strip()) for name in json.load(f))

        driver = setup_browser()
        uuid_lookup = load_uuid_lookup()

        # Step 1: Load past fights to find matching events
        if not os.path.exists(OUTPUT_PATH):
            print("⚠️ Cannot retry — no past scraped fight data found.")
            sys.exit(1)

        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            existing_fights = json.load(f)

        # Step 2: Find relevant event URLs
        events_to_retry = set()
        for f in existing_fights:
            name1 = normalize_name(f["fighter1"]).lower()
            name2 = normalize_name(f["fighter2"]).lower()
            if name1 in missing_names or name2 in missing_names:
                events_to_retry.add(f["event"])

        print(f"🔁 Retrying {len(events_to_retry)} events based on missing fighters...")

        # Step 3: Load event links
        all_event_links = get_event_links(driver)
       
        # Build a map of event title → URL
        event_title_map = {}
        for link in all_event_links:
            driver.get(link)
            soup = BeautifulSoup(driver.page_source, "html.parser")
            try:
                title_tag = soup.find("h1") or soup.find("title")
                event_title = title_tag.get_text(strip=True).split("|")[0].strip()
                event_title_map[event_title] = link
            except Exception:
                continue

        # Match events to retry using exact title
        filtered_links = [event_title_map[evt] for evt in events_to_retry if evt in event_title_map]

        # Step 4: Scrape only those events
        all_fights = []
        for link in filtered_links:
            fights = scrape_event(driver, link)
            all_fights.extend(fights)
            time.sleep(random.uniform(1.5, 3.5))

        try:
            driver.quit()
        except Exception as e:
            print(f"⚠️ Chrome quit() failed: {e}")

        # Merge into output
        if os.path.exists(OUTPUT_PATH):
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
        else:
            existing = []

        def fight_key(f):
            return (f.get("event"), f.get("fighter1"), f.get("fighter2"), f.get("event_date"))
        
        existing_keys = {fight_key(f) for f in existing}
        new_fights = [f for f in all_fights if fight_key(f) not in existing_keys]
        merged = existing + new_fights

        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2, ensure_ascii=False)

        print(f"✅ Retried {len(all_fights)} fights and merged {len(new_fights)} new ones.")

        # Update missing UUIDs
        still_missing = set()
        for f in all_fights:
            if not f["uuid1"]:
                still_missing.add(f["fighter1"])
            if not f["uuid2"]:
                still_missing.add(f["fighter2"])
        still_missing = sorted(still_missing)

        with open(error_file, "w", encoding="utf-8") as f:
            json.dump(still_missing, f, indent=2, ensure_ascii=False)
        print(f"⚠️ Updated UUID error list with {len(still_missing)} fighters.")

    elif mode == "3":
        # Retry failed events
        error_file = "data/errors/upcoming_event_errors.json"
        if not os.path.exists(error_file):
            print("No failed event log found.")
            sys.exit(0)
        with open(error_file, "r", encoding="utf-8") as f:
            failed_events = json.load(f)
        if not failed_events:
            print("No failed events to retry.")
            sys.exit(0)
        driver = setup_browser()
        uuid_lookup = load_uuid_lookup()
        all_fights = []
        retried_urls = set()
        for entry in failed_events:
            url = entry.get("url")
            if not url:
                continue
            print(f"🔁 Retrying failed event: {url}")
            fights = scrape_event(driver, url)
            if fights:
                all_fights.extend(fights)
                retried_urls.add(url)
            time.sleep(random.uniform(1.5, 3.5))
        try:
            driver.quit()
        except Exception as e:
            print(f"⚠️ Chrome quit() failed: {e}")

        # --- Merge retried fights into main output file, deduping by all fight info ---
        output_path = "data/upcoming_fights.json"
        if os.path.exists(output_path):
            with open(output_path, "r", encoding="utf-8") as f:
                existing_fights = json.load(f)
        else:
            existing_fights = []

        # Simple dedupe by (event, fighter1, fighter2, event_date)
        def fight_key(f):
            return (
                f.get("event"),
                f.get("fighter1"),
                f.get("fighter2"),
                f.get("event_date"),
            )
        existing_fight_keys = {fight_key(f) for f in existing_fights}
        new_fights = [f for f in all_fights if fight_key(f) not in existing_fight_keys]

        merged_fights = existing_fights + new_fights

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(merged_fights, f, indent=2, ensure_ascii=False)
        print(f"✅ Retried and scraped {len(all_fights)} fights from failed events. Merged {len(new_fights)} new fights.")

        # --- Remove successfully retried events from error log ---
        remaining_errors = [entry for entry in failed_events if entry.get("url") not in retried_urls]
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump(remaining_errors, f, indent=2, ensure_ascii=False)
        print(f"🧹 Cleaned up {len(retried_urls)} retried events from error log.")

        if not all_fights:
            print("No fights scraped on retry.")
    else:
        print("❌ Invalid option.")