import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
import re
import unicodedata
from datetime import datetime

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
UTILS_DIR = Path(__file__).resolve().parent.parent / "utils"


def create_normalized_name(name: str) -> str:
    """Standardize name for display or indexing without stripping accents or identity."""
    name = name.strip()
    name = re.sub(r"\s+", " ", name)
    name = unicodedata.normalize("NFC", name)  # keep accents, normalize encoding

    tokens = re.split(r"([\s\-'])", name)
    return "".join(token.capitalize() if token.isalpha() else token for token in tokens)


def load_json_file(filepath: str) -> Any:
    """Load JSON file with error handling."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File not found - {filepath}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON in {filepath} - {e}")
        sys.exit(1)

def normalize_name(name: str) -> str:
    """Normalize fighter name for consistent matching."""
    if not name:
        return ""
    # Remove extra whitespace and normalize case
    name = " ".join(name.strip().split()).upper()
    # Remove common variations that cause mismatches
    name = name.replace("'", "").replace("-", " ").replace(".", "")
    return name

def build_tapology_lookup(tapology_data: List[Dict]) -> tuple[Dict[str, Dict], Dict[str, Dict]]:
    """Build lookup dictionaries from Tapology data - by ID and by name."""
    id_lookup = {}
    name_lookup = {}
    duplicates = []
    
    for fighter in tapology_data:
        fighter_id = fighter.get("id")
        name = fighter.get("name", "").strip()
        
        # Build ID-based lookup (primary)
        if fighter_id:
            id_lookup[fighter_id] = fighter
        
        # Build name-based lookup (fallback)
        if name:
            key = normalize_name(name)
            if key in name_lookup:
                duplicates.append(name)
            else:
                name_lookup[key] = fighter
    
    if duplicates:
        print(f"⚠️ Warning: Found {len(duplicates)} duplicate names in Tapology data")
    
    return id_lookup, name_lookup

def create_name_fixes_lookup(name_fixes: Dict[str, str]) -> Dict[str, str]:
    """Create normalized name fixes lookup (UFC → Tapology)."""
    lookup = {}
    for ufc_name, tapology_name in name_fixes.items():
        # Normalize the UFC name (key)
        normalized_ufc = normalize_name(ufc_name)
        # Normalize the Tapology name (value)
        normalized_tapology = normalize_name(tapology_name)
        lookup[normalized_ufc] = normalized_tapology

        # Also add variations of the UFC name
        ufc_variations = [
            ufc_name.strip().upper(),  # Original case handling
            ufc_name.replace("'", "").replace("-", " ").strip().upper(),
            " ".join(ufc_name.strip().split()).upper()
        ]
        for variation in ufc_variations:
            if variation and variation != normalized_ufc:
                lookup[normalize_name(variation)] = normalized_tapology

    return lookup

def clean_measurement_field(value: str) -> str:
    """Clean height and reach fields to remove escaped quotes"""
    if not value or not isinstance(value, str):
        return value
    
    # Remove escaped quotes and normalize
    cleaned = value.replace('\\"', '"').replace('&quot;', '"')
    return cleaned

def merge_fighter_data(ufc_fighter: Dict, tapology_fighter: Dict) -> Dict:
    """Merge UFC and Tapology fighter data."""
    
    # Start with UFC data as base
    merged = ufc_fighter.copy()
    
    # Add Tapology data (only if not already present or empty)
    tapology_fields = {
        "nickname": tapology_fighter.get("nickname"),
        "profile_url_tapology": tapology_fighter.get("profile_url_tapology"),
        "country": tapology_fighter.get("country"),
        "age": tapology_fighter.get("age"),
        "weight_class": tapology_fighter.get("weight_class"),
        "height": clean_measurement_field(tapology_fighter.get("height")),
        "reach": clean_measurement_field(tapology_fighter.get("reach")),
        "wins_total": tapology_fighter.get("wins_total"),
        "losses_total": tapology_fighter.get("losses_total"),
        "draws_total": tapology_fighter.get("draws_total"),
        "ufc_wins_total": tapology_fighter.get("ufc_wins_total"),
        "ufc_losses_total": tapology_fighter.get("ufc_losses_total"),
        "ufc_draws_total": tapology_fighter.get("ufc_draws_total"),
        "ufc_wins_ko": tapology_fighter.get("ufc_wins_ko"),
        "ufc_wins_sub": tapology_fighter.get("ufc_wins_sub"),
        "ufc_wins_dec": tapology_fighter.get("ufc_wins_dec"),
        "ufc_losses_ko": tapology_fighter.get("ufc_losses_ko"),
        "ufc_losses_sub": tapology_fighter.get("ufc_losses_sub"),
        "ufc_losses_dec": tapology_fighter.get("ufc_losses_dec"),
        "fight_history": tapology_fighter.get("fight_history", []),
    }

    # Only add non-None values
    for key, value in tapology_fields.items():
        if value is not None:
            merged[key] = value
    
    return merged

def find_tapology_match(ufc_fighter: Dict, tapology_id_lookup: Dict, tapology_name_lookup: Dict, name_fixes: Dict) -> Optional[Dict]:
    """Find matching Tapology fighter using ID first, then name-based strategies."""
    fighter_id = ufc_fighter.get("id")
    ufc_name = ufc_fighter.get("name", "")
    
    # Strategy 1: Match by ID (primary method)
    if fighter_id and fighter_id in tapology_id_lookup:
        return tapology_id_lookup[fighter_id]
    
    # Strategy 2: Fallback to name-based matching
    if not ufc_name:
        return None
        
    normalized_name = normalize_name(ufc_name)
    
    # Strategy 2a: Direct name match
    if normalized_name in tapology_name_lookup:
        print(f"📝 Name match found: '{ufc_name}' (ID match failed)")
        return tapology_name_lookup[normalized_name]
    
    # Strategy 2b: Use name fixes - try the fixed name in tapology lookup
    if normalized_name in name_fixes:
        fixed_name = name_fixes[normalized_name]
        if fixed_name in tapology_name_lookup:
            print(f"📝 Name fix match found: '{ufc_name}' → '{fixed_name}' (ID match failed)")
            return tapology_name_lookup[fixed_name]
        # Also try variations of the fixed name
        fixed_variations = [
            fixed_name.replace("JR.", "").replace("SR.", "").strip(),
            fixed_name.replace("'", "").replace("-", " ").strip(),
            " ".join(fixed_name.split())
        ]
        for variation in fixed_variations:
            if variation in tapology_name_lookup and variation != fixed_name:
                print(f"📝 Name fix variation match found: '{ufc_name}' → '{variation}' (ID match failed)")
                return tapology_name_lookup[variation]
    
    # Strategy 2c: Fuzzy matching - try common name variations
    variations = [
        normalized_name.replace("JR", "").replace("SR", "").strip(),
        normalized_name.replace("JR.", "").replace("SR.", "").strip(), 
        normalized_name.replace("'", "").replace("-", "").strip(),
        normalized_name.replace(".", "").strip(),
        " ".join(normalized_name.split()),  # Normalize whitespace
    ]
    
    # Remove empty variations and duplicates
    variations = list(set([v for v in variations if v and v != normalized_name]))
    
    for variation in variations:
        if variation in tapology_name_lookup:
            print(f"📝 Fuzzy match found: '{ufc_name}' → '{variation}' (ID match failed)")
            return tapology_name_lookup[variation]
    
    # Strategy 2d: Try partial matching (last resort)
    ufc_parts = normalized_name.split()
    if len(ufc_parts) >= 2:
        # Try just first and last name
        partial_name = f"{ufc_parts[0]} {ufc_parts[-1]}"
        if partial_name in tapology_name_lookup and partial_name != normalized_name:
            print(f"📝 Partial match found: '{ufc_name}' → '{partial_name}' (ID match failed)")
            return tapology_name_lookup[partial_name]
    
    return None

def write_unmatched_report(unmatched: List[str], filepath: str) -> None:
    """Write unmatched fighters report."""
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"Unmatched UFC fighters (not found in Tapology)\n")
        f.write(f"Generated: {Path(__file__).name}\n")
        f.write(f"Total unmatched: {len(unmatched)}\n\n")
        
        for i, name in enumerate(sorted(unmatched), 1):
            f.write(f"{i:3d}. {name}\n")

def save_merged_data(data: List[Dict], filepath: str) -> None:
    """Save merged data to JSON file."""
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"❌ Error saving to {filepath}: {e}")
        sys.exit(1)

def extract_fight_history(fighters: List[Dict], output_path: str) -> None:
    """Extract flat fight history from merged fighters data."""
    print("🥊 Extracting fight history...")
    
    # Helper to validate date formats
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
    
    def parse_fight_date(raw_date: str) -> Optional[str]:
        """Parse fight date with multiple format support and validation"""
        if not is_valid_date_format(raw_date):
            return None
            
        try:
            # Method 1: Tapology format "2025-Feb 1" or "2025-Feb 15"
            if "-" in raw_date and len(raw_date.split("-")) == 2:
                parts = raw_date.split("-", 1)
                year_part = parts[0].strip()
                month_day_part = parts[1].strip()
                
                # Validate year is actually a year
                if not year_part.isdigit() or len(year_part) != 4:
                    return None
                    
                # Convert to parseable format
                date_str = f"{month_day_part} {year_part}"
                parsed_date = datetime.strptime(date_str, "%b %d %Y")
                return parsed_date.date().isoformat()
                
            # Method 2: Standard format "MM/DD/YYYY"
            elif "/" in raw_date:
                parsed_date = datetime.strptime(raw_date, "%m/%d/%Y")
                return parsed_date.date().isoformat()
                
            # Method 3: ISO format "YYYY-MM-DD"
            elif raw_date.count("-") == 2 and len(raw_date) == 10:
                # Validate it's actually ISO format
                datetime.strptime(raw_date, "%Y-%m-%d")
                return raw_date
                
            # Method 4: Year only "2024" -> use Jan 1st as placeholder
            elif raw_date.isdigit() and len(raw_date) == 4:
                year = int(raw_date)
                if 1900 <= year <= 2030:  # Reasonable year range
                    return f"{year}-01-01"
                    
        except ValueError:
            pass  # Fall through to return None
            
        return None

    # Extract only relevant fight history entries
    flat_fight_history = []
    skipped_invalid_dates = 0
    total_fights_processed = 0

    for fighter in fighters:
        fighter_id = fighter.get("id")
        for fight in fighter.get("fight_history", []):
            total_fights_processed += 1
            try:
                opponent_name = fight.get("opponent", "").strip()
                
                # Skip fights without opponent
                if not opponent_name:
                    continue

                # Parse fight date with improved validation
                raw_date = fight.get("fight_date")
                fight_date = None
                
                if raw_date:
                    fight_date = parse_fight_date(raw_date)
                    if not fight_date:
                        skipped_invalid_dates += 1
                        # Don't skip - keep the fight but with null date
                        fight_date = None

                # Create fight history entry with all Tapology fields
                fight_entry = {
                    "fighter_id": fighter_id,
                    "opponent": opponent_name,
                    "result": fight.get("result"),
                    "method": fight.get("method"),
                    "round": fight.get("round"),
                    "time": fight.get("time"),
                    "fight_date": fight_date
                }
                
                # Add additional Tapology fields if present
                optional_fields = ["method_detail", "event", "promotion", "betting_odds", 
                                 "betting_status", "pick_percentage", "weight_class"]
                for field in optional_fields:
                    if fight.get(field):
                        fight_entry[field] = fight.get(field)
                
                flat_fight_history.append(fight_entry)

            except Exception as e:
                print(f"⚠️ Error processing fight for {fighter.get('name', 'UNKNOWN')}: {e}")
                continue

    # Save clean flat fight history
    save_merged_data(flat_fight_history, output_path)
    
    # Summary
    print(f"✅ Saved flat fight history to {output_path} with {len(flat_fight_history)} entries")
    if skipped_invalid_dates > 0:
        print(f"⚠️ Skipped {skipped_invalid_dates} fights with invalid dates out of {total_fights_processed} total")

               

def main():
    """Main execution function."""
    print("🥊 Starting fighter data merge...")
    
    # Load data files
    print("📂 Loading data files...")
    ufc_data = load_json_file(DATA_DIR / "ufc_details.json")
    tapology_data = load_json_file(DATA_DIR / "tapology_fighters.json")


    # Load name fixes
    sys.path.append(str(UTILS_DIR))
    try:
        from name_fixes import NAME_FIXES
    except ImportError:
        print("⚠️ Warning: Could not import NAME_FIXES, using empty dict")
        NAME_FIXES = {}
    
    print(f"📊 Loaded {len(ufc_data)} UFC fighters, {len(tapology_data)} Tapology fighters")
    
    # Build lookups
    print("🔍 Building lookup tables...")
    tapology_id_lookup, tapology_name_lookup = build_tapology_lookup(tapology_data)
    name_fixes = create_name_fixes_lookup(NAME_FIXES)

    # Start with a clean slate – don't use existing data
    existing_lookup = {}
    
    # Merge data
    print("🔄 Merging fighter data...")
    merged_fighters = []
    unmatched = []
    
    mismatched_uuids = []
    for ufc_fighter in ufc_data:

        ufc_name = ufc_fighter.get("name", "").strip()
        if not ufc_name:
            print(f"⚠️ Warning: UFC fighter with empty name: {ufc_fighter}")
            continue
        
        tapology_fighter = find_tapology_match(ufc_fighter, tapology_id_lookup, tapology_name_lookup, name_fixes)
        
        merged = ufc_fighter.copy()
        merged["name"] = create_normalized_name(merged.get("name", ""))

        if tapology_fighter:
            merged = merge_fighter_data(merged, tapology_fighter)

            # UUID mismatch check
            if merged.get("id") and tapology_fighter.get("id") and merged["id"] != tapology_fighter["id"]:
                merged["uuid_mismatch"] = {
                    "ufc_id": merged["id"],
                    "tapology_id": tapology_fighter["id"]
                }
                mismatched_uuids.append({
                    "name": merged["name"],
                    "ufc_id": merged["id"],
                    "tapology_id": tapology_fighter["id"]
                })

        else:
            unmatched.append(ufc_name)
            # Still keep UFC-only fighter in merged output
            # No-op here — handled outside the conditional block
            pass


        # Rankings no longer added to fighter data
        # Move fight history to the end if present
        if "fight_history" in merged:
            fight_history = merged.pop("fight_history")
            merged["fight_history"] = fight_history


        existing_lookup[merged["id"]] = merged
        merged_fighters.append(merged)

   
    # Save results
    # Save UUID mismatches
    if mismatched_uuids:
        mismatch_path = DATA_DIR / "errors" / "uuid_mismatches.json"
        save_merged_data(mismatched_uuids, mismatch_path)
        print(f"📄 UUID mismatches report: {mismatch_path}")

    print("💾 Saving results...")
    save_merged_data(list(existing_lookup.values()), DATA_DIR / "fighters.json")

    
    # Generate reports
    print("\n📈 Results Summary:")
    print(f"✅ Successfully merged: {len(merged_fighters)} fighters")
    print(f"❌ Unmatched: {len(unmatched)} fighters")
    
    if unmatched:
        errors_path = DATA_DIR / "errors" / "unmatched_fighters.txt"
        write_unmatched_report(unmatched, errors_path)
        print(f"📄 Unmatched fighters report: {errors_path}")
        
        # Show worst offenders
        if len(unmatched) <= 10:
            print(f"\n❌ Unmatched fighters: {', '.join(unmatched)}")
    else:
        print("🎉 All UFC fighters matched successfully!")
    
    matched_count = len(ufc_data) - len(unmatched)
    match_rate = (matched_count / len(ufc_data)) * 100 if ufc_data else 0

    print(f"📊 Match rate: {match_rate:.1f}%")
    
    # Automatically extract fight history
    print("\n" + "="*50)
    extract_fight_history(list(existing_lookup.values()), DATA_DIR / "fight_history.json")


if __name__ == "__main__":
    main()