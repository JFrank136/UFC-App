import os, sys, re, json, time, threading, asyncio
from pathlib import Path
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
import aiohttp
import unicodedata
import uuid


def normalize_name(name):
    """Strip accents and special characters from name"""
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")


# Dynamically add the utils directory to the path
utils_path = Path(__file__).resolve().parent / "utils"
sys.path.append(str(utils_path))

from name_fixes import URL_OVERRIDES

HEADERS = {"User-Agent": "Mozilla/5.0"}
OUTPUT_FILE = "data/sherdog_fighters.json"

# Thread-safe session with connection pooling
class SessionManager:
    def __init__(self, max_workers=10):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        # Connection pooling
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=20,
            pool_maxsize=20,
            max_retries=3
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        self.lock = threading.Lock()
    
    def get(self, url, **kwargs):
        return self.session.get(url, **kwargs)

# Global session manager
session_manager = SessionManager()

def search_sherdog(fighter_name):
    """Uncached version of search"""
    return search_sherdog_internal(fighter_name)


def search_sherdog_internal(fighter_name):
    # Check if this name has a direct override
    override = URL_OVERRIDES.get(fighter_name.upper())
    if override:
        print(f"🔗 Using URL override for {fighter_name}")
        return override

    # Default search behavior
    normalized = normalize_name(fighter_name)
    query = normalized.replace(" ", "+")
    url = f"https://www.sherdog.com/stats/fightfinder?SearchTxt={query}"
    
    try:
        res = session_manager.get(url, timeout=10)
        if res.status_code != 200:
            return None
            
        soup = BeautifulSoup(res.text, "html.parser")
        
        # Get all fighter links from search results
        links = soup.select("table.fightfinder_result a[href^='/fighter/']")
        if not links:
            return None
        
        # If only one result, return it
        if len(links) == 1:
            return "https://www.sherdog.com" + links[0]['href']
        
        # Multiple results - find the best match using simple string comparison
        best_match = None
        best_score = 0
        
        for link in links:
            # Get the fighter name from the link text
            result_name = link.text.strip()
            
            # Simple similarity calculation (case-insensitive)
            name_lower = normalize_name(fighter_name).lower()
            result_lower = normalize_name(result_name).lower()

            
            # Exact match gets highest priority
            if name_lower == result_lower:
                print(f"  ✅ Exact match found: {result_name}")
                return "https://www.sherdog.com" + link['href']
            
            # Check if search name is contained in result or vice versa
            if name_lower in result_lower or result_lower in name_lower:
                # Calculate simple similarity score based on length difference
                score = min(len(name_lower), len(result_lower)) / max(len(name_lower), len(result_lower)) * 100
                
                print(f"  Comparing '{fighter_name}' vs '{result_name}' - Score: {score:.1f}")
                
                if score > best_score:
                    best_score = score
                    best_match = link
        
        # Only return if we have a reasonable match (>= 70% similarity)
        if best_match and best_score >= 70:
            print(f"  ✅ Best match: {best_match.text.strip()} (Score: {best_score:.1f})")
            return "https://www.sherdog.com" + best_match['href']
        else:
            print(f"  ❌ No good match found. Best score: {best_score:.1f}")
            # Fall back to first result if we can't find a good match
            print(f"  🔄 Falling back to first result: {links[0].text.strip()}")
            return "https://www.sherdog.com" + links[0]['href']
            
    except Exception as e:
        print(f"⚠️ Search error for {fighter_name}: {e}")
    
    return None


