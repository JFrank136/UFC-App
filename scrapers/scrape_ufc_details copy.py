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
        res = requests.get(url, stream=True)
        if res.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(1024):
                    f.write(chunk)
            return True
    except Exception as e:
        print(f"  ❌ Failed to download image: {e}")
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

class UFCRankingsScraper:
    """Scraper for UFC rankings page"""
    
    def __init__(self):
        self.rankings_cache = {}
        self.cache_timestamp = 0
        self.cache_duration = 3600  # 1 hour cache
    
    def normalize_fighter_name(self, name: str) -> str:
        """Normalize fighter name for comparison"""
        if not name:
            return ""
        
        # Convert to lowercase and normalize spaces
        normalized = re.sub(r'\s+', ' ', name.strip().lower())
        
        # Remove common suffixes
        normalized = re.sub(r'\s+(jr\.?|sr\.?|iii?|iv|v)$', '', normalized)
        
        # Handle apostrophes and special characters
        normalized = normalized.replace("'", "").replace("'", "").replace("-", " ")
        
        return normalized
    
    def get_rankings(self) -> Dict[str, Dict[str, int]]:
        """Scrape UFC rankings and return fighter name to ranking mapping"""
        current_time = time.time()
        
        # Use cache if recent
        if (current_time - self.cache_timestamp) < self.cache_duration and self.rankings_cache:
            logger.info("Using cached rankings data")
            return self.rankings_cache
        
        logger.info("Scraping UFC rankings...")
        
        try:
            response = session_manager.get("https://www.ufc.com/rankings", timeout=15)
            if response.status_code != 200:
                logger.error(f"Failed to fetch rankings page: {response.status_code}")
                return {}
            
            soup = BeautifulSoup(response.text, "html.parser")
            rankings = {}
            
            # Try multiple possible selectors for ranking sections
            ranking_sections = (
                soup.find_all("div", class_="view-grouping") or
                soup.find_all("div", class_="rankings-group") or
                soup.find_all("div", {"data-main-component": "RankingsWidget"})
            )
            
            if not ranking_sections:
                logger.warning("No ranking sections found with standard selectors, trying alternative approach")
                # Try to find any div containing ranking information
                ranking_sections = soup.find_all("div", string=re.compile(r"(Champion|#\d+)", re.IGNORECASE))
                ranking_sections = [section.find_parent() for section in ranking_sections if section.find_parent()]
            
            logger.info(f"Found {len(ranking_sections)} ranking sections")
            
            for section in ranking_sections:
                try:
                    # Get division name - try multiple approaches
                    division_name = None
                    
                    # Method 1: Look for header in this section
                    header = (
                        section.find("h4", class_="view-grouping-header") or
                        section.find("h3") or
                        section.find("h2") or
                        section.find(class_=re.compile(r"header|title"))
                    )
                    
                    if header:
                        division_name = header.get_text(strip=True).lower()
                    else:
                        # Method 2: Look for division name in data attributes or nearby text
                        for elem in section.find_all(["div", "span"], limit=10):
                            text = elem.get_text(strip=True).lower()
                            if any(weight in text for weight in ["heavyweight", "light heavyweight", "middleweight", "welterweight", "lightweight", "featherweight", "bantamweight", "flyweight", "strawweight"]):
                                division_name = text
                                break
                    
                    if not division_name:
                        logger.warning("Could not determine division name for section")
                        continue
                    
                    # Skip pound-for-pound
                    if "pound" in division_name:
                        continue
                    
                    logger.info(f"Processing division: {division_name}")
                    
                    # Find fighters - try multiple selectors
                    fighters = (
                        section.find_all("a", class_="button") or
                        section.find_all("a", href=re.compile(r"/athlete/")) or
                        section.find_all("div", class_=re.compile(r"fighter|athlete")) or
                        section.find_all("span", class_=re.compile(r"name"))
                    )
                    
                    if not fighters:
                        # Last resort: find any links or text that look like fighter names
                        fighters = section.find_all("a")
                        fighters = [f for f in fighters if f.get_text(strip=True) and len(f.get_text(strip=True).split()) >= 2]
                    
                    logger.info(f"Found {len(fighters)} fighters in {division_name}")
                    
                    champion_found = False
                    champion_assigned = False
                    
                    # Track if we're in a clear ranking context
                    has_ranking_structure = False
                    
                    # Check if this section has clear ranking structure
                    section_text = section.get_text().lower()
                    if "#1" in section_text or "#2" in section_text:
                        has_ranking_structure = True
                    
                    for fighter_element in fighters:
                        fighter_name = fighter_element.get_text(strip=True)
                        
                        # Clean up fighter name
                        fighter_name = re.sub(r'\s+', ' ', fighter_name).strip()
                        
                        if not fighter_name or len(fighter_name) < 3:
                            continue
                        
                        # Skip if it doesn't look like a name (too short, all caps acronyms, etc.)
                        if len(fighter_name.split()) < 2 and not any(c.islower() for c in fighter_name):
                            continue
                        
                        # Get much broader context - look at multiple parent levels
                        context_text = ""
                        current_element = fighter_element
                        for level in range(4):  # Check up to 4 parent levels
                            if current_element:
                                context_text += " " + current_element.get_text()
                                current_element = current_element.parent
                        context_text = context_text.lower()
                        
                        # Determine rank based on context clues
                        rank = None
                        
                        # Look for champion indicators first
                        champion_keywords = ["champion", "defending champion", "current champion", "title holder"]
                        exclusion_keywords = ["former", "ex-", "interim", "challenger", "contender"]
                        
                        has_champion_indicator = any(keyword in context_text for keyword in champion_keywords)
                        has_exclusion = any(ex in context_text for ex in exclusion_keywords)
                        
                        # Assign champion if we haven't yet
                        if not champion_assigned and has_champion_indicator and not has_exclusion:
                            rank = "C"
                            champion_found = True
                            champion_assigned = True
                        
                        # Look for explicit rank numbers - THIS IS THE KEY FIX
                        elif rank is None:
                            # Try multiple patterns to find explicit ranks
                            rank_patterns = [
                                r'#\s*(\d+)',           # #4, # 4
                                r'rank\s*#?\s*(\d+)',   # rank 4, rank #4
                                r'ranked\s*#?\s*(\d+)', # ranked 4, ranked #4
                                r'(?:^|\s)(\d+)(?:\s|$)', # standalone number
                            ]
                            
                            for pattern in rank_patterns:
                                rank_match = re.search(pattern, context_text)
                                if rank_match:
                                    found_rank = int(rank_match.group(1))
                                    if 1 <= found_rank <= 15:
                                        rank = found_rank
                                        logger.debug(f"Found explicit rank #{found_rank} for {fighter_name}")
                                        break
                        
                        # Skip this fighter if no valid rank found
                        if rank is None:
                            logger.debug(f"No valid rank found for {fighter_name}, skipping")
                            continue
                        
                        # Only proceed if we determined a valid rank
                        if isinstance(rank, int) and rank > 15:
                            continue
                        if rank == "C":
                            stored_rank = "C"
                        else:
                            try:
                                clean_rank = int(re.sub(r'[^0-9]', '', str(rank)))
                                stored_rank = f"#{clean_rank}"
                            except:
                                logger.warning(f"Bad rank format for {fighter_name}: {rank}")
                                continue

                        
                        # Additional validation for champion rank
                        if rank == 0:
                            # Double-check champion status with stricter validation
                            full_context = ""
                            if fighter_element.parent:
                                full_context = fighter_element.parent.get_text().lower()
                            if fighter_element.parent and fighter_element.parent.parent:
                                full_context += " " + fighter_element.parent.parent.get_text().lower()
                            
                            # Must have explicit champion indicators
                            explicit_champion = any(phrase in full_context for phrase in [
                                "defending champion", "current champion", "champion (c)", 
                                "title holder", "undisputed champion"
                            ])
                            
                            if not explicit_champion:
                                # Demote to rank 1 instead of champion
                                rank = 1
                                logger.debug(f"Demoted {fighter_name} from champion to #1 - insufficient evidence")
                        
                        # Normalize the name for storage
                        normalized_name = self.normalize_fighter_name(fighter_name)
                        
                        if normalized_name not in rankings:
                            rankings[normalized_name] = {}
                        
                        rankings[normalized_name][division_name] = stored_rank
                        
                        logger.debug(f"Added {fighter_name} (normalized: {normalized_name}) at rank {rank} in {division_name}")
                    
                    # If no champion was found in this division, log a warning
                    if not champion_found:
                        logger.warning(f"No champion found for {division_name} division")
                    
                except Exception as e:
                    logger.error(f"Error processing ranking section: {e}")
                    continue
            
            # If we still don't have rankings, try a more aggressive approach
            if not rankings:
                logger.warning("No rankings found with standard approach, trying aggressive parsing")
                
                # Look for any text that contains rank numbers and names
                all_text = soup.get_text()
                lines = all_text.split('\n')
                
                current_division = None
                for line in lines:
                    line = line.strip()
                    
                    # Check if this line is a division header
                    if any(weight in line.lower() for weight in ["heavyweight", "middleweight", "welterweight", "lightweight", "featherweight", "bantamweight", "flyweight"]):
                        current_division = line.lower()
                        continue
                    
                    # Check if this line contains a ranking
                    if current_division and (line.startswith('#') or 'champion' in line.lower()):
                        # Extract fighter name (this is very basic)
                        name_match = re.search(r'([A-Z][a-z]+ [A-Z][a-z]+)', line)
                        if name_match:
                            fighter_name = name_match.group(1)
                            normalized_name = self.normalize_fighter_name(fighter_name)
                            
                            if '#' in line:
                                rank_match = re.search(r'#(\d+)', line)
                                rank = int(rank_match.group(1)) if rank_match else 1
                            else:
                                rank = 0  # Champion
                            
                            if normalized_name not in rankings:
                                rankings[normalized_name] = {}
                            rankings[normalized_name][current_division] = rank
            
            self.rankings_cache = rankings
            self.cache_timestamp = current_time
            
            logger.info(f"Successfully scraped rankings for {len(rankings)} fighters")
            
            # Debug: Print some examples
            if rankings:
                logger.info("Sample rankings found:")
                for i, (name, divisions) in enumerate(list(rankings.items())[:5]):
                    logger.info(f"  {name}: {divisions}")
            
            return rankings
            
        except Exception as e:
            logger.error(f"Error scraping rankings: {e}")
            return {}
    
    def get_fighter_ranking(self, fighter_name: str, weight_class: str = None) -> Dict[str, any]:
        """Get ranking info for a specific fighter"""
        rankings = self.get_rankings()
        
        if not rankings:
            # Log the failed search for debugging
            logger.debug(f"No ranking found for {fighter_name} (normalized: {normalized_input})")
            return {"division_ranking": "unranked", "is_champion": False}
        
        # Normalize the input name
        normalized_input = self.normalize_fighter_name(fighter_name)
        
        # Try different name variations
        name_variations = [
            normalized_input,
            fighter_name.lower(),
            fighter_name.upper().lower(),  # Handle all caps names
            # Try removing common prefixes/suffixes
            re.sub(r'^(the\s+)', '', normalized_input),
            re.sub(r'\s+(jr\.?|sr\.?|iii?|iv)$', '', normalized_input),
        ]
        
        # Also try partial matches for compound names
        name_parts = normalized_input.split()
        if len(name_parts) >= 2:
            # Try first and last name only
            name_variations.append(f"{name_parts[0]} {name_parts[-1]}")
            # Try with middle initials removed
            if len(name_parts) > 2:
                name_variations.append(f"{name_parts[0]} {' '.join(name_parts[2:])}")
        
        logger.debug(f"Searching for {fighter_name} using variations: {name_variations}")
        
        for name_var in name_variations:
            if name_var in rankings:
                fighter_rankings = rankings[name_var]
                logger.debug(f"Found match for {name_var}: {fighter_rankings}")
                
                # If we have a specific weight class, try to match it
                if weight_class:
                    weight_class_lower = weight_class.lower()
                    
                    for division, rank in fighter_rankings.items():
                        if (weight_class_lower in division or 
                            division in weight_class_lower or
                            self._weight_class_match(weight_class_lower, division)):
                            
                            if str(rank).upper() == "C":
                                return {
                                    "division_ranking": "C",
                                    "is_champion": True,
                                    "division": division.title()
                                }
                            else:
                                try:
                                    return {
                                        "division_ranking": f"#{int(rank)}",
                                        "is_champion": False,
                                        "division": division.title()
                                    }
                                except (ValueError, TypeError):
                                    logger.warning(f"Invalid rank value for {fighter_name}: {rank}")
                                    return {
                                        "division_ranking": "unranked",
                                        "is_champion": False,
                                        "division": division.title()
                                    }

                
                # Otherwise, return the first (likely only) ranking
                if fighter_rankings:
                    division, rank = next(iter(fighter_rankings.items()))
                    if str(rank).upper() == "C":
                        return {
                            "division_ranking": "C",
                            "is_champion": True,
                            "division": division.title()
                        }
                    else:
                        try:
                            clean_rank = int(re.sub(r'[^0-9]', '', str(rank)))
                            return {
                                "division_ranking": f"#{clean_rank}",
                                "is_champion": False,
                                "division": division.title()
                            }
                        except:
                            logger.warning(f"Invalid rank format: {rank} for {fighter_name}")
                            return {
                                "division_ranking": "unranked",
                                "is_champion": False,
                                "division": division.title()
                            }

        
        # Try fuzzy matching as last resort
        for stored_name in rankings.keys():
            if self._names_similar(normalized_input, stored_name):
                fighter_rankings = rankings[stored_name]
                logger.info(f"Fuzzy match found: {fighter_name} -> {stored_name}")
                
                if fighter_rankings:
                    division, rank = next(iter(fighter_rankings.items()))
                    return {
                        "division_ranking": "Champion" if rank == 0 else f"#{rank}",
                        "is_champion": rank == 0,
                        "division": division.title()
                    }
        
        return {"division_ranking": "unranked", "is_champion": False}
    
    def _weight_class_match(self, weight_class: str, division: str) -> bool:
        """Check if weight class matches division"""
        weight_mappings = {
            'heavyweight': 'heavyweight',
            'light heavyweight': 'light heavyweight',
            'middleweight': 'middleweight', 
            'welterweight': 'welterweight',
            'lightweight': 'lightweight',
            'featherweight': 'featherweight',
            'bantamweight': 'bantamweight',
            'flyweight': 'flyweight',
            'strawweight': 'strawweight'
        }
        
        return weight_mappings.get(weight_class) == division
    
    def _names_similar(self, name1: str, name2: str) -> bool:
        """Check if two names are similar (basic fuzzy matching)"""
        if not name1 or not name2:
            return False
        
        # Split into words
        words1 = set(name1.split())
        words2 = set(name2.split())
        
        # Require exact match of at least first and last name
        if len(words1) >= 2 and len(words2) >= 2:
            intersection = words1.intersection(words2)
            # More strict: require at least 2 words to match exactly
            return len(intersection) >= 2
            
        return False
    
