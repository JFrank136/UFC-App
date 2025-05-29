import os
import json
import uuid
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Paths relative to this script's folder
UFC_PATH = "../data/ufc_details.json"
SHERDOG_PATH = "../data/sherdog_fighters.json"
UPCOMING_PATH = "../data/upcoming_fights.json"

# Connect to Supabase Postgres
conn = psycopg2.connect(
    dbname=os.getenv("SUPABASE_DB_NAME"),
    user=os.getenv("SUPABASE_DB_USER"),
    password=os.getenv("SUPABASE_DB_PASSWORD"),
    host=os.getenv("SUPABASE_DB_HOST"),
    port=os.getenv("SUPABASE_DB_PORT")
)

# Build name → fighter_id lookup
fighter_lookup = {}

for path in [UFC_PATH, SHERDOG_PATH]:
    with open(path, "r", encoding="utf-8") as f:
        for fighter in json.load(f):
            name = fighter.get("name", "").strip().lower()
            if "fighter_id" in fighter:
                fighter_lookup[name] = fighter["fighter_id"]

# Load upcoming fights
with open(UPCOMING_PATH, "r", encoding="utf-8") as f:
    fights = json.load(f)

cur = conn.cursor()
inserted = 0

# Insert upcoming fights
for fight in fights:
    name1 = fight["fighter1"].strip().lower()
    name2 = fight["fighter2"].strip().lower()

    fighter1_id = fighter_lookup.get(name1)
    fighter2_id = fighter_lookup.get(name2)

    if not fighter1_id or not fighter2_id:
        print(f"❌ Skipped: {fight['fighter1']} vs {fight['fighter2']} (missing ID)")
        continue

    try:
        cur.execute("""
            INSERT INTO upcoming_fights (
                id, event, event_type, event_date, event_time,
                fighter_id, opponent_id, fighter_name, opponent_name,
                weight_class, card_section, fight_order, scraped_at
            )

            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s
            )
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(uuid.uuid4()),
            str(uuid.uuid4()),
            fight["event"],
            fight["event_type"],
            fight["event_date"],
            fight["event_time"],
            fighter1_id,
            fighter2_id,
            fight["fighter1"],
            fight["fighter2"],
            fight["weight_class"],
            fight["card_section"],
            fight["fight_order"],
            fight["scraped_at"]
        ))
        inserted += 1
    except Exception as e:
        print(f"⚠️ DB insert failed: {e}")
        conn.rollback()
        continue

conn.commit()
cur.close()
conn.close()
print(f"\n✅ Uploaded {inserted} upcoming fights")
