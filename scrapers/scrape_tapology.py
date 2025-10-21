#!/usr/bin/env python3
"""
Tapology Test & Debug Scraper - Clean Working Version
For testing data accuracy on a few fighters
"""

import os
import sys
import re
import json
import time
import requests
from bs4 import BeautifulSoup
import unicodedata
from uuid import uuid4
from datetime import datetime
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Add utils path
utils_path = os.path.join(os.path.dirname(__file__), "utils")
sys.path.append(utils_path)

try:
    from name_fixes import TAPOLOGY_FIXES, NAME_FIXES
except ImportError:
    print("[WARN] Could not import name fixes. Continuing without name fixes.")
    TAPOLOGY_FIXES = {}
    NAME_FIXES = {}

# Configuration
OUTPUT_FILE = "data/tapology_fighters.json"
FIGHTERS_RAW_PATH = "data/ufc_fighters_raw.json"
BASE_URL = "https://www.tapology.com"

class SessionManager:
    """Thread-safe session manager for production scraping"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        })
        # Enhanced connection pooling
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=20,
            pool_maxsize=20,
            max_retries=3
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        self.lock = threading.Lock()
        self.request_count = 0
    
    def get(self, url, **kwargs):
        with self.lock:
            self.request_count += 1
        
        # Respectful delay with some randomization
        time.sleep(random.uniform(1.2, 2.5))  # Slightly faster while still respectful
        
        kwargs.setdefault('timeout', 30)
        try:
            response = self.session.get(url, **kwargs)
            return response
        except Exception as e:
            print(f"    [X] Request failed for {url}: {e}")
            return None

# Global session manager
session_manager = SessionManager()

def print_progress_bar(current, total, prefix='Progress', bar_length=50):
    """Print a progress bar"""
    percent = float(current) * 100 / total
    filled_length = int(bar_length * current // total)
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    print(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})', end='', flush=True)

def normalize_name_for_search(name):
    """Normalize name for search"""
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")

def clean_fighter_name(raw_name):
    """Clean fighter name from page title"""
    if not raw_name:
        return None
    
    # Remove suffixes and extract name before nickname
    patterns = [r'\s*\|\s*MMA Fighter Page.*$', r'\s*\|\s*Tapology.*$']
    cleaned = raw_name.strip()
    for pattern in patterns:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
    
    # Extract name before nickname: "Israel Adesanya ("The Last Stylebender")"
    name_match = re.match(r'^([^(]+)(?:\s*\([^)]*\))?', cleaned)
    if name_match:
        cleaned = name_match.group(1).strip()
    
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if 2 <= len(cleaned) <= 50 else None

def extract_fighter_data(soup, debug=False, fighter_id=None):
    """Extract specific fighter data fields from Tapology's HTML structure"""
    page_text = soup.get_text()
    data = {}
    
    # Store fighter_id for use in fight history
    if fighter_id:
        data['fighter_id'] = fighter_id
    
    if debug:
        print(f"[SEARCH] Starting data extraction...")
    
    # Age extraction - from span with data-controller="age-calc"
    if debug:
        print(f"  [DATE] Extracting age...")
    age_elem = soup.find('span', attrs={'data-controller': 'age-calc'})
    if age_elem:
        age_text = age_elem.get_text().strip()
        if debug:
            print(f"    Found age element: '{age_text}'")
        # Extract birth year and calculate age
        birth_year_match = re.search(r'(\d{4})', age_text)
        if birth_year_match:
            birth_year = int(birth_year_match.group(1))
            current_year = datetime.now().year
            calculated_age = current_year - birth_year
            data['age'] = str(calculated_age)
            if debug:
                print(f"    [OK] Calculated age: {calculated_age} (born {birth_year})")
        else:
            if debug:
                print(f"    [X] Could not extract birth year from: '{age_text}'")
    else:
        if debug:
            print(f"    [X] No age element found")
    
    # Basic info extraction using regex patterns
    field_patterns = {
        'country': r'Born:\s*([^,\n\r\|]+(?:,\s*[^,\n\r\|]+)?)',
        'weight_class': r'Weight Class:\s*([^\n\r\|]+)',
        'nickname': r'Nickname:\s*([^\n\r\|]+)',
    }
    
    if debug:
        print(f"  [WORLD] Extracting basic info...")
    
    for field, pattern in field_patterns.items():
        match = re.search(pattern, page_text, re.IGNORECASE)
        if match:
            value = match.group(1).strip()
            if field == 'country' and ',' in value:
                # Take the last part (usually country)
                data[field] = value.split(',')[-1].strip()
            elif field == 'country' and value.lower() == 'lagos':
                data[field] = 'Nigeria'  # Special case
            else:
                data[field] = value
            if debug:
                print(f"    [OK] {field}: '{data[field]}'")
        else:
            if debug:
                print(f"    [X] {field}: not found")
    
    # Height and Reach extraction - targeting specific HTML structure
    if debug:
        print(f"  [MEASURE] Extracting height and reach...")
    
    # Look for the specific structure: strong tag with "Height:" followed by span, then "Reach:" in next div
    height_found = False
    reach_found = False
    
    # Find all strong tags that contain "Height:"
    height_strongs = soup.find_all('strong', string=re.compile(r'Height:', re.IGNORECASE))
    for strong in height_strongs:
        # Look for span with height pattern in the same parent div
        parent_div = strong.find_parent('div')
        if parent_div:
            height_span = parent_div.find('span', string=re.compile(r"\d+&#39;\d+&quot;|\d+'\d+\""))
            if height_span:
                height_text = height_span.get_text().strip()
                # Handle HTML entities
                height_text = height_text.replace('&#39;', "'").replace('&quot;', '"')
                height_match = re.search(r"(\d+)'(\d+)", height_text)
                if height_match:
                    feet = height_match.group(1)
                    inches = height_match.group(2)
                    data['height'] = f"{feet}'{inches}\""
                    height_found = True
                    if debug:
                        print(f"    [OK] Found height: {data['height']} (from: '{height_text}')")
                    break
    
    # Find reach - look for strong with "Reach:" then find the next div with span containing reach
    reach_strongs = soup.find_all('strong', string=re.compile(r'Reach:', re.IGNORECASE))
    for strong in reach_strongs:
        # Get the parent div, then look for the next div sibling
        parent_div = strong.find_parent('div')
        if parent_div:
            next_div = parent_div.find_next_sibling('div')
            if next_div:
                reach_span = next_div.find('span', string=re.compile(r"\d+\.?\d*&quot;|\d+\.?\d*\""))
                if reach_span:
                    reach_text = reach_span.get_text().strip()
                    # Handle HTML entities
                    reach_text = reach_text.replace('&quot;', '"')
                    reach_match = re.search(r"(\d+\.?\d*)", reach_text)
                    if reach_match:
                        inches_value = reach_match.group(1)
                        # Convert to integer if it's a whole number (remove .0)
                        try:
                            if float(inches_value) == int(float(inches_value)):
                                inches_value = str(int(float(inches_value)))
                        except ValueError:
                            pass  # Keep original value if conversion fails
                        data['reach'] = f"{inches_value}\""
                        reach_found = True
                        if debug:
                            print(f"    [OK] Found reach: {data['reach']} (from: '{reach_text}')")
                        break
    
    # Fallback to regex approach if BeautifulSoup didn't work
    if not height_found:
        height_match = re.search(r'Height:\s*([^)]+\([^)]+\))', page_text)
        if height_match:
            height_full = height_match.group(1).strip()
            feet_inches_match = re.search(r"(\d+)'(\d+)", height_full)
            if feet_inches_match:
                feet = feet_inches_match.group(1)
                inches = feet_inches_match.group(2)
                data['height'] = f"{feet}'{inches}\""
                if debug:
                    print(f"    [OK] Found height (regex): {data['height']}")
        elif not height_found and debug:
            print(f"    [X] Height not found")
    
    if not reach_found:
        reach_match = re.search(r'Reach:\s*([^)]+\([^)]+\))', page_text)
        if reach_match:
            reach_full = reach_match.group(1).strip()
            inches_match = re.search(r'(\d+\.?\d*)', reach_full)
            if inches_match:
                inches_value = inches_match.group(1)
                try:
                    if float(inches_value) == int(float(inches_value)):
                        inches_value = str(int(float(inches_value)))
                except ValueError:
                    pass
                data['reach'] = f"{inches_value}\""
                if debug:
                    print(f"    [OK] Found reach (regex): {data['reach']}")
        elif not reach_found and debug:
            print(f"    [X] Reach not found")
    
    # Overall record extraction - Fixed to use actual Tapology structure
    if debug:
        print(f"  [FIGHT] Extracting overall record...")
    
    wins = losses = draws = "0"
    
    # Method 1: Look for the record pattern like "24-5-0" in the page
    record_match = re.search(r'(\d{1,2})-(\d{1,2})-(\d{1,2})', page_text)
    if record_match:
        wins = record_match.group(1)
        losses = record_match.group(2) 
        draws = record_match.group(3)
        if debug:
            print(f"    [OK] Found record pattern: {wins}-{losses}-{draws}")
    else:
        if debug:
            print(f"    [X] No record pattern found, trying alternative methods...")
        
        # Method 2: Look for elements near "Pro MMA Record" text
        record_sections = soup.find_all(string=re.compile(r'Pro MMA.*Record', re.IGNORECASE))
        for section in record_sections:
            parent = section.find_parent()
            if parent:
                # Look for record numbers in nearby elements
                nearby_text = parent.get_text()
                nearby_match = re.search(r'(\d{1,2})-(\d{1,2})-(\d{1,2})', nearby_text)
                if nearby_match:
                    wins = nearby_match.group(1)
                    losses = nearby_match.group(2)
                    draws = nearby_match.group(3)
                    if debug:
                        print(f"    [OK] Found record near 'Pro MMA Record': {wins}-{losses}-{draws}")
                    break
        
        # Method 3: Look for large numbers that could be the record
        if wins == "0" and losses == "0":
            large_numbers = soup.find_all(string=re.compile(r'^\s*\d{2}\s*$'))
            if len(large_numbers) >= 2:
                # Take first two large numbers as wins/losses
                wins = large_numbers[0].strip()
                losses = large_numbers[1].strip() if len(large_numbers) > 1 else "0"
                if debug:
                    print(f"    [RETRY] Using large numbers as fallback: {wins}-{losses}-{draws}")
    
    data.update({
        'wins_total': wins,
        'losses_total': losses,
        'draws_total': draws
    })
    
    if debug:
        print(f"    [OK] Final record: {wins}-{losses}-{draws}")
    
    # UFC-specific record extraction from promotion sections
    if debug:
        print(f"  [STATS] Extracting UFC record and method breakdown...")
    
    ufc_wins_total = ufc_losses_total = ufc_draws_total = "0"
    ufc_wins_ko = ufc_wins_sub = ufc_wins_dec = "0"
    ufc_losses_ko = ufc_losses_sub = ufc_losses_dec = "0"
    
    # Look for UFC promotion section
    ufc_sections = soup.find_all('img', alt=re.compile(r'UFC', re.IGNORECASE))
    
    for ufc_img in ufc_sections:
        # Find the parent container that has the UFC record
        ufc_container = ufc_img.find_parent()
        while ufc_container and not ufc_container.select('.mainRecord'):
            ufc_container = ufc_container.find_parent()
        
        if ufc_container:
            if debug:
                print(f"    Found UFC section container")
            
            # Extract main UFC record (wins/losses/draws)
            main_record = ufc_container.select_one('.mainRecord')
            if main_record:
                wins_elem = main_record.select_one('.wins .mainValue')
                losses_elem = main_record.select_one('.losses .mainValue')
                draws_elem = main_record.select_one('.draws .mainValue')
                
                if wins_elem:
                    ufc_wins_total = wins_elem.get_text().strip()
                if losses_elem:
                    ufc_losses_total = losses_elem.get_text().strip()
                if draws_elem:
                    ufc_draws_total = draws_elem.get_text().strip()
                
                if debug:
                    print(f"    [OK] UFC Record: {ufc_wins_total}-{ufc_losses_total}-{ufc_draws_total}")
            
            # Extract method breakdown
            method_record = ufc_container.select_one('.methodRecord')
            if method_record:
                if debug:
                    print(f"    Found method breakdown section")
                
                # Wins breakdown - Fixed to properly extract numbers
                wins_section = method_record.select_one('.methodRecordWins')
                if wins_section:
                    # Get all div elements that contain numbers
                    win_divs = wins_section.find_all('div', class_='div')
                    win_numbers = []
                    
                    for div in win_divs:
                        text = div.get_text().strip()
                        # Only collect actual numbers, skip dashes and empty strings
                        if text and text.isdigit():
                            win_numbers.append(text)
                    
                    # Should get 3 numbers: KO, SUB, DEC in order
                    if len(win_numbers) >= 3:
                        ufc_wins_ko = win_numbers[0]
                        ufc_wins_sub = win_numbers[1]
                        ufc_wins_dec = win_numbers[2]
                    elif len(win_numbers) == 2:
                        # Sometimes SUB might be missing, so we have KO and DEC
                        ufc_wins_ko = win_numbers[0]
                        ufc_wins_sub = "0"
                        ufc_wins_dec = win_numbers[1]
                    elif len(win_numbers) == 1:
                        ufc_wins_ko = win_numbers[0]
                
                # Losses breakdown  
                losses_section = method_record.select_one('.methodRecordLosses')
                if losses_section:
                    loss_values = losses_section.select('div.div')
                    # Filter out separator dashes and extract actual numbers
                    actual_loss_numbers = [val.get_text().strip() for val in loss_values if val.get_text().strip() != "-"]
                    
                    if len(actual_loss_numbers) >= 3:  # KO, SUB, DEC
                        ufc_losses_ko = actual_loss_numbers[0] if actual_loss_numbers[0] != "-" else "0"
                        ufc_losses_sub = actual_loss_numbers[1] if len(actual_loss_numbers) > 1 and actual_loss_numbers[1] != "-" else "0"
                        ufc_losses_dec = actual_loss_numbers[2] if len(actual_loss_numbers) > 2 and actual_loss_numbers[2] != "-" else "0"
                
                if debug:
                    print(f"    [OK] UFC Wins: KO={ufc_wins_ko}, SUB={ufc_wins_sub}, DEC={ufc_wins_dec}")
                    print(f"    [OK] UFC Losses: KO={ufc_losses_ko}, SUB={ufc_losses_sub}, DEC={ufc_losses_dec}")
            
            break  # Found UFC section, stop looking
    
    # If no UFC section found, use overall record as fallback
    if ufc_wins_total == "0" and ufc_losses_total == "0":
        ufc_wins_total = wins
        ufc_losses_total = losses
        ufc_draws_total = draws
        if debug:
            print(f"    [RETRY] No UFC section found, using overall record as fallback")
    
    data.update({
        'ufc_wins_total': ufc_wins_total,
        'ufc_losses_total': ufc_losses_total,
        'ufc_draws_total': ufc_draws_total,
        'ufc_wins_ko': ufc_wins_ko,
        'ufc_wins_sub': ufc_wins_sub,
        'ufc_wins_dec': ufc_wins_dec,
        'ufc_losses_ko': ufc_losses_ko,
        'ufc_losses_sub': ufc_losses_sub,
        'ufc_losses_dec': ufc_losses_dec
    })
    
    # Fight history (enhanced with betting odds and detailed info)
    if debug:
        print(f"  [FIGHT] Extracting fight history...")
    
    fight_history = []
    fighter_id = None
    
    # Get fighter ID from soup or other source if available
    # This will be set properly when called from process_fighter
    # Look for multiple possible fight div patterns
    fight_divs = []
    
    # Method 1: divs with data-bout-id (primary method - original working method)
    bout_id_divs = soup.find_all('div', attrs={'data-bout-id': True})
    fight_divs.extend(bout_id_divs)
    
    # Method 2: divs with class containing 'mb-2.5' and 'bg-tap_f2' (alternative pattern)
    try:
        alt_fight_divs = soup.find_all('div', class_=re.compile(r'.*mb-2\.5.*bg-tap_f2.*'))
        fight_divs.extend(alt_fight_divs)
    except Exception:
        pass  # Skip if regex fails
    
    # Method 3: divs containing fighter profile links (backup method)
    try:
        all_divs = soup.find_all('div')
        for div in all_divs:
            fighter_link = div.find('a', href=re.compile(r'/fightcenter/fighters/'))
            if fighter_link:
                fight_divs.append(div)
    except Exception:
        pass  # Skip if this method fails
    
    # Remove duplicates while preserving order (more efficient)
    fight_divs = list(dict.fromkeys(fight_divs))  # Preserves order, removes duplicates
    
    if debug:
        print(f"    Found {len(fight_divs)} total fight divs (after deduplication)")
    
    # Process all fights and separate UFC vs non-UFC
    all_fights = []
    ufc_fights = []
    non_ufc_fights = []
    
    for fight_div in fight_divs:
        try:
            fight_data = {}
            
            # Extract basic result (W/L/D)
            result_elem = fight_div.select_one('.result .div')
            if result_elem:
                result_text = result_elem.get_text().strip()
                if result_text == 'W':
                    fight_data['result'] = 'win'
                elif result_text == 'L':
                    fight_data['result'] = 'loss'
                elif result_text == 'D':
                    fight_data['result'] = 'draw'
                else:
                    fight_data['result'] = 'unknown'
            
            # Extract method (TKO, SUB, DEC, etc.)
            method_elem = fight_div.select_one('.result .div .div')
            if method_elem:
                method_text = method_elem.get_text().strip()
                fight_data['method'] = method_text
            
            # Extract opponent name
            opponent_link = fight_div.select_one('a[title*="Fighter Page"]')
            if opponent_link:
                fight_data['opponent'] = opponent_link.get_text().strip()
            
            # Extract fight details (round, time)
            detail_text = fight_div.get_text()
            
            # Round and time - look for patterns like "R2" and "0:30"
            round_match = re.search(r'R(\d+)', detail_text)
            if round_match:
                fight_data['round'] = round_match.group(1)
            
            time_match = re.search(r'(\d+:\d+)', detail_text)
            if time_match:
                fight_data['time'] = time_match.group(1)
            
            # Extract method details (like "Overhand Right & Ground Punches")
            method_detail_elem = fight_div.select_one('a[title="Bout Page"]')
            if method_detail_elem:
                method_detail = method_detail_elem.get_text().strip()
                # Clean up the method detail (remove round/time info)
                method_detail = re.sub(r'·.*$', '', method_detail).strip()
                if method_detail:
                    fight_data['method_detail'] = method_detail
            
            # Extract event name
            event_link = fight_div.select_one('a[title="Event Page"]')
            if event_link:
                fight_data['event'] = event_link.get_text().strip()
            
            # Extract date with improved validation
            fight_date = None
            
            # Method 1: Look for proper date elements
            date_elem = fight_div.select_one('.div span.text-tap_3')
            if date_elem:
                year_text = date_elem.get_text().strip()
                
                # Validate year is actually a year (not subscription text)
                if year_text.isdigit() and len(year_text) == 4:
                    year = int(year_text)
                    if 1990 <= year <= 2030:  # Reasonable year range for MMA
                        # Look for month/day in nearby element
                        date_detail = fight_div.select_one('.div span.text-neutral-600')
                        if date_detail:
                            month_day = date_detail.get_text().strip()
                            
                            # Validate month/day format
                            if re.match(r'^[A-Za-z]{3}\s+\d{1,2}$', month_day):
                                fight_date = f"{year}-{month_day}"
            
            # Method 2: Fallback - search for date patterns in the div text
            if not fight_date:
                div_text = fight_div.get_text()
                
                # Look for patterns like "2024 Dec 7", "2023 Jan 15"
                date_patterns = [
                    r'(20\d{2})\s+([A-Za-z]{3})\s+(\d{1,2})',  # "2024 Dec 7"
                    r'([A-Za-z]{3})\s+(\d{1,2}),?\s+(20\d{2})',  # "Dec 7, 2024" or "Dec 7 2024"
                ]
                
                for pattern in date_patterns:
                    match = re.search(pattern, div_text)
                    if match:
                        if pattern == date_patterns[0]:  # Year first
                            year, month, day = match.groups()
                            fight_date = f"{year}-{month} {day}"
                        else:  # Month first
                            month, day, year = match.groups()
                            fight_date = f"{year}-{month} {day}"
                        break
            
            # Method 3: Last resort - look for just year
            if not fight_date:
                year_matches = re.findall(r'20\d{2}', fight_div.get_text())
                if year_matches:
                    # Take the first reasonable year found
                    for year_str in year_matches:
                        year = int(year_str)
                        if 1990 <= year <= 2030:
                            fight_date = f"{year}-Jan 1"  # Placeholder date
                            break
            
            # Only set fight_date if we found a valid one
            if fight_date:
                # Final validation - make sure it doesn't contain subscription terms
                invalid_terms = ['basic', 'premium', 'advanced', 'professional bouts', 'amateur bouts']
                if not any(term in fight_date.lower() for term in invalid_terms):
                    fight_data['fight_date'] = fight_date
            
            # Extract promotion (UFC, etc.)
            promotion_img = fight_div.select_one('img[alt]')
            if promotion_img:
                fight_data['promotion'] = promotion_img.get('alt', 'Unknown')
            
            # Extract betting odds
            odds_text = detail_text
            odds_match = re.search(r'(-?\+?\d{3,4})\s*·\s*(.*?Favorite|.*?Underdog)', odds_text)
            if odds_match:
                fight_data['betting_odds'] = odds_match.group(1)
                fight_data['betting_status'] = odds_match.group(2)
            
            # Also look for pick percentage
            pick_match = re.search(r"Pick'em:\s*(\d+%)", odds_text)
            if pick_match:
                fight_data['pick_percentage'] = pick_match.group(1)
            
            # Extract weight class
            weight_match = re.search(r'(Heavyweight|Light Heavyweight|Middleweight|Welterweight|Lightweight|Featherweight|Bantamweight|Flyweight)', detail_text)
            if weight_match:
                fight_data['weight_class'] = weight_match.group(1)
            
            # Skip upcoming fights, rumors, or invalid results
            skip_keywords = ['upcoming', 'confirmed', 'rumor', 'cancelled', 'postponed', 'scheduled']
            invalid_date_keywords = ['basic', 'premium', 'advanced', 'professional bouts', 'amateur bouts', 'subscription']
            
            method_detail = fight_data.get('method_detail', '').lower()
            method = fight_data.get('method', '').lower()
            result = fight_data.get('result', 'unknown')
            fight_date = fight_data.get('fight_date', '')
            
            should_skip = (
                result == 'unknown' or
                any(keyword in method_detail for keyword in skip_keywords) or
                any(keyword in method for keyword in skip_keywords) or
                any(keyword in fight_date.lower() for keyword in invalid_date_keywords) or
                not fight_data.get('opponent')
            )
            
            if fight_data and not should_skip:
                # Add fighter_id to fight data
                if 'fighter_id' in data:
                    fight_data['fighter_id'] = data['fighter_id']
                
                # Check if it's a UFC fight
                promotion = fight_data.get('promotion', '').upper()
                if 'UFC' in promotion:
                    ufc_fights.append(fight_data)
                else:
                    non_ufc_fights.append(fight_data)
            
        except Exception as e:
            if debug:
                print(f"    [WARN] Error parsing fight: {str(e)}")
    
    # Deduplicate fights using multiple fields before combining
    def create_fight_key(fight):
        """Create unique key for fight deduplication"""
        return (
            fight.get('opponent', '').strip().lower(),
            fight.get('event', '').strip().lower(),
            fight.get('fight_date', '').strip(),
            fight.get('result', '').strip().lower(),
            fight.get('method', '').strip().lower(),
            fight.get('round', '').strip(),
            fight.get('time', '').strip()
        )
    
    # Deduplicate UFC fights
    ufc_seen = set()
    ufc_unique = []
    for fight in ufc_fights:
        key = create_fight_key(fight)
        if key not in ufc_seen:
            ufc_seen.add(key)
            ufc_unique.append(fight)
    
    # Deduplicate non-UFC fights
    non_ufc_seen = set()
    non_ufc_unique = []
    for fight in non_ufc_fights:
        key = create_fight_key(fight)
        if key not in non_ufc_seen and key not in ufc_seen:  # Also avoid duplicating UFC fights
            non_ufc_seen.add(key)
            non_ufc_unique.append(fight)
    
    # Combine fights with UFC priority, limit to 10 total
    remaining_slots = 10 - len(ufc_unique)
    if remaining_slots > 0:
        fight_history = ufc_unique + non_ufc_unique[:remaining_slots]
    else:
        fight_history = ufc_unique  # All UFC fights even if more than 10
    
    if debug:
        print(f"    Found {len(ufc_fights)} UFC fights ({len(ufc_unique)} unique), {len(non_ufc_fights)} non-UFC fights ({len(non_ufc_unique)} unique)")
        print(f"    Selected {len(fight_history)} total fights (UFC priority)")
        for fight_data in fight_history:
            opponent = fight_data.get('opponent', 'Unknown')
            method = fight_data.get('method', 'Unknown')
            promotion = fight_data.get('promotion', 'Unknown')
            result = fight_data.get('result', 'unknown')
            print(f"      {promotion}: {result} vs {opponent} by {method}")
    
    data['fight_history'] = fight_history
    
    if debug:
        print(f"    [OK] Extracted {len(fight_history)} fights with detailed data")
    
        
    return data

