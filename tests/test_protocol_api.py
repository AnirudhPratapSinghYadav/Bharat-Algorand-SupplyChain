from starlette.testclient import TestClient

from app import app


def test_protocol_display_global_state_shape():
    with TestClient(app) as client:
        r = client.get("/protocol/display-global-state")
        assert r.status_code == 200
        body = r.json()
        assert "app_id" in body
        assert "fields" in body
        assert isinstance(body["fields"], dict)


def test_audit_trail_route_exists():
    with TestClient(app) as client:
        r = client.get("/audit-trail/SHIP_PROTOCOL_TEST_001")
        assert r.status_code == 200
        j = r.json()
        assert j.get("shipment_id") == "SHIP_PROTOCOL_TEST_001"
        assert "entries" in j


def test_dispute_feed_has_network():
    with TestClient(app) as client:
        r = client.get("/dispute-feed")
        assert r.status_code == 200
        j = r.json()
        assert j.get("network") == "algorand_testnet"
        assert "total_items" in j
