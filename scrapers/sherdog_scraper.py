import requests
from bs4 import BeautifulSoup
import json
import time
import os
import re
from datetime import datetime

HEADERS = {"User-Agent": "Mozilla/5.0"}
OUTPUT_FILE = "data/sherdog_fighters.json"


def search_sherdog(fighter_name):
    query = fighter_name.replace(" ", "+")
    url = f"https://www.sherdog.com/stats/fightfinder?SearchTxt={query}"
    res = requests.get(url, headers=HEADERS)
    soup = BeautifulSoup(res.text, "html.parser")

    link = soup.select_one("table.fightfinder_result a[href^='/fighter/']")
    if link:
        return "https://www.sherdog.com" + link['href']
    return None


def scrape_fighter(url):
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        if res.status_code != 200:
            print(f"❌ Failed to load: {url}")
            return None

        soup = BeautifulSoup(res.text, "html.parser")

        # Nationality
        nationality_tag = soup.select_one("strong[itemprop='nationality']")
        country = nationality_tag.text.strip() if nationality_tag else None

        # Age
        age = None
        age_tag = soup.select_one("span[itemprop='birthDate']")
        if age_tag:
            age_raw = age_tag.text.strip()
            if '(' in age_raw:
                age = age_raw.split('(')[-1].replace("age", "").replace(")", "").strip()
            else:
                age = age_raw

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

        wins_total = extract_total("wins")
        losses_total = extract_total("losses")

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


        summary = {
            "Country": country,
            "Age": age,
            "Weight Class": weight_class,
            "Wins": wins_total,
            "Losses": losses_total,
            "Wins by KO": wins_by.get("KOS/TKOS"),
            "Wins by Sub": wins_by.get("SUBMISSIONS"),
            "Wins by Dec": wins_by.get("DECISIONS"),
            "Losses by KO": losses_by.get("KOS/TKOS"),
            "Losses by Sub": losses_by.get("SUBMISSIONS"),
            "Losses by Dec": losses_by.get("DECISIONS"),
        }

        # Fight History (leave as is)
        history = []
        rows = soup.select("table.new_table.fighter tr")
        for row in rows:
            cols = row.select("td")
            if len(cols) < 6:
                continue
            # skip header rows
            if any(hdr.lower() in cols[0].text.strip().lower() for hdr in ["result", "fighter"]):
                continue

            raw_date = cols[2].text.strip()
            date_match = re.search(r"[A-Za-z]{3} / \d{2} / \d{4}", raw_date)
            if date_match:
                dt = datetime.strptime(date_match.group(), "%b / %d / %Y")
                clean_date = dt.strftime("%m/%d/%Y")
            else:
                clean_date = raw_date

            method_raw = cols[3].text.strip()
            method_clean = re.split(r'\n|\s{2,}|[A-Z][a-z]+ [A-Z][a-z]+', method_raw)[0].strip()
            if not method_clean.endswith(")") and "(" in method_clean:
                method_clean += ")"

            fight = {
                "Result": cols[0].text.strip().lower(),
                "Fighter": cols[1].text.strip(),
                "Date": clean_date,
                "Method": method_clean,
                "R": cols[4].text.strip(),
                "Time": cols[5].text.strip(),
            }
            history.append(fight)

        name_tag = soup.select_one("span.fn")
        name = name_tag.text.strip() if name_tag else url.split("/")[-1]

        return {
            "name": name,
            "url": url,
            "summary": summary,
            "fight_history": history
        }

    except Exception as e:
        print(f"⚠️ Error scraping {url}: {e}")
        return None


def save_progress(data):
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


failures = []

def main():
    with open("data/ufc_fighters_raw.json", "r", encoding="utf-8") as f:
        roster = json.load(f)

    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]

    results = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            results = json.load(f)

    scraped_names = {f["name"] for f in results}

    for idx, fighter in enumerate(active_fighters, start=1):
        name = fighter.get("name")
        if not name or name in scraped_names:
            continue

        print(f"[{idx}/{len(active_fighters)}] Searching for {name} on Sherdog...")
        profile_url = search_sherdog(name)
        if not profile_url:
            print(f"❌ No Sherdog profile found for: {name}")
            failures.append({"name": name, "reason": "not found in search"})
            continue

        print(f"→ Scraping profile: {profile_url}")
        fighter_data = scrape_fighter(profile_url)
        if fighter_data:
            results.append(fighter_data)
            save_progress(results)
            print(f"✅ Scraped and saved: {fighter_data['name']}")
        else:
            print(f"❌ Failed to scrape data from profile: {profile_url}")
            failures.append({"name": name, "url": profile_url, "reason": "scrape failed"})

        time.sleep(1)

    if failures:
        os.makedirs(os.path.dirname("data/sherdog_failures.json"), exist_ok=True)
        with open("data/sherdog_failures.json", "w", encoding="utf-8") as f:
            json.dump(failures, f, indent=2, ensure_ascii=False)
        print(f"⚠️ Logged {len(failures)} failures to data/sherdog_failures.json")

    print("\n🎯 Done. Scraped data saved to:", OUTPUT_FILE)


if __name__ == "__main__":
    main()