# Global rankings scraper
rankings_scraper = UFCRankingsScraper()

def _scrape_details(profile_url):
    """Scrape detailed fighter information from UFC profile"""
    try:
        res = session_manager.get(profile_url, timeout=15)
        if res.status_code != 200:
            logger.warning(f"Failed to load profile: {profile_url} (Status: {res.status_code})")
            return {}

        soup = BeautifulSoup(res.text, "html.parser")
        data = {}

        # Grab profile image
        image_el = soup.select_one("div.c-hero__image img")
        if image_el and image_el.get("src"):
            image_url = image_el["src"]
            fighter_slug = profile_url.rstrip('/').split('/')[-1]
            image_dir = os.path.join("static", "fighter_images")
            os.makedirs(image_dir, exist_ok=True)
            image_path = os.path.join(image_dir, f"{fighter_slug}.jpg")

            os.makedirs("images", exist_ok=True)
            success = download_image(image_url, image_path)
            if success:
                data["image_local_path"] = image_path
            data["image_url"] = image_url


        # Ranking extraction from profile page as backup
        ranking = "Unranked"
        ranking_tags = soup.select("p.hero-profile__tag")
        for tag in ranking_tags:
            text = tag.get_text(strip=True)
            if text.startswith("#") or "champion" in text.lower():
                ranking = text
                data["profile_ranking"] = ranking  # Store this for debugging
                break

        # Bio extraction - more robust
        bio_labels = soup.select("div.c-bio__label")
        bio_data = {}
        for label_el in bio_labels:
            label = label_el.get_text(strip=True)
            value_el = label_el.find_next_sibling("div")
            if value_el:
                value = value_el.get_text(strip=True)
                bio_data[label] = value

        # Enhanced bio extraction
        data.update({
            "height": bio_data.get("Height"),
            "weight": bio_data.get("Weight"), 
            "reach": bio_data.get("Reach"),
        })

        # Main stats with error handling
        stats = soup.select(".c-stat-3bar__value")
        if len(stats) >= 5:
            data.update({
                "strikes_landed_per_min": stats[0].text.strip(),
                "strikes_absorbed_per_min": stats[1].text.strip(), 
                "takedown_avg": stats[2].text.strip(),
                "submission_avg": stats[3].text.strip(),
                "striking_defense": stats[4].text.strip()
            })

        # Additional stats
        stat_blocks = soup.find_all("div", class_="c-stat-compare__number")
        if len(stat_blocks) >= 2:
            data.update({
                "knockdown_avg": stat_blocks[0].text.strip(),
                "avg_fight_time": stat_blocks[1].text.strip()
            })

        # Sig. strikes by target - enhanced
        target_group = soup.find("div", class_="c-body--athlete-body")
        if target_group:
            target_rows = target_group.select("div.c-stat-body__row")
            target_stats = {}
            for row in target_rows:
                label_el = row.select_one(".c-stat-body__label")
                value_el = row.select_one(".c-stat-body__value")
                if label_el and value_el:
                    target_stats[label_el.text.strip().lower()] = value_el.text.strip()
            
            if target_stats:
                data["sig_strikes_by_target"] = target_stats

        # Fight history summary
        record_element = soup.select_one(".c-hero__headline-suffix")
        if record_element:
            data["record"] = record_element.get_text(strip=True)

        return data
        
    except Exception as e:
        logger.error(f"Error scraping {profile_url}: {e}")
        return {}

