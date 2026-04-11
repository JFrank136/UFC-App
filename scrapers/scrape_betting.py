#!/usr/bin/env python3
"""
UFC Betting Odds Scraper - BestFightOdds.com with Selenium
Scrapes comprehensive odds data from DraftKings and FanDuel
"""

import os
import sys
import json
import time
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime, timezone
import re
import unicodedata
from typing import Dict, List, Optional, Tuple
import random

# Add utils path for name fixes
sys.path.append("utils")
try:
    from name_fixes import TAPOLOGY_FIXES
    TAPOLOGY_FIXES = {name.upper(): fixed for name, fixed in TAPOLOGY_FIXES.items()}
except ImportError:
    print("⚠️ Could not import TAPOLOGY_FIXES. Continuing without name fixes.")
    TAPOLOGY_FIXES = {}

OUTPUT_FILE = "data/bestfightodds_data.json"
UPCOMING_FIGHTS_FILE = "data/upcoming_fights.json"
BASE_URL = "https://www.bestfightodds.com"

# Target sportsbooks - Only DraftKings and FanDuel
TARGET_SPORTSBOOKS = {"DraftKings", "FanDuel"}

def normalize_name(name: str) -> str:
    """Normalize fighter name for matching"""
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    return name.strip().upper()

def apply_name_fixes(name: str) -> str:
    """Apply name fixes from TAPOLOGY_FIXES"""
    norm = normalize_name(name)
    return TAPOLOGY_FIXES.get(norm, name)

def setup_browser():
    """Setup Chrome browser with anti-detection measures"""
    options = Options()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    # Realistic user agent
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
    
    # Uncomment for headless mode once working
    # options.add_argument("--headless")
    
    driver = webdriver.Chrome(options=options)
    
    # Remove webdriver property
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

def parse_american_odds(odds_text: str) -> Optional[int]:
    """Parse American odds format (+150, -200) to integer"""
    if not odds_text or odds_text.strip() in ['', '-', 'N/A']:
        return None
    
    # Clean the odds text
    clean_odds = re.sub(r'[^\d\-\+]', '', odds_text.strip())
    
    try:
        return int(clean_odds)
    except ValueError:
        return None

