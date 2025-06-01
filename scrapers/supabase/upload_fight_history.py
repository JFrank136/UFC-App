import os
import json
import psycopg2
from uuid import uuid4
from dotenv import load_dotenv
from datetime import datetime
import sys

# Load environment variables
load_dotenv()

# Path to fight history JSON
FIGHT_HISTORY_PATH = "../data/fight_history.json"

def print_progress(current, total, prefix='Progress', bar_length=50):
    """Print a progress bar to show upload status"""
    percent = float(current) * 100 / total
    filled_length = int(bar_length * current // total)
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    sys.stdout.write(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})')
    sys.stdout.flush()

def batch_insert_fights(cursor, fights_batch):
    """Insert a batch of fights efficiently"""
    if not fights_batch:
        return 0
    
    # Prepare batch insert query
    query = """
        INSERT INTO fight_history (
            id, fighter_id, opponent, result, method, round, time, fight_date
        ) VALUES %s
        ON CONFLICT (id) DO NOTHING;
    """
    
    # Convert batch to tuple format for execute_values
    values = []
    for fight_data in fights_batch:
        values.append((
            str(uuid4()),
            fight_data["fighter_id"],
            fight_data["opponent"],
            fight_data["result"],
            fight_data["method"],
            fight_data["round"],
            fight_data["time"],
            fight_data["fight_date"]
        ))
    
    psycopg2.extras.execute_values(cursor, query, values, template=None)
    return len(values)

def main():
    print("🥊 Starting fight history upload...")
    
    # Load fight history data
    try:
        with open(FIGHT_HISTORY_PATH, "r", encoding="utf-8") as f:
            fight_history = json.load(f)
        print(f"📊 Loaded {len(fight_history):,} fight records")
    except FileNotFoundError:
        print(f"❌ Fight history file not found: {FIGHT_HISTORY_PATH}")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in fight history file: {e}")
        return
    
    # Connect to database
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("SUPABASE_DB_NAME"),
            user=os.getenv("SUPABASE_DB_USER"),
            password=os.getenv("SUPABASE_DB_PASSWORD"),
            host=os.getenv("SUPABASE_DB_HOST"),
            port=os.getenv("SUPABASE_DB_PORT")
        )
        print("✅ Connected to database")
    except psycopg2.Error as e:
        print(f"❌ Database connection failed: {e}")
        return
    
    cur = conn.cursor()
    print("⚠️ Clearing existing fight history from the database...")
    cur.execute("TRUNCATE TABLE fight_history;")
    conn.commit()

    
    # Statistics tracking
    total_fights = len(fight_history)
    processed = 0
    successful_inserts = 0
    failed_inserts = 0
    skipped_dates = 0
    
    # Process configuration
    BATCH_SIZE = 1000  # Insert in batches for better performance
    batch = []
    
    print(f"📤 Processing {total_fights:,} fights in batches of {BATCH_SIZE:,}...")
    
    try:
        for i, fight in enumerate(fight_history):
            processed += 1
            
            # Skip fights without valid dates
            if not fight.get("fight_date"):
                skipped_dates += 1
                print_progress(processed, total_fights)
                continue
            
            try:
                # Parse and validate date
                fight_date = datetime.strptime(fight["fight_date"], "%Y-%m-%d").date()
                
                # Add to batch
                batch.append({
                    "fighter_id": fight["fighter_id"],
                    "opponent": fight.get("opponent", "Unknown"),
                    "result": fight.get("result"),
                    "method": fight.get("method"),
                    "round": fight.get("round"),
                    "time": fight.get("time"),
                    "fight_date": fight_date
                })
                
                # Insert batch when it reaches the batch size
                if len(batch) >= BATCH_SIZE:
                    try:
                        inserted_count = batch_insert_fights(cur, batch)
                        successful_inserts += inserted_count
                        conn.commit()
                        batch = []  # Clear batch
                    except Exception as e:
                        print(f"\n⚠️ Batch insert failed: {e}")
                        conn.rollback()
                        failed_inserts += len(batch)
                        batch = []
                
            except ValueError as e:
                print(f"\n⚠️ Invalid date format for fight: {fight.get('fight_date')} - {e}")
                failed_inserts += 1
            except Exception as e:
                print(f"\n⚠️ Error processing fight: {e}")
                failed_inserts += 1
            
            # Update progress every 100 items or at the end
            if processed % 100 == 0 or processed == total_fights:
                print_progress(processed, total_fights)
        
        # Insert remaining batch
        if batch:
            try:
                inserted_count = batch_insert_fights(cur, batch)
                successful_inserts += inserted_count
                conn.commit()
            except Exception as e:
                print(f"\n⚠️ Final batch insert failed: {e}")
                conn.rollback()
                failed_inserts += len(batch)
    
    except KeyboardInterrupt:
        print(f"\n⚠️ Upload interrupted by user")
        conn.rollback()
    
    finally:
        cur.close()
        conn.close()
        print("\n" + "="*60)
        print("📊 UPLOAD SUMMARY")
        print("="*60)
        print(f"Total records processed: {processed:,}")
        print(f"Successfully inserted: {successful_inserts:,}")
        print(f"Failed insertions: {failed_inserts:,}")
        print(f"Skipped (no date): {skipped_dates:,}")
        print(f"Success rate: {(successful_inserts/max(processed-skipped_dates, 1)*100):.1f}%")
        print("="*60)
        
        if successful_inserts > 0:
            print("✅ Upload completed successfully!")
        else:
            print("❌ No records were inserted")

if __name__ == "__main__":
    # Import execute_values for batch inserts
    import psycopg2.extras
    main()