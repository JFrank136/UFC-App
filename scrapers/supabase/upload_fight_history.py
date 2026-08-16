import os
import sys
import json
import time
from uuid import uuid4
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv


# Path to fight history JSON
FIGHT_HISTORY_PATH = Path(__file__).resolve().parent.parent / "data" / "fight_history.json"

# REST upload tuning
BATCH_SIZE = 500
HTTP_TIMEOUT = 30  # seconds


def print_progress(current, total, prefix="Progress", bar_length=50):
    percent = float(current) * 100 / total if total else 100.0
    filled_length = int(bar_length * current // total) if total else bar_length
    bar = "█" * filled_length + "-" * (bar_length - filled_length)
    sys.stdout.write(f"\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})")
    sys.stdout.flush()


def get_supabase_url_from_env():
    url = os.getenv("SUPABASE_URL")
    if url:
        return url.rstrip("/")

    db_host = os.getenv("SUPABASE_DB_HOST")  # e.g. db.<ref>.supabase.co
    if db_host and db_host.startswith("db.") and db_host.endswith(".supabase.co"):
        project_ref = db_host[len("db.") : -len(".supabase.co")]
        return f"https://{project_ref}.supabase.co"

    return None


def sb_headers():
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def http_request_with_retry(method, url, headers, params=None, json_body=None, timeout=HTTP_TIMEOUT, max_retries=5):
    backoff = 1.5
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_body,
                timeout=timeout,
            )

            if resp.status_code == 429:
                wait = float(resp.headers.get("Retry-After", backoff ** attempt))
                time.sleep(wait)
                continue

            if 500 <= resp.status_code <= 599:
                time.sleep(backoff ** attempt)
                continue

            return resp

        except requests.exceptions.Timeout:
            if attempt == max_retries:
                raise
            time.sleep(backoff ** attempt)

        except requests.exceptions.RequestException:
            if attempt == max_retries:
                raise
            time.sleep(backoff ** attempt)

    return None


def main():
    print("🥊 Starting fight history upload (HTTPS)...")

    # Load .env from project root
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    supabase_url = get_supabase_url_from_env()
    headers = sb_headers()

    if not supabase_url:
        print("❌ Missing SUPABASE_URL (or could not derive it). Add SUPABASE_URL to your .env.")
        return

    if not headers:
        print("❌ Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY in your .env.")
        return

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

    # Clear table (matches prior TRUNCATE intent)
    print("⚠️ Clearing existing fight history from Supabase (REST delete all)...")
    delete_url = f"{supabase_url}/rest/v1/fight_history"
    delete_params = {"id": "not.is.null"}  # delete all rows
    resp = http_request_with_retry("DELETE", delete_url, headers=headers, params=delete_params)

    if resp is None:
        print("❌ Delete request failed (no response).")
        return

    if resp.status_code not in (200, 204):
        print(f"❌ Delete failed: HTTP {resp.status_code}")
        print(resp.text[:1000])
        return

    print("✅ fight_history cleared")

    # Insert endpoint
    insert_url = f"{supabase_url}/rest/v1/fight_history"
    insert_headers = dict(headers)
    insert_headers["Prefer"] = "return=minimal"

    total_fights = len(fight_history)
    processed = 0
    successful_inserts = 0
    failed_inserts = 0
    skipped_dates = 0

    batch = []

    def flush_batch(batch_payload):
        if not batch_payload:
            return 0

        resp2 = http_request_with_retry(
            "POST",
            insert_url,
            headers=insert_headers,
            params=None,
            json_body=batch_payload,
        )

        if resp2 is None:
            raise RuntimeError("No response from Supabase on batch insert.")

        if resp2.status_code not in (200, 201, 204):
            raise RuntimeError(f"Batch insert failed: HTTP {resp2.status_code} :: {resp2.text[:1000]}")

        return len(batch_payload)

    print(f"📤 Processing {total_fights:,} fights in batches of {BATCH_SIZE:,}...")

    try:
        for fight in fight_history:
            processed += 1

            # Skip fights without valid dates
            if not fight.get("fight_date"):
                skipped_dates += 1
                if processed % 100 == 0 or processed == total_fights:
                    print_progress(processed, total_fights)
                continue

            try:
                # Validate date format (keep as YYYY-MM-DD string for Postgres date column)
                datetime.strptime(fight["fight_date"], "%Y-%m-%d")

                row = {
                    "id": str(uuid4()),
                    "fighter_id": fight["fighter_id"],
                    "opponent": fight.get("opponent", "Unknown"),
                    "result": fight.get("result"),
                    "method": fight.get("method"),
                    "round": fight.get("round"),
                    "time": fight.get("time"),
                    "fight_date": fight["fight_date"],
                    "method_detail": fight.get("method_detail"),
                    "event": fight.get("event"),
                    "promotion": fight.get("promotion"),
                    "betting_odds": fight.get("betting_odds"),
                    "betting_status": fight.get("betting_status"),
                    "pick_percentage": fight.get("pick_percentage"),
                    "weight_class": fight.get("weight_class"),
                }

                batch.append(row)

                if len(batch) >= BATCH_SIZE:
                    inserted = flush_batch(batch)
                    successful_inserts += inserted
                    batch = []

            except ValueError as e:
                # invalid date format
                failed_inserts += 1
            except Exception:
                failed_inserts += 1

            if processed % 100 == 0 or processed == total_fights:
                print_progress(processed, total_fights)

        if batch:
            inserted = flush_batch(batch)
            successful_inserts += inserted

    except KeyboardInterrupt:
        print("\n⚠️ Upload interrupted by user")
        return
    except Exception as e:
        print(f"\n❌ Upload failed: {e}")
        return

    print("\n" + "=" * 60)
    print("📊 UPLOAD SUMMARY (HTTPS)")
    print("=" * 60)
    print(f"Total records processed: {processed:,}")
    print(f"Successfully inserted: {successful_inserts:,}")
    print(f"Failed insertions: {failed_inserts:,}")
    print(f"Skipped (no date): {skipped_dates:,}")
    print(f"Success rate: {(successful_inserts / max(processed - skipped_dates, 1) * 100):.1f}%")
    print("=" * 60)

    if successful_inserts > 0:
        print("✅ Upload completed successfully!")
    else:
        print("❌ No records were inserted")


if __name__ == "__main__":
    main()
