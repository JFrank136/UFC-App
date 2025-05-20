import json
import requests
from bs4 import BeautifulSoup
import time

def scrape_details(profile_url):
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(profile_url, headers=headers)
    if res.status_code != 200:
        print(f"  ❌ Failed to load: {profile_url}")
        return {}

    soup = BeautifulSoup(res.text, "html.parser")
    data = {}

    # Try to get nickname from profile header if present
    nickname_el = soup.select_one("span.c-hero__nickname")
    if nickname_el:
        data["nickname"] = nickname_el.get_text(strip=True)

    # Try to get ranking if visible in the profile header
    ranking_el = soup.select_one("div.c-hero__headline > div")
    if ranking_el and "rank" in ranking_el.text.lower():
        data["ranking"] = ranking_el.get_text(strip=True)


    def get_bio(label):
        el = soup.find("div", class_="c-bio__label", string=label)
        return el.find_next_sibling("div").get_text(strip=True) if el else None

    # Basic bio
    data["height"] = get_bio("Height")
    data["weight"] = get_bio("Weight")
    data["reach"] = get_bio("Reach")
   
    # Main stats
    stats = soup.select(".c-stat-3bar__value")
    if len(stats) >= 6:
        data["strikes_landed_per_minute"] = stats[0].text.strip()
        data["strikes_absorbed_per_minute"] = stats[1].text.strip()
        data["takedown_avg"] = stats[2].text.strip()
        data["submission_avg"] = stats[3].text.strip()
        data["striking_defense"] = stats[4].text.strip()

    # Knockdowns & fight time
    stat_blocks = soup.find_all("div", class_="c-stat-compare__number")
    if len(stat_blocks) >= 2:
        data["knockdown_avg"] = stat_blocks[0].text.strip()
        data["avg_fight_time"] = stat_blocks[1].text.strip()

    # Sig. strikes by target
    target_group = soup.find("div", class_="c-body--athlete-body")
    if target_group:
        target_rows = target_group.select("div.c-stat-body__row")
        target_stats = {}
        for row in target_rows:
            label = row.select_one(".c-stat-body__label")
            value = row.select_one(".c-stat-body__value")
            if label and value:
                target_stats[label.text.strip().lower()] = value.text.strip()
        data["sig_strikes_by_target"] = target_stats

    return data

def enrich_roster(input_file="data/ufc_fighters_raw.json", output_file="data/ufc_details.json"):
    with open(input_file, "r", encoding="utf-8") as f:
        roster = json.load(f)

    # Only keep active fighters
    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
    total = len(active_fighters)
    enriched = []

    for idx, fighter in enumerate(active_fighters, start=1):
        print(f"[{idx}/{total}] Scraping {fighter['name']} ({total - idx} remaining)…", flush=True)

        profile_url = fighter.get("profile_url")
        if not profile_url:
            print("  ⚠️ No profile URL.")
            continue

        details = scrape_details(profile_url)
        if not details:
            continue

        fighter.update(details)
        enriched.append(fighter)

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(enriched, f, indent=2, ensure_ascii=False)

        time.sleep(1)

    print(f"\n✅ Done. Saved to {output_file}")

if __name__ == "__main__":
    enrich_roster()