def scrape_fighter(url, original_fighter=None):

    try:
        res = session_manager.get(url, timeout=15)
        if res.status_code != 200:
            print(f"❌ Failed to load: {url}")
            return None

        soup = BeautifulSoup(res.text, "html.parser")

        # Nationality
        nationality_tag = soup.select_one("strong[itemprop='nationality']")
        country = nationality_tag.text.strip() if nationality_tag else None

        # Age - optimized regex
        age = "Unknown"
        age_row = soup.find("td", string=re.compile(r"^\s*AGE\s*$", re.IGNORECASE))
        if age_row and age_row.find_next_sibling("td"):
            age_text = age_row.find_next_sibling("td").get_text(" ", strip=True)
            match = re.search(r"\d{1,3}", age_text)
            if match:
                age = match.group()

        # Weight Class
        weight_class = None
        weight_block = soup.select_one("div.association-class a[href*='weightclass']")
        if weight_block:
            weight_class = weight_block.text.strip()

        # Wins / Losses total - Improved extraction
        def extract_total(section_name):
            try:
                if section_name == "wins":
                    win_div = soup.select_one("div.winloses.win span:nth-of-type(2)")
                    return win_div.text.strip() if win_div else "0"
                elif section_name == "losses":
                    loss_div = soup.select_one("div.winloses.lose span:nth-of-type(2)")
                    return loss_div.text.strip() if loss_div else "0"
            except Exception as e:
                print(f"⚠️ Error extracting {section_name}: {e}")

            # Fallback to breakdown if the above fails
            if section_name == "wins":
                ko = int(wins_by.get("KOS/TKOS", "0"))
                sub = int(wins_by.get("SUBMISSIONS", "0"))
                dec = int(wins_by.get("DECISIONS", "0"))
                return str(ko + sub + dec)
            elif section_name == "losses":
                ko = int(losses_by.get("KOS/TKOS", "0"))
                sub = int(losses_by.get("SUBMISSIONS", "0"))
                dec = int(losses_by.get("DECISIONS", "0"))
                return str(ko + sub + dec)

            return "0"

        # KO/Sub/Dec breakdown - Improved with better fallbacks
        def parse_method_breakdown(section_name):
            result = {"KOS/TKOS": "0", "SUBMISSIONS": "0", "DECISIONS": "0"}
            section = soup.select_one(f"div.{section_name}")
            if not section:
                return result

            # Loop over each "meter-title" and find the next .meter div for its value
            for meter_title in section.select("div.meter-title"):
                label = meter_title.get_text(strip=True).upper()
                meter_div = meter_title.find_next_sibling("div", class_="meter")
                if not meter_div:
                    continue
                value_div = meter_div.select_one("div.pl")
                value = value_div.get_text(strip=True) if value_div else "0"

                if "KO" in label:
                    result["KOS/TKOS"] = value
                elif "SUBMISSION" in label:
                    result["SUBMISSIONS"] = value
                elif "DECISION" in label:
                    result["DECISIONS"] = value

            return result

        wins_by = parse_method_breakdown("wins")
        losses_by = parse_method_breakdown("loses")
        
        wins_total = extract_total("wins")
        losses_total = extract_total("losses")

        summary = {
            "country": country,
            "age": age,
            "weight_class": weight_class,
            "Wins": wins_total,
            "Losses": losses_total,
            "wins_by_ko": wins_by.get("KOS/TKOS"),
            "wins_by_sub": wins_by.get("SUBMISSIONS"),
            "wins_by_dec": wins_by.get("DECISIONS"),
            "losses_by_ko": losses_by.get("KOS/TKOS"),
            "losses_by_sub": losses_by.get("SUBMISSIONS"),
            "losses_by_dec": losses_by.get("DECISIONS"),
        }

        # Fight History - optimized with list comprehension where possible
        history = []
        rows = soup.select("table.new_table.fighter tr")
        
        # Pre-compile regex for better performance
        date_pattern = re.compile(r"[A-Za-z]{3} / \d{2} / \d{4}")
        method_split_pattern = re.compile(r'\n|\s{2,}|[A-Z][a-z]+ [A-Z][a-z]+')
        
        for row in rows:
            cols = row.select("td")
            if len(cols) < 6:
                continue
            
            # Skip header rows
            first_col_text = cols[0].text.strip().lower()
            if any(hdr in first_col_text for hdr in ["result", "fighter"]):
                continue

            raw_date = cols[2].text.strip()
            date_match = date_pattern.search(raw_date)
            if date_match:
                try:
                    dt = datetime.strptime(date_match.group(), "%b / %d / %Y")
                    clean_date = dt.strftime("%m/%d/%Y")
                except ValueError:
                    clean_date = raw_date
            else:
                clean_date = raw_date

            method_raw = cols[3].text.strip()
            method_clean = method_split_pattern.split(method_raw)[0].strip()
            if not method_clean.endswith(")") and "(" in method_clean:
                method_clean += ")"

            fight = {
                "result": cols[0].text.strip().lower(),
                "fighter": cols[1].text.strip(),
                "fight_date": clean_date,
                "method": method_clean,
                "round": cols[4].text.strip(),
                "time": cols[5].text.strip(),
            }
            history.append(fight)

        name_tag = soup.select_one("span.fn")
        name = name_tag.text.strip() if name_tag else url.split("/")[-1]

        nickname_tag = soup.select_one("span.nickname")
        nickname = nickname_tag.get_text(strip=True).strip('"') if nickname_tag else None

      
        return {
            "id": original_fighter.get("id") if original_fighter else str(uuid.uuid4()),
            "name": name,
            "nickname": nickname,
            "profile_url_sherdog": url,
            "country": country,
            "age": age,
            "weight_class": weight_class,
            "wins_total": wins_total,
            "losses_total": losses_total,
            "wins_ko": wins_by.get("KOS/TKOS"),
            "wins_sub": wins_by.get("SUBMISSIONS"),
            "wins_dec": wins_by.get("DECISIONS"),
            "losses_ko": losses_by.get("KOS/TKOS"),
            "losses_sub": losses_by.get("SUBMISSIONS"),
            "losses_dec": losses_by.get("DECISIONS"),
            "fight_history": history  # optional — can remove this too
        }


    except Exception as e:
        print(f"⚠️ Error scraping {url}: {e}")
        return None