@lru_cache(maxsize=1000)
def scrape_details(profile_url):
    """Public interface - uses caching"""
    return _scrape_details(profile_url)
    
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

    # Get profile URL - handle both possible keys
    profile_url = fighter.get("profile_url_ufc") or fighter.get("profile_url")
    if not profile_url:
        logger.warning(f"No profile URL for {fighter_name}")
        return None

    # Scrape detailed profile information
    details = scrape_details(profile_url)
    if not details:
        logger.warning(f"Failed to scrape profile details for {fighter_name}")
        return None

    # Get rankings information
    weight_class = fighter.get('weight_class') or fighter.get('division')
    ranking_info = rankings_scraper.get_fighter_ranking(fighter_name, weight_class)
    
    # Create enriched fighter data
    enriched_fighter = fighter.copy()
    enriched_fighter.update(details)
    enriched_fighter.update(ranking_info)
    
    # Add scraping metadata
    enriched_fighter["last_updated"] = time.time()
    
    logger.info(f"✅ Successfully enriched: {fighter_name} (Ranking: {ranking_info.get('division_ranking', 'unranked')})")
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
    logger.info("📊 Also scraping UFC rankings data...")
    
    # Pre-load rankings to cache them
    rankings_scraper.get_rankings()
    
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
        
        # Save failed fighters for manual review
        failures_file = "data/errors/ufc_details_failures.json"
        os.makedirs(os.path.dirname(failures_file), exist_ok=True)
        
        failed_data = {
            "timestamp": time.time(),
            "total_failures": len(failed_fighters),
            "failed_fighters": [
                {
                    "name": fighter.get('name', 'Unknown'),
                    "id": fighter.get('id', 'Unknown'),
                    "profile_url": fighter.get('profile_url_ufc') or fighter.get('profile_url', 'Unknown')
                }
                for _, _, fighter in failed_fighters
            ]
        }
        
        with open(failures_file, "w", encoding="utf-8") as f:
            json.dump(failed_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"💾 Failed fighters report saved to {failures_file}")

    # Count ranked vs unranked fighters
    ranked_count = sum(1 for f in enriched if f.get('division_ranking', 'unranked') != 'unranked')
    logger.info(f"🏆 Rankings summary: {ranked_count} ranked, {success_count - ranked_count} unranked fighters")
    logger.info(f"✅ File saved at: {os.path.abspath(output_file)}")
    logger.info(f"📁 Final data saved to {output_file}")