def apply_name_fixes(name: str) -> str:
    """Apply name fixes from both TAPOLOGY_FIXES and NAME_FIXES"""
    norm = name.upper()
    # Try TAPOLOGY_FIXES first, then NAME_FIXES as fallback
    fixed = TAPOLOGY_FIXES.get(norm)
    if fixed:
        return fixed
    return NAME_FIXES.get(norm, name)

def search_tapology(fighter_name, debug=False):
    """Search for fighter on Tapology with multiple fallback strategies"""
    # For TAPOLOGY_FIXES, we need to reverse lookup since format is TAPOLOGY_NAME : UFC_NAME
    # Find the Tapology name that maps to this UFC fighter name
    tapology_name_from_reverse_lookup = None
    ufc_name_upper = fighter_name.upper()
    for tapology_name, ufc_name in TAPOLOGY_FIXES.items():
        if ufc_name.upper() == ufc_name_upper:
            tapology_name_from_reverse_lookup = tapology_name
            break
    
    # Create list of name variations to try
    search_attempts = [
        fighter_name,  # Original name
        tapology_name_from_reverse_lookup,  # Tapology-specific fixes (reverse lookup)
        NAME_FIXES.get(fighter_name.upper(), fighter_name),  # General name fixes (accents, etc.)
    ]
    
    # Remove None values and duplicates while preserving order
    unique_attempts = []
    for name in search_attempts:
        if name and name not in unique_attempts:
            unique_attempts.append(name)
    
        
    if debug:
        print(f"[SEARCH] Will try {len(unique_attempts)} name variations for: {fighter_name}")
        for i, attempt in enumerate(unique_attempts, 1):
            if attempt != fighter_name:
                print(f"  Variation {i}: {attempt}")
    
    # Try each name variation
    for attempt_num, search_name in enumerate(unique_attempts, 1):
        if debug and len(unique_attempts) > 1:
            print(f"[SEARCH] Attempt {attempt_num}: Searching for '{search_name}'")
        
        normalized = normalize_name_for_search(search_name)
        query = normalized.replace(" ", "%20")
        url = f"https://www.tapology.com/search?term={query}&searchType=fighters"
        
        try:
            res = session_manager.get(url)
            if not res or res.status_code != 200:
                if debug:
                    print(f"  [X] Search failed with status: {res.status_code if res else 'No response'}")
                continue
                
            soup = BeautifulSoup(res.text, "html.parser")
            links = soup.select("a[href*='/fightcenter/fighters/']")
            
            if debug:
                print(f"  [LIST] Found {len(links)} fighter links")
            
            if not links:
                continue  # Try next variation
                
            if len(links) == 1:
                result_url = f"{BASE_URL}{links[0]['href']}"
                if debug:
                    print(f"  [OK] Single result found: {result_url}")
                return result_url
            
            # Find best match
            name_lower = normalized.lower()
            for i, link in enumerate(links):
                result_name = link.get_text().strip()
                if debug and i < 3:  # Show first 3 results
                    print(f"    {i+1}. {result_name}")
                
                if result_name and name_lower in result_name.lower():
                    result_url = f"{BASE_URL}{link['href']}"
                    if debug:
                        print(f"  [OK] Best match: {result_name} -> {result_url}")
                    return result_url
            
            # If we found results but no good match, keep trying variations
            # Only fall back to first result if this is our last attempt
            if attempt_num == len(unique_attempts) and links:
                result_url = f"{BASE_URL}{links[0]['href']}"
                if debug:
                    print(f"  [RETRY] Using first result as final fallback: {result_url}")
                return result_url
            
        except Exception as e:
            if debug:
                print(f"  [X] Search error: {e}")
            continue
    
    if debug:
        print(f"  [X] No results found after trying all name variations")
    return None

