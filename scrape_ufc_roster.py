import json
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import NoSuchElementException

def scrape_ufc_roster():
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--log-level=3")

    print("🚀 Launching browser...")
    driver = webdriver.Chrome(options=options)
    driver.get("https://www.ufc.com/athletes/all")

    # Accept cookies
    try:
        btn = driver.find_element(By.ID, "onetrust-accept-btn-handler")
        driver.execute_script("arguments[0].scrollIntoView(true);", btn)
        time.sleep(0.5)
        btn.click()
        print("🍪 Accepted cookies.")
        time.sleep(1)
    except Exception as e:
        print(f"⚠️ Cookie banner not clicked: {e}")

    print("📥 Scrolling to load all fighters...")
    last_count = 0
    retries = 0
    max_retries = 15
    while retries < max_retries:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2.5)
        cards = driver.find_elements(By.CSS_SELECTOR, "li.l-flex__item")
        if len(cards) == last_count:
            retries += 1
        else:
            retries = 0
            last_count = len(cards)

    print("🔍 Extracting fighter data...")
    cards = driver.find_elements(By.CSS_SELECTOR, "li.l-flex__item")
    print(f"✅ Found {len(cards)} fighter cards")

    fighters = []
    for card in cards:
        name = record = division = profile_url = image_url = ""

        try:
            name = card.find_element(By.CLASS_NAME, "c-listing-athlete__name").text.strip()
        except NoSuchElementException:
            continue

        try:
            record = card.find_element(By.CLASS_NAME, "c-listing-athlete__record").text.strip()
        except NoSuchElementException:
            pass

        try:
            division = card.find_element(By.CSS_SELECTOR, ".c-listing-athlete__title .field__item").text.strip()
        except NoSuchElementException:
            pass

        try:
            image_url = card.find_element(By.CSS_SELECTOR, ".c-listing-athlete__thumbnail img").get_attribute("src")
        except NoSuchElementException:
            pass

        try:
            profile_url = card.find_element(By.CSS_SELECTOR, "a.e-button--black").get_attribute("href")
        except NoSuchElementException:
            pass

        fighters.append({
            "name": name,
            "record": record,
            "division": division,
            "profile_url": profile_url,
            "image_url": image_url
        })

    driver.quit()

    with open("ufcRoster.json", "w", encoding="utf-8") as f:
        json.dump(fighters, f, indent=2, ensure_ascii=False)

    print(f"🎉 Done! Saved {len(fighters)} fighters to ufcRoster.json")

if __name__ == "__main__":
    scrape_ufc_roster()
