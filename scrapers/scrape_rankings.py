# scrape_rankings.py
import os
import time
import json
import unicodedata
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def normalize(name):
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().strip()


def load_fighter_index(file_path="data/ufc_fighters_raw.json"):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            fighters = json.load(f)
        return {
            normalize(f["name"]): f.get("uuid") or f.get("id") or None
            for f in fighters if f.get("name")
        }
    except Exception as e:
        print(f"⚠️ Failed to load fighter DB: {e}")
        return {}


def scrape_rankings():
    name_to_uuid = load_fighter_index()

    url = "https://www.ufc.com/rankings"
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    driver.get(url)

    WebDriverWait(driver, 30).until(
    EC.presence_of_element_located((By.CSS_SELECTOR, "div.view-grouping table tbody tr"))
    )


    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.view-grouping"))
    )

    with open("debug_rankings_page.html", "w", encoding="utf-8") as f:
        f.write(driver.page_source)

    try:
        close_btn = driver.find_element(By.CSS_SELECTOR, ".onetrust-close-btn-handler, .cc-btn.cc-dismiss")
        close_btn.click()
        print("Closed cookie/banner popup.")
        time.sleep(1)
    except Exception:
        pass


    headers = driver.find_elements(By.CSS_SELECTOR, "div.view-grouping-header")
    divisions = driver.find_elements(By.CSS_SELECTOR, "div.view-grouping")

    print(f"Found {len(headers)} headers and {len(divisions)} division blocks")

    if len(headers) != len(divisions):
        print("⚠️ Header and division block count mismatch. Proceeding with minimum pair count.")

    all_rankings = []
    missing_fighters = []

    for header, div in zip(headers, divisions):
        division_name = header.get_attribute("textContent").replace("Top Rank", "").strip()


        if not division_name:
            print("⚠️ Blank division header, skipping")
            continue

        # Get table
        try:
            table = div.find_element(By.CSS_SELECTOR, "table")
            caption = table.find_element(By.TAG_NAME, "caption")
        except Exception as e:
            print(f"⚠️ Could not find table for division {division_name}: {e}")
            continue

        fighters = []

        # -------- Champion Parsing --------
        try:
            champ_name = None
            champ_url = None
            # Champion's name and url
            champ_blocks = caption.find_elements(By.CSS_SELECTOR, ".rankings--athlete--champion")

            # If no blocks or first ones are empty, fallback to parsing caption itself
            blocks_to_try = champ_blocks if champ_blocks else [caption]

            champ_parsed = False

            for block in blocks_to_try:
                if "pound-for-pound" in division_name.lower():
                    break  # No champion in P4P divisions

                try:
                    champ_a = block.find_element(By.CSS_SELECTOR, "h5 a")
                    champ_name = champ_a.get_attribute("textContent").strip()
                    champ_url = champ_a.get_attribute("href")
                except:
                    # fallback: maybe a <h5> without <a>, and separate <a> inside block
                    try:
                        h5 = block.find_element(By.CSS_SELECTOR, "h5")
                        champ_name = h5.text.strip()
                        champ_url = block.find_element(By.CSS_SELECTOR, "a").get_attribute("href")
                    except:
                        continue

                if champ_name and champ_url:
                    norm = normalize(champ_name)
                    uuid = name_to_uuid.get(norm)
                    missing = uuid is None
                    if missing:
                        missing_fighters.append({
                            "name": champ_name,
                            "normalized": norm,
                            "division": division_name,
                            "rank": "C",
                            "profile_url": champ_url
                        })
                    fighters.append({
                        "rank": "C",
                        "name": champ_name,
                        "profile_url": champ_url,
                        "uuid": uuid,
                        "missing": missing,
                        "is_champion": True
                    })
                    champ_parsed = True
                    break  # ✅ Break after the first valid champ

        except Exception as e:
            print(f"⚠️ Error parsing champion for division {division_name}: {e}")
            pass

        # -------- Contenders Parsing --------
        try:
            rows = table.find_elements(By.CSS_SELECTOR, "tbody tr")
            for idx, row in enumerate(rows, 1):
                # Skip champion row if marked "C"
                try:
                    rank_col = row.find_element(By.CSS_SELECTOR, ".views-field-weight-class-rank").text.strip()
                    if rank_col.upper() == "C":
                        if "pound-for-pound" in division_name.lower():
                            print(f"⚠️ Skipping P4P fake champ row: {row.text}")
                        continue
                except Exception:
                    pass

                try:
                    name_el = row.find_element(By.CSS_SELECTOR, ".views-field-title a")
                    name = name_el.text.strip()
                    href = name_el.get_attribute("href")
                    norm = normalize(name)
                    uuid = name_to_uuid.get(norm)
                    missing = uuid is None
                    if missing:
                        missing_fighters.append({
                            "name": name,
                            "normalized": norm,
                            "division": division_name,
                            "rank": idx,
                            "profile_url": href
                        })
                    try:
                        change_el = row.find_element(By.CSS_SELECTOR, ".views-field-weight-class-rank-change")
                        change_text = change_el.text.strip()
                    except:
                        change_text = None

                    fighter_data = {
                        "rank": idx,
                        "name": name,
                        "profile_url": href,
                        "uuid": uuid,
                        "missing": missing,
                        "change": change_text if change_text else None
                    }
                    fighters.append(fighter_data)
                except Exception as e:
                    print(f"⚠️ Error parsing row: {e}")
                    continue
        except Exception as e:
            print(f"⚠️ Error parsing contenders for {division_name}: {e}")

        all_rankings.append({
            "division": division_name,
            "fighters": fighters
        })

    
    driver.quit()

    with open("data/ufc_rankings.json", "w", encoding="utf-8") as f:
        json.dump(all_rankings, f, indent=2, ensure_ascii=False)

    all_fighter_names = []
    for division in all_rankings:
        for fighter in division['fighters']:
            all_fighter_names.append(fighter['name'])

    expected_total = 11*16 + 30  # 11 weight classes with champ + 15, 2 P4P lists with 15
    count_check = "✅" if len(all_fighter_names) == expected_total else "❌"
    print(f"{count_check} {len(all_fighter_names)} total fighters (including duplicates, expected {expected_total})")



    if missing_fighters:
        os.makedirs("data/errors", exist_ok=True)
        with open("data/errors/rankings_errors.json", "w", encoding="utf-8") as f:
            json.dump(missing_fighters, f, indent=2, ensure_ascii=False)
        print(f"⚠️ Logged {len(missing_fighters)} fighters with missing UUIDs.")
    else:
        error_path = "data/errors/rankings_errors.json"
        if os.path.exists(error_path):
            os.remove(error_path)
            print("✅ All fighters matched. rankings_errors.json deleted.")



