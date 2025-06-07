import json
import requests
from bs4 import BeautifulSoup
import time
import uuid
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from functools import lru_cache
from uuid import UUID
import re
from typing import Dict, List, Optional
import logging


def download_image(url, save_path):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.ufc.com/"
        }
        res = requests.get(url, stream=True, headers=headers, timeout=10)
        if res.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(1024):
                    f.write(chunk)
            logger.info(f"✅ Downloaded image: {save_path}")
            return True
        else:
            logger.warning(f"❌ Image download failed: HTTP {res.status_code} for {url}")
    except Exception as e:
        logger.error(f"❌ Failed to download image: {e}")
    return False

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SessionManager:
    """Thread-safe session with connection pooling and rate limiting"""
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
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
        self.request_times = []
        self.min_delay = 0.5  # Minimum delay between requests
    
    def get(self, url, **kwargs):
        with self.lock:
            # Rate limiting
            now = time.time()
            self.request_times = [t for t in self.request_times if now - t < 60]  # Keep last minute
            
            if len(self.request_times) > 30:  # Max 30 requests per minute
                sleep_time = 60 - (now - self.request_times[0])
                if sleep_time > 0:
                    time.sleep(sleep_time)
            
            # Ensure minimum delay
            if self.request_times:
                last_request = self.request_times[-1]
                time_since_last = now - last_request
                if time_since_last < self.min_delay:
                    time.sleep(self.min_delay - time_since_last)
            
            self.request_times.append(time.time())
        
        return self.session.get(url, **kwargs)

# Global session manager
session_manager = SessionManager()


def extract_stats_by_structure(soup):
    """Extract stats based on the specific UFC page structure shown in screenshots"""
    stats = {}
    
    # Find all stat comparison groups
    stat_groups = soup.select(".c-stat-compare__group")
    
    for group in stat_groups:
        # Get the number and label from this group
        number_el = group.select_one(".c-stat-compare__number")
        label_el = group.select_one(".c-stat-compare__label")
        
        if not number_el or not label_el:
            continue
            
        number = number_el.get_text(strip=True)
        label = label_el.get_text(strip=True).lower()
        
        # Map based on label content
        if "sig. str. landed" in label:
            stats["sig_strikes_landed_per_min"] = number
        elif "sig. str. absorbed" in label:
            stats["sig_strikes_absorbed_per_min"] = number
        elif "takedown avg" in label:
            stats["takedown_avg_per_15min"] = number
        elif "submission avg" in label:
            stats["submission_avg_per_15min"] = number
        elif "sig. str. defense" in label:
            stats["sig_str_defense"] = number
        elif "takedown defense" in label:
            stats["takedown_defense"] = number
        elif "knockdown avg" in label:
            stats["knockdown_avg"] = number
        elif "average fight time" in label:
            stats["average_fight_time"] = number
    
    return stats


