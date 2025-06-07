import os
import sys
import json
import psycopg2
import psycopg2.extras
from uuid import UUID
from dotenv import load_dotenv


def clean_numeric(value):
    """Enhanced numeric cleaning function"""
    if value is None:
        return None
    
    if isinstance(value, str):
        value = value.strip()
        # Handle known placeholder values
        if value.lower() in {"unknown", "n/a", "-", ""}:
            return None
        
        # Try to convert string numbers to actual numbers
        try:
            # Handle decimal numbers
            if '.' in value:
                return float(value)
            else:
                return int(value)
        except ValueError:
            return None
    
    # Already a number
    if isinstance(value, (int, float)):
        return value
    
    return None


def extract_stat_value(stat_string):
    """Extract numeric value from formatted stats like '1409 (87%)'"""
    if not stat_string or stat_string is None:
        return None
    
    if isinstance(stat_string, str):
        # Remove everything after first space or parenthesis
        clean_stat = stat_string.split()[0].split('(')[0].strip()
        try:
            return float(clean_stat) if '.' in clean_stat else int(clean_stat)
        except ValueError:
            return None
    
    return stat_string


def print_progress(current, total, prefix='Progress', bar_length=50):
    """Print a progress bar to show upload status"""
    percent = float(current) * 100 / total
    filled_length = int(bar_length * current // total)
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    sys.stdout.write(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})')
    sys.stdout.flush()


def validate_fighter_data(fighter, index):
    """Validate individual fighter record"""
    errors = []
    
    # Check required fields
    if not fighter.get("id"):
        errors.append("Missing ID")
    else:
        try:
            UUID(fighter["id"])  # Validate UUID format
        except ValueError:
            errors.append("Invalid UUID format")
    
    if not fighter.get("name"):
        errors.append("Missing name")
    
    return errors


def batch_insert_fighters(cursor, fighters_batch):
    """Insert a batch of fighters efficiently with proper data conversion"""
    if not fighters_batch:
        return 0
    
    query = """
        INSERT INTO fighters (
            id, name, profile_url_ufc, profile_url_sherdog, status, height, weight, 
            reach, strikes_landed_per_min, strikes_absorbed_per_min, takedown_avg,
            submission_avg, striking_defense, knockdown_avg, avg_fight_time, nickname, 
            country, age, weight_class, wins_total, losses_total, wins_ko, wins_sub, wins_dec,
            losses_ko, losses_sub, losses_dec, image_url, image_local_path, ufc_rankings
        )

        VALUES %s
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            profile_url_ufc = EXCLUDED.profile_url_ufc,
            profile_url_sherdog = EXCLUDED.profile_url_sherdog,
            status = EXCLUDED.status,
            height = EXCLUDED.height,
            weight = EXCLUDED.weight,
            reach = EXCLUDED.reach,
            strikes_landed_per_min = EXCLUDED.strikes_landed_per_min,
            strikes_absorbed_per_min = EXCLUDED.strikes_absorbed_per_min,
            takedown_avg = EXCLUDED.takedown_avg,
            submission_avg = EXCLUDED.submission_avg,
            striking_defense = EXCLUDED.striking_defense,
            knockdown_avg = EXCLUDED.knockdown_avg,
            avg_fight_time = EXCLUDED.avg_fight_time,
            nickname = EXCLUDED.nickname,
            country = EXCLUDED.country,
            age = EXCLUDED.age,
            weight_class = EXCLUDED.weight_class,
            wins_total = EXCLUDED.wins_total,
            losses_total = EXCLUDED.losses_total,
            wins_ko = EXCLUDED.wins_ko,
            wins_sub = EXCLUDED.wins_sub,
            wins_dec = EXCLUDED.wins_dec,
            losses_ko = EXCLUDED.losses_ko,
            losses_sub = EXCLUDED.losses_sub,
            losses_dec = EXCLUDED.losses_dec,
            image_url = EXCLUDED.image_url,
            image_local_path = EXCLUDED.image_local_path,
            ufc_rankings = EXCLUDED.ufc_rankings;
    """
    
    # Convert batch to tuple format with proper data conversion
    values = []
    for fighter in fighters_batch:
        values.append((
            fighter["id"],
            fighter["name"],
            fighter.get("profile_url_ufc"),
            fighter.get("profile_url_sherdog"),
            fighter.get("status"),
            clean_numeric(fighter.get("height")),
            clean_numeric(fighter.get("weight")),
            clean_numeric(fighter.get("reach")),
            fighter.get("strikes_landed_per_min"),
            fighter.get("strikes_absorbed_per_min"),
            fighter.get("takedown_avg"),
            fighter.get("submission_avg"),
            fighter.get("striking_defense"),
            clean_numeric(fighter.get("knockdown_avg")),
            clean_numeric(fighter.get("avg_fight_time")),
            fighter.get("nickname"),
            fighter.get("country"),
            clean_numeric(fighter.get("age")),
            fighter.get("weight_class"),  
            clean_numeric(fighter.get("wins_total")),
            clean_numeric(fighter.get("losses_total")),
            clean_numeric(fighter.get("wins_ko")),
            clean_numeric(fighter.get("wins_sub")),
            clean_numeric(fighter.get("wins_dec")),
            clean_numeric(fighter.get("losses_ko")),
            clean_numeric(fighter.get("losses_sub")),
            clean_numeric(fighter.get("losses_dec")),
            fighter.get("image_url"),
            fighter.get("image_local_path"),
            json.dumps(fighter.get("ufc_rankings", []))  # convert to JSON string
        ))
    
    psycopg2.extras.execute_values(cursor, query, values, template=None)
    return len(values)


