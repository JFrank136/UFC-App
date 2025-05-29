import json
import sys
import os
import unicodedata

# Add utils folder to import path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'utils')))
from name_fixes import TAPOLOGY_FIXES

# Load data
with open("../data/fighters.json", "r", encoding="utf-8") as f:
    fighters = json.load(f)

with open("../data/upcoming_fights_raw.json", "r", encoding="utf-8") as f:
    fights = json.load(f)

# Build name-to-id lookup
def strip_accents(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

fighter_lookup = {
    strip_accents(fighter["name"].strip()).lower(): fighter["id"]
    for fighter in fighters if "id" in fighter
}


# Normalize names by stripping, removing accents, and applying fix map
def normalize(name):
    clean = name.strip()
    key = clean.upper()
    fixed = TAPOLOGY_FIXES.get(key, key)
    no_accents = ''.join(
        c for c in unicodedata.normalize('NFD', fixed)
        if unicodedata.category(c) != 'Mn'
    )
    return no_accents.lower()

# Track unmatched names
unmatched_names = set()
enriched_fights = []

# Enrich fights with fighter_id and opponent_id
for fight in fights:
    name1 = normalize(fight["fighter1"])
    name2 = normalize(fight["fighter2"])

    fighter1_id = fighter_lookup.get(name1)
    fighter2_id = fighter_lookup.get(name2)

    if not fighter1_id:
        unmatched_names.add(fight["fighter1"])
    if not fighter2_id:
        unmatched_names.add(fight["fighter2"])

    fight["fighter_id"] = fighter1_id
    fight["opponent_id"] = fighter2_id
    enriched_fights.append(fight)

# Write updated JSON
with open("upcoming_fights.json", "w", encoding="utf-8") as f:
    json.dump(enriched_fights, f, indent=2, ensure_ascii=False)

# Output unmatched names (summary only)
if unmatched_names:
    with open("../data/errors/unmatched_tapology.txt", "w", encoding="utf-8") as f:
        for name in sorted(unmatched_names):
            f.write(f"{name}\n")
    print(f"\n⚠️ {len(unmatched_names)} unmatched fighter(s) written to 'unmatched_fighters.txt'")
else:
    print("\n✅ All fighters matched successfully.")