def scrape_fighter(url, original_fighter=None, debug=True):
    """Main scraper function"""
    if debug:
        print(f"\n[FIGHT] Scraping fighter profile: {url}")
    
    try:
        res = session_manager.get(url)
        if not res or res.status_code != 200:
            if debug:
                print(f"  [X] Failed to load profile page")
            return None

        soup = BeautifulSoup(res.text, "html.parser")
        
        # Extract fighter name
        name = None
        for selector in ["h1", "title"]:
            elem = soup.select_one(selector)
            if elem:
                cleaned_name = clean_fighter_name(elem.get_text().strip())
                if cleaned_name:
                    name = cleaned_name
                    if debug:
                        print(f"  [OK] Extracted name: '{name}' (from {selector})")
                    break
        
        if not name:
            name = url.split("/")[-1].replace("-", " ").title()
            if debug:
                print(f"  [RETRY] Fallback name from URL: '{name}'")

        # Extract all data
        fighter_id = original_fighter.get("id") if original_fighter else str(uuid4())
        fighter_data = extract_fighter_data(soup, debug, fighter_id)
        
        # Combine final data
        result = {
            "id": original_fighter.get("id") if original_fighter else str(uuid4()),
            "name": name,
            "profile_url_tapology": url,
            "scraped_at": datetime.now().isoformat(),
            **{k: v for k, v in fighter_data.items() if k != 'fighter_id'}
        }

        if debug:
            print(f"  [OK] Successfully scraped fighter data")
        
        return result

    except Exception as e:
        if debug:
            print(f"  [X] Error scraping fighter: {e}")
        return None