def extract_fighter_names_from_matchup(matchup_text: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract fighter names from matchup text like 'Jones vs Smith'"""
    if not matchup_text:
        return None, None
    
    # Common patterns for fighter matchups
    patterns = [
        r'(.+?)\s+vs\.?\s+(.+)',
        r'(.+?)\s+v\.?\s+(.+)',
        r'(.+?)\s+-\s+(.+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, matchup_text.strip(), re.IGNORECASE)
        if match:
            fighter1 = match.group(1).strip()
            fighter2 = match.group(2).strip()
            
            # Apply name fixes
            fighter1 = apply_name_fixes(fighter1)
            fighter2 = apply_name_fixes(fighter2)
            
            return fighter1, fighter2
    
    return None, None

def load_upcoming_fights() -> List[Dict]:
    """Load upcoming fights data for cross-referencing"""
    try:
        with open(UPCOMING_FIGHTS_FILE, "r", encoding="utf-8") as f:
            fights = json.load(f)
        
        upcoming_fights = [
            fight for fight in fights 
            if fight.get("event_status") == "upcoming"
        ]
        
        print(f"📅 Loaded {len(upcoming_fights)} upcoming fights for matching")
        return upcoming_fights
        
    except FileNotFoundError:
        print(f"⚠️ Upcoming fights file not found: {UPCOMING_FIGHTS_FILE}")
        return []
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in upcoming fights file: {e}")
        return []

def scrape_ufc_events(driver) -> List[str]:
    """Get list of UFC event URLs from BestFightOdds using Selenium"""
    print("🔍 Finding UFC events on BestFightOdds with browser...")
    
    try:
        # Navigate to BestFightOdds
        driver.get(BASE_URL)
        
        # Wait for page to load
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Random delay to appear human
        time.sleep(random.uniform(2, 4))
        
        # Get page source and parse with BeautifulSoup
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        print(f"📄 Page title: {soup.title.string if soup.title else 'No title'}")
        
        # Look for UFC event links
        event_links = []
        
        # Find all links
        all_links = soup.find_all('a', href=True)
        for link in all_links:
            href = link.get('href', '')
            text = link.get_text(strip=True).lower()
            
            # Look for UFC event patterns
            if ('ufc' in href.lower() and '/events/' in href) or \
               ('ufc' in text and any(word in text for word in ['vs', 'v.', 'fight', ':'])):
                
                # Make absolute URL
                if href.startswith('/'):
                    full_url = BASE_URL + href
                elif href.startswith('http'):
                    full_url = href
                else:
                    continue
                
                if full_url not in event_links and 'ufc' in full_url.lower():
                    event_links.append(full_url)
                    
                    # Limit to avoid too many events
                    if len(event_links) >= 8:
                        break
        
        if not event_links:
            print("⚠️ No UFC event links found, using manual fallback URLs")
            event_links = [
                f"{BASE_URL}/events/ufc-316-dvalishvili-vs-omalley-2",
                f"{BASE_URL}/events/ufc-317-topuria-vs-oliveira",
                f"{BASE_URL}/events/ufc-318-holloway-vs-poirier-3"
            ]
        
        print(f"✅ Found {len(event_links)} UFC event URLs")
        return event_links[:5]  # Limit to recent events
        
    except Exception as e:
        print(f"❌ Error finding UFC events: {e}")
        # Return manual fallback
        return [
            f"{BASE_URL}/events/ufc-316-dvalishvili-vs-omalley-2",
            f"{BASE_URL}/events/ufc-317-topuria-vs-oliveira"
        ]

def scrape_event_odds(driver, event_url: str) -> List[Dict]:
    """Scrape betting odds for a specific UFC event using Selenium"""
    print(f"🥊 Scraping event: {event_url}")
    
    try:
        # Navigate to event page
        driver.get(event_url)
        
        # Wait for page content
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Random delay
        time.sleep(random.uniform(2, 4))
        
        # Get page source
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Extract event title  
        event_title = "Unknown Event"
        title_selectors = ["h1", ".event-title", "title"]
        for selector in title_selectors:
            title_elem = soup.select_one(selector)
            if title_elem:
                event_title = title_elem.get_text(strip=True)
                if 'ufc' in event_title.lower():
                    break
        
        print(f"📅 Event: {event_title}")
        
        # Look for odds tables
        odds_data = []
        
        # Find tables with betting data
        tables = soup.find_all('table')
        if not tables:
            print("⚠️ No tables found on page")
            return []
        
        print(f"📊 Processing {len(tables)} tables...")
        
        for table in tables:
            # Extract fight odds from table
            rows = table.find_all('tr')
            
            current_fight = None
            current_sportsbooks = {}
            
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:
                    continue
                
                first_cell_text = cells[0].get_text(strip=True)
                
                # Check if this is a fighter matchup row
                fighter1, fighter2 = extract_fighter_names_from_matchup(first_cell_text)
                
                if fighter1 and fighter2:
                    # Save previous fight if exists
                    if current_fight and current_sportsbooks:
                        fight_odds = create_fight_odds_record(
                            current_fight, current_sportsbooks, event_title, event_url
                        )
                        if fight_odds:
                            odds_data.append(fight_odds)
                    
                    # Start new fight
                    current_fight = {
                        "fighter1": fighter1,
                        "fighter2": fighter2,
                        "matchup": first_cell_text
                    }
                    current_sportsbooks = {}
                    continue
                
                # Check if this is sportsbook odds row
                if current_fight and any(book.lower() in first_cell_text.lower() for book in TARGET_SPORTSBOOKS):
                    sportsbook_name = first_cell_text
                    
                    # Extract odds from remaining cells
                    odds_values = []
                    for cell in cells[1:]:
                        odds_text = cell.get_text(strip=True)
                        parsed_odds = parse_american_odds(odds_text)
                        odds_values.append(parsed_odds)
                    
                    # Store sportsbook data
                    current_sportsbooks[sportsbook_name] = {
                        "moneyline": {
                            "fighter1": odds_values[0] if len(odds_values) > 0 else None,
                            "fighter2": odds_values[1] if len(odds_values) > 1 else None
                        }
                    }
                    
                    # Extract over/under if available
                    if len(odds_values) > 2:
                        over_under = extract_over_under_from_odds(odds_values[2:])
                        if over_under:
                            current_sportsbooks[sportsbook_name]["over_under"] = over_under
            
            # Don't forget the last fight
            if current_fight and current_sportsbooks:
                fight_odds = create_fight_odds_record(
                    current_fight, current_sportsbooks, event_title, event_url
                )
                if fight_odds:
                    odds_data.append(fight_odds)
        
        print(f"✅ Extracted odds for {len(odds_data)} fights")
        return odds_data
        
    except Exception as e:
        print(f"❌ Error scraping event {event_url}: {e}")
        return []

def extract_over_under_from_odds(odds_values) -> Optional[Dict]:
    """Extract over/under data from odds values"""
    over_under = {}
    
    # Look for over/under patterns in the odds values
    for odds in odds_values:
        if odds is not None:
            # This is a simplified version - BestFightOdds structure may vary
            # We'll need to see the actual page structure to parse correctly
            pass
    
    return over_under if over_under else None

def create_fight_odds_record(fight_info: Dict, sportsbooks: Dict, event_title: str, event_url: str) -> Optional[Dict]:
    """Create a comprehensive fight odds record"""
    if not fight_info or not sportsbooks:
        return None
    
    # Create base record
    odds_record = {
        "event": event_title,
        "event_url": event_url,
        "fighter1": fight_info["fighter1"],
        "fighter2": fight_info["fighter2"],
        "matchup": fight_info["matchup"],
        "sportsbooks": {},
        "scraped_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add sportsbook data
    for sportsbook_name, sportsbook_data in sportsbooks.items():
        # Clean sportsbook name
        clean_name = sportsbook_name.strip()
        
        # Extract recognized sportsbook
        recognized_book = None
        for target_book in TARGET_SPORTSBOOKS:
            if target_book.lower() in clean_name.lower():
                recognized_book = target_book
                break
        
        if not recognized_book:
            continue
        
        odds_record["sportsbooks"][recognized_book] = {
            "moneyline": sportsbook_data.get("moneyline", {}),
            "over_under": sportsbook_data.get("over_under"),
            "method_of_victory": sportsbook_data.get("method_of_victory"),
            "round_betting": sportsbook_data.get("round_betting"),
            "props": sportsbook_data.get("props")
        }
    
    return odds_record if odds_record["sportsbooks"] else None

def match_odds_to_upcoming_fights(odds_data: List[Dict], upcoming_fights: List[Dict]) -> List[Dict]:
    """Match scraped odds to upcoming fights data"""
    print("🔗 Matching odds to upcoming fights...")
    
    matched_odds = []
    unmatched_odds = []
    
    # Create lookup for upcoming fights
    fight_lookup = {}
    for fight in upcoming_fights:
        fighter1 = normalize_name(fight.get("fighter1", ""))
        fighter2 = normalize_name(fight.get("fighter2", ""))
        key = tuple(sorted([fighter1, fighter2]))
        fight_lookup[key] = fight
    
    for odds in odds_data:
        fighter1_norm = normalize_name(odds["fighter1"])
        fighter2_norm = normalize_name(odds["fighter2"])
        lookup_key = tuple(sorted([fighter1_norm, fighter2_norm]))
        
        if lookup_key in fight_lookup:
            matched_fight = fight_lookup[lookup_key]
            
            # Enrich odds with fight metadata
            enriched_odds = odds.copy()
            enriched_odds.update({
                "event_date": matched_fight.get("event_date"),
                "event_type": matched_fight.get("event_type"),
                "fighter1_id": matched_fight.get("uuid1"),
                "fighter2_id": matched_fight.get("uuid2"),
                "weight_class": matched_fight.get("weight_class"),
                "fight_order": matched_fight.get("fight_order"),
                "venue": matched_fight.get("venue"),
                "location": matched_fight.get("location")
            })
            
            matched_odds.append(enriched_odds)
            print(f"✅ Matched: {odds['fighter1']} vs {odds['fighter2']}")
        else:
            unmatched_odds.append(odds)
            print(f"⚠️ Unmatched: {odds['fighter1']} vs {odds['fighter2']}")
    
    print(f"\n📊 Matching Results:")
    print(f"✅ Matched: {len(matched_odds)} fights")
    print(f"⚠️ Unmatched: {len(unmatched_odds)} fights")
    
    return matched_odds

def save_odds_data(odds_data: List[Dict], output_file: str = OUTPUT_FILE):
    """Save comprehensive odds data to JSON file"""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(odds_data, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Saved {len(odds_data)} comprehensive odds records to {output_file}")
        
    except Exception as e:
        print(f"❌ Error saving odds data: {e}")

def main():
    """Main execution function with Selenium"""
    print("🎲 UFC Comprehensive Betting Odds Scraper - BestFightOdds.com")
    print("=" * 70)
    
    # Load upcoming fights for cross-referencing
    upcoming_fights = load_upcoming_fights()
    
    # Setup browser
    driver = setup_browser()
    
    try:
        # Get UFC event URLs
        event_urls = scrape_ufc_events(driver)
        
        if not event_urls:
            print("❌ No UFC event URLs found")
            return
        
        print(f"🎯 Found {len(event_urls)} UFC events to scrape")
        
        # Scrape odds from all events
        all_odds = []
        
        for i, event_url in enumerate(event_urls, 1):
            print(f"\n[{i}/{len(event_urls)}] Processing event...")
            event_odds = scrape_event_odds(driver, event_url)
            all_odds.extend(event_odds)
            
            # Random delay between events
            time.sleep(random.uniform(3, 6))
        
        if not all_odds:
            print("❌ No odds data scraped")
            return
        
        print(f"\n🎯 Successfully scraped odds for {len(all_odds)} fights across all events")
        
        # Match odds to existing fight data if available
        if upcoming_fights:
            matched_odds = match_odds_to_upcoming_fights(all_odds, upcoming_fights)
            final_odds = matched_odds
            
            # Save unmatched odds for debugging
            unmatched = [odds for odds in all_odds if odds not in matched_odds]
            if unmatched:
                debug_file = "data/errors/unmatched_bestfightodds.json"
                save_odds_data(unmatched, debug_file)
                print(f"🔍 Saved {len(unmatched)} unmatched odds to {debug_file}")
        else:
            final_odds = all_odds
            print("⚠️ No upcoming fights data available - saving all scraped odds")
        
        # Save comprehensive odds data
        save_odds_data(final_odds)
        
        # Generate summary
        sportsbook_counts = {}
        bet_type_counts = {"moneyline": 0, "over_under": 0, "props": 0}
        
        for odds in final_odds:
            for sportsbook in odds.get("sportsbooks", {}):
                sportsbook_counts[sportsbook] = sportsbook_counts.get(sportsbook, 0) + 1
                
                book_data = odds["sportsbooks"][sportsbook]
                if book_data.get("moneyline"):
                    bet_type_counts["moneyline"] += 1
                if book_data.get("over_under"):
                    bet_type_counts["over_under"] += 1
                if book_data.get("props"):
                    bet_type_counts["props"] += 1
        
        print("\n" + "=" * 70)
        print("📊 COMPREHENSIVE SCRAPING SUMMARY")
        print("=" * 70)
        print(f"Total fights scraped: {len(final_odds)}")
        print(f"Total odds records: {sum(sportsbook_counts.values())}")
        
        print(f"\n📈 Sportsbook Coverage:")
        for book, count in sorted(sportsbook_counts.items()):
            print(f"  {book}: {count} fights")
        
        print(f"\n🎯 Bet Type Coverage:")
        for bet_type, count in bet_type_counts.items():
            print(f"  {bet_type.title()}: {count} records")
        
        if final_odds:
            print(f"\n✅ BestFightOdds scraping completed successfully!")
            print(f"📁 Data saved to: {OUTPUT_FILE}")
        else:
            print("\n⚠️ No odds data was successfully processed")
        
        print("=" * 70)
    
    finally:
        driver.quit()

if __name__ == "__main__":
    main()