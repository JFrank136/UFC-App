import os
import sys
import json
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

UPCOMING_FIGHTS_PATH = Path(__file__).resolve().parent.parent / "data" / "upcoming_fights.json"
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


def flush_upsert_batch(supabase_url, headers, batch):
    """Upsert fights where both fighter IDs are present - updates existing rows via stable unique index."""
    if not batch:
        return 0

    url = f"{supabase_url}/rest/v1/upcoming_fights"
    h = dict(headers)
    h["Prefer"] = "resolution=merge-duplicates,return=minimal"

    resp = http_request_with_retry(
        "POST", url, headers=h, json_body=batch,
        params={"on_conflict": "fighter_pair,event_date"}
    )

    if resp is None:
        raise RuntimeError("No response from Supabase on batch upsert.")

    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Batch upsert failed: HTTP {resp.status_code} :: {resp.text[:1000]}")

    return len(batch)


def flush_insert_batch(supabase_url, headers, batch):
    """Plain insert for fights missing one or both fighter IDs - can't upsert without a reliable match key.
    Falls back to row-by-row insertion on conflict to skip duplicates gracefully."""
    if not batch:
        return 0

    url = f"{supabase_url}/rest/v1/upcoming_fights"
    h = dict(headers)
    h["Prefer"] = "return=minimal"

    resp = http_request_with_retry("POST", url, headers=h, json_body=batch)

    if resp is None:
        raise RuntimeError("No response from Supabase on batch insert.")

    # If no conflict, done
    if resp.status_code in (200, 201, 204):
        return len(batch)

    # On 409 conflict, fall back to inserting one row at a time and skip duplicates
    if resp.status_code == 409:
        inserted = 0
        for row in batch:
            r = http_request_with_retry("POST", url, headers=h, json_body=[row])
            if r is None:
                continue
            if r.status_code in (200, 201, 204):
                inserted += 1
            elif r.status_code == 409:
                pass  # Already exists - skip silently
            else:
                raise RuntimeError(f"Batch insert failed: HTTP {r.status_code} :: {r.text[:1000]}")
        return inserted

    raise RuntimeError(f"Batch insert failed: HTTP {resp.status_code} :: {resp.text[:1000]}")


def mark_past_fights(supabase_url, headers):
    """Update any DB rows where event_date is before today but status is still 'upcoming' or 'tbd'."""
    from datetime import date
    today = date.today().isoformat()

    print(f"Marking fights before {today} as 'past'...")

    url = f"{supabase_url}/rest/v1/upcoming_fights"
    h = dict(headers)
    h["Prefer"] = "return=minimal"

    # Target rows where event_date < today AND status is not already 'past'
    params = {
        "event_date": f"lt.{today}",
        "event_status": "neq.past",
    }

    resp = http_request_with_retry(
        "PATCH", url, headers=h,
        params=params,
        json_body={"event_status": "past"}
    )

    if resp is None:
        print("  Warning: No response when marking past fights - skipping")
        return

    if resp.status_code not in (200, 201, 204):
        print(f"  Warning: Failed to mark past fights (HTTP {resp.status_code}) - skipping")
        return

    print("  Done marking past fights")


def main():
    print("Uploading upcoming fights (HTTPS)...")

    # Load .env from project root
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    supabase_url = get_supabase_url_from_env()
    headers = sb_headers()

    if not supabase_url:
        print("Missing SUPABASE_URL (or could not derive it). Add SUPABASE_URL to your .env.")
        sys.exit(1)

    if not headers:
        print("Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY in your .env.")
        sys.exit(1)

    # Mark any fights with a past event_date as "past" before uploading
    mark_past_fights(supabase_url, headers)

    if not os.path.exists(UPCOMING_FIGHTS_PATH):
        print(f"Upcoming fights file not found: {UPCOMING_FIGHTS_PATH}")
        sys.exit(1)

    try:
        with open(UPCOMING_FIGHTS_PATH, "r", encoding="utf-8") as f:
            fights = json.load(f)
        print(f"Loaded {len(fights):,} fights")
    except Exception as e:
        print(f"Failed to load upcoming fights file: {e}")
        sys.exit(1)

    total = len(fights)
    processed = 0
    upserted = 0
    inserted = 0
    skipped = 0
    upsert_batch = []  # fights with both IDs - safe to upsert against unique index
    insert_batch = []  # fights missing an ID - plain insert only

    print(f"Processing {total:,} fights in batches of {BATCH_SIZE:,}...")

    try:
        for fight in fights:
            processed += 1

            # Allow partial UUIDs - only skip if both are missing
            fighter1_id = fight.get("fighter1_id") or fight.get("uuid1")
            fighter2_id = fight.get("fighter2_id") or fight.get("uuid2")

            if not fighter1_id and not fighter2_id:
                skipped += 1
                if processed % 100 == 0 or processed == total:
                    print_progress(processed, total)
                continue

            row = {
                "event": fight.get("event"),
                "event_type": fight.get("event_type"),
                "event_date": fight.get("event_date"),
                "event_time": fight.get("event_time"),
                "event_status": fight.get("event_status", "upcoming"),
                "venue": fight.get("venue"),
                "location": fight.get("location"),
                "fight_card_image_url": fight.get("fight_card_image_url"),
                "fight_card_image_local_path": fight.get("fight_card_image_local_path"),
                "fighter1": fight.get("fighter1"),
                "fighter2": fight.get("fighter2"),
                "fighter1_id": fighter1_id,
                "fighter2_id": fighter2_id,
                "fight_order": fight.get("fight_order"),
                "card_section": fight.get("card_section"),
                "weight_class": fight.get("weight_class"),
                "scraped_at": fight.get("scraped_at"),
            }

            if fighter1_id and fighter2_id:
                upsert_batch.append(row)
                if len(upsert_batch) >= BATCH_SIZE:
                    upserted += flush_upsert_batch(supabase_url, headers, upsert_batch)
                    upsert_batch = []
            else:
                insert_batch.append(row)
                if len(insert_batch) >= BATCH_SIZE:
                    inserted += flush_insert_batch(supabase_url, headers, insert_batch)
                    insert_batch = []

            if processed % 100 == 0 or processed == total:
                print_progress(processed, total)

        # Flush remaining batches
        if upsert_batch:
            upserted += flush_upsert_batch(supabase_url, headers, upsert_batch)
        if insert_batch:
            inserted += flush_insert_batch(supabase_url, headers, insert_batch)

    except KeyboardInterrupt:
        print("\nUpload interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nUpcoming fights upload failed: {e}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("UPCOMING FIGHTS UPLOAD SUMMARY (HTTPS)")
    print("=" * 60)
    print(f"Total fights processed:   {processed:,}")
    print(f"Upserted (stable IDs):    {upserted:,}")
    print(f"Inserted (partial IDs):   {inserted:,}")
    print(f"Skipped (no UUIDs):       {skipped:,}")
    print("=" * 60)
    print("Upload completed!")


if __name__ == "__main__":
    main()