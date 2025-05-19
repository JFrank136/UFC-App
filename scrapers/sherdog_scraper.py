import requests
from bs4 import BeautifulSoup
import json
import time
import os

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

        def safe_text(selector):
            el = soup.select_one(selector)
            return el.text.strip() if el else None

        country = safe_text(".bio_graphical_data span[itemprop='addressCountry']")
        age_raw = safe_text("span[itemprop='birthDate']")
        age = age_raw.split('(')[-1].replace("age", "").replace(")", "").strip() if age_raw else None

        summary = {
            "Country": country,
            "Age": age,
            "Wins": safe_text("div.wins span.counter"),
            "Losses": safe_text("div.losses span.counter"),
            "Wins by KO": safe_text("div.wins .graph_tag:nth-child(2) .sub_line"),
            "Wins by Sub": safe_text("div.wins .graph_tag:nth-child(3) .sub_line"),
            "Wins by Dec": safe_text("div.wins .graph_tag:nth-child(4) .sub_line"),
            "Losses by KO": safe_text("div.losses .graph_tag:nth-child(2) .sub_line"),
            "Losses by Sub": safe_text("div.losses .graph_tag:nth-child(3) .sub_line"),
            "Losses by Dec": safe_text("div.losses .graph_tag:nth-child(4) .sub_line"),
        }

        history = []
        rows = soup.select("table.fight_history tr:not(.table_head)")
        for row in rows:
            cols = row.select("td")
            if len(cols) < 7:
                continue
            fight = {
                "Result": cols[0].text.strip(),
                "Fighter": cols[1].text.strip(),
                "Date": cols[3].text.strip(),
                "Method": cols[4].text.strip(),
                "R": cols[5].text.strip(),
                "Time": cols[6].text.strip(),
            }
            history.append(fight)

        name = safe_text("span.fn")
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
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    with open("data/ufc_fighters_raw.json", "r", encoding="utf-8") as f:
        roster = json.load(f)

    # Only keep active fighters
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
            continue

        print(f"→ Scraping profile: {profile_url}")
        fighter_data = scrape_fighter(profile_url)
        if fighter_data:
            results.append(fighter_data)
            save_progress(results)
            print(f"✅ Scraped and saved: {fighter_data['name']}")

        time.sleep(1)

    print("\n🎯 Done. Scraped data saved to:", OUTPUT_FILE)

if __name__ == "__main__":
    main()
