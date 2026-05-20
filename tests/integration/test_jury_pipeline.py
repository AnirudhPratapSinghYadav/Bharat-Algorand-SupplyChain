"""Four-agent jury pipeline (TestNet + SQLite)."""

import pytest

from app import run_four_agent_jury


def _seed_shipment_row(shipment_id: str, origin: str, destination: str):
    import app as app_module

    with app_module.get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO shipments
            (id, origin, destination, current_lat, current_lon, supplier_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (shipment_id, origin, destination, 19.0, 72.0, ""),
        )
        conn.commit()


@pytest.mark.testnet
@pytest.mark.slow
def test_run_four_agent_jury(unique_shipment_id, valid_supplier_address, api_client):
    import algorand_client as chain

    chain.register_navitrust(unique_shipment_id, valid_supplier_address, "Mumbai→Delhi")
    _seed_shipment_row(unique_shipment_id, "Mumbai", "Delhi")
    result = run_four_agent_jury(unique_shipment_id, "Delhi")
    assert "arbiter" in result
    assert result["arbiter"]["verdict"] in ("SETTLE", "HOLD", "DISPUTE")
    assert "sentinel" in result
    assert "weather" in result


@pytest.mark.testnet
def test_run_jury_endpoint(unique_shipment_id, valid_supplier_address, api_client):
    import algorand_client as chain

    chain.register_navitrust(unique_shipment_id, valid_supplier_address, "API→Jury")
    _seed_shipment_row(unique_shipment_id, "Mumbai", "Chennai")
    r = api_client.post("/run-jury", json={"shipment_id": unique_shipment_id})
    assert r.status_code == 200
    data = r.json()
    assert data.get("verdict") in ("SETTLE", "HOLD", "DISPUTE")
    assert "agents" in data or "arbiter" in data
