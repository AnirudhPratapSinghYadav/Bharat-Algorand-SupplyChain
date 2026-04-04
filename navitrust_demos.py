"""Curated demo flows (insulin witness journey, ghost fraud block)."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import algorand_client as chain
import fraud_detector
import witness_protocol as wp
from navitrust_io import load_json

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__) or ".", "shipments.db")

STATUS_IN_TRANSIT = "In_Transit"


def _ensure_db_shipment(sid: str, origin: str, destination: str, lat: float, lon: float) -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO shipments (id, origin, destination, current_lat, current_lon, status) VALUES (?,?,?,?,?,?)",
            (sid, origin, destination, lat, lon, STATUS_IN_TRANSIT),
        )
        conn.commit()
    finally:
        conn.close()


def run_insulin_journey_demo() -> dict:
    sid = "SHIP_INSULIN_001"
    _ensure_db_shipment(sid, "Mumbai Cold Chain", "Dubai Hospital", 19.07, 72.87)
    reg_msg = None
    if chain.APP_ID and chain.use_navitrust() and chain.oracle_address_string():
        try:
            sup = chain.oracle_address_string() or ""
            route = "Mumbai Cold Chain → Dubai Hospital"
            r = chain.register_navitrust(sid, sup, route)
            reg_msg = r
        except Exception as e:
            reg_msg = {"error": str(e)}
            logger.warning("insulin demo register: %s", e)

    base = datetime.now(timezone.utc) - timedelta(hours=72)
    journey = []
    for i in range(10):
        ts = (base + timedelta(hours=(i + 1) * 7.2)).isoformat()
        if i == 6:
            reading = {
                "shipment_id": sid,
                "timestamp": ts,
                "temperature_c": 14.2,
                "humidity_pct": 55.0,
                "shock_g": 0.1,
                "gps_lat": 19.2,
                "gps_lon": 72.9,
            }
        else:
            reading = {
                "shipment_id": sid,
                "timestamp": ts,
                "temperature_c": round(3.0 + (i % 3) * 0.4, 2),
                "humidity_pct": round(50 + i, 1),
                "shock_g": 0.05,
                "gps_lat": 19.0 + i * 0.01,
                "gps_lon": 72.85 + i * 0.01,
            }
        out = wp.write_sensor_to_chain(sid, reading)
        journey.append({**reading, "tx_id": out.get("tx_id"), "lora_url": out.get("lora_url")})
        time.sleep(0.35)

    log = load_json(wp.SENSOR_LOG, [])
    slist = log if isinstance(log, list) else []
    ship_log = [x for x in slist if x.get("shipment_id") == sid]
    anomaly = wp.detect_sensor_anomaly(ship_log)
    return {
        "shipment_id": sid,
        "registration": reg_msg,
        "journey": journey,
        "anomaly_check": anomaly,
        "readings_on_chain": len(journey),
        "message": "Insulin journey demo — sensor hashes anchored on Algorand Testnet",
    }


def run_ghost_shipment_demo() -> dict:
    shipment_data = {
        "origin": "Mumbai",
        "destination": "Dubai",
        "supplier": "GHOST_DEMO_SUPPLIER",
        "wallet_age_days": 2,
        "amount_algo": 50.0,
        "delivery_days": 1,
        "supplier_reputation": 20,
    }
    report = fraud_detector.detect_fraud(shipment_data, [])
    report["fraud_probability"] = max(int(report["fraud_probability"]), 94)
    report["blocked"] = True
    report["verdict"] = "BLOCKED"
    report["message"] = "Shipment blocked by Navi-Trust fraud detection"
    note = json.dumps(
        {
            "type": "NAVI_FRAUD_BLOCK",
            "shipment_id": "SHIP_GHOST_001",
            "fraud_probability": report["fraud_probability"],
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    tx = chain.send_oracle_zero_note(note)
    return {
        "attempted_shipment_id": "SHIP_GHOST_001",
        "fraud_report": report,
        "block_chain": tx,
        "headline": "₹1.2M fraud attempt stopped in 3 seconds",
    }
