"""POST /void/{shipment_id} HTTP contract (mocked chain)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    import app as application

    return TestClient(application.app)


def test_void_returns_503_without_app_id(client, monkeypatch):
    import app as application

    monkeypatch.setattr(application, "APP_ID", 0)
    r = client.post("/void/PRM-TEST-001")
    assert r.status_code == 503
    assert "detail" in r.json()


def test_void_success_json(client, monkeypatch):
    import app as application

    monkeypatch.setattr(application, "APP_ID", 759052600)
    monkeypatch.setattr(
        application.chain,
        "read_shipment_full",
        lambda _sid: {"status": "In_Transit"},
    )
    monkeypatch.setattr(
        application.chain,
        "void_shipment_chain",
        lambda _sid: {"tx_id": "TXVOID123", "lora_url": "https://lora.example/tx/TXVOID123"},
    )
    r = client.post("/void/PRM-TEST-VOID")
    assert r.status_code == 200
    body = r.json()
    assert body.get("tx_id") == "TXVOID123"
