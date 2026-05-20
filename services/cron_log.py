"""Append-only log of autonomous auto-jury runs (for GET /cron-log)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
CRON_LOG_PATH = ROOT / "cron_log.json"
MAX_ENTRIES = 200


def append_cron_entry(entry: dict[str, Any]) -> None:
    entry = {**entry, "timestamp": entry.get("timestamp") or datetime.now(timezone.utc).isoformat()}
    rows: list[dict[str, Any]] = []
    if CRON_LOG_PATH.is_file():
        try:
            raw = json.loads(CRON_LOG_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                rows = raw
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("cron_log read failed: %s", e)
    rows.append(entry)
    rows = rows[-MAX_ENTRIES:]
    try:
        CRON_LOG_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    except OSError as e:
        logger.warning("cron_log write failed: %s", e)


def list_cron_entries(limit: int = 50) -> list[dict[str, Any]]:
    limit = max(1, min(limit, MAX_ENTRIES))
    if not CRON_LOG_PATH.is_file():
        return []
    try:
        raw = json.loads(CRON_LOG_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return list(reversed(raw[-limit:]))
    except (json.JSONDecodeError, OSError):
        return []
