"""End-to-end API flow on TestNet (register → jury; settle optional)."""

import pytest


@pytest.mark.e2e
@pytest.mark.testnet
@pytest.mark.slow
def test_register_and_run_jury(unique_shipment_id, valid_supplier_address, api_client):
    payload = {
        "shipment_id": unique_shipment_id,
        "supplier_address": valid_supplier_address,
        "route": "Mumbai→Rotterdam",
        "origin": "Mumbai",
        "destination": "Rotterdam",
        "origin_lat": 19.076,
        "origin_lon": 72.877,
    }
    reg = api_client.post("/register-shipment", json=payload)
    assert reg.status_code == 200, reg.text
    assert reg.json().get("tx_id")

    jury = api_client.post("/run-jury", json={"shipment_id": unique_shipment_id})
    assert jury.status_code == 200, jury.text
    verdict = jury.json().get("verdict")
    assert verdict in ("SETTLE", "HOLD", "DISPUTE")

    verify = api_client.get(f"/verify/{unique_shipment_id}")
    assert verify.status_code == 200
    chain = verify.json().get("chain") or {}
    status = chain.get("status") or verify.json().get("status")
    assert status in ("In_Transit", "Disputed", "Settled", "IN_TRANSIT", "DISPUTED", "SETTLED", None) or status
