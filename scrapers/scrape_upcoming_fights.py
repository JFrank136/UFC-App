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

def print_progress_bar(current, total, prefix='Progress', bar_length=50):
    """Print a progress bar"""
    percent = float(current) * 100 / total
    filled_length = int(bar_length * current // total)
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    print(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})', end='', flush=True)

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
    """Extract venue name and location from event page using Tapology's specific HTML structure"""
    venue = None
    location = None
    
    try:
        # Method 1: Target Tapology's specific HTML structure
        # Look for list items with the venue/location labels
        list_items = soup.select("li.leading-normal")
        
        for li in list_items:
            # Get all spans in this list item
            bold_span = li.select_one("span.font-bold.text-neutral-900")
            value_span = li.select_one("span.text-neutral-700")
            
            if bold_span and value_span:
                label_text = bold_span.get_text(strip=True).lower()
                
                # Check for venue
                if "venue:" in label_text:
                    venue = value_span.get_text(strip=True)
                
                # Check for location
                elif "location:" in label_text:
                    # Location might contain a link, so get all text content
                    location = value_span.get_text(strip=True)
        
        # Method 2: Alternative approach using direct text search for labels
        if not venue or not location:
            # Find spans that contain "Venue:" or "Location:" as text
            all_spans = soup.find_all("span", class_="font-bold")
            
            for span in all_spans:
                span_text = span.get_text(strip=True).lower()
                
                if "venue:" in span_text and not venue:
                    # Look for the next span with venue info
                    next_span = span.find_next_sibling("span")
                    if not next_span:
                        # Try looking in parent element for text-neutral-700 span
                        parent = span.find_parent()
                        if parent:
                            next_span = parent.select_one("span.text-neutral-700")
                    
                    if next_span:
                        venue = next_span.get_text(strip=True)
                
                elif "location:" in span_text and not location:
                    # Look for the next span with location info
                    next_span = span.find_next_sibling("span")
                    if not next_span:
                        # Try looking in parent element for text-neutral-700 span
                        parent = span.find_parent()
                        if parent:
                            next_span = parent.select_one("span.text-neutral-700")
                    
                    if next_span:
                        location = next_span.get_text(strip=True)
        
        # Method 3: Regex fallback on page text (last resort)
        if not venue or not location:
            page_text = soup.get_text()
            
            if not venue:
                venue_match = re.search(r'Venue:\s*([^\n\r]+)', page_text, re.IGNORECASE)
                if venue_match:
                    venue = venue_match.group(1).strip()
            
            if not location:
                location_match = re.search(r'Location:\s*([^\n\r]+)', page_text, re.IGNORECASE)
                if location_match:
                    location = location_match.group(1).strip()
        
        # Method 4: Look for common venue names if still missing
        if not venue:
            venue_keywords = ['ufc apex', 'arena', 'center', 'centre', 'stadium', 'dome', 'hall', 'pavilion', 'coliseum']
            all_text_spans = soup.select("span.text-neutral-700")
            
            for span in all_text_spans:
                text = span.get_text(strip=True).lower()
                if any(keyword in text for keyword in venue_keywords):
                    venue = span.get_text(strip=True)
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
                # Fight card image saved successfully
                pass
    
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

            fighter1_id = uuid_lookup.get(normalize_name(fixed1))
            fighter2_id = uuid_lookup.get(normalize_name(fixed2))

            # Mark event status (upcoming vs past) but keep all events
            event_status = "upcoming"
            try:
                fight_date_obj = datetime.strptime(event_date, "%Y-%m-%d").date()
                if fight_date_obj < now:
                    event_status = "past"
            except Exception:
                event_status = "tbd"  # If date is TBD or malformed

            fights.append({
                "event": event_title,
                "event_type": event_type,
                "event_date": event_date,
                "event_time": event_time,
                "event_status": event_status,
                "venue": venue,
                "location": location,
                "fight_card_image_url": image_url,
                "fight_card_image_local_path": image_local_path,
                "fighter1": fighter1,
                "fighter2": fighter2,
                "fighter1_id": fighter1_id,
                "fighter2_id": fighter2_id,
                "fight_order": fight_order,
                "card_section": card_section,
                "weight_class": weight_class,
                "scraped_at": datetime.now(timezone.utc).isoformat()
            })

        except Exception as fe:
            print(f"❌ Failed to parse fight block: {fe}")
            continue

    return fights

def scrape_event(driver, url):
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
        total_links = len(links)
        for idx, link in enumerate(links, 1):
            try:
                print_progress_bar(idx, total_links, "Scraping Events")
                fights = scrape_event(driver, link)
                all_fights.extend(fights)
                time.sleep(random.uniform(1.5, 3.5))
            except Exception as e:
                # Log failed events for retry without verbose output
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

    # Generate summary statistics
    upcoming_fights = [f for f in all_fights if f.get("event_status") == "upcoming"]
    past_fights = [f for f in all_fights if f.get("event_status") == "past"]
    tbd_fights = [f for f in all_fights if f.get("event_status") == "tbd"]
    
    # Count missing UUIDs
    missing_names = set()
    for f in all_fights:
        if not f["fighter1_id"]:
            missing_names.add(f["fighter1"])
        if not f["fighter2_id"]:
            missing_names.add(f["fighter2"])
    missing_names = sorted(missing_names)

    print(f"\n📊 SCRAPING SUMMARY")
    print(f"✅ Total fights: {len(all_fights)}")
    print(f"   • Upcoming: {len(upcoming_fights)}")
    print(f"   • Past: {len(past_fights)}")
    print(f"   • TBD: {len(tbd_fights)}")
    if missing_names:
        print(f"⚠️ Missing UUIDs: {len(missing_names)} fighters")

    if missing_names:
        os.makedirs("data/errors", exist_ok=True)
        with open("data/errors/upcoming_errors.json", "w", encoding="utf-8") as f:
            json.dump(missing_names, f, indent=2, ensure_ascii=False)

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

        if not os.path.exists(OUTPUT_PATH):
            print("⚠️ Cannot update UUIDs — no existing fight data found.")
            sys.exit(1)

        print("🔄 Loading fresh UUID lookup and updating existing fights...")
        uuid_lookup = load_uuid_lookup()

        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            existing_fights = json.load(f)

        updated_count = 0
        still_missing = set()

        for fight in existing_fights:
            # Update fighter1 UUID if missing
            if not fight.get("fighter1_id"):
                # Apply name fixes before lookup
                fixed_name1 = apply_name_fixes(fight["fighter1"])
                new_uuid1 = uuid_lookup.get(normalize_name(fixed_name1))
                if new_uuid1:
                    fight["fighter1_id"] = new_uuid1
                    updated_count += 1
                else:
                    still_missing.add(fight["fighter1"])

            # Update fighter2 UUID if missing  
            if not fight.get("fighter2_id"):
                # Apply name fixes before lookup
                fixed_name2 = apply_name_fixes(fight["fighter2"])
                new_uuid2 = uuid_lookup.get(normalize_name(fixed_name2))
                if new_uuid2:
                    fight["fighter2_id"] = new_uuid2
                    updated_count += 1
                else:
                    still_missing.add(fight["fighter2"])

        # Save updated fights
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(existing_fights, f, indent=2, ensure_ascii=False)

        # Update error file with remaining missing fighters
        still_missing_list = sorted(still_missing)
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump(still_missing_list, f, indent=2, ensure_ascii=False)

        print(f"✅ Updated {updated_count} missing UUIDs")
        if still_missing_list:
            print(f"⚠️ Still missing UUIDs for {len(still_missing_list)} fighters")
        else:
            print("🎉 All fighters now have UUIDs!")

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