def enrich_roster_sequential(input_file="data/ufc_fighters_raw.json", output_file="data/ufc_details.json"):
    """Sequential version for debugging or when concurrent processing causes issues"""
    logger.info("🐌 Running in sequential mode...")
    
    with open(input_file, "r", encoding="utf-8") as f:
        roster = json.load(f)

    active_fighters = [f for f in roster if f.get("status", "").lower() == "active"]
    total = len(active_fighters)
    enriched = []

    # Pre-load rankings
    rankings_scraper.get_rankings()

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

def debug_rankings_for_fighter(fighter_name):
    """Debug function to test ranking detection for a specific fighter"""
    logger.info(f"=== DEBUG: Testing rankings for {fighter_name} ===")
    
    scraper = UFCRankingsScraper()
    rankings = scraper.get_rankings()
    
    normalized_name = scraper.normalize_fighter_name(fighter_name)
    logger.info(f"Normalized name: '{normalized_name}'")
    
    # Show all possible matches
    matches = []
    for stored_name in rankings.keys():
        if normalized_name in stored_name or stored_name in normalized_name:
            matches.append((stored_name, rankings[stored_name]))
    
    logger.info(f"Potential matches found: {len(matches)}")
    for name, divisions in matches:
        logger.info(f"  '{name}' -> {divisions}")
    
    # Test the actual function
    result = scraper.get_fighter_ranking(fighter_name)
    logger.info(f"Final result: {result}")
    
    return result

if __name__ == "__main__":
    import sys
    
    # Check for debug mode
    if "--debug" in sys.argv:
        if len(sys.argv) > 2:
            debug_fighter = sys.argv[2]
            debug_rankings_for_fighter(debug_fighter)
        else:
            debug_rankings_for_fighter("ISRAEL ADESANYA")
        sys.exit(0)
    
    # Parse command line arguments
    sequential_mode = "--sequential" in sys.argv
    max_workers = 4
    
    # Check for custom worker count
    for arg in sys.argv:
        if arg.startswith("--workers="):
            try:
                max_workers = int(arg.split("=")[1])
                max_workers = max(1, min(max_workers, 10))  # Limit between 1-10
            except ValueError:
                logger.warning("Invalid worker count, using default (4)")
    
    if sequential_mode:
        enrich_roster_sequential()  
    else:
        logger.info(f"🚀 Running in concurrent mode with {max_workers} workers...")
        enrich_roster(max_workers=max_workers)