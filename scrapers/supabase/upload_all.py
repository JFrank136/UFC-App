import os
import sys
import json
import psycopg2
import psycopg2.extras
from uuid import UUID, uuid4
from dotenv import load_dotenv
from datetime import datetime


def print_progress(current, total, prefix='Progress', bar_length=50):
    """Print a progress bar to show upload status"""
    percent = float(current) * 100 / total
    filled_length = int(bar_length * current // total)
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    sys.stdout.write(f'\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})')
    sys.stdout.flush()


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


def clean_time_field(value):
    """Clean time fields - keep as text, don't convert to numeric"""
    if value is None:
        return None
    
    if isinstance(value, str):
        value = value.strip()
        # Handle known placeholder values
        if value.lower() in {"unknown", "n/a", "-", "", "00:00"}:
            return None
        return value
    
    return str(value) if value else None

class DatabaseUploader:
    def __init__(self):
        """Initialize database connection"""
        load_dotenv()
        try:
            self.conn = psycopg2.connect(
                dbname=os.getenv("SUPABASE_DB_NAME"),
                user=os.getenv("SUPABASE_DB_USER"),
                password=os.getenv("SUPABASE_DB_PASSWORD"),
                host=os.getenv("SUPABASE_DB_HOST"),
                port=os.getenv("SUPABASE_DB_PORT")
            )
            self.cur = self.conn.cursor()
            print("✅ Connected to database")
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            sys.exit(1)
    
    def close(self):
        """Close database connection"""
        if hasattr(self, 'cur'):
            self.cur.close()
        if hasattr(self, 'conn'):
            self.conn.close()
    
    def upload_fighters(self, file_path="../data/fighters.json"):
        """Upload fighters to database"""
        print("🥊 Uploading fighters...")
        
        # Load data
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                fighters = json.load(f)
            print(f"📊 Loaded {len(fighters):,} fighters from {file_path}")
        except Exception as e:
            print(f"❌ Failed to load fighters file: {e}")
            return False
        
        # Clear existing data
        print("⚠️ Clearing existing fighters from the database...")
        self.cur.execute("DELETE FROM fighters;")
        self.conn.commit()
        
        # Batch insert configuration
        BATCH_SIZE = 500
        batch = []
        total_fighters = len(fighters)
        processed = 0
        successful_inserts = 0
        validation_failures = 0
        
        # FIXED: Updated query to match exact schema field names
        query = """
            INSERT INTO fighters (
                id, name, nickname, profile_url_ufc, height, weight, reach, country, age, gender, weight_class,
                wins_total, losses_total, wins_ko, wins_sub, wins_dec, losses_ko, losses_sub, losses_dec,
                sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, takedown_avg_per_15min,
                submission_avg_per_15min, sig_str_defense, knockdown_avg, avg_fight_time, created_at,
                profile_url_sherdog, image_url, image_local_path, takedown_defense, striking_accuracy,
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
                country = EXCLUDED.country,
                age = EXCLUDED.age,
                gender = EXCLUDED.gender,
                weight_class = EXCLUDED.weight_class,
                wins_total = EXCLUDED.wins_total,
                losses_total = EXCLUDED.losses_total,
                wins_ko = EXCLUDED.wins_ko,
                wins_sub = EXCLUDED.wins_sub,
                wins_dec = EXCLUDED.wins_dec,
                losses_ko = EXCLUDED.losses_ko,
                losses_sub = EXCLUDED.losses_sub,
                losses_dec = EXCLUDED.losses_dec,
                sig_strikes_landed_per_min = EXCLUDED.sig_strikes_landed_per_min,
                sig_strikes_absorbed_per_min = EXCLUDED.sig_strikes_absorbed_per_min,
                takedown_avg_per_15min = EXCLUDED.takedown_avg_per_15min,
                submission_avg_per_15min = EXCLUDED.submission_avg_per_15min,
                sig_str_defense = EXCLUDED.sig_str_defense,
                knockdown_avg = EXCLUDED.knockdown_avg,
                avg_fight_time = EXCLUDED.avg_fight_time,
                profile_url_sherdog = EXCLUDED.profile_url_sherdog,
                image_url = EXCLUDED.image_url,
                image_local_path = EXCLUDED.image_local_path,
                takedown_defense = EXCLUDED.takedown_defense,
                striking_accuracy = EXCLUDED.striking_accuracy,
                takedown_accuracy = EXCLUDED.takedown_accuracy,
                sig_strikes_by_position = EXCLUDED.sig_strikes_by_position,
                sig_strikes_by_target = EXCLUDED.sig_strikes_by_target;
        """
        
        try:
            for fighter in fighters:
                processed += 1
                
                # Basic validation
                if not fighter.get("id") or not fighter.get("name"):
                    validation_failures += 1
                    continue
                
                try:
                    UUID(fighter["id"])  # Validate UUID format
                except ValueError:
                    validation_failures += 1
                    continue
                
                
                fighter_data = (
                    fighter["id"],                                                           # id (UUID)
                    fighter["name"],                                                         # name
                    fighter.get("nickname"),                                                # nickname
                    fighter.get("profile_url_ufc"),                                        # profile_url_ufc
                    clean_numeric(fighter.get("height")),                                  # height (decimal)
                    clean_numeric(fighter.get("weight")),                                  # weight (decimal)
                    clean_numeric(fighter.get("reach")),                                   # reach (decimal)
                    fighter.get("country"),                                                # country
                    clean_numeric(fighter.get("age")),                                     # age (int)
                    fighter.get("gender"),                                                 # gender (text)
                    fighter.get("weight_class"),                                           # weight_class
                    clean_numeric(fighter.get("wins_total")),                              # wins_total (int)
                    clean_numeric(fighter.get("losses_total")),                            # losses_total (int)
                    clean_numeric(fighter.get("wins_ko")),                                 # wins_ko (int)
                    clean_numeric(fighter.get("wins_sub")),                                # wins_sub (int)
                    clean_numeric(fighter.get("wins_dec")),                                # wins_dec (int)
                    clean_numeric(fighter.get("losses_ko")),                               # losses_ko (int)
                    clean_numeric(fighter.get("losses_sub")),                              # losses_sub (int)
                    clean_numeric(fighter.get("losses_dec")),                              # losses_dec (int)
                    fighter.get("sig_strikes_landed_per_min"),                             # sig_strikes_landed_per_min (text)
                    fighter.get("sig_strikes_absorbed_per_min"),                           # sig_strikes_absorbed_per_min (text)
                    fighter.get("takedown_avg_per_15min"),                                 # takedown_avg_per_15min (text)
                    fighter.get("submission_avg_per_15min"),                               # submission_avg_per_15min (text)
                    fighter.get("sig_str_defense"),                                        # sig_str_defense (text)
                    clean_numeric(fighter.get("knockdown_avg")),                           # knockdown_avg (decimal)
                    clean_time_field(fighter.get("avg_fight_time")),                       # avg_fight_time (standardized field name)
                    datetime.now(),                                                        # created_at (timestamp)
                    fighter.get("profile_url_sherdog"),                                    # profile_url_sherdog
                    fighter.get("image_url"),                                              # image_url
                    fighter.get("image_local_path"),                                       # image_local_path
                    fighter.get("takedown_defense"),                                       # takedown_defense (text)
                    fighter.get("striking_accuracy"),                                      # striking_accuracy (text)
                    fighter.get("takedown_accuracy"),                                      # takedown_accuracy (text)
                    json.dumps(fighter.get("sig_strikes_by_position")) if fighter.get("sig_strikes_by_position") else None,  # sig_strikes_by_position (JSON)
                    json.dumps(fighter.get("sig_strikes_by_target")) if fighter.get("sig_strikes_by_target") else None       # sig_strikes_by_target (JSON)
                )
                
                batch.append(fighter_data)
                
                # Insert batch when it reaches the batch size
                if len(batch) >= BATCH_SIZE:
                    psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                    successful_inserts += len(batch)
                    self.conn.commit()
                    batch = []
                
                # Update progress
                if processed % 50 == 0 or processed == total_fighters:
                    print_progress(processed, total_fighters, "Processing")
            
            # Process remaining batch
            if batch:
                psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                successful_inserts += len(batch)
                self.conn.commit()
        
        except Exception as e:
            print(f"\n❌ Fighter upload failed: {e}")
            self.conn.rollback()
            return False
        
        print(f"\n✅ Fighters: {successful_inserts:,} uploaded, {validation_failures:,} failed validation")
        return True
    
    def upload_fight_history(self, file_path="../data/fight_history.json"):
        """Upload fight history to database"""
        print("🥊 Uploading fight history...")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                fight_history = json.load(f)
            print(f"📊 Loaded {len(fight_history):,} fight records")
        except Exception as e:
            print(f"❌ Failed to load fight history file: {e}")
            return False
        
        # Clear existing data
        print("⚠️ Clearing existing fight history from the database...")
        self.cur.execute("TRUNCATE TABLE fight_history;")
        self.conn.commit()
        
        # Batch configuration
        BATCH_SIZE = 1000
        batch = []
        total_fights = len(fight_history)
        processed = 0
        successful_inserts = 0
        skipped_dates = 0
        
        # Schema matches perfectly - no changes needed
        query = """
            INSERT INTO fight_history (
                id, fighter_id, opponent, result, method, round, time, fight_date
            ) VALUES %s
            ON CONFLICT (id) DO NOTHING;
        """
        
        try:
            for fight in fight_history:
                processed += 1
                
                # Skip fights without valid dates
                if not fight.get("fight_date"):
                    skipped_dates += 1
                    continue
                
                try:
                    # Parse and validate date
                    fight_date = datetime.strptime(fight["fight_date"], "%Y-%m-%d").date()
                    
                    fight_data = (
                        str(uuid4()),
                        fight["fighter_id"],
                        fight.get("opponent", "Unknown"),
                        fight.get("result"),
                        fight.get("method"),
                        fight.get("round"),
                        fight.get("time"),
                        fight_date
                    )
                    
                    batch.append(fight_data)
                    
                    # Insert batch when it reaches the batch size
                    if len(batch) >= BATCH_SIZE:
                        psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                        successful_inserts += len(batch)
                        self.conn.commit()
                        batch = []
                
                except ValueError:
                    # Skip invalid dates
                    continue
                
                # Update progress
                if processed % 100 == 0 or processed == total_fights:
                    print_progress(processed, total_fights, "Processing")
            
            # Process remaining batch
            if batch:
                psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                successful_inserts += len(batch)
                self.conn.commit()
        
        except Exception as e:
            print(f"\n❌ Fight history upload failed: {e}")
            self.conn.rollback()
            return False
        
        print(f"\n✅ Fight History: {successful_inserts:,} uploaded, {skipped_dates:,} skipped (no date)")
        return True
    
    def upload_rankings(self, file_path="../data/ufc_rankings.json"):
        """Upload rankings to database"""
        print("📋 Uploading rankings...")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"❌ Failed to load rankings file: {e}")
            return False
        
        # Clear existing data
        print("⚠️ Clearing existing rankings from the database...")
        self.cur.execute("TRUNCATE TABLE rankings;")
        self.conn.commit()
        
        # Batch configuration
        BATCH_SIZE = 500
        batch = []
        total = sum(len(d["fighters"]) for d in data)
        processed = 0
        inserted = 0
        
        # Schema matches perfectly - no changes needed
        query = """
            INSERT INTO rankings (id, division, rank, name, uuid, change)
            VALUES %s
            ON CONFLICT (id) DO NOTHING;
        """
        
        try:
            for entry in data:
                division = entry["division"]
                for fighter in entry["fighters"]:
                    ranking_data = (
                        str(uuid4()),
                        division,
                        str(fighter["rank"]),
                        fighter["name"],
                        fighter["uuid"],
                        fighter.get("change")
                    )
                    
                    batch.append(ranking_data)
                    processed += 1
                    
                    if len(batch) >= BATCH_SIZE:
                        psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                        inserted += len(batch)
                        self.conn.commit()
                        batch = []
                    
                    if processed % 100 == 0 or processed == total:
                        print_progress(processed, total, "Processing")
            
            # Process remaining batch
            if batch:
                psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                inserted += len(batch)
                self.conn.commit()
        
        except Exception as e:
            print(f"\n❌ Rankings upload failed: {e}")
            self.conn.rollback()
            return False
        
        print(f"\n✅ Rankings: {inserted:,} uploaded")
        return True
    
    def upload_upcoming_fights(self, file_path="../data/upcoming_fights.json"):
        """Upload upcoming fights to database"""
        print("🥊 Uploading upcoming fights...")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                fights = json.load(f)
            print(f"📊 Loaded {len(fights):,} upcoming fights")
        except Exception as e:
            print(f"❌ Failed to load upcoming fights file: {e}")
            return False
        
        # Clear existing data
        print("⚠️ Truncating upcoming_fights table...")
        self.cur.execute("TRUNCATE TABLE upcoming_fights;")
        self.conn.commit()
        
        # Batch configuration
        BATCH_SIZE = 500
        batch = []
        total_fights = len(fights)
        processed = 0
        successful_inserts = 0
        skipped = 0
        
        # FIXED: Updated query to match exact schema field order
        query = """
            INSERT INTO upcoming_fights (
                id, event, event_type, event_date, event_time,
                venue, location, fight_card_image_url, fight_card_image_local_path,
                fighter1, fighter2, fighter1_id, fighter2_id,
                fight_order, card_section, weight_class, scraped_at
            )
            VALUES %s;
        """
        
        try:
            for fight in fights:
                processed += 1
                
                # Allow partial UUIDs — only skip if both are missing
                fighter1_id = fight.get("fighter1_id") or fight.get("uuid1")  # Support both during transition
                fighter2_id = fight.get("fighter2_id") or fight.get("uuid2")  # Support both during transition
                
                if not fighter1_id and not fighter2_id:
                    skipped += 1
                    continue
                
                # FIXED: Data tuple matching exact schema field order
                fight_data = (
                    str(uuid4()),                                  # id
                    fight.get("event"),                           # event
                    fight.get("event_type"),                      # event_type
                    fight.get("event_date"),                      # event_date
                    fight.get("event_time"),                      # event_time
                    fight.get("venue"),                           # venue
                    fight.get("location"),                        # location
                    fight.get("fight_card_image_url"),            # fight_card_image_url
                    fight.get("fight_card_image_local_path"),     # fight_card_image_local_path
                    fight.get("fighter1"),                        # fighter1
                    fight.get("fighter2"),                        # fighter2
                    fighter1_id,                                  # fighter1_id
                    fighter2_id,                                  # fighter2_id
                    fight.get("fight_order"),                     # fight_order
                    fight.get("card_section"),                    # card_section
                    fight.get("weight_class"),                    # weight_class
                    fight.get("scraped_at")                       # scraped_at
                )
                
                batch.append(fight_data)
                
                if len(batch) >= BATCH_SIZE:
                    psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                    successful_inserts += len(batch)
                    self.conn.commit()
                    batch = []
                
                if processed % 100 == 0 or processed == total_fights:
                    print_progress(processed, total_fights, "Processing")
            
            # Process remaining batch
            if batch:
                psycopg2.extras.execute_values(self.cur, query, batch, template=None)
                successful_inserts += len(batch)
                self.conn.commit()
        
        except Exception as e:
            print(f"\n❌ Upcoming fights upload failed: {e}")
            self.conn.rollback()
            return False
        
        print(f"\n✅ Upcoming Fights: {successful_inserts:,} uploaded, {skipped:,} skipped (no UUIDs)")
        return True
    
    def validate_upload_integrity(self):
        """Validate data integrity after upload"""
        print("🔍 Validating upload integrity...")
        
        try:
            # Check table counts
            tables = ['fighters', 'fight_history', 'rankings', 'upcoming_fights']
            for table in tables:
                self.cur.execute(f"SELECT COUNT(*) FROM {table}")
                count = self.cur.fetchone()[0]
                print(f"  {table}: {count:,} records")
            
            # Check for orphaned records in fight_history
            self.cur.execute("""
                SELECT COUNT(*) FROM fight_history fh 
                LEFT JOIN fighters f ON fh.fighter_id = f.id 
                WHERE f.id IS NULL
            """)
            orphaned_fights = self.cur.fetchone()[0]
            if orphaned_fights > 0:
                print(f"  ⚠️ Warning: {orphaned_fights} orphaned fight history records")
            
            # Check for orphaned records in rankings
            self.cur.execute("""
                SELECT COUNT(*) FROM rankings r 
                LEFT JOIN fighters f ON r.uuid = f.id 
                WHERE f.id IS NULL AND r.uuid IS NOT NULL
            """)
            orphaned_rankings = self.cur.fetchone()[0]
            if orphaned_rankings > 0:
                print(f"  ⚠️ Warning: {orphaned_rankings} orphaned ranking records")
            
            # Check for orphaned records in upcoming_fights
            self.cur.execute("""
                SELECT COUNT(*) FROM upcoming_fights uf 
                LEFT JOIN fighters f1 ON uf.fighter1_id = f1.id 
                LEFT JOIN fighters f2 ON uf.fighter2_id = f2.id 
                WHERE (f1.id IS NULL AND uf.fighter1_id IS NOT NULL) 
                   OR (f2.id IS NULL AND uf.fighter2_id IS NOT NULL)
            """)
            orphaned_upcoming = self.cur.fetchone()[0]
            if orphaned_upcoming > 0:
                print(f"  ⚠️ Warning: {orphaned_upcoming} upcoming fights with invalid fighter IDs")
                
                # Show missing fighter names
                self.cur.execute("""
                    SELECT DISTINCT 
                        CASE WHEN f1.id IS NULL AND uf.fighter1_id IS NOT NULL THEN uf.fighter1 END as missing_fighter1,
                        CASE WHEN f2.id IS NULL AND uf.fighter2_id IS NOT NULL THEN uf.fighter2 END as missing_fighter2
                    FROM upcoming_fights uf 
                    LEFT JOIN fighters f1 ON uf.fighter1_id = f1.id 
                    LEFT JOIN fighters f2 ON uf.fighter2_id = f2.id 
                    WHERE (f1.id IS NULL AND uf.fighter1_id IS NOT NULL) 
                       OR (f2.id IS NULL AND uf.fighter2_id IS NOT NULL)
                """)
                missing_results = self.cur.fetchall()
                missing_fighters = set()
                for row in missing_results:
                    if row[0]:  # missing_fighter1
                        missing_fighters.add(row[0])
                    if row[1]:  # missing_fighter2
                        missing_fighters.add(row[1])
                
                if missing_fighters:
                    print(f"  🔍 Missing fighters: {', '.join(sorted(missing_fighters))}")
            
            if orphaned_fights == 0 and orphaned_rankings == 0 and orphaned_upcoming == 0:
                print("  ✅ All foreign key relationships are valid")
        
        except Exception as e:
            print(f"  ❌ Validation failed: {e}")


def main():
    """Main execution function"""
    print("🚀 Starting comprehensive database upload...")
    print("="*60)
    
    uploader = DatabaseUploader()
    
    try:
        # Upload all data in logical order
        success_count = 0
        
        # 1. Upload fighters first (needed for foreign keys)
        if uploader.upload_fighters():
            success_count += 1
        
        # 2. Upload fight history (depends on fighters)
        if uploader.upload_fight_history():
            success_count += 1
        
        # 3. Upload rankings
        if uploader.upload_rankings():
            success_count += 1
        
        # 4. Upload upcoming fights
        if uploader.upload_upcoming_fights():
            success_count += 1
        
        # 5. Validate data integrity
        uploader.validate_upload_integrity()
        
        # Summary
        print("\n" + "="*60)
        print("📊 UPLOAD SUMMARY")
        print("="*60)
        print(f"Successfully uploaded: {success_count}/4 tables")
        
        if success_count == 4:
            print("🎉 All data uploaded successfully!")
        else:
            print(f"⚠️ {4 - success_count} table(s) failed to upload")
        
        print("="*60)
    
    except KeyboardInterrupt:
        print("\n⚠️ Upload interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
    
    finally:
        uploader.close()


if __name__ == "__main__":
    main()