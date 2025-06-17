#!/usr/bin/env python3
"""
Improved BestFightOdds Scraper - Enhanced Debug Version
Better fighter detection and page structure analysis
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
import random

OUTPUT_FILE = "data/bestfightodds_debug.json"
BASE_URL = "https://www.bestfightodds.com"

def setup_browser():
    """Setup Chrome browser"""
    options = Options()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

def enhanced_fighter_detection(soup):
    """Enhanced fighter name detection with multiple strategies"""
    print("\n🥊 ENHANCED FIGHTER DETECTION:")
    
    potential_fights = []
    
    # Strategy 1: Look for table headers with scope="row" (fighter matchups)
    fight_headers = soup.select('th[scope="row"]')
    print(f"📋 Found {len(fight_headers)} table headers with scope='row':")
    
    for i, header in enumerate(fight_headers):
        text = header.get_text(strip=True)
        print(f"  Header {i+1}: '{text}'")
        
        # Try multiple patterns for fighter vs fighter
        patterns = [
            r'^([A-Za-z\'\-\.\s]+)\s+vs\.?\s+([A-Za-z\'\-\.\s]+)$',
            r'^([A-Za-z\'\-\.\s]+)\s+v\.?\s+([A-Za-z\'\-\.\s]+)$',
            r'^([A-Za-z\'\-\.\s]+)\s+-\s+([A-Za-z\'\-\.\s]+)$',
            r'^([A-Za-z\'\-\.\s]+)\s+@\s+([A-Za-z\'\-\.\s]+)$',
            r'^([A-Za-z\'\-\.\s]+)\s+versus\s+([A-Za-z\'\-\.\s]+)$'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fighter1 = match.group(1).strip()
                fighter2 = match.group(2).strip()
                
                # Validate fighter names (reasonable length, not all caps unless short)
                if (3 <= len(fighter1) <= 50 and 3 <= len(fighter2) <= 50 and
                    not fighter1.isupper() and not fighter2.isupper()):
                    potential_fights.append({
                        "fighter1": fighter1,
                        "fighter2": fighter2,
                        "source": "table_header",
                        "original_text": text,
                        "header_element": header
                    })
                    print(f"    ✅ MATCH: {fighter1} vs {fighter2}")
                    break
    
    # Strategy 2: Look in link text (fighter profile links)
    fighter_links = soup.select('a[href*="fighter"]')
    print(f"\n🔗 Found {len(fighter_links)} fighter profile links:")
    
    link_fighters = []
    for link in fighter_links[:10]:  # Show first 10
        text = link.get_text(strip=True)
        href = link.get('href', '')
        print(f"  Link: '{text}' -> {href}")
        
        if 3 <= len(text) <= 50 and not text.isupper():
            link_fighters.append(text)
    
    # Try to pair up fighters from links
    if len(link_fighters) >= 2:
        print(f"\n🔄 Attempting to pair {len(link_fighters)} fighters from links:")
        for i in range(0, len(link_fighters)-1, 2):
            if i+1 < len(link_fighters):
                fighter1 = link_fighters[i]
                fighter2 = link_fighters[i+1]
                potential_fights.append({
                    "fighter1": fighter1,
                    "fighter2": fighter2,
                    "source": "fighter_links",
                    "original_text": f"{fighter1} vs {fighter2}",
                    "header_element": None
                })
                print(f"    Paired: {fighter1} vs {fighter2}")
    
    # Strategy 3: Look for divs or spans with fighter names
    potential_name_elements = soup.select('span.fighter-name, div.fighter-name, .fighter, .matchup')
    print(f"\n👤 Found {len(potential_name_elements)} potential fighter name elements:")
    
    for elem in potential_name_elements:
        text = elem.get_text(strip=True)
        print(f"  Element: '{text}' (class: {elem.get('class', [])})")
    
    # Strategy 4: Search in all text for common MMA name patterns
    all_text = soup.get_text()
    lines = [line.strip() for line in all_text.split('\n') if line.strip()]
    
    print(f"\n📄 Scanning {len(lines)} text lines for fighter patterns:")
    name_patterns = [
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+vs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+v\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+-\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'
    ]
    
    text_matches = 0
    for line in lines:
        for pattern in name_patterns:
            matches = re.finditer(pattern, line)
            for match in matches:
                fighter1 = match.group(1).strip()
                fighter2 = match.group(2).strip()
                
                if (3 <= len(fighter1) <= 50 and 3 <= len(fighter2) <= 50):
                    potential_fights.append({
                        "fighter1": fighter1,
                        "fighter2": fighter2,
                        "source": "text_scan",
                        "original_text": line,
                        "header_element": None
                    })
                    text_matches += 1
                    if text_matches <= 5:  # Show first 5
                        print(f"    Text match: {fighter1} vs {fighter2}")
    
    print(f"  Total text matches: {text_matches}")
    
    # Remove duplicates
    unique_fights = []
    seen_combinations = set()
    
    for fight in potential_fights:
        # Create a normalized key for deduplication
        f1_norm = fight["fighter1"].lower().strip()
        f2_norm = fight["fighter2"].lower().strip()
        fight_key = tuple(sorted([f1_norm, f2_norm]))
        
        if fight_key not in seen_combinations:
            seen_combinations.add(fight_key)
            unique_fights.append(fight)
    
    print(f"\n✅ Total unique fights detected: {len(unique_fights)}")
    for i, fight in enumerate(unique_fights, 1):
        print(f"  {i}. {fight['fighter1']} vs {fight['fighter2']} (from: {fight['source']})")
    
    return unique_fights

def enhanced_odds_analysis(soup, detected_fights):
    """Enhanced odds analysis with better mapping"""
    print("\n💰 ENHANCED ODDS ANALYSIS:")
    
    # Get all cells with data-li attributes
    data_li_cells = soup.select('td[data-li]')
    print(f"📊 Found {len(data_li_cells)} cells with data-li")
    
    # Group cells by row to understand table structure
    row_analysis = {}
    for cell in data_li_cells:
        # Find the parent row
        parent_row = cell.find_parent('tr')
        if parent_row:
            row_id = id(parent_row)  # Use object ID as unique row identifier
            
            if row_id not in row_analysis:
                row_analysis[row_id] = {
                    "row_element": parent_row,
                    "cells": [],
                    "fight_header": None
                }
            
            # Extract odds from cell
            cell_text = cell.get_text(strip=True)
            data_li = cell.get('data-li')
            has_odds = bool(re.search(r'[+\-]\d{2,4}', cell_text))
            
            row_analysis[row_id]["cells"].append({
                "data_li": data_li,
                "text": cell_text,
                "has_odds": has_odds,
                "classes": cell.get('class', [])
            })
    
    print(f"📋 Organized into {len(row_analysis)} rows")
    
    # Try to associate rows with fight headers
    for row_id, row_data in row_analysis.items():
        row_element = row_data["row_element"]
        
        # Look for fight header in this row
        fight_header = row_element.select_one('th[scope="row"]')
        if fight_header:
            header_text = fight_header.get_text(strip=True)
            row_data["fight_header"] = header_text
            
            # Try to match with detected fights
            for fight in detected_fights:
                if (fight["fighter1"].lower() in header_text.lower() and 
                    fight["fighter2"].lower() in header_text.lower()):
                    row_data["matched_fight"] = fight
                    break
    
    # Analyze sportsbook structure
    print(f"\n🏪 SPORTSBOOK ANALYSIS:")
    
    # Look for sportsbook headers in table
    sportsbook_headers = soup.select('th')
    sportsbook_columns = {}
    
    for i, header in enumerate(sportsbook_headers):
        header_text = header.get_text(strip=True)
        for sportsbook in ["DraftKings", "FanDuel", "BetMGM", "Caesars", "PointsBet"]:
            if sportsbook.lower() in header_text.lower():
                sportsbook_columns[i] = sportsbook
                print(f"  Column {i}: {sportsbook} (header: '{header_text}')")
    
    # Try to extract structured odds data
    fight_odds = []
    
    for row_id, row_data in row_analysis.items():
        if row_data.get("fight_header") and row_data.get("matched_fight"):
            fight = row_data["matched_fight"]
            
            odds_record = {
                "fighter1": fight["fighter1"],
                "fighter2": fight["fighter2"],
                "matchup": row_data["fight_header"],
                "sportsbooks": {},
                "raw_cells": row_data["cells"]
            }
            
            # Try to map cells to sportsbooks
            cells_with_odds = [cell for cell in row_data["cells"] if cell["has_odds"]]
            
            print(f"\n🥊 Processing fight: {fight['fighter1']} vs {fight['fighter2']}")
            print(f"    Found {len(cells_with_odds)} cells with odds")
            
            for i, cell in enumerate(cells_with_odds):
                print(f"      Cell {i+1}: {cell['text']} (data-li: {cell['data_li']})")
            
            # Simple mapping: assume pairs of odds are fighter1, fighter2 for each sportsbook
            for i in range(0, len(cells_with_odds), 2):
                if i+1 < len(cells_with_odds):
                    cell1 = cells_with_odds[i]
                    cell2 = cells_with_odds[i+1]
                    
                    # Extract odds values
                    odds1_match = re.search(r'([+\-]\d{2,4})', cell1["text"])
                    odds2_match = re.search(r'([+\-]\d{2,4})', cell2["text"])
                    
                    if odds1_match and odds2_match:
                        odds1 = int(odds1_match.group(1))
                        odds2 = int(odds2_match.group(1))
                        
                        # Determine sportsbook (simplified - would need better logic)
                        sportsbook_name = f"Unknown_Book_{i//2 + 1}"
                        if i//2 < len(sportsbook_columns):
                            sportsbook_name = list(sportsbook_columns.values())[i//2]
                        
                        odds_record["sportsbooks"][sportsbook_name] = {
                            "moneyline": {
                                "fighter1": odds1,
                                "fighter2": odds2
                            }
                        }
                        
                        print(f"      Mapped to {sportsbook_name}: {odds1} / {odds2}")
            
            if odds_record["sportsbooks"]:
                fight_odds.append(odds_record)
    
    return fight_odds, row_analysis

def comprehensive_page_analysis(soup):
    """Comprehensive analysis of page structure"""
    print("\n🔍 COMPREHENSIVE PAGE ANALYSIS:")
    
    analysis = {
        "page_title": soup.title.string if soup.title else "No title",
        "total_tables": len(soup.find_all('table')),
        "total_rows": len(soup.find_all('tr')),
        "data_li_elements": len(soup.select('[data-li]')),
        "button_elements": len(soup.find_all('button')),
        "link_elements": len(soup.find_all('a')),
        "odds_found": len(re.findall(r'[+\-]\d{2,4}', soup.get_text()))
    }
    
    print(f"📄 Page title: {analysis['page_title']}")
    print(f"📊 Tables: {analysis['total_tables']}")
    print(f"📋 Rows: {analysis['total_rows']}")
    print(f"🔢 Elements with data-li: {analysis['data_li_elements']}")
    print(f"🔘 Buttons: {analysis['button_elements']}")
    print(f"🔗 Links: {analysis['link_elements']}")
    print(f"💰 Odds found: {analysis['odds_found']}")
    
    # Look for specific BestFightOdds elements
    specific_elements = {
        "odds_tables": len(soup.select('table.odds-table')),
        "but_sg_cells": len(soup.select('.but-sg')),
        "prop_cells": len(soup.select('.prop-cell')),
        "fighter_links": len(soup.select('a[href*="fighter"]')),
        "event_headers": len(soup.select('h1, h2, h3'))
    }
    
    print(f"\n🎯 BestFightOdds specific elements:")
    for element, count in specific_elements.items():
        print(f"  {element}: {count}")
    
    return analysis

def improved_button_clicking(driver):
    """Improved button clicking strategy"""
    print("\n🔘 IMPROVED BUTTON CLICKING:")
    
    # Wait for initial page load
    time.sleep(2)
    
    # Multiple button strategies
    button_strategies = [
        ("Expand buttons with data-li", "button[data-li]"),
        ("Button cells", "td.button-cell button"),
        ("But-sg buttons", "td.but-sg button"),
        ("Prop cell buttons", ".prop-cell button"),
        ("Any clickable odds buttons", "button:contains('+')"),
        ("Generic expansion buttons", "button[title*='expand']"),
        ("Plus/minus buttons", "button.expand, button.collapse")
    ]
    
    total_clicked = 0
    
    for strategy_name, selector in button_strategies:
        try:
            buttons = driver.find_elements(By.CSS_SELECTOR, selector)
            print(f"  {strategy_name}: Found {len(buttons)} buttons")
            
            clicked_this_round = 0
            for i, button in enumerate(buttons):
                try:
                    if button.is_displayed() and button.is_enabled():
                        # Scroll to button
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
                        time.sleep(0.3)
                        
                        # Click using JavaScript to avoid interception
                        driver.execute_script("arguments[0].click();", button)
                        clicked_this_round += 1
                        total_clicked += 1
                        
                        # Small delay between clicks
                        time.sleep(0.5)
                        
                        # Limit clicks per strategy to avoid infinite expansion
                        if clicked_this_round >= 10:
                            break
                            
                except Exception as e:
                    print(f"    Failed to click button {i+1}: {e}")
                    continue
            
            print(f"    Clicked {clicked_this_round} buttons")
            
            # Wait for content to load after each strategy
            if clicked_this_round > 0:
                time.sleep(2)
                
        except Exception as e:
            print(f"  Error with {strategy_name}: {e}")
    
    print(f"✅ Total buttons clicked: {total_clicked}")
    return total_clicked

def simple_scrape_event(driver, event_url: str):
    """Enhanced event scraper with improved detection"""
    print(f"\n🥊 ENHANCED EVENT SCRAPING: {event_url}")
    
    try:
        # Navigate to event
        driver.get(event_url)
        
        # Wait for page load
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        time.sleep(3)
        
        # Get initial page analysis
        soup_initial = BeautifulSoup(driver.page_source, 'html.parser')
        initial_analysis = comprehensive_page_analysis(soup_initial)
        
        # Improved button clicking
        buttons_clicked = improved_button_clicking(driver)
        
        # Wait for expanded content
        time.sleep(3)
        
        # Get final page source
        soup_final = BeautifulSoup(driver.page_source, 'html.parser')
        final_analysis = comprehensive_page_analysis(soup_final)
        
        # Enhanced fighter detection
        detected_fights = enhanced_fighter_detection(soup_final)
        
        # Enhanced odds analysis
        fight_odds, row_analysis = enhanced_odds_analysis(soup_final, detected_fights)
        
        # Create comprehensive result
        result = {
            "event_url": event_url,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "page_analysis": {
                "initial": initial_analysis,
                "final": final_analysis,
                "buttons_clicked": buttons_clicked
            },
            "detected_fights": detected_fights,
            "extracted_odds": fight_odds,
            "debug_info": {
                "total_fights_detected": len(detected_fights),
                "total_odds_records": len(fight_odds),
                "row_analysis_count": len(row_analysis),
                "expansion_success": final_analysis["odds_found"] > initial_analysis["odds_found"]
            }
        }
        
        return result
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"error": str(e), "event_url": event_url}

def main():
    """Main enhanced debug function"""
    print("🚀 ENHANCED BestFightOdds Debug Scraper")
    print("=" * 60)
    
    driver = setup_browser()
    
    try:
        # Test with the same URL
        test_url = "https://www.bestfightodds.com/events/ufc-3725"
        
        print(f"🎯 Testing with: {test_url}")
        
        result = simple_scrape_event(driver, test_url)
        
        # Save enhanced debug results
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Enhanced results saved to: {OUTPUT_FILE}")
        
        if result and not result.get("error"):
            print(f"\n📊 SUMMARY:")
            print(f"  Fights detected: {result['debug_info']['total_fights_detected']}")
            print(f"  Odds records: {result['debug_info']['total_odds_records']}")
            print(f"  Buttons clicked: {result['page_analysis']['buttons_clicked']}")
            print(f"  Expansion successful: {result['debug_info']['expansion_success']}")
            
            if result['detected_fights']:
                print(f"\n🥊 DETECTED FIGHTS:")
                for i, fight in enumerate(result['detected_fights'], 1):
                    print(f"  {i}. {fight['fighter1']} vs {fight['fighter2']}")
            
            if result['extracted_odds']:
                print(f"\n💰 EXTRACTED ODDS:")
                for odds in result['extracted_odds']:
                    sportsbooks = list(odds['sportsbooks'].keys())
                    print(f"  {odds['fighter1']} vs {odds['fighter2']} - {len(sportsbooks)} sportsbooks")
        
        print(f"\n✅ Enhanced debugging completed!")
        print(f"📁 Check the output file for detailed analysis")
    
    except Exception as e:
        print(f"❌ Critical error: {e}")
    
    finally:
        input("\nPress Enter to close browser...")
        driver.quit()

if __name__ == "__main__":
    main()