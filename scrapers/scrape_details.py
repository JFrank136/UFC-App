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

def clean_stat_value(value):
    """Clean stat values - return None only for truly empty/missing values"""
    if not value or value in ["00:00", "-", "Unknown", "N/A", ""]:
        return None
    return value

def clean_stats_group(stats_dict):
    """Clean a group of related stats - null them all if they're all zeros"""
    if not stats_dict:
        return stats_dict
    
    # Check if all non-None values are effectively zero
    non_null_values = [v for v in stats_dict.values() if v is not None]
    if not non_null_values:
        return stats_dict
    
    # Check if all values are zero-like
    zero_patterns = ["0", "0.0", "0 (0 %)", "0 (0%)", "00:00"]
    all_zeros = all(str(v).strip() in zero_patterns for v in non_null_values)
    
    if all_zeros:
        # If all stats in this group are zero, likely no data available
        return {k: None for k in stats_dict.keys()}
    
    return stats_dict


def download_image(url, save_path):
    """Download image with minimal logging"""
    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.ufc.com/"
        }
        
        res = session_manager.get(url, stream=True, timeout=10)
        if res.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(1024):
                    if chunk:
                        f.write(chunk)
            return True
    except Exception:
        pass
    return False

# Setup logging
logging.basicConfig(level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create a minimal progress logger
def show_progress(current, total, current_fighter=""):
    if current % 25 == 0 or current == 1 or current == total:
        if current_fighter:
            print(f"[{current}/{total}] Processing: {current_fighter}")
        else:
            print(f"[{current}/{total}] Processing fighters...")

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
            # Simplified rate limiting
            now = time.time()
            self.request_times = [t for t in self.request_times if now - t < 60]
            
            # More conservative rate limiting
            if len(self.request_times) > 20:  # Max 20 requests per minute
                sleep_time = 60 - (now - self.request_times[0])
                if sleep_time > 0:
                    time.sleep(sleep_time)
            
            # Minimum delay between requests
            if self.request_times:
                time_since_last = now - self.request_times[-1]
                if time_since_last < self.min_delay:
                    time.sleep(self.min_delay - time_since_last)
            
            self.request_times.append(time.time())
        
        return self.session.get(url, **kwargs)

# Global session manager
session_manager = SessionManager()


def extract_stats_by_structure(soup):
    """Extract stats based on the specific UFC page structure shown in screenshots"""
    stats = {}
    
    def is_valid_stat_value(value, expected_type="number"):
        """Validate that extracted value is actually a stat, not help text"""
        if not value or not isinstance(value, str):
            return False
        
        value = value.strip().lower()
        
        # Common invalid patterns that indicate help text
        invalid_patterns = [
            "per min", "per 15 min", "percentage", "attempted", "landed",
            "defense is", "average number", "window", "fighter", "takedown",
            "significant strikes", "submissions", "knockdown", "is the percentage",
            "accuracy is", "average time"
        ]
        
        # If it contains help text patterns, it's invalid
        if any(pattern in value for pattern in invalid_patterns):
            return False
        
        # For numeric stats, should contain digits
        if expected_type == "number" and not any(char.isdigit() for char in value):
            return False
        
        # For time stats, should have time format
        if expected_type == "time" and ":" not in value:
            return False
            
        return True
    
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
        
        # Skip zero/empty values
        if number in ["00:00", "0", "0.0", "0 (0 %)", "0 (0%)", "-"]:
            number = None
        
        # Map based on label content with validation
        if "sig. str. landed" in label:
            if is_valid_stat_value(number):
                stats["sig_strikes_landed_per_min"] = number
            else:
                stats["sig_strikes_landed_per_min"] = None
        elif "sig. str. absorbed" in label:
            if is_valid_stat_value(number):
                stats["sig_strikes_absorbed_per_min"] = number
            else:
                stats["sig_strikes_absorbed_per_min"] = None
        elif "takedown avg" in label:
            if is_valid_stat_value(number):
                stats["takedown_avg_per_15min"] = number
            else:
                stats["takedown_avg_per_15min"] = None
        elif "submission avg" in label:
            if is_valid_stat_value(number):
                stats["submission_avg_per_15min"] = number
            else:
                stats["submission_avg_per_15min"] = None
        elif "sig. str. defense" in label:
            if is_valid_stat_value(number):
                stats["sig_str_defense"] = number
            else:
                stats["sig_str_defense"] = None
        elif "takedown defense" in label:
            if is_valid_stat_value(number):
                stats["takedown_defense"] = number
            else:
                stats["takedown_defense"] = None
        elif "knockdown avg" in label:
            if is_valid_stat_value(number):
                stats["knockdown_avg"] = number
            else:
                stats["knockdown_avg"] = None
        elif "average fight time" in label:
            if is_valid_stat_value(number, "time"):
                stats["avg_fight_time"] = number
            else:
                stats["avg_fight_time"] = None
    
    return stats

def extract_accuracy_and_defense_stats_combined(soup, page_text):
    """Extract striking/takedown accuracy in format: '54% 106/195'"""
    combined_stats = {}
    
    def is_valid_stat_value(value):
        """Check if a value is actually a stat and not help text"""
        if not value or not isinstance(value, str):
            return False
        
        value = value.strip().lower()
        
        # Reject obvious help text patterns
        invalid_patterns = [
            "per min", "per 15 min", "percentage", "attempted", "landed",
            "defense is", "average number", "window", "fighter", "takedown",
            "significant strikes", "submissions", "knockdown"
        ]
        
        if any(pattern in value for pattern in invalid_patterns):
            return False
            
        # Must contain digits to be valid
        return any(char.isdigit() for char in value)
    
    def calculate_accuracy_format(landed=None, attempted=None, percentage=None):
        """Calculate accuracy in format: '54% 106/195'"""
        try:
            # Convert inputs to integers if they're strings
            if landed is not None:
                landed = int(str(landed).strip())
            if attempted is not None:
                attempted = int(str(attempted).strip())
            if percentage is not None:
                if isinstance(percentage, str):
                    # Extract number from percentage string like "54%" 
                    perc_match = re.search(r"(\d+)", percentage)
                    if perc_match:
                        percentage = int(perc_match.group(1))
                    else:
                        percentage = None
            
            # Case 1: Have landed and attempted, calculate percentage
            if landed is not None and attempted is not None and attempted > 0:
                calculated_percentage = round((landed / attempted) * 100)
                return f"{calculated_percentage}% {landed}/{attempted}"
            
            # Case 2: Have percentage and landed, calculate attempted
            elif percentage is not None and landed is not None and percentage > 0:
                attempted = round((landed * 100) / percentage)
                return f"{percentage}% {landed}/{attempted}"
            
            # Case 3: Have percentage and attempted, calculate landed
            elif percentage is not None and attempted is not None and attempted > 0:
                landed = round((percentage * attempted) / 100)
                return f"{percentage}% {landed}/{attempted}"
            
            return None
        except (ValueError, ZeroDivisionError, TypeError):
            return None
    
    try:
        # Method 1: Extract from overlap stats sections
        overlap_stats = soup.select(".c-overlap__stats")
        temp_values = {}
        
        for stat_section in overlap_stats:
            try:
                title_el = stat_section.select_one(".c-overlap__stats-title")
                value_el = stat_section.select_one(".c-overlap__stats-value")
                text_el = stat_section.select_one(".c-overlap__stats-text")
                
                if not title_el or not value_el:
                    continue
                    
                title = title_el.get_text(strip=True).lower()
                value = value_el.get_text(strip=True)
                text = text_el.get_text(strip=True).lower() if text_el else ""
                
                # Skip if value looks like help text
                if not is_valid_stat_value(value):
                    continue
                
                # Store relevant values
                if "sig. strikes landed" in title and value.isdigit():
                    temp_values["strikes_landed"] = value
                    # Look for attempted in text
                    attempted_match = re.search(r"(\d+)", text)
                    if attempted_match:
                        temp_values["strikes_attempted"] = attempted_match.group(1)
                
                elif "takedowns landed" in title and value.isdigit():
                    temp_values["takedowns_landed"] = value
                    # Look for attempted in text
                    attempted_match = re.search(r"(\d+)", text)
                    if attempted_match:
                        temp_values["takedowns_attempted"] = attempted_match.group(1)
                        
            except Exception as e:
                logger.warning(f"Error processing overlap stat section: {e}")
                continue
        
        # Calculate striking accuracy
        if "strikes_landed" in temp_values:
            striking_accuracy = calculate_accuracy_format(
                landed=temp_values.get("strikes_landed"),
                attempted=temp_values.get("strikes_attempted")
            )
            if striking_accuracy:
                combined_stats["striking_accuracy"] = striking_accuracy
        
        # Calculate takedown accuracy
        if "takedowns_landed" in temp_values:
            takedown_accuracy = calculate_accuracy_format(
                landed=temp_values.get("takedowns_landed"),
                attempted=temp_values.get("takedowns_attempted")
            )
            if takedown_accuracy:
                combined_stats["takedown_accuracy"] = takedown_accuracy
        
        # Method 2: Look for pre-formatted accuracy sections as fallback
        if not combined_stats.get("striking_accuracy"):
            try:
                # Look for existing formatted accuracy like "54%" with "106/195"
                accuracy_sections = soup.find_all(string=re.compile(r"STRIKING.*ACCURACY", re.IGNORECASE))
                for section in accuracy_sections:
                    parent = section.find_parent()
                    if parent:
                        section_text = parent.get_text()
                        
                        # Look for pattern like "54% 106/195" or "106/195 (54%)"
                        patterns = [
                            r"(\d+)%\s*(\d+)/(\d+)",  # "54% 106/195"
                            r"(\d+)/(\d+)\s*\((\d+)%\)",  # "106/195 (54%)"
                            r"(\d+)/(\d+)\s*(\d+)%"  # "106/195 54%"
                        ]
                        
                        for pattern in patterns:
                            match = re.search(pattern, section_text)
                            if match:
                                if len(match.groups()) == 3:
                                    if pattern == patterns[0]:  # percentage first
                                        percentage, landed, attempted = match.groups()
                                    else:  # landed/attempted first
                                        landed, attempted, percentage = match.groups()
                                    
                                    result = calculate_accuracy_format(
                                        landed=landed, attempted=attempted, percentage=percentage
                                    )
                                    if result:
                                        combined_stats["striking_accuracy"] = result
                                        break
                        if combined_stats.get("striking_accuracy"):
                            break
            except Exception as e:
                logger.warning(f"Error in striking accuracy fallback: {e}")
        
        # Similar fallback for takedown accuracy
        if not combined_stats.get("takedown_accuracy"):
            try:
                takedown_sections = soup.find_all(string=re.compile(r"TAKEDOWN.*ACCURACY", re.IGNORECASE))
                for section in takedown_sections:
                    parent = section.find_parent()
                    if parent:
                        section_text = parent.get_text()
                        
                        patterns = [
                            r"(\d+)%\s*(\d+)/(\d+)",
                            r"(\d+)/(\d+)\s*\((\d+)%\)",
                            r"(\d+)/(\d+)\s*(\d+)%"
                        ]
                        
                        for pattern in patterns:
                            match = re.search(pattern, section_text)
                            if match:
                                if len(match.groups()) == 3:
                                    if pattern == patterns[0]:
                                        percentage, landed, attempted = match.groups()
                                    else:
                                        landed, attempted, percentage = match.groups()
                                    
                                    result = calculate_accuracy_format(
                                        landed=landed, attempted=attempted, percentage=percentage
                                    )
                                    if result:
                                        combined_stats["takedown_accuracy"] = result
                                        break
                        if combined_stats.get("takedown_accuracy"):
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
                data["image_local_path"] = f"/images/{fighter_slug}.jpg"
            else:
                success = download_image(image_url, image_path)
                if success:
                    data["image_local_path"] = f"/images/{fighter_slug}.jpg"
            data["image_url"] = image_url
            data["image_verified"] = True
        else:
            data["image_url"] = "/static/images/placeholder.jpg"
            data["image_local_path"] = "/images/placeholder.jpg"
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
        
        # Group related stats for intelligent cleaning
        core_stats = {
            "sig_strikes_landed_per_min": structure_stats.get("sig_strikes_landed_per_min"),
            "sig_strikes_absorbed_per_min": structure_stats.get("sig_strikes_absorbed_per_min"),
            "takedown_avg_per_15min": structure_stats.get("takedown_avg_per_15min"),
            "submission_avg_per_15min": structure_stats.get("submission_avg_per_15min"),
            "avg_fight_time": structure_stats.get("avg_fight_time")
        }
        
        defense_stats = {
            "sig_str_defense": structure_stats.get("sig_str_defense"),
            "takedown_defense": structure_stats.get("takedown_defense"),
            "knockdown_avg": structure_stats.get("knockdown_avg")
        }
        
        # Clean groups intelligently
        cleaned_core = clean_stats_group(core_stats)
        cleaned_defense = clean_stats_group(defense_stats)
        
        # Merge cleaned stats
        cleaned_structure_stats = {**cleaned_core, **cleaned_defense}
        data.update(cleaned_structure_stats)
        
        # Fallback method: use the original extraction if primary fails
        if not any(v is not None for v in cleaned_structure_stats.values()):
            logger.info(f"Using fallback stat extraction for {fighter_slug}")
            data["sig_strikes_landed_per_min"] = clean_stat_value(extract_stat_by_label(soup, "SIG. STR. LANDED", page_text) or extract_stat_by_label(soup, "SIG STR LANDED", page_text))
            data["sig_strikes_absorbed_per_min"] = clean_stat_value(extract_stat_by_label(soup, "SIG. STR. ABSORBED", page_text) or extract_stat_by_label(soup, "SIG STR ABSORBED", page_text))
            data["takedown_avg_per_15min"] = clean_stat_value(extract_stat_by_label(soup, "TAKEDOWN AVG", page_text))
            data["submission_avg_per_15min"] = clean_stat_value(extract_stat_by_label(soup, "SUBMISSION AVG", page_text))
            data["knockdown_avg"] = clean_stat_value(extract_stat_by_label(soup, "KNOCKDOWN AVG", page_text))
            data["avg_fight_time"] = clean_stat_value(extract_stat_by_label(soup, "AVERAGE FIGHT TIME", page_text))
            
            # Only extract simple defense percentages if combined stats weren't found
            if not data.get("sig_str_defense"):
                data["sig_str_defense"] = clean_stat_value(extract_stat_by_label(soup, "SIG. STR. DEFENSE", page_text) or extract_stat_by_label(soup, "SIG STR DEFENSE", page_text))
            if not data.get("takedown_defense"):
                data["takedown_defense"] = clean_stat_value(extract_stat_by_label(soup, "TAKEDOWN DEFENSE", page_text))

        # Third fallback: try to extract from stat value containers directly
        if not any([data.get("sig_strikes_landed_per_min"), data.get("sig_strikes_absorbed_per_min")]):
            stat_values = soup.select(".c-stat-3bar__value, .c-stat-compare__number")
            if len(stat_values) >= 6:
                try:
                    data["sig_strikes_landed_per_min"] = clean_stat_value(stat_values[0].text.strip())
                    data["sig_strikes_absorbed_per_min"] = clean_stat_value(stat_values[1].text.strip())
                    data["takedown_avg_per_15min"] = clean_stat_value(stat_values[2].text.strip())
                    data["submission_avg_per_15min"] = clean_stat_value(stat_values[3].text.strip())
                    data["sig_str_defense"] = clean_stat_value(stat_values[4].text.strip()) if len(stat_values) > 4 else None
                    data["knockdown_avg"] = clean_stat_value(stat_values[5].text.strip()) if len(stat_values) > 5 else None
                    
                    # Average fight time often in different container
                    time_elements = soup.select("div.c-stat-compare__number")
                    for elem in time_elements:
                        text = elem.text.strip()
                        if ":" in text and text != "00:00":  # Time format, but not empty
                            data["avg_fight_time"] = text
                            break
                    if not data.get("avg_fight_time"):  # Ensure it's None if no valid time found
                        data["avg_fight_time"] = None
                except IndexError:
                    logger.warning(f"Could not extract stats from stat containers for {fighter_slug}")

        # ===== ACCURACY AND DEFENSE STATS (COMBINED FORMAT) =====
        accuracy_and_defense_stats = extract_accuracy_and_defense_stats_combined(soup, page_text)
        data.update(accuracy_and_defense_stats)

        # ===== POSITIONAL AND TARGET STATS (PRESERVED) =====
        
        # Strikes by position
        position_stats = extract_position_stats(soup, page_text)
        if position_stats:
            # Only null out position stats if ALL are zero (indicating no fight data)
            cleaned_position = clean_stats_group(position_stats)
            if any(v is not None for v in cleaned_position.values()):
                data["sig_strikes_by_position"] = position_stats  # Keep original if any real data
            # If all were nulled, don't add the field at all

        # Strikes by target
        target_stats = extract_target_stats(soup, page_text)
        if target_stats:
            # Only null out target stats if ALL are zero (indicating no fight data)
            cleaned_target = clean_stats_group(target_stats)
            if any(v is not None for v in cleaned_target.values()):
                data["sig_strikes_by_target"] = target_stats  # Keep original if any real data
            # If all were nulled, don't add the field at all

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
    """Process a single fighter with minimal logging"""
    idx, total, fighter = fighter_info
    
    # Validate UUID
    try:
        UUID(fighter["id"])
    except (ValueError, KeyError):
        return None

    fighter_name = fighter.get('name', 'Unknown')
    
    # Show progress for every 25th fighter
    show_progress(idx, total, fighter_name)

    # Skip if already processed and image exists
    fighter_slug = fighter.get("profile_url_ufc", "").rstrip('/').split('/')[-1]
    if fighter_slug:
        image_path = os.path.join("..", "ufc-tracker", "public", "images", f"{fighter_slug}.jpg")
        if (fighter.get("image_verified") and os.path.exists(image_path)):
            return fighter

    # Get profile URL
    profile_url_ufc = fighter.get("profile_url_ufc") or fighter.get("profile_url")
    if not profile_url_ufc:
        return None

    # Scrape profile
    details = scrape_details(profile_url_ufc)
    if not details:
        return None

    # Merge data
    enriched_fighter = fighter.copy()
    enriched_fighter.update(details)
    enriched_fighter["last_updated"] = time.time()
    
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

    # Single retry for failed fighters
    if failed_fighters:
        print(f"🔄 Retrying {len(failed_fighters)} failed fighters...")
        
        retry_workers = min(2, len(failed_fighters))
        retry_successes = []
        
        with ThreadPoolExecutor(max_workers=retry_workers) as executor:
            retry_futures = {
                executor.submit(process_fighter, fighter_info): fighter_info 
                for fighter_info in failed_fighters
            }
            
            for future in as_completed(retry_futures):
                try:
                    result = future.result(timeout=60)
                    if result:
                        retry_successes.append(result)
                        enriched.append(result)
                except Exception:
                    pass
        
        # Update failed list
        failed_fighters = [f for f in failed_fighters 
                          if f[2].get('name') not in [r.get('name') for r in retry_successes]]
        
        if retry_successes:
            print(f"✅ Retry recovered {len(retry_successes)} fighters")

    # Final save
    thread_safe_save(enriched, output_file)
    
    # Generate summary report
    success_count = len(enriched)
    failure_count = len(failed_fighters)
    success_rate = (success_count / total) * 100 if total > 0 else 0
    
    print(f"\n📊 SUMMARY REPORT")
    print(f"✅ Successfully processed: {success_count}/{total} fighters ({success_rate:.1f}%)")
    
    if failed_fighters:
        print(f"❌ Failed to process: {failure_count} fighters")
        
        # Save failed fighters
        failures_file = "data/errors/details_errors.json"
        os.makedirs(os.path.dirname(failures_file), exist_ok=True)

        failed_data = [
            {
                "name": fighter[2].get('name', 'Unknown'),
                "uuid": fighter[2].get('id', 'Unknown'),
                "profile_url_ufc": fighter[2].get('profile_url_ufc', 'Unknown'),
                "reason": "scrape failed"
            }
            for fighter in failed_fighters
        ]
        
        with open(failures_file, "w", encoding="utf-8") as f:
            json.dump(failed_data, f, indent=2, ensure_ascii=False)

        print(f"💾 Failed fighters report saved to {failures_file}")

    print(f"📁 Final data saved to {output_file}")

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
        
        if idx % 10 == 0 or idx == 1 or idx == len(fighters_to_update):
            print(f"[{idx}/{len(fighters_to_update)}] Updating ranked fighter images...")
        
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
            
            success = download_image(image_url, image_path)
            
            if success:
                updated_count += 1
            else:
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
        
        try:
            with open(retry_file, "r", encoding="utf-8") as f:
                failures = json.load(f)
        except FileNotFoundError:
            print("✅ No failure file found.")
            sys.exit(0)

        # Load main roster to get complete fighter data
        try:
            with open(input_roster_file, "r", encoding="utf-8") as f:
                full_roster = json.load(f)
        except Exception as e:
            print(f"❌ Failed to load input roster: {e}")
            sys.exit(1)

        # Build fighter lookup by name and UUID
        fighter_lookup = {}
        for fighter in full_roster:
            if fighter.get("status", "").lower() == "active":
                name_key = fighter.get("name", "").strip().lower()
                uuid_key = str(fighter.get("id", "")).strip()
                fighter_lookup[name_key] = fighter
                fighter_lookup[uuid_key] = fighter

        # Prepare fighters to retry
        to_retry = []
        for entry in failures:
            name = entry.get("name", "").strip()
            uuid = entry.get("uuid", "").strip()
            
            # Try to find fighter in roster
            fighter = fighter_lookup.get(name.lower()) or fighter_lookup.get(uuid)
            if fighter:
                to_retry.append(fighter)
            else:
                print(f"⚠️ Fighter '{name}' not found in active roster")

        if not to_retry:
            print("⚠️ No matching fighters found for retry.")
            sys.exit(0)

        print(f"🚀 Retrying {len(to_retry)} fighters...")
        
        # Process fighters (same as main function)
        enriched = []
        failed_fighters = []
        
        for idx, fighter in enumerate(to_retry, start=1):
            try:
                result = process_fighter((idx, len(to_retry), fighter))
                if result:
                    enriched.append(result)
                    print(f"✅ Success: {fighter.get('name')}")
                else:
                    failed_fighters.append(fighter)
                    print(f"❌ Failed: {fighter.get('name')}")
            except Exception as e:
                print(f"❌ Error processing {fighter.get('name')}: {e}")
                failed_fighters.append(fighter)
            
            time.sleep(1)

        # Load existing details and merge with new results
        try:
            with open("data/ufc_details.json", "r", encoding="utf-8") as f:
                existing_details = json.load(f)
        except FileNotFoundError:
            existing_details = []
        
        # Create lookup by UUID for existing details
        existing_by_uuid = {str(f.get("id", "")).strip(): f for f in existing_details}
        
        # Merge new results (overwrite existing fighters with same UUID)
        for fighter in enriched:
            fighter_uuid = str(fighter.get("id", "")).strip()
            existing_by_uuid[fighter_uuid] = fighter
        
        # Save merged results
        merged_fighters = list(existing_by_uuid.values())
        with open("data/ufc_details.json", "w", encoding="utf-8") as f:
            json.dump(merged_fighters, f, indent=2, ensure_ascii=False)
        
        # Update error file - remove successful entries
        successful_names = {f.get("name", "").strip().lower() for f in enriched}
        remaining_errors = [
            entry for entry in failures 
            if entry.get("name", "").strip().lower() not in successful_names
        ]
        
        with open(retry_file, "w", encoding="utf-8") as f:
            json.dump(remaining_errors, f, indent=2, ensure_ascii=False)
        
        print(f"\n📊 RETRY SUMMARY:")
        print(f"✅ Successfully processed: {len(enriched)} fighters")
        print(f"❌ Failed to process: {len(failed_fighters)} fighters")
        print(f"🧹 Removed {len(successful_names)} entries from error file")
        print(f"📁 Merged {len(enriched)} fighters into existing data")
        print(f"📁 Total fighters in file: {len(merged_fighters)}")
    
    else:
        print("❌ Invalid choice.")