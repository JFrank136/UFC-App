#!/usr/bin/env python3
"""
UFC Data Pipeline Manager
Single entry point for all UFC data operations
"""

import os
import sys
import json
import subprocess
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

class PipelineMode(Enum):
    FULL_REFRESH = "full"
    WEEKLY_UPDATE = "weekly" 
    POST_EVENT = "post_event"
    TEST_RUN = "test"

@dataclass
class PipelineConfig:
    """Configuration for pipeline execution"""
    mode: PipelineMode
    skip_upload: bool = False
    max_workers: int = 4
    test_limit: Optional[int] = None  # Limit records for testing

class PipelineManager:
    def __init__(self, config: PipelineConfig):
        self.config = config
        self.base_path = Path(__file__).parent / "scrapers"
        self.data_path = self.base_path / "data"
        self.errors_path = self.data_path / "errors"
        self.start_time = datetime.now()
        
        # Ensure directories exist
        self.data_path.mkdir(exist_ok=True)
        self.errors_path.mkdir(exist_ok=True)
    
    def run_script(self, script_name: str, choice: str = "1", timeout: int = 1800) -> bool:
        """Run a scraper script with automatic input"""
        script_path = self.base_path / script_name
        if not script_path.exists():
            print(f"❌ Script not found: {script_name}")
            return False
        
        print(f"\n🔄 Running {script_name} (choice: {choice})")
        try:
            proc = subprocess.run(
                [sys.executable, str(script_path)],
                input=choice + "\n",
                text=True,
                cwd=self.base_path,
                timeout=timeout,
                capture_output=True
            )
            
            if proc.returncode == 0:
                print(f"✅ {script_name} completed successfully")
                return True
            else:
                print(f"❌ {script_name} failed with return code {proc.returncode}")
                if proc.stderr:
                    print(f"Error output: {proc.stderr[-500:]}")  # Last 500 chars
                return False
                
        except subprocess.TimeoutExpired:
            print(f"⏱️ {script_name} timed out after {timeout}s")
            return False
        except Exception as e:
            print(f"❌ Error running {script_name}: {e}")
            return False
    
    def check_data_exists(self, filepath: str) -> bool:
        """Check if data file exists and has content"""
        path = self.data_path / filepath
        if not path.exists():
            return False
        
        try:
            with open(path, 'r') as f:
                data = json.load(f)
                return len(data) > 0
        except:
            return False
    
    def get_error_counts(self) -> Dict[str, int]:
        """Get count of errors from all error files"""
        error_counts = {}
        for error_file in self.errors_path.glob("*.json"):
            try:
                with open(error_file, 'r') as f:
                    data = json.load(f)
                    error_counts[error_file.stem] = len(data)
            except:
                error_counts[error_file.stem] = 0
        return error_counts
    
    def run_full_refresh(self) -> bool:
        """Complete data refresh - everything from scratch"""
        print("\n🔄 FULL REFRESH MODE")
        print("=" * 50)
        
        steps = [
            ("scrape_roster.py", "1"),
            ("scrape_details.py", "1"), 
            ("scrape_sherdog.py", "1"),
            ("scrape_rankings.py", "1"),
            ("scrape_upcoming_fights.py", "1"),
            ("merge_fighters.py", ""),
            ("merge_past_fights.py", ""),
        ]
        
        if not self.config.skip_upload:
            steps.extend([
                ("upload_fighters.py", ""),
                ("upload_fight_history.py", ""),
                ("upload_rankings.py", ""),
                ("upload_upcoming_fights.py", ""),
            ])
        
        return self._run_steps(steps)
    
    def run_weekly_update(self) -> bool:
        """Weekly update - rankings, upcoming fights, retry errors"""
        print("\n📅 WEEKLY UPDATE MODE")
        print("=" * 50)
        
        steps = [
            ("scrape_rankings.py", "1"),
            ("scrape_upcoming_fights.py", "1"),
        ]
        
        # Check for errors to retry
        if self.check_data_exists("errors/details_errors.json"):
            steps.append(("scrape_details.py", "2"))
        
        if self.check_data_exists("errors/sherdog_failures.json"):
            steps.append(("scrape_sherdog.py", "2"))
        
        # Always merge and upload for weekly updates
        steps.extend([
            ("merge_fighters.py", ""),
            ("upload_fighters.py", ""),
            ("upload_rankings.py", ""),
            ("upload_upcoming_fights.py", ""),
        ])
        
        return self._run_steps(steps)
    
    def run_post_event(self) -> bool:
        """Post-event update - fighter details, rankings, and upcoming fights"""
        print("\n🥊 POST-EVENT UPDATE MODE")
        print("=" * 50)
        
        steps = [
            ("scrape_details.py", "3"),  # Update ranked fighter images
            ("scrape_rankings.py", "1"),
            ("scrape_upcoming_fights.py", "1"),
            ("merge_fighters.py", ""),
        ]
        
        if not self.config.skip_upload:
            steps.extend([
                ("upload_fighters.py", ""),
                ("upload_rankings.py", ""),
                ("upload_upcoming_fights.py", ""),
            ])
        
        return self._run_steps(steps)
    
    def run_test_mode(self) -> bool:
        """Test mode - limited data, no uploads"""
        print("\n🧪 TEST MODE")
        print("=" * 50)
        
        # For testing, just run core scrapers with retries
        steps = []
        
        if self.check_data_exists("errors/details_errors.json"):
            steps.append(("scrape_details.py", "2"))
        else:
            print("ℹ️ No details errors to retry, skipping details scraping")
        
        if self.check_data_exists("errors/sherdog_failures.json"):
            steps.append(("scrape_sherdog.py", "2"))
        else:
            print("ℹ️ No Sherdog failures to retry, skipping Sherdog scraping")
        
        # Always test merge
        steps.append(("merge_fighters.py", ""))
        
        return self._run_steps(steps)
    
    def _run_steps(self, steps: List[tuple]) -> bool:
        """Execute a list of pipeline steps"""
        total_steps = len(steps)
        completed = 0
        
        for i, (script, choice) in enumerate(steps, 1):
            print(f"\n📍 Step {i}/{total_steps}: {script}")
            
            if self.run_script(script, choice):
                completed += 1
            else:
                print(f"⚠️ Step {i} failed, but continuing...")
        
        return completed == total_steps
    
    def show_summary(self, success: bool):
        """Show pipeline execution summary"""
        duration = datetime.now() - self.start_time
        
        print("\n" + "=" * 60)
        print("📊 PIPELINE EXECUTION SUMMARY")
        print("=" * 60)
        print(f"Mode: {self.config.mode.value}")
        print(f"Duration: {duration}")
        print(f"Status: {'✅ SUCCESS' if success else '❌ FAILED'}")
        
        # Show data file status
        print("\n📁 Data Files:")
        data_files = [
            "ufc_fighters_raw.json",
            "ufc_details.json", 
            "sherdog_fighters.json",
            "ufc_rankings.json",
            "upcoming_fights.json",
            "fighters.json",
            "fight_history.json"
        ]
        
        for filename in data_files:
            if self.check_data_exists(filename):
                print(f"  ✅ {filename}")
            else:
                print(f"  ❌ {filename} (missing or empty)")
        
        # Show error counts
        error_counts = self.get_error_counts()
        if error_counts:
            print("\n⚠️ Error Files:")
            for error_type, count in error_counts.items():
                print(f"  {error_type}: {count} errors")
        else:
            print("\n✅ No error files found")
        
        print("=" * 60)

