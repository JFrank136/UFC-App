import os
import sys
import json
import psycopg2
import psycopg2.extras
from uuid import uuid4
from dotenv import load_dotenv

RANKINGS_PATH = "../data/ufc_rankings.json"
BATCH_SIZE = 500

def print_progress(current, total, prefix='Progress', bar_length=50):
    percent = float(current) * 100 / total
    filled_length = int(bar_length * current // total)
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    sys.stdout.write(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})')
    sys.stdout.flush()

def batch_insert_rankings(cursor, batch):
    if not batch:
        return 0

    query = """
        INSERT INTO rankings (id, division, rank, name, uuid, change)
        VALUES %s
        ON CONFLICT (id) DO NOTHING;
    """
    values = [(str(uuid4()), r["division"], str(r["rank"]), r["name"], r["uuid"], r.get("change")) for r in batch]
    psycopg2.extras.execute_values(cursor, query, values, template=None)
    return len(values)

def main():
    print("📋 Uploading UFC rankings...")

    if not os.path.exists(RANKINGS_PATH):
        print(f"❌ Rankings file not found: {RANKINGS_PATH}")
        sys.exit(1)

    try:
        with open(RANKINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load rankings file: {e}")
        sys.exit(1)

    load_dotenv()

    try:
        conn = psycopg2.connect(
            dbname=os.getenv("SUPABASE_DB_NAME"),
            user=os.getenv("SUPABASE_DB_USER"),
            password=os.getenv("SUPABASE_DB_PASSWORD"),
            host=os.getenv("SUPABASE_DB_HOST"),
            port=os.getenv("SUPABASE_DB_PORT")
        )
        print("✅ Connected to database")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

    cur = conn.cursor()
    print("⚠️ Clearing existing rankings from the database...")
    cur.execute("TRUNCATE TABLE rankings;")
    conn.commit()

    batch = []
    total = sum(len(d["fighters"]) for d in data)
    processed = 0
    inserted = 0

    try:
        for entry in data:
            division = entry["division"]
            for fighter in entry["fighters"]:
                batch.append({
                    "division": division,
                    "rank": fighter["rank"],
                    "name": fighter["name"],
                    "uuid": fighter["uuid"],
                    "change": fighter.get("change")
                })
                processed += 1

                if len(batch) >= BATCH_SIZE:
                    inserted += batch_insert_rankings(cur, batch)
                    conn.commit()
                    batch = []

                if processed % 100 == 0 or processed == total:
                    print_progress(processed, total)

        if batch:
            inserted += batch_insert_rankings(cur, batch)
            conn.commit()

    except KeyboardInterrupt:
        print("\n⚠️ Upload interrupted by user")
        conn.rollback()

    finally:
        cur.close()
        conn.close()
        print("\n📊 RANKINGS UPLOAD SUMMARY")
        print("=" * 60)
        print(f"Total fighters processed: {processed:,}")
        print(f"Successfully inserted: {inserted:,}")
        print("=" * 60)

if __name__ == "__main__":
    main()
