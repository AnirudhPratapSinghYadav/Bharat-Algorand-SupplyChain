from starlette.testclient import TestClient

from app import app


def test_health_ok():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert "app_id" in body
        assert "network" in body
        assert "algod_ok" in body
        assert "db_ok" in body
        assert "oracle_configured" in body
        assert "gemini_configured" in body
