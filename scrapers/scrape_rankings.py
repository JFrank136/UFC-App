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


def parse_change_indicator(change_text):
    """Parse change indicators from the UFC page"""
    if not change_text:
        return None
    
    change_text = change_text.strip().upper()
    
    # Map common change indicators
    change_map = {
        "NEW": "NEW",
        "INTERIM": "INTERIM",
        "↑": "↑",
        "↓": "↓",
        "UP": "↑",
        "DOWN": "↓"
    }
    
    for indicator, mapped in change_map.items():
        if indicator in change_text:
            return change_text  # Return the original text for now
    
    return change_text if change_text else None


def validate_division_structure(division_name, fighters):
    """Validate that division has proper champion structure"""
    issues = []
    champions = [f for f in fighters if f["rank"] == "C"]
    interim_champions = [f for f in fighters if f.get("change") == "INTERIM"]
    
    # Check for champion count
    if len(champions) == 0 and "pound-for-pound" not in division_name.lower():
        issues.append(f"{division_name} has no champion")
    elif len(champions) > 1:
        issues.append(f"{division_name} has multiple champions")
    
    return issues


def scrape_rankings():
    print("🏆 Starting UFC rankings scrape...")
    
    name_to_uuid = load_fighter_index()

    url = "https://www.ufc.com/rankings"
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    driver.get(url)

    print("📄 Loading rankings page...")
    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.view-grouping table tbody tr"))
    )

    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.view-grouping"))
    )

    # Close any popups
    try:
        close_btn = driver.find_element(By.CSS_SELECTOR, ".onetrust-close-btn-handler, .cc-btn.cc-dismiss")
        close_btn.click()
        time.sleep(1)
    except Exception:
        pass

    headers = driver.find_elements(By.CSS_SELECTOR, "div.view-grouping-header")
    divisions = driver.find_elements(By.CSS_SELECTOR, "div.view-grouping")

    print(f"📊 Processing {len(headers)} divisions...")

    if len(headers) != len(divisions):
        print("⚠️ Header and division block count mismatch.")

    all_rankings = []
    missing_fighters = []
    warnings = []

    for idx, (header, div) in enumerate(zip(headers, divisions), 1):
        division_name = header.get_attribute("textContent").replace("Top Rank", "").strip()

        if not division_name:
            warnings.append("Blank division header found")
            continue
        
        # Show progress every few divisions
        if idx % 3 == 0 or idx == len(headers):
            print(f"[{idx}/{len(headers)}] Processing divisions...")

        try:
            table = div.find_element(By.CSS_SELECTOR, "table")
            caption = table.find_element(By.TAG_NAME, "caption")
        except Exception as e:
            warnings.append(f"Could not find table for division {division_name}")
            continue

        fighters = []

        # -------- Champion Parsing --------
        try:
            champ_name = None
            champ_url = None
            champ_blocks = caption.find_elements(By.CSS_SELECTOR, ".rankings--athlete--champion")

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
                    
                    # For champions, check if UFC website shows any change indicator
                    change = None
                    try:
                        change_el = block.find_element(By.CSS_SELECTOR, ".views-field-weight-class-rank-change")
                        change_text = change_el.text.strip()
                        if change_text:
                            change = parse_change_indicator(change_text)
                    except:
                        pass  # No change indicator, leave as None
                    
                    fighters.append({
                        "rank": "C",
                        "name": champ_name,
                        "profile_url": champ_url,
                        "uuid": uuid,
                        "missing": missing,
                        "change": change  # Only use website-provided changes
                    })
                    champ_parsed = True
                    break

        except Exception as e:
            warnings.append(f"Error parsing champion for division {division_name}")

        # -------- Contenders Parsing --------
        try:
            rows = table.find_elements(By.CSS_SELECTOR, "tbody tr")
            for idx, row in enumerate(rows, 1):
                # Skip champion row if marked "C"
                try:
                    rank_col = row.find_element(By.CSS_SELECTOR, ".views-field-weight-class-rank").text.strip()
                    if rank_col.upper() == "C":
                        if "pound-for-pound" in division_name.lower():
                            warnings.append(f"Skipping P4P fake champ row")
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
                    
                    # Parse change indicator from UFC website (trust this)
                    parsed_change = None
                    try:
                        change_el = row.find_element(By.CSS_SELECTOR, ".views-field-weight-class-rank-change")
                        change_text = change_el.text.strip()
                        if change_text:  # Only use if not empty
                            parsed_change = parse_change_indicator(change_text)
                    except:
                        pass  # No change indicator on website, leave as None
                    
                    # Don't compute changes - trust UFC website only
                    # If UFC shows no change, assume no change (None)
                    
                    fighter_data = {
                        "rank": idx,
                        "name": name,
                        "profile_url": href,
                        "uuid": uuid,
                        "missing": missing,
                        "change": parsed_change  # Only use website-provided changes
                    }
                    fighters.append(fighter_data)
                    
                except Exception as e:
                    warnings.append(f"Error parsing fighter row in {division_name}")
                    continue
        except Exception as e:
            warnings.append(f"Error parsing contenders for {division_name}")

        # Validate division structure
        validation_issues = validate_division_structure(division_name, fighters)
        if validation_issues:
            warnings.extend(validation_issues)

        all_rankings.append({
            "division": division_name,
            "fighters": fighters
        })

    driver.quit()

    print("💾 Saving rankings data...")

    # Save rankings
    with open("data/ufc_rankings.json", "w", encoding="utf-8") as f:
        json.dump(all_rankings, f, indent=2, ensure_ascii=False)

    # Summary statistics
    all_fighter_names = []
    rank_changes = 0
    
    for division in all_rankings:
        for fighter in division['fighters']:
            all_fighter_names.append(fighter['name'])
            if fighter.get('change') and fighter['change'] not in ["CHAMPION", "INTERIM", None]:
                rank_changes += 1

    expected_total = 11*16 + 30  # 11 weight classes with champ + 15, 2 P4P lists with 15
    
    print("\n" + "="*50)
    print("📊 RANKINGS SUMMARY")
    print("="*50)
    print(f"✅ Total fighters: {len(all_fighter_names)} (expected ~{expected_total})")
    if rank_changes > 0:
        print(f"📈 Rank changes detected: {rank_changes}")

    # Handle missing fighters
    if missing_fighters:
        os.makedirs("data/errors", exist_ok=True)
        with open("data/errors/rankings_errors.json", "w", encoding="utf-8") as f:
            json.dump(missing_fighters, f, indent=2, ensure_ascii=False)
        print(f"⚠️ Missing UUIDs: {len(missing_fighters)} fighters")
    else:
        error_path = "data/errors/rankings_errors.json"
        if os.path.exists(error_path):
            os.remove(error_path)
        print("✅ All fighters matched")

    # Show warnings if any
    if warnings:
        print(f"⚠️ Warnings: {len(warnings)} issues encountered")
        # Only show first few warnings to avoid spam
        for warning in warnings[:3]:
            print(f"   • {warning}")
        if len(warnings) > 3:
            print(f"   • ... and {len(warnings) - 3} more")
    
    print("="*50)