def save_progress(data):
    """Thread-safe save function"""
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with session_manager.lock:
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                existing_data = {f["name"]: f for f in json.load(f)}
        except FileNotFoundError:
            existing_data = {}

        for new_fighter in data:
            existing_data[new_fighter["name"]] = new_fighter  # add or update

        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(list(existing_data.values()), f, indent=2, ensure_ascii=False)

def process_fighter(fighter_info):
    """Process a single fighter - designed for threading"""
    idx, total, fighter = fighter_info
    from name_fixes import NAME_FIXES

    name = fighter.get("name")
    name = NAME_FIXES.get(name.upper(), name)

    
    print(f"[{idx}/{total}] Searching for {name} on Sherdog...")
    profile_url = search_sherdog(name)
    
    if not profile_url:
        print(f"❌ No Sherdog profile found for: {name}")
        return None, {"name": name, "reason": "not found in search"}

    print(f"→ Scraping profile: {profile_url}")
    fighter_data = scrape_fighter(profile_url, fighter)

    
    if fighter_data:
        print(f"✅ Scraped: {fighter_data['name']}")
        return fighter_data, None
    else:
        print(f"❌ Failed to scrape data from profile: {profile_url}")
       

def main():
    with open("data/ufc_fighters_raw.json", "r", encoding="utf-8") as f:
        roster = json.load(f)

    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]

    results = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            results = json.load(f)

    fighters_to_scrape = [
        (idx, len(active_fighters), fighter)
        for idx, fighter in enumerate(active_fighters, start=1)
    ]

    
    if not fighters_to_scrape:
        print("No new fighters to scrape!")
        return

    failures = []
    
    # Use ThreadPoolExecutor for concurrent processing
    max_workers = min(8, len(fighters_to_scrape))  # Limit concurrent requests
    
    print(f"🚀 Starting concurrent scraping with {max_workers} workers...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_fighter = {
            executor.submit(process_fighter, fighter_info): fighter_info 
            for fighter_info in fighters_to_scrape
        }
        
        # Process completed tasks as they finish
        for future in as_completed(future_to_fighter):
            try:
                fighter_data, failure = future.result()
                
                if fighter_data:
                    results.append(fighter_data)
                    # Save progress every 10 successful scrapes
                    if len(results) % 10 == 0:
                        save_progress(results)
                        
                if failure:
                    failures.append(failure)
                    
            except Exception as e:
                fighter_info = future_to_fighter[future]
                print(f"⚠️ Exception processing {fighter_info[2].get('name')}: {e}")
                failures.append({
                    "name": fighter_info[2].get('name'), 
                    "reason": f"exception: {e}"
                })
            
            # Small delay to be respectful
            time.sleep(0.1)

    # Final save
    save_progress(results)
    
    if failures:
        os.makedirs(os.path.dirname("data/errors/sherdog_errors.json"), exist_ok=True)
        with open("data/errors/sherdog_failures.json", "w", encoding="utf-8") as f:
            json.dump(failures, f, indent=2, ensure_ascii=False)
        
        print(f"\n⚠️ Logged {len(failures)} failures to errors/sherdog_failures.json")
        print("🧩 Breakdown:")
        print(f"  - Not found in search: {sum(1 for f in failures if f.get('reason') == 'not found in search')}")
        print(f"  - Scrape failed:       {sum(1 for f in failures if f.get('reason') == 'scrape failed')}")
        print(f"  - Other exceptions:    {sum(1 for f in failures if 'exception' in f.get('reason', ''))}")
        print(f"\n🎯 Done. Scraped {len(results)} fighters. Data saved to: {OUTPUT_FILE}")