def debug_fighter_data(fighter, index):
    """Debug function to see what data is being processed"""
    print(f"\n--- Fighter {index}: {fighter.get('name', 'Unknown')} ---")
    
    # Check key fields that were showing as NULL
    test_fields = {
        'age': clean_numeric(fighter.get('age')),
        'country': fighter.get('country'),
        'height': clean_numeric(fighter.get('height')),
        'weight': clean_numeric(fighter.get('weight')),
        'strikes_landed_per_min': fighter.get('strikes_landed_per_min'),
        'weight_class': fighter.get('weight_class') 
    }
    
    for field, processed_value in test_fields.items():
        raw_value = fighter.get(field, 'MISSING')
        print(f"{field}: '{raw_value}' -> {processed_value}")


def main():
    # Define file path
    FIGHTERS_PATH = "../data/fighters.json"
    
    # Verify file exists
    if not os.path.exists(FIGHTERS_PATH):
        print(f"❌ File not found: {FIGHTERS_PATH}")
        sys.exit(1)
    
    # Load and validate JSON
    try:
        with open(FIGHTERS_PATH, "r", encoding="utf-8") as f:
            fighters = json.load(f)
        print(f"✅ Loaded {len(fighters):,} fighters from {FIGHTERS_PATH}")
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to load file: {e}")
        sys.exit(1)
    
    
    # Load environment variables
    load_dotenv()
    
    # Database connection
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("SUPABASE_DB_NAME"),
            user=os.getenv("SUPABASE_DB_USER"),
            password=os.getenv("SUPABASE_DB_PASSWORD"),
            host=os.getenv("SUPABASE_DB_HOST"),
            port=os.getenv("SUPABASE_DB_PORT")
        )
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)
    
    cur = conn.cursor()
    print("⚠️ Deleting existing fighters from the database...")
    cur.execute("DELETE FROM fighters;")
    conn.commit()

    
 
    # Statistics
    total_fighters = len(fighters)
    processed = 0
    successful_inserts = 0
    validation_failures = 0
    database_failures = 0
    
    # Processing configuration
    BATCH_SIZE = 500
    batch = []
    validation_errors = []
    
    try:
        for idx, fighter in enumerate(fighters, start=1):
            processed += 1
            
            # Validate fighter data
            errors = validate_fighter_data(fighter, idx)
            if errors:
                validation_failures += 1
                validation_errors.append({
                    "index": idx,
                    "name": fighter.get("name", "Unknown"),
                    "errors": errors
                })
                print_progress(processed, total_fighters, "Processing")
                continue
            
            # Add to batch
            batch.append(fighter)
            
            # Process batch when it reaches the batch size
            if len(batch) >= BATCH_SIZE:
                try:
                    inserted_count = batch_insert_fighters(cur, batch)
                    successful_inserts += inserted_count
                    conn.commit()
                    batch = []
                except Exception as e:
                    print(f"\n⚠️ Batch insert failed: {e}")
                    conn.rollback()
                    database_failures += len(batch)
                    batch = []
            
            # Update progress
            if processed % 50 == 0 or processed == total_fighters:
                print_progress(processed, total_fighters, "Processing")
        
        # Process remaining batch
        if batch:
            try:
                inserted_count = batch_insert_fighters(cur, batch)
                successful_inserts += inserted_count
                conn.commit()
            except Exception as e:
                print(f"\n⚠️ Final batch insert failed: {e}")
                conn.rollback()
                database_failures += len(batch)
    
    except KeyboardInterrupt:
        print(f"\n⚠️ Upload interrupted by user")
        conn.rollback()
    
    finally:
        cur.close()
        conn.close()
        
        # Print detailed summary
        print("\n" + "="*60)
        print("📊 FIGHTER UPLOAD SUMMARY")
        print("="*60)
        print(f"Total fighters processed: {processed:,}")
        print(f"Successfully inserted: {successful_inserts:,}")
        print(f"Validation failures: {validation_failures:,}")
        print(f"Database failures: {database_failures:,}")
        print(f"Success rate: {(successful_inserts/max(processed, 1)*100):.1f}%")
        
        if validation_errors and len(validation_errors) <= 10:
            print("\n❌ Validation Errors:")
            for error in validation_errors:
                print(f"  [{error['index']}] {error['name']}: {', '.join(error['errors'])}")
        elif validation_errors:
            print(f"\n❌ {len(validation_errors)} validation errors (showing first 5):")
            for error in validation_errors[:5]:
                print(f"  [{error['index']}] {error['name']}: {', '.join(error['errors'])}")
        
        print("="*60)
        
        if successful_inserts > 0:
            print("✅ Fighter upload completed!")
        else:
            print("❌ No fighters were successfully uploaded")


if __name__ == "__main__":
    main()