import os
import sys
import json
import time
from uuid import uuid4
from pathlib import Path

import requests
from dotenv import load_dotenv

RANKINGS_PATH = Path(__file__).resolve().parent.parent / "data" / "ufc_rankings.json"
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

    # fallback derive from db host if present: db.<ref>.supabase.co -> https://<ref>.supabase.co
    db_host = os.getenv("SUPABASE_DB_HOST")
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

            # rate limit
            if resp.status_code == 429:
                wait = float(resp.headers.get("Retry-After", backoff ** attempt))
                time.sleep(wait)
                continue

            # transient server errors
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


def flush_batch(supabase_url, headers, batch):
    if not batch:
        return 0

    url = f"{supabase_url}/rest/v1/rankings"
    h = dict(headers)
    h["Prefer"] = "return=minimal"

    resp = http_request_with_retry("POST", url, headers=h, json_body=batch)

    if resp is None:
        raise RuntimeError("No response from Supabase on batch insert.")

    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Batch insert failed: HTTP {resp.status_code} :: {resp.text[:1000]}")

    return len(batch)


def main():
    print("📋 Uploading UFC rankings (HTTPS)...")

    # Load .env from project root
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    supabase_url = get_supabase_url_from_env()
    headers = sb_headers()

    if not supabase_url:
        print("❌ Missing SUPABASE_URL (or could not derive it). Add SUPABASE_URL to your .env.")
        sys.exit(1)

    if not headers:
        print("❌ Missing SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY in your .env.")
        sys.exit(1)

    if not os.path.exists(RANKINGS_PATH):
        print(f"❌ Rankings file not found: {RANKINGS_PATH}")
        sys.exit(1)

    try:
        with open(RANKINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load rankings file: {e}")
        sys.exit(1)

    # Clear table (matches old TRUNCATE intent)
    print("⚠️ Clearing existing rankings from Supabase (REST delete all)...")
    delete_url = f"{supabase_url}/rest/v1/rankings"
    delete_params = {"id": "not.is.null"}
    resp = http_request_with_retry("DELETE", delete_url, headers=headers, params=delete_params)
    if resp is None:
        print("❌ Delete request failed (no response).")
        sys.exit(1)
    if resp.status_code not in (200, 204):
        print(f"❌ Delete failed: HTTP {resp.status_code}")
        print(resp.text[:1000])
        sys.exit(1)
    print("✅ rankings cleared")

    total = sum(len(d.get("fighters", [])) for d in data)
    processed = 0
    inserted = 0
    batch = []

    try:
        for entry in data:
            division = entry.get("division")
            fighters = entry.get("fighters", [])
            for fighter in fighters:
                batch.append(
                    {
                        "id": str(uuid4()),
                        "division": division,
                        "rank": str(fighter.get("rank")),
                        "name": fighter.get("name"),
                        "uuid": fighter.get("uuid"),
                        "change": fighter.get("change"),
                    }
                )

                processed += 1

                if len(batch) >= BATCH_SIZE:
                    inserted += flush_batch(supabase_url, headers, batch)
                    batch = []

                if processed % 100 == 0 or processed == total:
                    print_progress(processed, total)

        if batch:
            inserted += flush_batch(supabase_url, headers, batch)

    except KeyboardInterrupt:
        print("\n⚠️ Upload interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Rankings upload failed: {e}")
        sys.exit(1)

    print("\n📊 RANKINGS UPLOAD SUMMARY (HTTPS)")
    print("=" * 60)
    print(f"Total fighters processed: {processed:,}")
    print(f"Successfully inserted:   {inserted:,}")
    print("=" * 60)
    print("✅ Upload completed!")


if __name__ == "__main__":
    main()
