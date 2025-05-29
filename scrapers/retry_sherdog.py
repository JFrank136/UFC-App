import json
import time
from pathlib import Path
from sherdog_scraper import scrape_fighter, OUTPUT_FILE

FAILURE_FILE = "data/errors/sherdog_failures.json"

def main():
    with open(FAILURE_FILE, "r", encoding="utf-8") as f:
        failures = json.load(f)

    retry_these = [f for f in failures if f.get("reason") == "scrape failed"]
    # Keep all other failures intact
    unrelated_failures = [f for f in failures if f.get("reason") != "scrape failed"]


    if not retry_these:
        print("✅ No retryable failures.")
        return

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        results = json.load(f)

    scraped_names = {f["name"] for f in results}
    still_failed = []

    for i, entry in enumerate(retry_these, 1):
        name = entry["name"]
        url = entry["url"]
        print(f"[{i}/{len(retry_these)}] Retrying: {name}")

        if name in scraped_names:
            print(f"→ Skipping {name}, already saved.")
            continue

        fighter_data = scrape_fighter(url)
        if fighter_data:
            results.append(fighter_data)
            print(f"✅ Re-scraped: {fighter_data['name']}")

        else:
            still_failed.append(entry)
            print(f"❌ Still failed: {name}")

        time.sleep(1)

    # Save updated results and failures
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    with open(FAILURE_FILE, "w", encoding="utf-8") as f:
        json.dump(still_failed + unrelated_failures, f, indent=2, ensure_ascii=False)


    print(f"\n🎯 Retry complete. {len(results)} fighters saved. {len(still_failed)} still failed.")

if __name__ == "__main__":
    main()
