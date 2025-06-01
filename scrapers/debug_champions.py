from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

options = Options()
options.add_argument("--window-size=1920,1080")
# REMOVE headless so you can visually confirm banners
# options.add_argument("--headless")

driver = webdriver.Chrome(options=options)
driver.get("https://www.ufc.com/rankings")

# Wait for rankings to load
WebDriverWait(driver, 30).until(
    EC.presence_of_element_located((By.CSS_SELECTOR, "div.view-grouping table tbody tr"))
)

try:
    close_btn = driver.find_element(By.CSS_SELECTOR, ".onetrust-close-btn-handler, .cc-btn.cc-dismiss")
    close_btn.click()
    print("✅ Closed cookie/banner popup.")
    time.sleep(1)
except:
    pass

headers = driver.find_elements(By.CSS_SELECTOR, "div.view-grouping-header")
divisions = driver.find_elements(By.CSS_SELECTOR, "div.view-grouping")

print(f"🧪 Found {len(headers)} headers and {len(divisions)} blocks")

for i, (header, div) in enumerate(zip(headers, divisions)):
    try:
        division_name = header.get_attribute("textContent").replace("Top Rank", "").strip()
        print(f"\n--- {i+1}. {division_name} ---")
        table = div.find_element(By.CSS_SELECTOR, "table")
        caption = table.find_element(By.TAG_NAME, "caption")
        print("Caption Text:")
        print(caption.text.strip())
        print("\nCaption HTML:")
        print(caption.get_attribute("outerHTML"))

        try:
            champ = caption.find_element(By.CSS_SELECTOR, "h5 a")
            print(f"✅ Champion found: {champ.text.strip()} — {champ.get_attribute('href')}")
        except:
            print("❌ No <h5 a> champion found")
    except Exception as e:
        print(f"⚠️ Error with division: {e}")
        continue

driver.quit()
