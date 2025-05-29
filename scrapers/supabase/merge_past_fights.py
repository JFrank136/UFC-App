import json
import re
from pathlib import Path
from datetime import datetime

# Load merged fighters JSON
INPUT_PATH = Path("../data/fighters.json")
OUTPUT_PATH = Path("../data/fight_history.json")

with INPUT_PATH.open("r", encoding="utf-8") as f:
    fighters = json.load(f)

# Helper to normalize opponent names
def normalize_name(name: str) -> str:
    name = name.strip()
    name = re.sub(r"\s+", " ", name)
    return name.lower()

# Extract only relevant fight history entries
flat_fight_history = []

for fighter in fighters:
    fighter_id = fighter.get("id")
    for fight in fighter.get("fight_history", []):
        try:
            opponent_name = fight.get("fighter", "").strip()

            # Parse fight date safely
            raw_date = fight.get("Date") or fight.get("fight_date")
            fight_date = None
            if raw_date:
                try:
                    fight_date = datetime.strptime(raw_date, "%m/%d/%Y").date().isoformat()
                except ValueError:
                    print(f"⚠️ Invalid date format: '{raw_date}' for fighter {fighter.get('name')}")

            flat_fight_history.append({
                "fighter_id": fighter_id,
                "opponent": opponent_name,
                "result": fight.get("result"),
                "method": fight.get("method"),
                "round": fight.get("round"),
                "time": fight.get("time"),
                "fight_date": fight_date
            })

        except Exception as e:
            print(f"⚠️ Error processing fight for {fighter.get('name', 'UNKNOWN')}: {e}")
            continue

# Save clean flat fight history
with OUTPUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(flat_fight_history, f, indent=2, ensure_ascii=False)

print(f"✅ Saved flat fight history to {OUTPUT_PATH} with {len(flat_fight_history)} entries")
