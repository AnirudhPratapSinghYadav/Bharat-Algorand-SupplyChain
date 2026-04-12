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


def test_simulate_event_unknown_shipment():
    with TestClient(app) as client:
        r = client.post(
            "/simulate-event",
            json={"shipment_id": "SHIP_DOES_NOT_EXIST_999", "event": "test"},
        )
        assert r.status_code == 400


def test_simulate_event_ok():
    with TestClient(app) as client:
        r = client.post(
            "/simulate-event",
            json={
                "shipment_id": "SHIP_MUMBAI_001",
                "event": "GPS calibration drift (demo)",
                "severity": "medium",
            },
        )
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        assert j.get("stored", {}).get("shipment_id") == "SHIP_MUMBAI_001"