def save_test_results(results):
    """Save test results to JSON file"""
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    try:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"[SAVE] Test results saved to: {OUTPUT_FILE}")
        
    except Exception as e:
        print(f"[X] Error saving results: {e}")

def load_active_fighters():
    """Load active fighters from UFC roster"""
    try:
        with open(FIGHTERS_RAW_PATH, "r", encoding="utf-8") as f:
            roster = json.load(f)
        
        active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
        print(f"[STATS] Loaded {len(active_fighters)} active fighters from roster")
        return active_fighters
        
    except FileNotFoundError:
        print(f"[X] UFC fighters file not found: {FIGHTERS_RAW_PATH}")
        return []
    except json.JSONDecodeError as e:
        print(f"[X] Invalid JSON in fighters file: {e}")
        return []

def process_fighter(fighter_info):
    """Process a single fighter - designed for threading"""
    idx, total, fighter = fighter_info
    
    name = fighter.get("name")
    if not name:
        return None, {"name": "Unknown", "reason": "no name"}

    # Search for fighter
    profile_url = search_tapology(name, debug=False)
    
    if not profile_url:
        return None, {"name": name, "reason": "not found in search"}

    # Scrape fighter data (silent mode for production)
    fighter_data = scrape_fighter(profile_url, original_fighter=fighter, debug=False)
    
    if fighter_data:
        return fighter_data, None
    else:
        return None, {"name": name, "reason": "scrape failed"}
        
