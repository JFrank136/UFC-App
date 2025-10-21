import os
import sys
import json
import psycopg2
import psycopg2.extras
from uuid import UUID
from dotenv import load_dotenv
from datetime import datetime


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
            id, name, nickname, profile_url_ufc, height, weight, reach, status, country, age, gender, weight_class,
            wins_total, losses_total, draws_total, ufc_wins_total, ufc_losses_total, ufc_draws_total,
            ufc_wins_ko, ufc_wins_sub, ufc_wins_dec, ufc_losses_ko, ufc_losses_sub, ufc_losses_dec,
            sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, takedown_avg_per_15min,
            submission_avg_per_15min, sig_str_defense, knockdown_avg, avg_fight_time, created_at,
            profile_url_tapology, image_url, image_local_path, takedown_defense, striking_accuracy,
            takedown_accuracy, sig_strikes_by_position, sig_strikes_by_target
        )
        VALUES %s
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            nickname = EXCLUDED.nickname,
            profile_url_ufc = EXCLUDED.profile_url_ufc,
            height = EXCLUDED.height,
            weight = EXCLUDED.weight,
            reach = EXCLUDED.reach,
            status = EXCLUDED.status,
            country = EXCLUDED.country,
            age = EXCLUDED.age,
            gender = EXCLUDED.gender,
            weight_class = EXCLUDED.weight_class,
            wins_total = EXCLUDED.wins_total,
            losses_total = EXCLUDED.losses_total,
            draws_total = EXCLUDED.draws_total,
            ufc_wins_total = EXCLUDED.ufc_wins_total,
            ufc_losses_total = EXCLUDED.ufc_losses_total,
            ufc_draws_total = EXCLUDED.ufc_draws_total,
            ufc_wins_ko = EXCLUDED.ufc_wins_ko,
            ufc_wins_sub = EXCLUDED.ufc_wins_sub,
            ufc_wins_dec = EXCLUDED.ufc_wins_dec,
            ufc_losses_ko = EXCLUDED.ufc_losses_ko,
            ufc_losses_sub = EXCLUDED.ufc_losses_sub,
            ufc_losses_dec = EXCLUDED.ufc_losses_dec,
            sig_strikes_landed_per_min = EXCLUDED.sig_strikes_landed_per_min,
            sig_strikes_absorbed_per_min = EXCLUDED.sig_strikes_absorbed_per_min,
            takedown_avg_per_15min = EXCLUDED.takedown_avg_per_15min,
            submission_avg_per_15min = EXCLUDED.submission_avg_per_15min,
            sig_str_defense = EXCLUDED.sig_str_defense,
            knockdown_avg = EXCLUDED.knockdown_avg,
            avg_fight_time = EXCLUDED.avg_fight_time,
            profile_url_tapology = EXCLUDED.profile_url_tapology,
            image_url = EXCLUDED.image_url,
            image_local_path = EXCLUDED.image_local_path,
            takedown_defense = EXCLUDED.takedown_defense,
            striking_accuracy = EXCLUDED.striking_accuracy,
            takedown_accuracy = EXCLUDED.takedown_accuracy,
            sig_strikes_by_position = EXCLUDED.sig_strikes_by_position,
            sig_strikes_by_target = EXCLUDED.sig_strikes_by_target;
        """
    
    # Convert batch to tuple format with proper data conversion
    values = []
    for fighter in fighters_batch:
        values.append((
            fighter["id"],                                                           # id
            fighter["name"],                                                         # name
            fighter.get("nickname"),                                                # nickname
            fighter.get("profile_url_ufc"),                                        # profile_url_ufc
            clean_numeric(fighter.get("height")),                                  # height
            clean_numeric(fighter.get("weight")),                                  # weight
            clean_numeric(fighter.get("reach")),                                   # reach
            fighter.get("status"),                                                  # status
            fighter.get("country"),                                                # country
            clean_numeric(fighter.get("age")),                                     # age
            fighter.get("gender"),                                                 # gender
            fighter.get("weight_class"),                                           # weight_class
            clean_numeric(fighter.get("wins_total")),                              # wins_total
            clean_numeric(fighter.get("losses_total")),                            # losses_total
            clean_numeric(fighter.get("draws_total")),                             # draws_total
            clean_numeric(fighter.get("ufc_wins_total")),                          # ufc_wins_total
            clean_numeric(fighter.get("ufc_losses_total")),                        # ufc_losses_total
            clean_numeric(fighter.get("ufc_draws_total")),                         # ufc_draws_total
            clean_numeric(fighter.get("ufc_wins_ko")),                             # ufc_wins_ko
            clean_numeric(fighter.get("ufc_wins_sub")),                            # ufc_wins_sub
            clean_numeric(fighter.get("ufc_wins_dec")),                            # ufc_wins_dec
            clean_numeric(fighter.get("ufc_losses_ko")),                           # ufc_losses_ko
            clean_numeric(fighter.get("ufc_losses_sub")),                          # ufc_losses_sub
            clean_numeric(fighter.get("ufc_losses_dec")),                          # ufc_losses_dec
            fighter.get("sig_strikes_landed_per_min"),                             # sig_strikes_landed_per_min
            fighter.get("sig_strikes_absorbed_per_min"),                           # sig_strikes_absorbed_per_min
            fighter.get("takedown_avg_per_15min"),                                 # takedown_avg_per_15min
            fighter.get("submission_avg_per_15min"),                               # submission_avg_per_15min
            fighter.get("sig_str_defense"),                                        # sig_str_defense
            clean_numeric(fighter.get("knockdown_avg")),                           # knockdown_avg
            fighter.get("avg_fight_time"),                                         # avg_fight_time
            datetime.now(),                                                        # created_at
            fighter.get("profile_url_tapology"),                                   # profile_url_tapology
            fighter.get("image_url"),                                              # image_url
            fighter.get("image_local_path"),                                       # image_local_path
            fighter.get("takedown_defense"),                                       # takedown_defense
            fighter.get("striking_accuracy"),                                      # striking_accuracy
            fighter.get("takedown_accuracy"),                                      # takedown_accuracy
            json.dumps(fighter.get("sig_strikes_by_position")) if fighter.get("sig_strikes_by_position") else None,  # sig_strikes_by_position
            json.dumps(fighter.get("sig_strikes_by_target")) if fighter.get("sig_strikes_by_target") else None       # sig_strikes_by_target
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