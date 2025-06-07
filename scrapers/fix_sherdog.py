import json
import os

SHERDOG_PATH = "data/sherdog_fighters.json"
UUID_MISMATCHES_PATH = "data/errors/uuid_mismatches.json"

# 1. Load mappings
with open(UUID_MISMATCHES_PATH, "r", encoding="utf-8") as f:
    mismatches = json.load(f)
id_map = {entry["sherdog_id"]: entry["ufc_id"] for entry in mismatches}

# 2. Load Sherdog fighters
with open(SHERDOG_PATH, "r", encoding="utf-8") as f:
    fighters = json.load(f)

# 3. Replace IDs as needed
count = 0
for fighter in fighters:
    fid = fighter.get("id")
    if fid in id_map:
        print(f"Fixing {fighter.get('name','?')}: {fid} → {id_map[fid]}")
        fighter["id"] = id_map[fid]
        count += 1

if count:
    # Backup old file first
    backup = SHERDOG_PATH + ".backup"
    os.rename(SHERDOG_PATH, backup)
    print(f"Backup written to: {backup}")

    # Write the updated file
    with open(SHERDOG_PATH, "w", encoding="utf-8") as f:
        json.dump(fighters, f, indent=2, ensure_ascii=False)
    print(f"Updated {count} fighter IDs in {SHERDOG_PATH}")
else:
    print("No fighter IDs were updated.")

