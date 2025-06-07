# config.py
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class Paths:
    """Centralized path configuration"""
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / "data"
    ERRORS_DIR = DATA_DIR / "errors"
    
    # Data files
    UFC_FIGHTERS_RAW = DATA_DIR / "ufc_fighters_raw.json"
    UFC_DETAILS = DATA_DIR / "ufc_details.json"
    SHERDOG_FIGHTERS = DATA_DIR / "sherdog_fighters.json"
    UFC_RANKINGS = DATA_DIR / "ufc_rankings.json"
    UPCOMING_FIGHTS = DATA_DIR / "upcoming_fights.json"
    FIGHTERS_MERGED = DATA_DIR / "fighters.json"
    FIGHT_HISTORY = DATA_DIR / "fight_history.json"
    
    # Error files
    DETAILS_ERRORS = ERRORS_DIR / "details_errors.json"
    SHERDOG_FAILURES = ERRORS_DIR / "sherdog_failures.json"
    RANKINGS_ERRORS = ERRORS_DIR / "rankings_errors.json"
    UPCOMING_ERRORS = ERRORS_DIR / "upcoming_errors.json"

@dataclass
class ScrapingConfig:
    """Scraping configuration"""
    MAX_WORKERS: int = 4
    BATCH_SIZE: int = 500
    REQUEST_DELAY: float = 1.0
    TIMEOUT: int = 30
    MAX_RETRIES: int = 3

@dataclass
class DatabaseConfig:
    """Database configuration"""
    BATCH_SIZE: int = 500
    TIMEOUT: int = 300

# Usage in your scripts:
# from config import Paths, ScrapingConfig
# 
# with open(Paths.UFC_FIGHTERS_RAW, 'r') as f:
#     data = json.load(f)