def run_full_scrape():
    # your existing full scrape logic here
    pass  # placeholder

def run_retry_only():
    FAILURE_FILE = "data/errors/sherdog_failures.json"
    try:
        with open(FAILURE_FILE, "r", encoding="utf-8") as f:
            failures = json.load(f)
    except FileNotFoundError:
        print("No failure file found.")
        return

    retry_these = [f for f in failures if f.get("reason") in {"scrape failed", "not found in search"}]
    unrelated_failures = [
    f for f in failures 
    if f.get("reason") not in {"scrape failed", "not found in search"}
    ]

    if not retry_these:
        print("✅ No retryable failures.")
        return

    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            results = json.load(f)
    except FileNotFoundError:
        results = []

    existing_names = {f["name"] for f in results}
    still_failed = []

    for i, entry in enumerate(retry_these, 1):
        from name_fixes import NAME_FIXES

        name_raw = entry["name"]
        name = NAME_FIXES.get(name_raw.upper(), name_raw)
        print(f"[{i}/{len(retry_these)}] Retrying: {name_raw} → {name}" if name != name_raw else f"[{i}/{len(retry_these)}] Retrying: {name}")


        url = entry.get("url")
        if not url:
            url = search_sherdog(name)
            if not url:
                print(f"❌ Still could not find URL for: {name}")
                still_failed.append(entry)
                continue

        fighter_data = scrape_fighter(url)
        if fighter_data:
            results.append(fighter_data)
            print(f"✅ Re-scraped: {fighter_data['name']}")
        else:
            still_failed.append(entry)
            print(f"❌ Still failed: {name}")
        time.sleep(1)

    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            existing_data = {f["name"]: f for f in json.load(f)}
    except FileNotFoundError:
        existing_data = {}

    for new_fighter in results:
        existing_data[new_fighter["name"]] = new_fighter  # add or update

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(list(existing_data.values()), f, indent=2, ensure_ascii=False)
    with open(FAILURE_FILE, "w", encoding="utf-8") as f:
        json.dump(still_failed + unrelated_failures, f, indent=2, ensure_ascii=False)

    print(f"\n🎯 Retry complete. {len(results)} fighters saved. {len(still_failed)} still failed.")

if __name__ == "__main__":
    print("Choose run mode:\n1. Full scrape\n2. Retry failed only")
    choice = input("Enter 1 or 2: ").strip()
    if choice == "1":
        main()
    elif choice == "2":
        run_retry_only()
    else:
        print("Invalid choice.")