def save_progress(data, filepath=OUTPUT_FILE, use_lock=True):
    """Thread-safe save function"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    def _save():
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[X] Error saving data: {e}")
    
    if use_lock:
        with session_manager.lock:
            _save()
    else:
        _save()

def retry_failed_fighters():
    """Retry fighters from error file with enhanced name fixing"""
    print("[RETRY] RETRY FAILED FIGHTERS")
    print("=" * 60)
    
    error_file = "data/errors/tapology_failures.json"
    
    # Load error file
    try:
        with open(error_file, "r", encoding="utf-8") as f:
            failures = json.load(f)
        print(f"[STATS] Loaded {len(failures)} failed fighters from error file")
    except FileNotFoundError:
        print("[X] No error file found")
        return
    except json.JSONDecodeError as e:
        print(f"[X] Invalid JSON in error file: {e}")
        return
    
    if not failures:
        print("[OK] No failed fighters to retry")
        return
    
    # Load active fighters to get complete data
    active_fighters = load_active_fighters()
    if not active_fighters:
        print("[X] No active fighters to process")
        return
    
    # Build lookup by name (case-insensitive)
    fighter_lookup = {f.get("name", "").strip().lower(): f for f in active_fighters}
    
    # Find fighters to retry
    fighters_to_retry = []
    for failure in failures:
        name = failure.get("name", "").strip().lower()
        if name in fighter_lookup:
            fighters_to_retry.append(fighter_lookup[name])
        else:
            print(f"[WARN] Fighter '{failure.get('name')}' not found in active roster")
    
    if not fighters_to_retry:
        print("[X] No matching fighters found for retry")
        return
    
    print(f"[START] Retrying {len(fighters_to_retry)} fighters with enhanced name fixing...")
    
    # Process fighters
    results = []
    new_failures = []
    successful_fighter_names = set()  # Track successful names for error file cleanup
    
    for idx, fighter in enumerate(fighters_to_retry, 1):
        try:
            fighter_info = (idx, len(fighters_to_retry), fighter)
            fighter_data, failure = process_fighter(fighter_info)
            
            if fighter_data:
                results.append(fighter_data)
                successful_fighter_names.add(fighter.get("name", "").strip().lower())
                print(f"[OK] Retry successful: {fighter.get('name')}")
            
            if failure:
                new_failures.append(failure)
                print(f"[X] Retry failed: {fighter.get('name')} - {failure.get('reason')}")
            
            # Update progress
            print_progress_bar(idx, len(fighters_to_retry), "Retrying")
            
            # Delay between requests
            time.sleep(random.uniform(2, 4))
            
        except Exception as e:
            fighter_name = fighter.get('name', 'Unknown')
            new_failures.append({"name": fighter_name, "reason": f"exception: {str(e)[:50]}"})
            print_progress_bar(idx, len(fighters_to_retry), "Retrying")
    
    print()  # New line after progress bar
    
    # Merge with existing results if they exist
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            existing_results = json.load(f)
    except FileNotFoundError:
        existing_results = []
    
    # Remove duplicates and add new results
    existing_names = {r.get("name", "").strip().lower() for r in existing_results}
    unique_new_results = [r for r in results if r.get("name", "").strip().lower() not in existing_names]
    
    existing_results.extend(unique_new_results)
    save_progress(existing_results, use_lock=False)
    
    # Update error file - remove successful fighters from original failures
    remaining_failures = []
    for failure in failures:
        failure_name = failure.get("name", "").strip().lower()
        if failure_name not in successful_fighter_names:
            remaining_failures.append(failure)
    
    # Add new failures, avoiding duplicates
    existing_failure_names = {f.get("name", "").strip().lower() for f in remaining_failures}
    for new_failure in new_failures:
        new_failure_name = new_failure.get("name", "").strip().lower()
        if new_failure_name not in existing_failure_names:
            remaining_failures.append(new_failure)
            existing_failure_names.add(new_failure_name)
    
    # Save updated error file or remove if empty
    if remaining_failures:
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump(remaining_failures, f, indent=2, ensure_ascii=False)
        print(f"[PAGE] Updated error file with {len(remaining_failures)} remaining failures")
    else:
        # Remove error file if no failures
        if os.path.exists(error_file):
            os.remove(error_file)
        print("[SUCCESS] All retry attempts successful! Error file removed.")
    
    # Summary
    retry_success_count = len(results)
    retry_failure_count = len(new_failures)
    resolved_count = len(successful_fighter_names)
    
    print(f"\n[STATS] RETRY SUMMARY")
    print(f"Attempted: {len(fighters_to_retry)}")
    print(f"Newly successful: {retry_success_count}")
    print(f"Still failed: {retry_failure_count}")
    print(f"Resolved from error file: {resolved_count}")
    print(f"Success rate: {(retry_success_count/len(fighters_to_retry)*100):.1f}%")
    print(f"[FILE] Results merged into: {OUTPUT_FILE}")

def main():
    """Main production scraper"""
    print("[FIGHT] TAPOLOGY PRODUCTION SCRAPER")
    print("=" * 60)
    
    # Load active fighters
    active_fighters = load_active_fighters()
    if not active_fighters:
        print("[X] No active fighters to process")
        return
    
    # Prepare processing list
    fighters_to_process = [
        (idx, len(active_fighters), fighter)
        for idx, fighter in enumerate(active_fighters, start=1)
    ]
    
    results = []
    failures = []
    
    # Ask user for processing mode
    print(f"\nProcessing {len(active_fighters)} active fighters:")
    print("[1] Sequential (slower, more reliable)")
    print("[2] Concurrent (faster, 4 workers)")
    
    mode = input("Choose mode (1 or 2): ").strip()
    
    if mode == "2":
        # Concurrent processing
        max_workers = 4
        print(f"[START] Starting concurrent processing with {max_workers} workers...")
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_fighter = {
                executor.submit(process_fighter, fighter_info): fighter_info
                for fighter_info in fighters_to_process
            }
            
            # Process completed tasks
            for future in as_completed(future_to_fighter):
                try:
                    fighter_data, failure = future.result(timeout=60)
                    
                    if fighter_data:
                        results.append(fighter_data)
                        # Save progress every 25 successful scrapes
                        if len(results) % 25 == 0:
                            save_progress(results)
                    
                    if failure:
                        failures.append(failure)
                    
                    # Update progress bar
                    completed = len(results) + len(failures)
                    print_progress_bar(completed, len(active_fighters), "Processing")
                        
                except Exception as e:
                    fighter_info = future_to_fighter[future]
                    fighter_name = fighter_info[2].get('name', 'Unknown')
                    failures.append({"name": fighter_name, "reason": f"exception: {str(e)[:50]}"})
                    
                    # Update progress bar
                    completed = len(results) + len(failures)
                    print_progress_bar(completed, len(active_fighters), "Processing")
    
    else:
        # Sequential processing
        print("[SLOW] Starting sequential processing...")
        
        for idx, fighter_info in enumerate(fighters_to_process, 1):
            try:
                fighter_data, failure = process_fighter(fighter_info)
                
                if fighter_data:
                    results.append(fighter_data)
                    # Save progress every 5 fighters in sequential mode
                    if len(results) % 5 == 0:
                        save_progress(results)
                
                if failure:
                    failures.append(failure)
                
                # Update progress bar
                print_progress_bar(idx, len(fighters_to_process), "Processing")
                
                # Longer delay in sequential mode
                time.sleep(random.uniform(2, 4))
                
            except Exception as e:
                fighter_name = fighter_info[2].get('name', 'Unknown')
                failures.append({"name": fighter_name, "reason": f"exception: {str(e)[:50]}"})
                
                # Update progress bar
                print_progress_bar(idx, len(fighters_to_process), "Processing")
    
    # Final save
    save_progress(results)
    
    # Save failures
    if failures:
        failures_file = "data/errors/tapology_failures.json"
        os.makedirs(os.path.dirname(failures_file), exist_ok=True)
        with open(failures_file, "w", encoding="utf-8") as f:
            json.dump(failures, f, indent=2, ensure_ascii=False)
        print(f"[WARN] Saved {len(failures)} failures to {failures_file}")
    
    # Summary
    success_count = len(results)
    failure_count = len(failures)
    total_fighters = len(active_fighters)
    success_rate = (success_count / total_fighters) * 100 if total_fighters > 0 else 0
    
    print(f"\n" + "=" * 60)
    print(f"[STATS] SCRAPING SUMMARY")
    print(f"=" * 60)
    print(f"Total fighters: {total_fighters}")
    print(f"Successfully scraped: {success_count}")
    print(f"Failed: {failure_count}")
    print(f"Success rate: {success_rate:.1f}%")
    print(f"[FILE] Results saved to: {OUTPUT_FILE}")
    
    if success_count > 0:
        print(f"[OK] Production scraping completed!")
    else:
        print(f"[X] No fighters were successfully scraped")
    
    print("=" * 60)

def test_specific_fighters():
    """Test scraper on specific fighters"""
    print("[TEST] TAPOLOGY TEST & DEBUG SCRAPER")
    print("=" * 50)
    
    # Get test fighters from user
    test_fighters = []
    print("Enter fighter names to test (one per line, empty line to finish):")
    
    while len(test_fighters) < 10:  # Max 10 for testing
        name = input(f"Fighter {len(test_fighters) + 1}: ").strip()
        if not name:
            break
        test_fighters.append(name)
    
    if not test_fighters:
        # Default test fighters if none provided
        test_fighters = [
            "Israel Adesanya",
            "Jon Jones",
            "Conor McGregor"
        ]
        print(f"No fighters entered. Using defaults: {', '.join(test_fighters)}")
    
    print(f"\n[TARGET] Testing {len(test_fighters)} fighters...")
    
    results = []
    
    for i, fighter_name in enumerate(test_fighters, 1):
        print(f"\n[{i}/{len(test_fighters)}] Testing: {fighter_name}")
        print("-" * 40)
        
        # Search for fighter
        profile_url = search_tapology(fighter_name, debug=True)
        
        if not profile_url:
            print(f"[X] Could not find {fighter_name} on Tapology")
            continue
        
        # Scrape fighter data
        fighter_data = scrape_fighter(profile_url, debug=True)
        
        if fighter_data:
            results.append(fighter_data)
            print(f"[OK] Successfully scraped {fighter_name}")
        else:
            print(f"[X] Failed to scrape data for {fighter_name}")
        
        # Delay between fighters
        if i < len(test_fighters):
            print(f"⏳ Waiting before next fighter...")
            time.sleep(random.uniform(3, 5))
    
    # Save results
    save_test_results(results)
    
    # Summary
    successful = len([r for r in results if r and r.get("name")])
    
    print(f"\n" + "=" * 50)
    print(f"[STATS] TEST SUMMARY")
    print(f"=" * 50)
    print(f"Total fighters tested: {len(test_fighters)}")
    print(f"Successfully scraped: {successful}")
    print(f"Failed: {len(test_fighters) - successful}")
    print(f"Success rate: {(successful / len(test_fighters) * 100):.1f}%")
    
    if successful > 0:
        print(f"\n[OK] Test completed! Check {OUTPUT_FILE} for detailed results.")
    else:
        print(f"\n[X] No fighters were successfully scraped. Check the debug output above.")

if __name__ == "__main__":
    print("[FIGHT] Tapology Scraper")
    print("[1] Production mode - scrape all active fighters")
    print("[2] Retry failed fighters from error file")
    print("[3] Test mode - test specific fighters")
    
    choice = input("Choose mode (1-3): ").strip()
    
    if choice == "1":
        main()
    elif choice == "2":
        retry_failed_fighters()
    elif choice == "3":
        test_specific_fighters()
    else:
        print("[X] Invalid choice")