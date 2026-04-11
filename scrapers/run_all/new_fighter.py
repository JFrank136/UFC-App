import subprocess
import os
import sys  # ADD THIS

def run_script(script_path, input_choice):
    print(f"\n▶️ Running {os.path.basename(script_path)} with choice: {input_choice}")
    proc = subprocess.Popen(
        [sys.executable, script_path],
        stdin=subprocess.PIPE,
        text=True,
        cwd=base_path  # <<< this sets the working directory to /scrapers
    )

    try:
        proc.communicate(input=input_choice + "\n", timeout=300)
    except subprocess.TimeoutExpired:
        print(f"⏱️ Timeout during {script_path}, killing process.")
        proc.kill()

if __name__ == "__main__":
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    scripts = [
        ("scrape_roster.py", "2"),          # Inject new UFC_ROSTER fighters
        ("scrape_details.py", "2"),         # Retry from details_errors.json
        ("scrape_sherdog.py", "2"),         # Retry from sherdog_failures.json
        ("scrape_upcoming_fights.py", "2")  # Log missing UUIDs only
    ]

    for script_name, input_choice in scripts:
        script_path = os.path.join(base_path, script_name)
        run_script(script_path, input_choice)

    print("\n✅ New fighter pipeline complete.")
