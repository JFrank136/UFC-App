import os
import sys
import json
import time
from uuid import UUID
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv


# ----------------------------
# Config / Paths
# ----------------------------
FIGHTERS_PATH = "../data/fighters.json"
BATCH_SIZE = 500
HTTP_TIMEOUT = 30  # seconds


# ----------------------------
# Helpers
# ----------------------------
def print_progress(current, total, prefix="Progress", bar_length=50):
    percent = float(current) * 100 / total if total else 100.0
    filled_length = int(bar_length * current // total) if total else bar_length
    bar = "█" * filled_length + "-" * (bar_length - filled_length)
    sys.stdout.write(f"\r{prefix}: |{bar}| {percent:.1f}% ({current}/{total})")
    sys.stdout.flush()


def clean_numeric(value):
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        if v.lower() in {"unknown", "n/a", "-", ""}:
            return None
        try:
            return float(v) if "." in v else int(v)
        except ValueError:
            return None
    if isinstance(value, (int, float)):
        return value
    return None


def clean_time_field(value):
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        if v.lower() in {"unknown", "n/a", "-", "", "00:00"}:
            return None
        return v
    return str(value) if value else None


def validate_fighter_data(fighter, index):
    errors = []
    if not fighter.get("id"):
        errors.append("Missing ID")
    else:
        try:
            UUID(fighter["id"])
        except ValueError:
            errors.append("Invalid UUID format")
    if not fighter.get("name"):
        errors.append("Missing name")
    return errors


def get_supabase_url_from_env():
    """Prefer SUPABASE_URL; fallback to deriving from SUPABASE_DB_HOST if needed."""
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
    """
    Basic retry for transient errors / rate limits.
    """
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

            # Rate limited
            if resp.status_code == 429:
                wait = float(resp.headers.get("Retry-After", backoff ** attempt))
                time.sleep(wait)
                continue

            # Transient 5xx
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
    # Load .env from project root (UFC-App/.env)
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    supabase_url = get_supabase_url_from_env()
    headers = sb_headers()

    print("=== Supabase REST Upload: fighters ===")
    print("Script dir:", str(Path(__file__).resolve().parent))
    print(".env path :", str(env_path))
    print("SUPABASE_URL:", supabase_url if supabase_url else "MISSING")
    print("Key present:", "YES" if headers else "NO")

    if not supabase_url:
        print("\n❌ Missing SUPABASE_URL (or could not derive it). Add SUPABASE_URL to your .env.")
        sys.exit(1)

    if not headers:
        print("\n❌ Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY in your .env.")
        sys.exit(1)

    # Load fighters JSON
    if not os.path.exists(FIGHTERS_PATH):
        print(f"\n❌ File not found: {FIGHTERS_PATH}")
        sys.exit(1)

    try:
        with open(FIGHTERS_PATH, "r", encoding="utf-8") as f:
            fighters = json.load(f)
        print(f"\n✅ Loaded {len(fighters):,} fighters from {FIGHTERS_PATH}")
    except Exception as e:
        print(f"\n❌ Failed to load fighters file: {e}")
        sys.exit(1)

    # IMPORTANT: wipe table (matches your old behavior)
    # This requires service_role or permissive RLS.
    print("\n⚠️ Deleting existing fighters from Supabase (REST)...")
    delete_url = f"{supabase_url}/rest/v1/fighters"
    delete_params = {"id": "not.is.null"}  # delete all rows
    resp = http_request_with_retry("DELETE", delete_url, headers=headers, params=delete_params)

    if resp is None:
        print("❌ Delete request failed (no response).")
        sys.exit(1)

    if resp.status_code not in (200, 204):
        print(f"❌ Delete failed: HTTP {resp.status_code}")
        print(resp.text[:1000])
        sys.exit(1)

    print("✅ Fighters table cleared")

    # Upsert endpoint
    upsert_url = f"{supabase_url}/rest/v1/fighters"
    # Prefer upsert behavior
    upsert_headers = dict(headers)
    upsert_headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    total = len(fighters)
    processed = 0
    successful = 0
    validation_failures = 0

    batch = []

    def flush_batch(batch_payload):
        if not batch_payload:
            return 0
        # on_conflict=id makes it an upsert by PK
        params = {"on_conflict": "id"}
        resp2 = http_request_with_retry(
            "POST",
            upsert_url,
            headers=upsert_headers,
            params=params,
            json_body=batch_payload,
        )
        if resp2 is None:
            raise RuntimeError("No response from Supabase on batch upsert.")

        if resp2.status_code not in (200, 201, 204):
            raise RuntimeError(f"Batch upsert failed: HTTP {resp2.status_code} :: {resp2.text[:1000]}")

        return len(batch_payload)

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        for idx, fighter in enumerate(fighters, start=1):
            processed += 1

            errors = validate_fighter_data(fighter, idx)
            if errors:
                validation_failures += 1
                if processed % 50 == 0 or processed == total:
                    print_progress(processed, total, "Processing")
                continue

            row = {
                "id": fighter["id"],
                "name": fighter["name"],
                "nickname": fighter.get("nickname"),
                "profile_url_ufc": fighter.get("profile_url_ufc"),
                "height": clean_numeric(fighter.get("height")),
                "weight": clean_numeric(fighter.get("weight")),
                "reach": clean_numeric(fighter.get("reach")),
                "status": fighter.get("status"),
                "country": fighter.get("country"),
                "age": clean_numeric(fighter.get("age")),
                "gender": fighter.get("gender"),
                "weight_class": fighter.get("weight_class"),
                "wins_total": clean_numeric(fighter.get("wins_total")),
                "losses_total": clean_numeric(fighter.get("losses_total")),
                "draws_total": clean_numeric(fighter.get("draws_total")),
                "ufc_wins_total": clean_numeric(fighter.get("ufc_wins_total")),
                "ufc_losses_total": clean_numeric(fighter.get("ufc_losses_total")),
                "ufc_draws_total": clean_numeric(fighter.get("ufc_draws_total")),
                "ufc_wins_ko": clean_numeric(fighter.get("ufc_wins_ko")),
                "ufc_wins_sub": clean_numeric(fighter.get("ufc_wins_sub")),
                "ufc_wins_dec": clean_numeric(fighter.get("ufc_wins_dec")),
                "ufc_losses_ko": clean_numeric(fighter.get("ufc_losses_ko")),
                "ufc_losses_sub": clean_numeric(fighter.get("ufc_losses_sub")),
                "ufc_losses_dec": clean_numeric(fighter.get("ufc_losses_dec")),
                "sig_strikes_landed_per_min": fighter.get("sig_strikes_landed_per_min"),
                "sig_strikes_absorbed_per_min": fighter.get("sig_strikes_absorbed_per_min"),
                "takedown_avg_per_15min": fighter.get("takedown_avg_per_15min"),
                "submission_avg_per_15min": fighter.get("submission_avg_per_15min"),
                "sig_str_defense": fighter.get("sig_str_defense"),
                "knockdown_avg": clean_numeric(fighter.get("knockdown_avg")),
                "avg_fight_time": clean_time_field(fighter.get("avg_fight_time")),
                "created_at": now_iso,
                "profile_url_tapology": fighter.get("profile_url_tapology"),
                "image_url": fighter.get("image_url"),
                "image_local_path": fighter.get("image_local_path"),
                "takedown_defense": fighter.get("takedown_defense"),
                "striking_accuracy": fighter.get("striking_accuracy"),
                "takedown_accuracy": fighter.get("takedown_accuracy"),
                # PostgREST can accept JSON objects directly for json/jsonb columns
                "sig_strikes_by_position": fighter.get("sig_strikes_by_position"),
                "sig_strikes_by_target": fighter.get("sig_strikes_by_target"),
            }

            batch.append(row)

            if len(batch) >= BATCH_SIZE:
                inserted = flush_batch(batch)
                successful += inserted
                batch = []

            if processed % 50 == 0 or processed == total:
                print_progress(processed, total, "Processing")

        if batch:
            inserted = flush_batch(batch)
            successful += inserted

    except KeyboardInterrupt:
        print("\n⚠️ Upload interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fighter upload failed: {e}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("📊 FIGHTERS UPLOAD SUMMARY (HTTPS)")
    print("=" * 60)
    print(f"Total fighters processed: {processed:,}")
    print(f"Successfully upserted:    {successful:,}")
    print(f"Validation failures:      {validation_failures:,}")
    print("=" * 60)
    print("✅ Upload completed!")


if __name__ == "__main__":
    main()
