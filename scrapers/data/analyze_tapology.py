#!/usr/bin/env python3
"""
Analyze fight dates in tapology_fighters.json to find problematic date formats
"""

import json
from datetime import datetime
from collections import Counter

def is_valid_date_format(date_str: str) -> bool:
    """Check if date string is in a valid format"""
    if not date_str or not isinstance(date_str, str):
        return False
    
    # Skip obviously invalid date patterns
    invalid_patterns = [
        'basic', 'professional bouts', 'amateur bouts', 'subscription',
        'tier', 'premium', 'advanced', 'standard'
    ]
    
    date_lower = date_str.lower().strip()
    if any(pattern in date_lower for pattern in invalid_patterns):
        return False
    
    # Must contain at least one digit for year
    if not any(char.isdigit() for char in date_str):
        return False
        
    # Must be reasonable length (not too short or too long)
    if len(date_str.strip()) < 4 or len(date_str.strip()) > 20:
        return False
        
    return True

def can_parse_date(raw_date: str) -> tuple[bool, str]:
    """Try to parse date and return success status and error reason"""
    if not is_valid_date_format(raw_date):
        return False, "Invalid format"
        
    try:
        # Method 1: Tapology format "2025-Feb 1" or "2025-Feb 15"
        if "-" in raw_date and len(raw_date.split("-")) == 2:
            parts = raw_date.split("-", 1)
            year_part = parts[0].strip()
            month_day_part = parts[1].strip()
            
            # Validate year is actually a year
            if not year_part.isdigit() or len(year_part) != 4:
                return False, f"Invalid year: {year_part}"
                
            # Convert to parseable format
            date_str = f"{month_day_part} {year_part}"
            datetime.strptime(date_str, "%b %d %Y")
            return True, "Tapology format OK"
            
        # Method 2: Standard format "MM/DD/YYYY"
        elif "/" in raw_date:
            datetime.strptime(raw_date, "%m/%d/%Y")
            return True, "MM/DD/YYYY format OK"
            
        # Method 3: ISO format "YYYY-MM-DD"
        elif raw_date.count("-") == 2 and len(raw_date) == 10:
            datetime.strptime(raw_date, "%Y-%m-%d")
            return True, "ISO format OK"
            
        # Method 4: Year only "2024"
        elif raw_date.isdigit() and len(raw_date) == 4:
            year = int(raw_date)
            if 1900 <= year <= 2030:
                return True, "Year only OK"
            else:
                return False, f"Year out of range: {year}"
                
        return False, "Unknown format"
        
    except ValueError as e:
        return False, f"Parsing error: {e}"

def main():
    print("🔍 Analyzing fight dates in tapology_fighters.json...")
    
    # Load tapology data
    try:
        with open("tapology_fighters.json", "r", encoding="utf-8") as f:
            tapology_data = json.load(f)
        print(f"📊 Loaded {len(tapology_data)} fighters")
    except FileNotFoundError:
        print("❌ tapology_fighters.json not found")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        return
    
    # Analyze all fight dates
    total_fights = 0
    valid_dates = 0
    invalid_dates = []
    error_reasons = Counter()
    
    for fighter in tapology_data:
        fighter_name = fighter.get("name", "Unknown")
        fight_history = fighter.get("fight_history", [])
        
        for fight in fight_history:
            total_fights += 1
            opponent = fight.get("opponent", "Unknown")
            fight_date = fight.get("fight_date")
            
            if not fight_date:
                continue  # Skip empty dates
            
            can_parse, reason = can_parse_date(fight_date)
            
            if can_parse:
                valid_dates += 1
            else:
                invalid_dates.append({
                    "fighter": fighter_name,
                    "opponent": opponent,
                    "date": fight_date,
                    "reason": reason
                })
                error_reasons[reason] += 1
    
    # Summary
    print(f"\n📊 ANALYSIS RESULTS")
    print("=" * 50)
    print(f"Total fights: {total_fights}")
    print(f"Valid dates: {valid_dates}")
    print(f"Invalid dates: {len(invalid_dates)}")
    print(f"Success rate: {(valid_dates/total_fights*100):.1f}%")
    
    # Show error breakdown
    if error_reasons:
        print(f"\n❌ ERROR BREAKDOWN:")
        for reason, count in error_reasons.most_common():
            print(f"  {reason}: {count}")
    
    # Show some examples of invalid dates
    if invalid_dates:
        print(f"\n🔍 EXAMPLES OF INVALID DATES (showing first 20):")
        for i, error in enumerate(invalid_dates[:20]):
            print(f"  {i+1:2d}. '{error['date']}' - {error['fighter']} vs {error['opponent']} ({error['reason']})")
        
        if len(invalid_dates) > 20:
            print(f"     ... and {len(invalid_dates) - 20} more")
    
    # Group by unique invalid date values
    unique_invalid_dates = Counter([error['date'] for error in invalid_dates])
    if unique_invalid_dates:
        print(f"\n📋 MOST COMMON INVALID DATE VALUES:")
        for date_val, count in unique_invalid_dates.most_common(15):
            print(f"  '{date_val}' - appears {count} times")
    
    # Save detailed report if requested
    save_report = input(f"\nSave detailed report to invalid_dates_report.json? (y/N): ").lower().startswith('y')
    if save_report:
        with open("invalid_dates_report.json", "w", encoding="utf-8") as f:
            json.dump(invalid_dates, f, indent=2, ensure_ascii=False)
        print(f"📄 Detailed report saved to invalid_dates_report.json")

if __name__ == "__main__":
    main()