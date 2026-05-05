import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

THRESHOLDS: dict = {
    "ufc_fighters_raw.json": {
        "min_records": 100,
        "max_drop_pct": 20,
        "required_fields": ["id", "name"],
        "warn_only": False,
    },
    "ufc_details.json": {
        "min_records": 100,
        "max_drop_pct": 20,
        "required_fields": ["id", "name"],
        "warn_only": False,
    },
    "tapology_fighters.json": {
        "min_records": 100,
        "max_drop_pct": 20,
        "required_fields": ["name"],
        "warn_only": False,
    },
    "ufc_rankings.json": {
        "min_records": 10,
        "max_drop_pct": 30,
        "required_fields": [],
        "warn_only": False,
    },
    "upcoming_fights.json": {
        "min_records": 1,
        "max_drop_pct": None,
        "required_fields": [],
        "warn_only": True,
    },
    "fighters.json": {
        "min_records": 100,
        "max_drop_pct": 10,
        "required_fields": ["id", "name"],
        "warn_only": False,
    },
    "fight_history.json": {
        "min_records": 1000,
        "max_drop_pct": 20,
        "required_fields": ["fighter_id"],
        "warn_only": False,
    },
}


@dataclass
class ValidationResult:
    passed: bool
    warn_only: bool = False
    reason: str = ""
    record_count: int = 0
    previous_count: int = 0


def validate_file(
    data_path: Path, backup_path: Optional[Path] = None
) -> ValidationResult:
    """Validate a data file against defined thresholds."""
    cfg = THRESHOLDS.get(data_path.name)
    if cfg is None:
        return ValidationResult(passed=True, reason=f"No thresholds for {data_path.name}")

    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ValidationResult(passed=False, reason=f"File not found: {data_path}")
    except json.JSONDecodeError as e:
        return ValidationResult(passed=False, reason=f"Invalid JSON in {data_path.name}: {e}")

    if not isinstance(data, list):
        return ValidationResult(
            passed=False, reason=f"Expected JSON array, got {type(data).__name__}"
        )

    count = len(data)

    if count < cfg["min_records"]:
        return ValidationResult(
            passed=False,
            warn_only=cfg["warn_only"],
            reason=f"Too few records: {count} (minimum {cfg['min_records']})",
            record_count=count,
        )

    previous_count = 0
    if backup_path and backup_path.exists() and cfg["max_drop_pct"] is not None:
        try:
            prev = json.loads(backup_path.read_text(encoding="utf-8"))
            previous_count = len(prev) if isinstance(prev, list) else 0
            if previous_count > 0:
                drop_pct = (previous_count - count) / previous_count * 100
                if drop_pct > cfg["max_drop_pct"]:
                    return ValidationResult(
                        passed=False,
                        warn_only=cfg["warn_only"],
                        reason=(
                            f"Count dropped {drop_pct:.1f}% "
                            f"(was {previous_count}, now {count}), "
                            f"threshold {cfg['max_drop_pct']}%"
                        ),
                        record_count=count,
                        previous_count=previous_count,
                    )
        except (json.JSONDecodeError, OSError):
            pass

    required = cfg["required_fields"]
    if required:
        bad = [
            i
            for i, row in enumerate(data)
            if not isinstance(row, dict) or any(not row.get(f) for f in required)
        ]
        if bad:
            return ValidationResult(
                passed=False,
                reason=f"{len(bad)} rows missing required fields {required}",
                record_count=count,
                previous_count=previous_count,
            )

    return ValidationResult(
        passed=True,
        warn_only=cfg["warn_only"],
        record_count=count,
        previous_count=previous_count,
    )
