#!/usr/bin/env python3
"""
Quick status checker for UFC data pipeline
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

def check_file_status(filepath: Path) -> dict:
    """Check file existence, size, and freshness"""
    if not filepath.exists():
        return {"exists": False, "size": 0, "age": None, "records": 0}
    
    stat = filepath.stat()
    age = datetime.now() - datetime.fromtimestamp(stat.st_mtime)
    
    records = 0
    if filepath.suffix == '.json':
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    records = len(data)
                elif isinstance(data, dict):
                    # Handle special cases for different file structures
                    if 'fighters' in data:  # Some files might be wrapped
                        records = len(data['fighters'])
                    else:
                        records = 1
                else:
                    records = 1
        except Exception as e:
            print(f"  ⚠️ Error reading {filepath.name}: {e}")
            records = -1  # Indicate parsing error
    
    return {
        "exists": True,
        "size": stat.st_size,
        "age": age,
        "records": records
    }

def main():
    base_path = Path(__file__).parent
    
    # Try multiple possible data directory locations
    possible_data_paths = [
        base_path / "data",                    # If status.py is in scrapers/
        base_path / "scrapers" / "data",       # If status.py is in root/
        base_path.parent / "scrapers" / "data" # If status.py is in subfolder
    ]
    
    data_path = None
    for path in possible_data_paths:
        if path.exists():
            data_path = path
            break
    
    if not data_path:
        print("❌ Could not find data directory in any of these locations:")
        for path in possible_data_paths:
            print(f"   - {path}")
        print("\nPlease ensure your data files are in one of these locations.")
        return
    
    errors_path = data_path / "errors"
    
    print("🥊 UFC Pipeline Status Report")
    print("=" * 60)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Data directory: {data_path}")
    print()
    
    # Core data files
    core_files = {
        "UFC Fighters Raw": "ufc_fighters_raw.json",
        "UFC Details": "ufc_details.json", 
        "Sherdog Data": "sherdog_fighters.json",
        "Rankings": "ufc_rankings.json",
        "Upcoming Fights": "upcoming_fights.json",
        "Merged Fighters": "fighters.json",
        "Fight History": "fight_history.json"
    }
    
    print("📁 CORE DATA FILES")
    print("-" * 40)
    for name, filename in core_files.items():
        status = check_file_status(data_path / filename)
        
        if status["exists"]:
            age_str = f"{status['age'].days}d {status['age'].seconds//3600}h ago"
            size_mb = status["size"] / (1024*1024)
            print(f"✅ {name:<20} {status['records']:>6} records, {size_mb:.1f}MB, {age_str}")
        else:
            print(f"❌ {name:<20} Missing")
    
    print()
    
    # Error files
    error_files = {}
    if errors_path.exists():
        for error_file in errors_path.glob("*.json"):
            try:
                with open(error_file, 'r') as f:
                    data = json.load(f)
                    error_files[error_file.stem] = len(data)
            except:
                error_files[error_file.stem] = 0
    
    if error_files:
        print("⚠️ ERROR FILES")
        print("-" * 40)
        for error_type, count in error_files.items():
            if count > 0:
                print(f"❌ {error_type:<25} {count:>3} errors")
            else:
                print(f"✅ {error_type:<25} No errors")
    else:
        print("✅ NO ERROR FILES (Clean state)")
    
    print()
    
    # Recommendations
    print("💡 RECOMMENDATIONS")
    print("-" * 40)
    
    # Check for stale data
    stale_threshold = timedelta(days=7)
    for name, filename in core_files.items():
        status = check_file_status(data_path / filename)
        if status["exists"] and status["age"] > stale_threshold:
            print(f"📅 {name} is {status['age'].days} days old - consider updating")
    
    # Check for errors
    if any(count > 0 for count in error_files.values()):
        print("🔄 Run error retries to resolve failed items")
    
    # Check for missing files
    missing = [name for name, filename in core_files.items() 
              if not check_file_status(data_path / filename)["exists"]]
    if missing:
        print(f"📋 Missing files: {', '.join(missing)} - run full refresh")
    
    if not missing and not any(count > 0 for count in error_files.values()):
        print("✨ All systems green! Consider weekly update mode.")

if __name__ == "__main__":
    main()