"""Simulated IoT readings hashed and anchored on Algorand (NAVI_SENSOR notes)."""

from __future__ import annotations

import hashlib
import json
import logging
import random
from datetime import datetime, timezone

import algorand_client as chain
from navitrust_io import load_json, save_json

logger = logging.getLogger(__name__)

SENSOR_LOG = "sensor_log.json"


def simulate_sensor_reading(shipment_id: str) -> dict:
    return {
        "shipment_id": shipment_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "temperature_c": round(random.uniform(1.5, 8.5), 2),
        "humidity_pct": round(random.uniform(40, 80), 1),
        "shock_g": round(random.uniform(0, 2.5), 3),
        "gps_lat": round(random.uniform(12, 25), 4),
        "gps_lon": round(random.uniform(55, 80), 4),
    }


def hash_sensor_reading(reading: dict) -> str:
    data = json.dumps(reading, sort_keys=True)
    return hashlib.sha256(data.encode()).hexdigest()


def write_sensor_to_chain(shipment_id: str, reading_override: dict | None = None) -> dict:
    reading = reading_override or simulate_sensor_reading(shipment_id)
    reading_hash = hash_sensor_reading(reading)
    note = json.dumps(
        {
            "type": "NAVI_SENSOR",
            "v": "1",
            "sid": shipment_id,
            "hash": reading_hash,
            "temp": reading["temperature_c"],
            "humid": reading["humidity_pct"],
            "shock": reading["shock_g"],
            "ts": reading["timestamp"],
        }
    )
    res = chain.send_oracle_zero_note(note)
    tx_id = (res or {}).get("tx_id")
    lora_url = (res or {}).get("lora_url") or (
        f"https://lora.algokit.io/testnet/transaction/{tx_id}" if tx_id else ""
    )
    entry = {
        **reading,
        "hash": reading_hash,
        "tx_id": tx_id,
        "lora_url": lora_url,
    }
    sensor_log = load_json(SENSOR_LOG, [])
    if not isinstance(sensor_log, list):
        sensor_log = []
    sensor_log.append(entry)
    save_json(SENSOR_LOG, sensor_log[-500:])
    return {"tx_id": tx_id, "lora_url": lora_url, "reading": reading, "hash": reading_hash}


def detect_sensor_anomaly(readings: list[dict]) -> dict:
    if len(readings) < 5:
        return {"anomaly": False, "reason": "insufficient data"}
    temps = [float(r["temperature_c"]) for r in readings]
    avg = sum(temps) / len(temps)
    for r in readings:
        t = float(r["temperature_c"])
        if t > avg * 2.5:
            return {
                "anomaly": True,
                "detected_at": r.get("timestamp"),
                "value": t,
                "expected_max": round(avg * 1.5, 2),
                "tx_id": r.get("tx_id"),
                "lora_url": r.get("lora_url"),
                "severity": "CRITICAL" if t > 15 else "WARNING",
            }
    return {"anomaly": False, "avg_temp": round(avg, 2)}