if __name__ == "__main__":
    print("Select run mode:")
    print("[1] Full scrape")
    print("[2] Only fix fighters with missing UUIDs")
    choice = input("Enter 1 or 2: ").strip()

    if choice == "1":
        scrape_rankings()
    elif choice == "2":
        try:
            with open("data/errors/rankings_errors.json", "r", encoding="utf-8") as f:
                missing = json.load(f)
        except FileNotFoundError:
            print("⚠️ No rankings_errors.json file found.")
            exit()

        uuid_map = load_fighter_index()
        updated = []
        matched_count = 0
        for fighter in missing:
            norm = normalize(fighter["name"])
            uuid = uuid_map.get(norm)
            if uuid:
                fighter["uuid"] = uuid
                fighter["missing"] = False
                matched_count += 1
                print(f"✅ Matched: {fighter['name']} → {uuid}")
            else:
                updated.append(fighter)


        if updated:
            with open("data/errors/rankings_errors.json", "w", encoding="utf-8") as f:
                json.dump(updated, f, indent=2, ensure_ascii=False)
            print(f"✅ Matched {matched_count} fighters. Still unmatched: {len(updated)}")
        else:
            os.remove("data/errors/rankings_errors.json")
            print(f"✅ Matched all {matched_count} fighters. rankings_errors.json deleted.")

    else:
        print("Invalid input. Exiting.")