def extract_accuracy_and_defense_stats_combined(soup, page_text):
    """Extract striking/takedown accuracy and defense as combined strings"""
    combined_stats = {}
    
    try:
        # Extract from overlap stats sections (most reliable for UFC pages)
        overlap_stats = soup.select(".c-overlap__stats")
        
        # Dictionary to store found values temporarily
        temp_values = {}
        
        for stat_section in overlap_stats:
            try:
                # Get the title and value
                title_el = stat_section.select_one(".c-overlap__stats-title")
                value_el = stat_section.select_one(".c-overlap__stats-value")
                text_el = stat_section.select_one(".c-overlap__stats-text")
                
                if not title_el or not value_el:
                    continue
                    
                title = title_el.get_text(strip=True).lower()
                value = value_el.get_text(strip=True)
                text = text_el.get_text(strip=True).lower() if text_el else ""
                
                # Striking accuracy (Sig. Strikes Landed)
                if "sig. strikes landed" in title:
                    if value.isdigit() and "attempted" in text:
                        attempted_match = re.search(r"(\d+)", text)
                        if attempted_match:
                            attempted = attempted_match.group(1)
                            try:
                                percent = round((int(value) / int(attempted)) * 100)
                                combined_stats["striking_accuracy"] = f"{value}/{attempted} ({percent}%)"
                            except (ValueError, ZeroDivisionError):
                                combined_stats["striking_accuracy"] = f"{value}/{attempted}"
                
                # Striking defense (Sig. Strikes Attempted - needs to be calculated)
                elif "sig. strikes attempted" in title:
                    temp_values["sig_strikes_attempted"] = value
                    
                # Takedown accuracy (Takedowns Landed)
                elif "takedowns landed" in title:
                    if value.isdigit() and "attempted" in text:
                        attempted_match = re.search(r"(\d+)", text)
                        if attempted_match:
                            attempted = attempted_match.group(1)
                            try:
                                percent = round((int(value) / int(attempted)) * 100)
                                combined_stats["takedown_accuracy"] = f"{value}/{attempted} ({percent}%)"
                            except (ValueError, ZeroDivisionError):
                                combined_stats["takedown_accuracy"] = f"{value}/{attempted}"
                
                # Takedown defense (Takedowns Attempted - needs to be calculated)
                elif "takedowns attempted" in title:
                    temp_values["takedowns_attempted"] = value
                    
            except Exception as e:
                logger.warning(f"Error processing overlap stat section: {e}")
                continue
        
        # Calculate defense stats if we have the necessary data
        try:
            # For striking defense: (attempted - landed) / attempted
            if "sig_strikes_attempted" in temp_values and combined_stats.get("striking_accuracy"):
                striking_accuracy = combined_stats["striking_accuracy"]
                landed_match = re.search(r"(\d+)/(\d+)", striking_accuracy)
                if landed_match:
                    landed = int(landed_match.group(1))
                    attempted = int(temp_values["sig_strikes_attempted"])
                    if attempted > 0:
                        defended = attempted - landed
                        defense_percent = round((defended / attempted) * 100)
                        combined_stats["sig_str_defense"] = f"{defended}/{attempted} ({defense_percent}%)"
        except Exception as e:
            logger.warning(f"Error calculating striking defense: {e}")
        
        try:
            # For takedown defense: (attempted - landed) / attempted  
            if "takedowns_attempted" in temp_values and combined_stats.get("takedown_accuracy"):
                takedown_accuracy = combined_stats["takedown_accuracy"]
                landed_match = re.search(r"(\d+)/(\d+)", takedown_accuracy)
                if landed_match:
                    landed = int(landed_match.group(1))
                    attempted = int(temp_values["takedowns_attempted"])
                    if attempted > 0:
                        defended = attempted - landed
                        defense_percent = round((defended / attempted) * 100)
                        combined_stats["takedown_defense"] = f"{defended}/{attempted} ({defense_percent}%)"
        except Exception as e:
            logger.warning(f"Error calculating takedown defense: {e}")
        
        # Fallback: Look for pre-formatted accuracy/defense sections
        if not combined_stats.get("striking_accuracy"):
            try:
                striking_sections = soup.find_all(string=re.compile(r"STRIKING.*ACCURACY", re.IGNORECASE))
                for section in striking_sections:
                    parent = section.find_parent()
                    if parent:
                        section_text = parent.get_text()
                        
                        # Look for pattern like "1734/3460 (50%)" or separate values
                        combined_match = re.search(r"(\d+)/(\d+)\s*\((\d+%)\)", section_text)
                        if combined_match:
                            landed, attempted, percent = combined_match.groups()
                            combined_stats["striking_accuracy"] = f"{landed}/{attempted} ({percent})"
                            break
            except Exception as e:
                logger.warning(f"Error in striking accuracy fallback: {e}")
        
        if not combined_stats.get("takedown_accuracy"):
            try:
                takedown_sections = soup.find_all(string=re.compile(r"TAKEDOWN.*ACCURACY", re.IGNORECASE))
                for section in takedown_sections:
                    parent = section.find_parent()
                    if parent:
                        section_text = parent.get_text()
                        
                        # Look for pattern like "33/73 (55%)" or separate values
                        combined_match = re.search(r"(\d+)/(\d+)\s*\((\d+%)\)", section_text)
                        if combined_match:
                            landed, attempted, percent = combined_match.groups()
                            combined_stats["takedown_accuracy"] = f"{landed}/{attempted} ({percent})"
                            break
            except Exception as e:
                logger.warning(f"Error in takedown accuracy fallback: {e}")
    
    except Exception as e:
        logger.error(f"Error in extract_accuracy_and_defense_stats_combined: {e}")
        
    return combined_stats


