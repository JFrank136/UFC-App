import subprocess
import time

def run_step(name, command):
    print(f"\n▶️ Starting: {name}")
    try:
        subprocess.run(command, shell=True, check=True)
        print(f"✅ Finished: {name}")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error in {name}: {e}")
    time.sleep(2)

if __name__ == "__main__":
    start_time = time.time()

    run_step("UFC Roster Scraper", "py scrape_ufc_roster.py")
    run_step("UFC Details Scraper", "py scrape_ufc_details.py")
    run_step("Sherdog Scraper", "py sherdog_scraper.py")

    end_time = time.time()
    print(f"\n🎉 All scrapers completed in {round((end_time - start_time) / 60, 2)} minutes.")