def fix_missing_uuids():
    """Fix fighters with missing UUIDs from error file"""
    print("🔄 Fixing missing UUIDs...")
    
    try:
        with open("data/errors/rankings_errors.json", "r", encoding="utf-8") as f:
            missing = json.load(f)
    except FileNotFoundError:
        print("⚠️ No rankings_errors.json file found.")
        return

    uuid_map = load_fighter_index()
    updated = []
    matched_count = 0
    
    for fighter in missing:
        norm = normalize(fighter["name"])
        uuid = uuid_map.get(norm)
        if uuid:
            matched_count += 1
        else:
            updated.append(fighter)

    print(f"✅ Matched {matched_count} fighters")
    
    if updated:
        with open("data/errors/rankings_errors.json", "w", encoding="utf-8") as f:
            json.dump(updated, f, indent=2, ensure_ascii=False)
        print(f"⚠️ Still unmatched: {len(updated)} fighters")
    else:
        os.remove("data/errors/rankings_errors.json")
        print("✅ All fighters matched - error file deleted")


if __name__ == "__main__":
    print("Select run mode:")
    print("[1] Full scrape")
    print("[2] Only fix fighters with missing UUIDs")
    choice = input("Enter 1 or 2: ").strip()

    if choice == "1":
        scrape_rankings()
    elif choice == "2":
        fix_missing_uuids()
    else:
        print("Invalid input. Exiting.")