def extract_stat_by_label(soup, label_text, page_text=None):
    """Extract stat value by finding its label first - PRESERVED from original"""
    # Method 1: Find label and get next value element
    label_elements = soup.find_all(string=re.compile(re.escape(label_text), re.IGNORECASE))
    for label_elem in label_elements:
        parent = label_elem.find_parent()
        if parent:
            # Look for value in next sibling or within same container
            value_elem = (parent.find_next_sibling() or 
                         parent.find_next("div", class_=re.compile("number|value")) or
                         parent.select_one(".c-stat-compare__number, .c-stat-3bar__value"))
            if value_elem:
                value = value_elem.get_text(strip=True)
                if value and value != label_text:
                    return value
    
    # Method 2: Page-wide regex search if label method fails
    if page_text:
        pattern = rf"{re.escape(label_text)}[^\d]*(\d+(?:\.\d+)?(?:%|:\d+)?)"
        match = re.search(pattern, page_text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None


def extract_position_stats(soup, page_text):
    """Extract significant strikes by position - PRESERVED from original"""
    position_stats = {}
    
    # Method 1: Look for position sections in HTML
    position_sections = soup.find_all(string=re.compile(r"SIG\.\s*STR\.\s*BY\s*POSITION", re.IGNORECASE))
    
    for section in position_sections:
        parent = section.find_parent()
        if parent:
            section_text = parent.get_text()
            
            # Extract standing, clinch, ground with numbers and percentages
            standing_match = re.search(r"STANDING[^\d]*(\d+)\s*[\(\[](\d+%)[\)\]]", section_text, re.IGNORECASE)
            clinch_match = re.search(r"CLINCH[^\d]*(\d+)\s*[\(\[](\d+%)[\)\]]", section_text, re.IGNORECASE)
            ground_match = re.search(r"GROUND[^\d]*(\d+)\s*[\(\[](\d+%)[\)\]]", section_text, re.IGNORECASE)
            
            if standing_match:
                position_stats["standing"] = f"{standing_match.group(1)} ({standing_match.group(2)})"
            if clinch_match:
                position_stats["clinch"] = f"{clinch_match.group(1)} ({clinch_match.group(2)})"
            if ground_match:
                position_stats["ground"] = f"{ground_match.group(1)} ({ground_match.group(2)})"
            
            if position_stats:
                break
    
    # Method 2: Page-wide search if section method fails
    if not position_stats and page_text:
        standing_match = re.search(r"STANDING[^\d]*(\d+)\s*[\(\[](\d+%)[\)\]]", page_text, re.IGNORECASE)
        clinch_match = re.search(r"CLINCH[^\d]*(\d+)\s*[\(\[](\d+%)[\)\]]", page_text, re.IGNORECASE)
        ground_match = re.search(r"GROUND[^\d]*(\d+)\s*[\(\[](\d+%)[\)\]]", page_text, re.IGNORECASE)
        
        if standing_match:
            position_stats["standing"] = f"{standing_match.group(1)} ({standing_match.group(2)})"
        if clinch_match:
            position_stats["clinch"] = f"{clinch_match.group(1)} ({clinch_match.group(2)})"
        if ground_match:
            position_stats["ground"] = f"{ground_match.group(1)} ({ground_match.group(2)})"
    
    return position_stats


def extract_target_stats(soup, page_text):
    """Extract significant strikes by target (head, body, leg) - PRESERVED from original"""
    target_stats = {}
    
    # Method 1: Extract from SVG body diagram (most accurate)
    svg_body_diagram = soup.select_one("svg.c-stat-body__svg")
    if svg_body_diagram:
        # Try to find text elements with specific IDs first
        head_value = svg_body_diagram.select_one("text[id*='head_value'], text[id*='head-value']")
        head_percent = svg_body_diagram.select_one("text[id*='head_percent'], text[id*='head-percent']")
        body_value = svg_body_diagram.select_one("text[id*='body_value'], text[id*='body-value']")
        body_percent = svg_body_diagram.select_one("text[id*='body_percent'], text[id*='body-percent']")
        leg_value = svg_body_diagram.select_one("text[id*='leg_value'], text[id*='leg-value']")
        leg_percent = svg_body_diagram.select_one("text[id*='leg_percent'], text[id*='leg-percent']")
        
        # Extract and combine values
        if head_value and head_percent:
            target_stats["head"] = f"{head_value.text.strip()} ({head_percent.text.strip()})"
        if body_value and body_percent:
            target_stats["body"] = f"{body_value.text.strip()} ({body_percent.text.strip()})"
        if leg_value and leg_percent:
            target_stats["leg"] = f"{leg_value.text.strip()} ({leg_percent.text.strip()})"
    
    # Method 2: Generic SVG text extraction if specific IDs don't work
    if not target_stats and svg_body_diagram:
        all_svg_texts = [elem.text.strip() for elem in svg_body_diagram.select("text") if elem.text.strip()]
        
        # Filter for numbers and percentages
        numbers = [t for t in all_svg_texts if t.isdigit()]
        percentages = [t for t in all_svg_texts if re.match(r'\d+%', t)]
        
        # Try to match common patterns (usually head, body, leg order)
        if len(numbers) >= 3 and len(percentages) >= 3:
            try:
                target_stats["head"] = f"{numbers[0]} ({percentages[0]})"
                target_stats["body"] = f"{numbers[1]} ({percentages[1]})"
                target_stats["leg"] = f"{numbers[2]} ({percentages[2]})"
            except IndexError:
                pass
    
    # Method 3: Page-wide regex search as fallback
    if not target_stats and page_text:
        head_match = re.search(r"HEAD[^\d]*(\d+)[^\d]*(\d+%)", page_text, re.IGNORECASE)
        body_match = re.search(r"BODY[^\d]*(\d+)[^\d]*(\d+%)", page_text, re.IGNORECASE)
        leg_match = re.search(r"LEG[^\d]*(\d+)[^\d]*(\d+%)", page_text, re.IGNORECASE)
        
        if head_match:
            target_stats["head"] = f"{head_match.group(1)} ({head_match.group(2)})"
        if body_match:
            target_stats["body"] = f"{body_match.group(1)} ({body_match.group(2)})"
        if leg_match:
            target_stats["leg"] = f"{leg_match.group(1)} ({leg_match.group(2)})"
    
    return target_stats


def _scrape_details(profile_url_ufc):
    """Enhanced scraper with improved stat extraction and comprehensive data collection"""
    try:
        res = session_manager.get(profile_url_ufc, timeout=15)
        if res.status_code != 200:
            logger.warning(f"Failed to load profile: {profile_url_ufc} (Status: {res.status_code})")
            return {}

        soup = BeautifulSoup(res.text, "html.parser")
        page_text = soup.get_text()
        data = {}

        # Extract gender from weight class or division info
        gender = "Male"  # Default
        weight_class_elements = soup.find_all(string=re.compile(r"women|Women", re.IGNORECASE))
        if weight_class_elements:
            gender = "Female"
        
        # Also check in bio labels for weight class
        bio_labels = soup.select("div.c-bio__label")
        for label_el in bio_labels:
            label = label_el.get_text(strip=True)
            if label.lower() == "weight class":
                value_el = label_el.find_next_sibling("div")
                if value_el and "women" in value_el.get_text(strip=True).lower():
                    gender = "Female"
                    break
        
        data["gender"] = gender

        # Image handling (preserved from original)
        fighter_slug = profile_url_ufc.rstrip('/').split('/')[-1]
        image_url = None
        image_el = (soup.select_one("img.hero-profile__image") or 
                   soup.select_one("img[class*='hero-profile']") or
                   soup.select_one("img[class*='athlete_bio_full_body']") or
                   soup.select_one(".hero-profile img"))
        
        if image_el and image_el.get("src"):
            src = image_el["src"].strip()
            if src.startswith("//"):
                image_url = "https:" + src
            elif src.startswith("/"):
                image_url = "https://www.ufc.com" + src
            else:
                image_url = src

            if "ufc.com" not in image_url.lower():
                logger.warning(f"⚠️ Non-UFC image URL for {fighter_slug}: {image_url}")
                image_url = None
        else:
            backup_selectors = [
                "img[src*='athlete_bio']",
                "img[src*='fighter']", 
                ".hero-profile img",
                ".c-hero img",
                "img[alt*='Fighter']"
            ]
            
            for selector in backup_selectors:
                backup_el = soup.select_one(selector)
                if backup_el and backup_el.get("src"):
                    src = backup_el["src"].strip()
                    if src.startswith("//"):
                        image_url = "https:" + src
                    elif src.startswith("/"):
                        image_url = "https://www.ufc.com" + src
                    else:
                        image_url = src
                    logger.info(f"🔍 Found backup image for {fighter_slug}: {selector}")
                    break
            
            if not image_url:
                logger.warning(f"⚠️ Could not find any image for {fighter_slug}")

        if image_url:
            image_dir = os.path.join("..", "ufc-tracker", "public", "images")
            os.makedirs(image_dir, exist_ok=True)
            image_path = os.path.join(image_dir, f"{fighter_slug}.jpg")

            if os.path.exists(image_path):
                logger.info(f"Image already exists for {fighter_slug}, skipping download.")
                data["image_local_path"] = f"/images/{fighter_slug}.jpg"
            else:
                logger.info(f"Downloading image for {fighter_slug}: {image_url}")
                success = download_image(image_url, image_path)
                if success:
                    data["image_local_path"] = f"/images/{fighter_slug}.jpg"
                else:
                    logger.warning(f"Failed to download image for {fighter_slug}")
            data["image_url"] = image_url
            data["image_verified"] = True
            logger.info(f"✅ Image verified for {fighter_slug}")
        else:
            data["image_url"] = "/static/images/placeholder.jpg"
            data["image_local_path"] = "/images/placeholder.jpg"
            logger.info(f"📷 Using placeholder for {fighter_slug}")
            data["image_verified"] = False

        # Bio extraction (preserved from original)
        bio_labels = soup.select("div.c-bio__label")
        bio_data = {}
        for label_el in bio_labels:
            label = label_el.get_text(strip=True)
            value_el = label_el.find_next_sibling("div")
            if value_el:
                value = value_el.get_text(strip=True)
                bio_data[label] = value

        # Enhanced bio extraction with new field names
        data.update({
            "height": bio_data.get("Height"),
            "weight": bio_data.get("Weight"), 
            "reach": bio_data.get("Reach"),
        })

        # ===== NEW IMPROVED STAT EXTRACTION =====
        
        # Primary method: extract using the specific structure
        structure_stats = extract_stats_by_structure(soup)
        data.update(structure_stats)
        
        # Fallback method: use the original extraction if primary fails
        if not structure_stats:
            logger.info(f"Using fallback stat extraction for {fighter_slug}")
            data["sig_strikes_landed_per_min"] = extract_stat_by_label(soup, "SIG. STR. LANDED", page_text) or extract_stat_by_label(soup, "SIG STR LANDED", page_text)
            data["sig_strikes_absorbed_per_min"] = extract_stat_by_label(soup, "SIG. STR. ABSORBED", page_text) or extract_stat_by_label(soup, "SIG STR ABSORBED", page_text)
            data["takedown_avg_per_15min"] = extract_stat_by_label(soup, "TAKEDOWN AVG", page_text)
            data["submission_avg_per_15min"] = extract_stat_by_label(soup, "SUBMISSION AVG", page_text)
            data["knockdown_avg"] = extract_stat_by_label(soup, "KNOCKDOWN AVG", page_text)
            data["average_fight_time"] = extract_stat_by_label(soup, "AVERAGE FIGHT TIME", page_text)
            
            # Only extract simple defense percentages if combined stats weren't found
            if not data.get("sig_str_defense"):
                data["sig_str_defense"] = extract_stat_by_label(soup, "SIG. STR. DEFENSE", page_text) or extract_stat_by_label(soup, "SIG STR DEFENSE", page_text)
            if not data.get("takedown_defense"):
                data["takedown_defense"] = extract_stat_by_label(soup, "TAKEDOWN DEFENSE", page_text)

        # Third fallback: try to extract from stat value containers directly
        if not any([data.get("sig_strikes_landed_per_min"), data.get("sig_strikes_absorbed_per_min")]):
            stat_values = soup.select(".c-stat-3bar__value, .c-stat-compare__number")
            if len(stat_values) >= 6:
                try:
                    data["sig_strikes_landed_per_min"] = stat_values[0].text.strip()
                    data["sig_strikes_absorbed_per_min"] = stat_values[1].text.strip()
                    data["takedown_avg_per_15min"] = stat_values[2].text.strip()
                    data["submission_avg_per_15min"] = stat_values[3].text.strip()
                    data["sig_str_defense"] = stat_values[4].text.strip() if len(stat_values) > 4 else None
                    data["knockdown_avg"] = stat_values[5].text.strip() if len(stat_values) > 5 else None
                    
                    # Average fight time often in different container
                    time_elements = soup.select("div.c-stat-compare__number")
                    for elem in time_elements:
                        text = elem.text.strip()
                        if ":" in text:  # Time format
                            data["average_fight_time"] = text
                            break
                except IndexError:
                    logger.warning(f"Could not extract stats from stat containers for {fighter_slug}")

        # ===== ACCURACY AND DEFENSE STATS (COMBINED FORMAT) =====
        accuracy_and_defense_stats = extract_accuracy_and_defense_stats_combined(soup, page_text)
        data.update(accuracy_and_defense_stats)

        # ===== POSITIONAL AND TARGET STATS (PRESERVED) =====
        
        # Strikes by position
        position_stats = extract_position_stats(soup, page_text)
        if position_stats:
            data["sig_strikes_by_position"] = position_stats

        # Strikes by target
        target_stats = extract_target_stats(soup, page_text)
        if target_stats:
            data["sig_strikes_by_target"] = target_stats

        # ===== ADDITIONAL BETTING-RELEVANT STATS (PRESERVED) =====
        
        # Fight record
        record_element = soup.select_one(".c-hero__headline-suffix")
        if record_element:
            data["fight_record"] = record_element.get_text(strip=True)

        # Extract win/loss method breakdown if available
        method_stats = {}
        
        # Look for method breakdown sections
        method_sections = soup.find_all(string=re.compile(r"METHOD", re.IGNORECASE))
        for section in method_sections:
            parent = section.find_parent()
            if parent:
                section_text = parent.get_text()
                
                # Extract various finish methods
                ko_match = re.search(r"KO[^\d]*(\d+)", section_text, re.IGNORECASE)
                sub_match = re.search(r"SUB[^\d]*(\d+)", section_text, re.IGNORECASE)
                dec_match = re.search(r"DEC[^\d]*(\d+)", section_text, re.IGNORECASE)
                
                if ko_match:
                    method_stats["ko_tko"] = ko_match.group(1)
                if sub_match:
                    method_stats["submission"] = sub_match.group(1)
                if dec_match:
                    method_stats["decision"] = dec_match.group(1)

        if method_stats:
            data["win_methods"] = method_stats

        # ===== ADDITIONAL STATS FOR BETTING MODELS (PRESERVED) =====
        
        # Control time (if available)
        control_time = extract_stat_by_label(soup, "CONTROL TIME", page_text)
        if control_time:
            data["control_time_avg"] = control_time

        # Reversal stats
        reversals = extract_stat_by_label(soup, "REVERSALS", page_text)
        if reversals:
            data["reversals_avg"] = reversals

        # Submission attempts
        sub_attempts = extract_stat_by_label(soup, "SUBMISSION ATTEMPTS", page_text)
        if sub_attempts:
            data["submission_attempts_avg"] = sub_attempts

        # NOTE: Removed distance_control and performance_by_round as requested

        return data
        
    except Exception as e:
        logger.error(f"Error scraping {profile_url_ufc}: {e}")
        return {}

@lru_cache(maxsize=1000)
def scrape_details(profile_url_ufc):
    """Public interface - uses caching"""
    return _scrape_details(profile_url_ufc)
    
def process_fighter(fighter_info):
    """Process a single fighter with enhanced error handling"""
    idx, total, fighter = fighter_info
    
    # Validate UUID
    try:
        UUID(fighter["id"])
    except (ValueError, KeyError):
        logger.error(f"Invalid UUID for {fighter.get('name', 'Unknown')}: {fighter.get('id', 'Missing')}")
        return None

    fighter_name = fighter.get('name', 'Unknown')
    logger.info(f"[{idx}/{total}] Processing {fighter_name} ({total - idx} remaining)")

    # Skip if image already verified AND file exists
    if (fighter.get("image_verified") is True and 
        fighter.get("image_local_path") and 
        os.path.exists(fighter.get("image_local_path", ""))):
        logger.info(f"🛑 Skipping {fighter_name} (image already verified and exists)")
        return fighter

    # Get profile URL - handle both possible keys
    profile_url_ufc = fighter.get("profile_url_ufc") or fighter.get("profile_url")
    if not profile_url_ufc:
        logger.warning(f"No profile URL for {fighter_name}")
        return None

    # Scrape detailed profile information
    details = scrape_details(profile_url_ufc)
    if not details:
        logger.warning(f"Failed to scrape profile details for {fighter_name}")
        return None

    # Create enriched fighter data
    enriched_fighter = fighter.copy()
    enriched_fighter.update(details)

    # Add scraping metadata
    enriched_fighter["last_updated"] = time.time()
    
    logger.info(f"✅ Successfully enriched: {fighter_name}")
    return enriched_fighter

def thread_safe_save(enriched, output_file):
    """Thread-safe save function with backup"""
    backup_file = f"{output_file}.backup"
    output_dir = os.path.dirname(output_file) or "."
    os.makedirs(output_dir, exist_ok=True)

    with session_manager.lock:
        try:
            # Create backup if existing file
            if os.path.exists(output_file):
                os.rename(output_file, backup_file)

            # ✅ This actually saves the file
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(enriched, f, indent=2, ensure_ascii=False)

            # Clean up backup
            if os.path.exists(backup_file):
                os.remove(backup_file)

            logger.info(f"✅ File saved at: {os.path.abspath(output_file)}")

        except Exception as e:
            logger.error(f"Error saving data: {e}")
            if os.path.exists(backup_file):
                os.rename(backup_file, output_file)
            raise

def enrich_roster(input_file="data/ufc_fighters_raw.json", output_file="data/ufc_details.json", max_workers=4):
    """Enhanced main function with better error handling and progress tracking"""
    
    # Load existing data
    try:
        with open(input_file, "r", encoding="utf-8") as f:
            roster = json.load(f)
    except FileNotFoundError:
        logger.error(f"Input file not found: {input_file}")
        return
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in input file: {input_file}")
        return

    # Filter active fighters
    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
    total = len(active_fighters)
    
    if not active_fighters:
        logger.warning("No active fighters found in input data")
        return
    
    logger.info(f"🚀 Processing {total} active fighters with {max_workers} concurrent workers...")
    
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_file) or "."
    os.makedirs(output_dir, exist_ok=True)

    # Prepare fighter processing list
    fighters_to_process = [
        (idx, total, fighter) 
        for idx, fighter in enumerate(active_fighters, start=1)
    ]
    
    enriched = []
    failed_fighters = []
    batch_save_interval = 10  # Save every 10 successful scrapes
    
    # Process fighters concurrently
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_fighter = {
            executor.submit(process_fighter, fighter_info): fighter_info 
            for fighter_info in fighters_to_process
        }
        
        for future in as_completed(future_to_fighter):
            try:
                enriched_fighter = future.result(timeout=30)
                
                if enriched_fighter:
                    enriched.append(enriched_fighter)
                    
                    # Batch save for progress preservation
                    if len(enriched) % batch_save_interval == 0:
                        thread_safe_save(enriched, output_file)
                        logger.info(f"💾 Batch saved {len(enriched)} records...")
                else:
                    fighter_info = future_to_fighter[future]
                    failed_fighters.append(fighter_info)
                    
            except Exception as e:
                fighter_info = future_to_fighter[future]
                fighter_name = fighter_info[2].get('name', 'Unknown')
                logger.error(f"Exception processing {fighter_name}: {e}")
                failed_fighters.append(fighter_info)

    # Handle retries for failed fighters
    max_retries = 2
    retry_count = 0
    
    while failed_fighters and retry_count < max_retries:
        retry_count += 1
        logger.info(f"🔄 Retry attempt {retry_count}/{max_retries} for {len(failed_fighters)} failed fighters...")
        
        current_failures = failed_fighters.copy()
        failed_fighters = []
        
        # Use fewer workers for retries
        retry_workers = min(2, len(current_failures))
        
        with ThreadPoolExecutor(max_workers=retry_workers) as executor:
            future_to_fighter = {
                executor.submit(process_fighter, fighter_info): fighter_info 
                for fighter_info in current_failures
            }
            
            for future in as_completed(future_to_fighter):
                try:
                    enriched_fighter = future.result(timeout=45)
                    
                    if enriched_fighter:
                        enriched.append(enriched_fighter)
                        logger.info(f"✅ Retry success: {enriched_fighter['name']}")
                    else:
                        fighter_info = future_to_fighter[future]
                        failed_fighters.append(fighter_info)
                        
                except Exception as e:
                    fighter_info = future_to_fighter[future]
                    fighter_name = fighter_info[2].get('name', 'Unknown')
                    logger.error(f"Retry exception for {fighter_name}: {e}")
                    failed_fighters.append(fighter_info)
            
            # Small delay to be respectful
            time.sleep(0.1)

    # Final save
    thread_safe_save(enriched, output_file)
    
    # Generate summary report
    success_count = len(enriched)
    failure_count = len(failed_fighters)
    success_rate = (success_count / total) * 100 if total > 0 else 0
    
    logger.info(f"\n📊 SUMMARY REPORT")
    logger.info(f"✅ Successfully processed: {success_count}/{total} fighters ({success_rate:.1f}%)")
    
    if failed_fighters:
        logger.warning(f"❌ Failed to process: {failure_count} fighters")
        
        # Save failed fighters in simple retry format
        failures_file = "data/errors/details_errors.json"
        os.makedirs(os.path.dirname(failures_file), exist_ok=True)

        failed_data = [
            {
                "name": fighter[2].get('name', 'Unknown'),
                "uuid": fighter[2].get('id', 'Unknown'),
                "profile_url_ufc": fighter[2].get('profile_url_ufc') or fighter[2].get('profile_url_ufc', 'Unknown'),
                "reason": "scrape failed"
            }
            for fighter in failed_fighters
        ]
        
        with open(failures_file, "w", encoding="utf-8") as f:
            json.dump(failed_data, f, indent=2, ensure_ascii=False)

        logger.info(f"💾 Failed fighters report saved to {failures_file}")

    logger.info(f"📁 Final data saved to {output_file}")

