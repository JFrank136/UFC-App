import os
import sys
import time
import subprocess
from pathlib import Path

import requests
from dotenv import load_dotenv

HTTP_TIMEOUT = 30  # seconds


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


def http_request_with_retry(method, url, headers, params=None, timeout=HTTP_TIMEOUT, max_retries=5):
    backoff = 1.5
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
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


def rest_count(supabase_url, headers, table, extra_params=None):
    """
    Get a row count via PostgREST headers (HEAD + Prefer: count=exact).
    Returns int count, or None if it couldn't be determined.
    """
    url = f"{supabase_url}/rest/v1/{table}"
    h = dict(headers)
    h["Prefer"] = "count=exact"
    params = {"select": "id"}  # minimal select to allow count
    if extra_params:
        params.update(extra_params)

    resp = http_request_with_retry("HEAD", url, headers=h, params=params)
    if resp is None:
        return None
    if resp.status_code not in (200, 204):
        return None

    # Content-Range: 0-0/12345 or */12345
    cr = resp.headers.get("Content-Range")
    if not cr or "/" not in cr:
        return None
    try:
        return int(cr.split("/")[-1])
    except ValueError:
        return None


def run_script(script_name: str) -> bool:
    """
    Run a sibling upload script in a subprocess so sys.exit inside it doesn't kill upload_all.
    """
    script_path = Path(__file__).resolve().parent / script_name
    if not script_path.exists():
        print(f"❌ Missing script: {script_path}")
        return False

    print("\n" + "-" * 60)
    print(f"▶ Running {script_name}")
    print("-" * 60)

    r = subprocess.run([sys.executable, str(script_path)], text=True)
    if r.returncode == 0:
        print(f"✅ {script_name} finished successfully")
        return True
    else:
        print(f"❌ {script_name} failed (exit code {r.returncode})")
        return False


def validate_upload_integrity(supabase_url, headers):
    """
    Lightweight integrity checks via REST:
    - row counts for key tables
    (Deep FK orphan checks require PostgREST relationship metadata and can vary by schema;
     you can add those later if needed.)
    """
    print("\n" + "=" * 60)
    print("🔍 VALIDATING UPLOAD (HTTPS)")
    print("=" * 60)

    tables = ["fighters", "fight_history", "rankings", "upcoming_fights"]
    for t in tables:
        c = rest_count(supabase_url, headers, t)
        if c is None:
            print(f"  {t}: (count unavailable)")
        else:
            print(f"  {t}: {c:,} records")

    print("=" * 60)
    print("✅ Validation complete (counts).")


def main():
    print("🚀 Starting comprehensive database upload (HTTPS)...")
    print("=" * 60)

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

    # Quick connectivity sanity check (443)
    try:
        resp = http_request_with_retry(
            "GET",
            f"{supabase_url}/rest/v1/",
            headers=headers,
            params=None,
            timeout=10,
            max_retries=2,
        )
        # Some projects return 404 here; that's fine. We mainly care that HTTPS works.
        print(f"✅ HTTPS reachable: {supabase_url}")
    except Exception as e:
        print(f"❌ HTTPS connectivity check failed: {e}")
        sys.exit(1)

    # Run uploads in the same logical order
    scripts = [
        "upload_fighters.py",
        "upload_fight_history.py",
        "upload_rankings.py",
        "upload_upcoming_fights.py",
    ]

    success_count = 0
    for s in scripts:
        if run_script(s):
            success_count += 1

    # Validate
    validate_upload_integrity(supabase_url, headers)

    # Summary
    print("\n" + "=" * 60)
    print("📊 UPLOAD SUMMARY (HTTPS)")
    print("=" * 60)
    print(f"Successfully uploaded: {success_count}/{len(scripts)} tables")
    if success_count == len(scripts):
        print("🎉 All data uploaded successfully!")
    else:
        print(f"⚠️ {len(scripts) - success_count} script(s) failed — scroll up to see which one.")
    print("=" * 60)


if __name__ == "__main__":
    main()
