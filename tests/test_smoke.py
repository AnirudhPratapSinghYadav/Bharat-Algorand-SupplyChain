"""
Phase 0 smoke: core API routes via TestClient (no live HTTP server).
Optional live checks: set LIVE_ALGORAND_SMOKE=1 to require healthy algod/indexer.
"""

import os

from starlette.testclient import TestClient

from app import app


def test_smoke_health():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert isinstance(body.get("algod_ok"), bool)
        assert isinstance(body.get("indexer_ok"), bool)
        if os.environ.get("LIVE_ALGORAND_SMOKE", "").strip().lower() in ("1", "true", "yes"):
            assert body["algod_ok"] is True
            assert body["indexer_ok"] is True


def test_smoke_stats():
    with TestClient(app) as client:
        r = client.get("/stats")
        assert r.status_code == 200
        body = r.json()
        assert "total_shipments" in body
        assert "escrow_total_algo" in body


def test_smoke_verify():
    with TestClient(app) as client:
        r = client.get("/verify/SHIP_SMOKE_VERIFY_001")
        assert r.status_code == 200
        body = r.json()
        assert body.get("shipment_id") == "SHIP_SMOKE_VERIFY_001"
        assert "on_chain_status" in body


def test_smoke_navibot():
    with TestClient(app) as client:
        # Rule path: no Gemini required; must return 200 with text
        r = client.post("/navibot", json={"query": "how does the 4 agent jury work?", "history": []})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("text"), str)
        assert len(body["text"]) > 0
        assert "AI unavailable" not in body["text"]


def test_smoke_run_jury_route_exists():
    with TestClient(app) as client:
        r = client.post(
            "/run-jury",
            json={"shipment_id": "SHIP_SMOKE_JURY_001", "destination_city": "Dubai"},
        )
        assert r.status_code != 404
        assert isinstance(r.json(), dict)


def test_smoke_price():
    with TestClient(app) as client:
        r = client.get("/price")
        assert r.status_code == 200
        body = r.json()
        assert "algo_usd" in body


def test_smoke_escrow_usd():
    with TestClient(app) as client:
        r = client.get("/escrow-usd/SHIP_SMOKE_ESCROW_001")
        assert r.status_code == 200
        body = r.json()
        assert body.get("shipment_id") == "SHIP_SMOKE_ESCROW_001"
        assert "funds_usd" in body


def test_smoke_dispute_feed():
    with TestClient(app) as client:
        r = client.get("/dispute-feed")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