def enrich_roster_sequential(input_file="data/ufc_fighters_raw.json", output_file="data/ufc_details.json"):
    """Sequential version for debugging or when concurrent processing causes issues"""
    logger.info("🐌 Running in sequential mode...")
    
    with open(input_file, "r", encoding="utf-8") as f:
        roster = json.load(f)

    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
    total = len(active_fighters)
    enriched = []

    for idx, fighter in enumerate(active_fighters, start=1):
        try:
            UUID(fighter["id"])
        except (ValueError, KeyError):
            logger.error(f"Invalid UUID for {fighter.get('name', 'Unknown')}")
            continue

        result = process_fighter((idx, total, fighter))
        if result:
            enriched.append(result)

        # Save progress every 5 fighters
        if len(enriched) % 5 == 0:
            thread_safe_save(enriched, output_file)

        time.sleep(1)  # Be extra respectful in sequential mode

    thread_safe_save(enriched, output_file)
    logger.info(f"✅ Sequential processing complete. Saved {len(enriched)} fighters to {output_file}")


def update_ranked_fighter_images(rankings_file="data/ufc_rankings.json", roster_file="data/ufc_fighters_raw.json"):
    """Update images for top 5 ranked fighters + champions from each division"""
    logger.info("🏆 Starting ranked fighter image update...")
    
    # Load rankings and roster data
    try:
        with open(rankings_file, "r", encoding="utf-8") as f:
            rankings_data = json.load(f)
        with open(roster_file, "r", encoding="utf-8") as f:
            roster_data = json.load(f)
    except FileNotFoundError as e:
        logger.error(f"❌ Required file not found: {e}")
        return
    except json.JSONDecodeError as e:
        logger.error(f"❌ Invalid JSON: {e}")
        return
    
    # Build UUID to fighter mapping
    uuid_to_fighter = {f.get("id"): f for f in roster_data if f.get("id")}
    
    # Collect fighters to update (top 5 + champions)
    fighters_to_update = []
    
    for division in rankings_data:
        division_name = division.get("division", "Unknown")
        logger.info(f"📋 Processing division: {division_name}")
        
        for fighter_rank in division.get("fighters", []):
            rank = fighter_rank.get("rank")
            uuid = fighter_rank.get("uuid")
            name = fighter_rank.get("name", "Unknown")
            
            # Include champions (rank "C") and top 5 (ranks 1-5)
            if rank == "C" or (isinstance(rank, int) and 1 <= rank <= 5):
                if uuid and uuid in uuid_to_fighter:
                    fighter_data = uuid_to_fighter[uuid]
                    fighters_to_update.append((fighter_data, rank, division_name))
                    logger.info(f"  🎯 Queued for update: {name} (Rank {rank})")
                else:
                    logger.warning(f"  ⚠️ Fighter not found in roster: {name} (UUID: {uuid})")
    
    if not fighters_to_update:
        logger.warning("No ranked fighters found to update")
        return
    
    logger.info(f"🚀 Updating images for {len(fighters_to_update)} ranked fighters...")
    
    # Process each fighter
    updated_count = 0
    failed_count = 0
    
    for idx, (fighter, rank, division) in enumerate(fighters_to_update, 1):
        fighter_name = fighter.get("name", "Unknown")
        profile_url_ufc = fighter.get("profile_url_ufc") or fighter.get("profile_url")
        
        if not profile_url_ufc:
            logger.warning(f"[{idx}/{len(fighters_to_update)}] No profile URL for {fighter_name}")
            failed_count += 1
            continue
        
        logger.info(f"[{idx}/{len(fighters_to_update)}] Updating {fighter_name} (Rank {rank}, {division})")
        
        try:
            # Scrape the profile page for updated image
            res = session_manager.get(profile_url_ufc, timeout=15)
            if res.status_code != 200:
                logger.warning(f"Failed to load profile: {profile_url_ufc}")
                failed_count += 1
                continue
            
            soup = BeautifulSoup(res.text, "html.parser")
            fighter_slug = profile_url_ufc.rstrip('/').split('/')[-1]
            
            # Find image using same selectors as main scraping
            image_url = None
            image_el = (soup.select_one("img.hero-profile__image") or 
                       soup.select_one("img[class*='hero-profile']") or
                       soup.select_one("img[class*='athlete_bio_full_body']") or
                       soup.select_one(".hero-profile img"))
            
            if image_el and image_el.get("src"):
                src = image_el["src"].strip()
                if src.startswith("//"):
                    image_url = "https:" + src
                elif src.startswith("/"):
                    image_url = "https://www.ufc.com" + src
                else:
                    image_url = src
            else:
                # Try backup selectors
                backup_selectors = [
                    "img[src*='athlete_bio']",
                    "img[src*='fighter']", 
                    ".hero-profile img",
                    ".c-hero img",
                    "img[alt*='Fighter']"
                ]
                
                for selector in backup_selectors:
                    backup_el = soup.select_one(selector)
                    if backup_el and backup_el.get("src"):
                        src = backup_el["src"].strip()
                        if src.startswith("//"):
                            image_url = "https:" + src
                        elif src.startswith("/"):
                            image_url = "https://www.ufc.com" + src
                        else:
                            image_url = src
                        break
            
            if not image_url:
                logger.warning(f"Could not find image URL for {fighter_name}")
                failed_count += 1
                continue
            
            # Force download new image (overwrite existing)
            image_dir = os.path.join("..", "ufc-tracker", "public", "images")
            os.makedirs(image_dir, exist_ok=True)
            image_path = os.path.join(image_dir, f"{fighter_slug}.jpg")
            
            logger.info(f"🔄 Force downloading updated image for {fighter_name}: {image_url}")
            success = download_image(image_url, image_path)
            
            if success:
                logger.info(f"✅ Updated image for {fighter_name} (Rank {rank})")
                updated_count += 1
            else:
                logger.warning(f"❌ Failed to download image for {fighter_name}")
                failed_count += 1
            
            # Be respectful with requests
            time.sleep(1)
            
        except Exception as e:
            logger.error(f"Error updating {fighter_name}: {e}")
            failed_count += 1
    
    # Summary
    logger.info(f"\n📊 RANKED FIGHTER IMAGE UPDATE SUMMARY")
    logger.info(f"✅ Successfully updated: {updated_count} images")
    logger.info(f"❌ Failed to update: {failed_count} images")
    logger.info(f"📁 Images saved to: ../ufc-tracker/public/images/")


