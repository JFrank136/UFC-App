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


def launch_undetected_chrome(options, attempts=2, delay=5):
    """Launch undetected_chromedriver, retrying once on SessionNotCreatedException.

    Right after Chrome auto-updates, undetected_chromedriver has to download and
    patch a fresh driver binary on the spot the next time it's asked for a
    matching version_main. Launching Chrome against a binary that was just
    written a moment earlier is a known flaky window (AV/SmartScreen scanning
    the new exe) that fails with "chrome not reachable" — a short retry after
    the binary has settled on disk succeeds.
    """
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return uc.Chrome(
                options=options,
                use_subprocess=True,
                version_main=get_chrome_major_version(),
            )
        except Exception as e:
            last_error = e
            if attempt < attempts:
                time.sleep(delay)
    raise last_error
