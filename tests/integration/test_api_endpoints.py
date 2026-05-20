"""FastAPI routes (no testnet required)."""

import re

import responses
from freezegun import freeze_time

from app import COINGECKO_SIMPLE_PRICE_URL, _ALGO_PRICE_CACHE


def test_health_endpoint(api_client):
    r = api_client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "oracle_ready" in data
    assert "algod_ok" in data


def test_config_endpoint(api_client):
    r = api_client.get("/config")
    assert r.status_code == 200
    data = r.json()
    assert "app_id" in data
    assert "demo_shipments" in data
    assert isinstance(data["demo_shipments"], list)


@responses.activate
def test_price_endpoint_fallback(api_client):
    _ALGO_PRICE_CACHE["ts"] = 0.0
    _ALGO_PRICE_CACHE["payload"] = None
    responses.add(
        responses.GET,
        re.compile(re.escape(COINGECKO_SIMPLE_PRICE_URL) + r".*"),
        json={},
        status=500,
    )
    r = api_client.get("/price")
    assert r.status_code == 200
    data = r.json()
    assert data.get("algo_usd") is not None
    assert data.get("source") == "fallback"


def test_verify_unknown_shipment(api_client):
    r = api_client.get("/verify/SHIP_DOES_NOT_EXIST_PYTEST")
    assert r.status_code == 200
    body = r.json()
    assert "chain" in body or "shipment_id" in body


@freeze_time("2025-05-20T12:00:00Z")
def test_audit_trail_empty(api_client):
    r = api_client.get("/audit-trail/SHIP_AUDIT_EMPTY")
    assert r.status_code == 200
    assert r.json().get("shipment_id") == "SHIP_AUDIT_EMPTY"


def test_simulate_event_requires_db_row(api_client, sample_shipment_id):
    import app as app_module

    with app_module.get_db() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO shipments
            (id, origin, destination, current_lat, current_lon, supplier_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (sample_shipment_id, "Mumbai", "Delhi", 19.0, 72.0, ""),
        )
        conn.commit()
    r = api_client.post(
        "/simulate-event",
        json={"shipment_id": sample_shipment_id, "event": "delay", "severity": "medium"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert body.get("event", {}).get("shipment_id") == sample_shipment_id