if __name__ == "__main__":
    import sys
    print("Run mode:\n[1] Full scrape\n[2] Retry from details_errors.json\n[3] Update ranked fighter images")
    mode = input("Choose 1, 2, or 3: ").strip()

    sequential_mode = "--sequential" in sys.argv
    max_workers = 4
    for arg in sys.argv:
        if arg.startswith("--workers="):
            try:
                max_workers = int(arg.split("=")[1])
                max_workers = max(1, min(max_workers, 10))
            except ValueError:
                logger.warning("Invalid worker count, using default (4)")

    if mode == "1":
        logger.info(f"🚀 Running full scrape with {max_workers} workers...")
        enrich_roster(max_workers=max_workers)

    elif mode == "3":
        logger.info("🏆 Running ranked fighter image update...")
        update_ranked_fighter_images()
    
    elif mode == "2":
        retry_file = "data/errors/details_errors.json"
        input_roster_file = "data/ufc_fighters_raw.json"
        output_file = "data/ufc_details.json"

        # Load main roster and error list
        try:
            with open(input_roster_file, "r", encoding="utf-8") as f:
                full_roster = json.load(f)
            with open(retry_file, "r", encoding="utf-8") as f:
                retry_list = json.load(f)
        except Exception as e:
            logger.error(f"❌ Failed to load input files: {e}")
            sys.exit(1)

        # Build a map of current active fighters: name.lower() and uuid => fighter
        active_fighters = { 
            (f.get("name", "").strip().lower(), str(f.get("id", "")).strip()): f 
            for f in full_roster if f.get("status", "").lower() == "active"
        }
        active_names = set(name for (name, uid) in active_fighters.keys())
        active_uuids = set(uid for (name, uid) in active_fighters.keys())

        # Prepare retry list with up-to-date info from roster, or use error file info if missing
        to_retry = []
        for entry in retry_list:
            name = entry.get("name", "").strip()
            uuid_ = str(entry.get("uuid", "")).strip()
            key = (name.lower(), uuid_)
            # Prefer current info from active roster (keeps freshest profile_url_ufc, etc)
            match = active_fighters.get(key)
            if not match:
                # Try matching by name only (in case uuid changed)
                alt_key = next((k for k in active_fighters if k[0] == name.lower()), None)
                if alt_key:
                    match = active_fighters[alt_key]
            if match:
                to_retry.append(match)
            else:
                # Fallback to error entry data if not found in active roster
                # This shouldn't happen unless you have a mismatch, but is safe
                new_fighter = dict(entry)
                new_fighter["id"] = uuid_
                new_fighter["status"] = "active"
                to_retry.append(new_fighter)

        if not to_retry:
            logger.warning("⚠️ No matching fighters found for retry.")
            sys.exit(0)

        # Enrich and merge results (only for to_retry list)
        enriched = []
        for idx, fighter in enumerate(to_retry, 1):
            result = process_fighter((idx, len(to_retry), fighter))
            if result:
                enriched.append(result)
            else:
                logger.warning(f"❌ Retry failed for {fighter.get('name')}")
            time.sleep(1)

        # Merge into existing details, only for active fighters!
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                existing_details = json.load(f)
        except FileNotFoundError:
            existing_details = []

        # Build a map of existing details by both name (lower) and uuid (id)
        details_by_name = {f.get("name", "").strip().lower(): f for f in existing_details}
        details_by_uuid = {str(f.get("id", "")).strip(): f for f in existing_details}

        # Remove any details for fighters no longer active
        active_names_set = set([f.get("name", "").strip().lower() for f in full_roster if f.get("status", "").lower() == "active"])
        active_uuids_set = set([str(f.get("id", "")).strip() for f in full_roster if f.get("status", "").lower() == "active"])
        filtered_existing_details = [
            f for f in existing_details
            if f.get("name", "").strip().lower() in active_names_set and str(f.get("id", "")).strip() in active_uuids_set
        ]

        # Merge/replace enriched fighters into filtered details (no duplicates)
        merged = {str(f.get("id", "")).strip(): f for f in filtered_existing_details}
        for f in enriched:
            merged[str(f.get("id", "")).strip()] = f
            # Also allow name match (in case UUID changed), but UUID is preferred
            merged[f.get("name", "").strip().lower()] = f

        # Final output: unique by UUID, and only for active fighters
        out_fighters = {}
        for key, fighter in merged.items():
            uuid_ = str(fighter.get("id", "")).strip()
            name = fighter.get("name", "").strip().lower()
            # Only include if in active set
            if (name in active_names_set and uuid_ in active_uuids_set):
                out_fighters[uuid_] = fighter

        # Save
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(list(out_fighters.values()), f, indent=2, ensure_ascii=False)
        logger.info(f"✅ Saved retried and refreshed data to {output_file}")
    
    else:
        print("❌ Invalid choice.")