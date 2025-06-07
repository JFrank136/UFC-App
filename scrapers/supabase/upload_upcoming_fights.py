import json
import psycopg2
from psycopg2.extras import execute_values
from uuid import uuid4
from dotenv import load_dotenv
import os

def main():
    load_dotenv()
    conn = psycopg2.connect(
        dbname=os.getenv("SUPABASE_DB_NAME"),
        user=os.getenv("SUPABASE_DB_USER"),
        password=os.getenv("SUPABASE_DB_PASSWORD"),
        host=os.getenv("SUPABASE_DB_HOST"),
        port=os.getenv("SUPABASE_DB_PORT")
    )

    with open("../data/upcoming_fights.json", "r", encoding="utf-8") as f:
        fights = json.load(f)

    cur = conn.cursor()

    # Wipe the table before reuploading
    print("⚠️ Truncating upcoming_fights table...")
    cur.execute("TRUNCATE TABLE upcoming_fights;")
    conn.commit()

    insert_query = """
    INSERT INTO upcoming_fights (
        id, event, event_type, event_date, event_time,
        venue, location, fight_card_image_url, fight_card_image_local_path,
        fighter1, fighter2, fighter1_id, fighter2_id,
        fight_order, card_section, weight_class, scraped_at
    )
    VALUES %s;
    """

    values = []
    for fight in fights:
        # Allow partial UUIDs — only warn if both are missing
        uuid1 = fight.get("uuid1")
        uuid2 = fight.get("uuid2")

        if not uuid1 and not uuid2:
            print(f"❌ Skipped: {fight['fighter1']} vs {fight['fighter2']} (no UUIDs)")
            continue

        if not uuid1 or not uuid2:
            print(f"⚠️ Partial UUID: {fight['fighter1']} vs {fight['fighter2']} (one missing)")

        values.append((
            str(uuid4()),
            fight.get("event"),
            fight.get("event_type"),
            fight.get("event_date"),
            fight.get("event_time"),
            fight.get("venue"),
            fight.get("location"),
            fight.get("fight_card_image_url"),
            fight.get("fight_card_image_local_path"),
            fight.get("fighter1"),
            fight.get("fighter2"),
            fight.get("uuid1"),
            fight.get("uuid2"),
            fight.get("fight_order"),
            fight.get("card_section"),
            fight.get("weight_class"),
            fight.get("scraped_at")
        ))

    execute_values(cur, insert_query, values)
    conn.commit()
    conn.close()

    print(f"✅ Uploaded {len(values)} fights with venue and image information.")

if __name__ == "__main__":
    main()