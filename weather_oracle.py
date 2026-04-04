"""Hourly multi-port weather snapshots on-chain (NAVI_WEATHER_ORACLE)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import algorand_client as chain
from navitrust_io import load_json, save_json
from weather_real import TOP_PORTS, fetch_weather_real

logger = logging.getLogger(__name__)

WEATHER_LOG = "weather_oracle_log.json"


def write_weather_oracle_tick() -> list[dict]:
    results: list[dict] = []
    for city in TOP_PORTS:
        try:
            weather = fetch_weather_real(city)
            note = json.dumps(
                {
                    "type": "NAVI_WEATHER_ORACLE",
                    "city": city,
                    "temp": weather["temperature_c"],
                    "precip": weather["precipitation_mm"],
                    "wind": weather["wind_kmh"],
                    "code": weather["weather_code"],
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            )
            res = chain.send_oracle_zero_note(note)
            tx_id = (res or {}).get("tx_id")
            results.append(
                {
                    "city": city,
                    "tx_id": tx_id,
                    "lora_url": (res or {}).get("lora_url"),
                    "weather": weather,
                }
            )
        except Exception as e:
            results.append({"city": city, "error": str(e)})
    log = load_json(WEATHER_LOG, [])
    if not isinstance(log, list):
        log = []
    log.extend(results)
    save_json(WEATHER_LOG, log[-2000:])
    return results


def latest_by_city() -> dict[str, dict]:
    log = load_json(WEATHER_LOG, [])
    if not isinstance(log, list):
        return {}
    latest: dict[str, dict] = {}
    for row in reversed(log):
        c = row.get("city")
        if c and c not in latest and "weather" in row:
            latest[str(c)] = row
    return latest


def history_city(city: str, hours: int = 72) -> list[dict]:
    log = load_json(WEATHER_LOG, [])
    if not isinstance(log, list):
        return []
    city_l = city.strip().lower()
    rows = [r for r in log if str(r.get("city", "")).lower() == city_l]
    # Approximate: keep last N entries per city (hourly ~ 72 max useful)
    cap = max(1, min(hours, 168))
    return rows[-cap:]


def dispute_evidence_for_shipment(
    destination_city: str,
    shipment_id: str,
    hours: int = 72,
) -> dict:
    readings = history_city(destination_city, hours=hours)
    return {
        "shipment_id": shipment_id,
        "destination_city": destination_city,
        "hours_window": hours,
        "readings": readings,
        "blockchain_weather_record": "Blockchain Weather Record — Cannot Be Disputed",
        "proofs": [r.get("lora_url") for r in readings if r.get("lora_url")],
    }
