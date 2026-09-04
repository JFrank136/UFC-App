"""Detect the installed Chrome major version so undetected_chromedriver can be
pinned to a matching driver instead of grabbing whatever it considers latest.

Without this, undetected_chromedriver's cache can end up holding a driver built
for a newer Chrome than what's actually installed, which fails with
SessionNotCreatedException on every scrape until someone notices and clears
the cache by hand.
"""

import re
import subprocess
import time
import winreg

import undetected_chromedriver as uc
from selenium import webdriver


def get_chrome_major_version():
    """Return the installed Chrome's major version as an int, or None if it can't be found."""
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Google\Chrome\BLBeacon")
        version, _ = winreg.QueryValueEx(key, "version")
        return int(version.split(".")[0])
    except OSError:
        pass

    for path in (
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ):
        try:
            result = subprocess.run(
                ["powershell", "-Command", f"(Get-Item '{path}').VersionInfo.ProductVersion"],
                capture_output=True, text=True, timeout=10,
            )
            match = re.match(r"(\d+)\.", result.stdout.strip())
            if match:
                return int(match.group(1))
        except (OSError, subprocess.TimeoutExpired):
            continue

    return None


def launch_undetected_chrome(options_factory, attempts=2, delay=5):
    """Launch undetected_chromedriver, retrying once on SessionNotCreatedException.

    Right after Chrome auto-updates, undetected_chromedriver has to download and
    patch a fresh driver binary on the spot the next time it's asked for a
    matching version_main. Launching Chrome against a binary that was just
    written a moment earlier is a known flaky window (AV/SmartScreen scanning
    the new exe) that fails with "chrome not reachable" — a short retry after
    the binary has settled on disk succeeds.

    `options_factory` is a zero-arg callable that builds a fresh ChromeOptions
    each call — a ChromeOptions instance is consumed the moment it's handed to
    a driver constructor (even a failing one), so reusing one across attempts
    raises "you cannot reuse the ChromeOptions object" instead of retrying.
    """
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return uc.Chrome(
                options=options_factory(),
                use_subprocess=True,
                version_main=get_chrome_major_version(),
            )
        except Exception as e:
            last_error = e
            if attempt < attempts:
                time.sleep(delay)
    raise last_error


def launch_chrome(options_factory, attempts=2, delay=5):
    """Launch a plain selenium Chrome driver, retrying once on SessionNotCreatedException.

    Same "chrome not reachable" flaky window launch_undetected_chrome retries around
    (see its docstring, including why options must be a factory), but for scripts
    scraping sites that don't need undetected_chromedriver's stealth features
    (e.g. scrape_rankings.py on ufc.com).
    """
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return webdriver.Chrome(options=options_factory())
        except Exception as e:
            last_error = e
            if attempt < attempts:
                time.sleep(delay)
    raise last_error
