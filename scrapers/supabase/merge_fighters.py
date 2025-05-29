import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
import re
import unicodedata


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
    return name.strip().upper()

def build_sherdog_lookup(sherdog_data: List[Dict]) -> Dict[str, Dict]:
    """Build lookup dictionary from Sherdog data."""
    lookup = {}
    duplicates = []
    
    for fighter in sherdog_data:
        name = fighter.get("name", "").strip()
        if not name:
            continue
            
        key = normalize_name(name)
        if key in lookup:
            duplicates.append(name)
        else:
            lookup[key] = fighter
    
    if duplicates:
        print(f"⚠️ Warning: Found {len(duplicates)} duplicate names in Sherdog data")
    
    return lookup

def create_name_fixes_lookup(name_fixes: Dict[str, str]) -> Dict[str, str]:
    """Create normalized name fixes lookup (UFC → Sherdog)."""
    return {normalize_name(k): normalize_name(v) for k, v in name_fixes.items()}

def merge_fighter_data(ufc_fighter: Dict, sherdog_fighter: Dict) -> Dict:
    """Merge UFC and Sherdog fighter data."""
    summary = sherdog_fighter
    
    # Start with UFC data as base
    merged = ufc_fighter.copy()
    
    # Add Sherdog data (only if not already present or empty)
    sherdog_fields = {
        "nickname": sherdog_fighter.get("nickname"),
        "profile_url_sherdog": sherdog_fighter.get("profile_url_sherdog"),
        "country": sherdog_fighter.get("country"),
        "age": sherdog_fighter.get("age"),
        "weight_class": sherdog_fighter.get("weight_class"),
        "wins_total": sherdog_fighter.get("wins_total"),
        "losses_total": sherdog_fighter.get("losses_total"),
        "wins_ko": sherdog_fighter.get("wins_ko"),
        "wins_sub": sherdog_fighter.get("wins_sub"),
        "wins_dec": sherdog_fighter.get("wins_dec"),
        "losses_ko": sherdog_fighter.get("losses_ko"),
        "losses_sub": sherdog_fighter.get("losses_sub"),
        "losses_dec": sherdog_fighter.get("losses_dec"),
        "fight_history": sherdog_fighter.get("fight_history", []),
    }

    # Only add non-None values
    for key, value in sherdog_fields.items():
        if value is not None:
            merged[key] = value
    
    return merged

def find_sherdog_match(ufc_name: str, sherdog_lookup: Dict, name_fixes: Dict) -> Optional[Dict]:
    """Find matching Sherdog fighter using various strategies."""
    normalized_name = normalize_name(ufc_name)
    
    # Strategy 1: Direct match
    if normalized_name in sherdog_lookup:
        return sherdog_lookup[normalized_name]
    
    # Strategy 2: Use name fixes
    if normalized_name in name_fixes:
        fixed_name = name_fixes[normalized_name]
        if fixed_name in sherdog_lookup:
            return sherdog_lookup[fixed_name]
    
    # Strategy 3: Fuzzy matching (basic - remove common prefixes/suffixes)
    # Remove common MMA name variations
    variations = [
        normalized_name.replace("JR.", "").replace("SR.", "").strip(),
        normalized_name.replace("'", "").replace("-", " ").strip(),
        " ".join(normalized_name.split()),  # Normalize whitespace
    ]
    
    for variation in variations:
        if variation in sherdog_lookup and variation != normalized_name:
            print(f"📝 Fuzzy match found: '{ufc_name}' → '{variation}'")
            return sherdog_lookup[variation]
    
    return None

def write_unmatched_report(unmatched: List[str], filepath: str) -> None:
    """Write unmatched fighters report."""
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"Unmatched UFC fighters (not found in Sherdog)\n")
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

def main():
    """Main execution function."""
    print("🥊 Starting fighter data merge...")
    
    # Load data files
    print("📂 Loading data files...")
    ufc_data = load_json_file("../data/ufc_details.json")
    sherdog_data = load_json_file("../data/sherdog_fighters.json")
    
    # Load name fixes
    sys.path.append("../utils")
    try:
        from name_fixes import NAME_FIXES
    except ImportError:
        print("⚠️ Warning: Could not import NAME_FIXES, using empty dict")
        NAME_FIXES = {}
    
    print(f"📊 Loaded {len(ufc_data)} UFC fighters, {len(sherdog_data)} Sherdog fighters")
    
    # Build lookups
    print("🔍 Building lookup tables...")
    sherdog_lookup = build_sherdog_lookup(sherdog_data)
    name_fixes = create_name_fixes_lookup(NAME_FIXES)
    
    # Merge data
    print("🔄 Merging fighter data...")
    merged_fighters = []
    unmatched = []
    
    for ufc_fighter in ufc_data:
        ufc_name = ufc_fighter.get("name", "").strip()
        if not ufc_name:
            print(f"⚠️ Warning: UFC fighter with empty name: {ufc_fighter}")
            continue
        
        sherdog_fighter = find_sherdog_match(ufc_name, sherdog_lookup, name_fixes)
        
        if sherdog_fighter:
            merged = merge_fighter_data(ufc_fighter, sherdog_fighter)
            merged["name"] = create_normalized_name(merged["name"])
            merged_fighters.append(merged)
        else:
            unmatched.append(ufc_name)
    
    # Save results
    print("💾 Saving results...")
    save_merged_data(merged_fighters, "../data/fighters.json")
    
    # Generate reports
    print("\n📈 Results Summary:")
    print(f"✅ Successfully merged: {len(merged_fighters)} fighters")
    print(f"❌ Unmatched: {len(unmatched)} fighters")
    
    if unmatched:
        errors_path = "../data/errors/unmatched_fighters.txt"
        write_unmatched_report(unmatched, errors_path)
        print(f"📄 Unmatched fighters report: {errors_path}")
        
        # Show worst offenders
        if len(unmatched) <= 10:
            print(f"\n❌ Unmatched fighters: {', '.join(unmatched)}")
    else:
        print("🎉 All UFC fighters matched successfully!")
    
    match_rate = (len(merged_fighters) / len(ufc_data)) * 100 if ufc_data else 0
    print(f"📊 Match rate: {match_rate:.1f}%")

if __name__ == "__main__":
    main()