def main():
    print("🥊 UFC Data Pipeline Manager")
    print("=" * 60)
    
    # Mode selection
    print("\nSelect pipeline mode:")
    print("[1] Full Refresh (complete rebuild)")
    print("[2] Weekly Update (rankings + upcoming fights + error retries)")
    print("[3] Post-Event Update (ranked fighter images + current data)")
    print("[4] Test Mode (retry errors only, no uploads)")
    
    choice = input("\nEnter choice (1-4): ").strip()
    
    mode_map = {
        "1": PipelineMode.FULL_REFRESH,
        "2": PipelineMode.WEEKLY_UPDATE,
        "3": PipelineMode.POST_EVENT,
        "4": PipelineMode.TEST_RUN,
    }
    
    if choice not in mode_map:
        print("❌ Invalid choice")
        sys.exit(1)
    
    mode = mode_map[choice]
    
    # Additional options
    skip_upload = False
    if mode != PipelineMode.TEST_RUN:
        skip_upload = input("Skip database uploads? (y/N): ").lower().startswith('y')
    else:
        skip_upload = True  # Always skip uploads in test mode
    
    # Create configuration
    config = PipelineConfig(
        mode=mode,
        skip_upload=skip_upload,
        max_workers=4
    )
    
    # Run pipeline
    pipeline = PipelineManager(config)
    
    print(f"\n🚀 Starting {mode.value} pipeline...")
    if skip_upload:
        print("⚠️ Database uploads will be skipped")
    
    # Execute based on mode
    if mode == PipelineMode.FULL_REFRESH:
        success = pipeline.run_full_refresh()
    elif mode == PipelineMode.WEEKLY_UPDATE:
        success = pipeline.run_weekly_update()
    elif mode == PipelineMode.POST_EVENT:
        success = pipeline.run_post_event()
    elif mode == PipelineMode.TEST_RUN:
        success = pipeline.run_test_mode()
    
    pipeline.show_summary(success)

if __name__ == "__main__":
    main()