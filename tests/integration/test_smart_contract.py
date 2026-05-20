"""Real TestNet contract calls (skipped without ORACLE_MNEMONIC + APP_ID)."""

import pytest

import algorand_client as chain


@pytest.mark.testnet
def test_register_shipment_status_in_transit(unique_shipment_id, valid_supplier_address):
    route = "Pytest→TestNet"
    out = chain.register_navitrust(unique_shipment_id, valid_supplier_address, route)
    assert out.get("tx_id")
    st = chain.read_shipment_status(unique_shipment_id)
    assert st == "In_Transit"


@pytest.mark.testnet
def test_read_shipment_full_after_register(unique_shipment_id, valid_supplier_address):
    route = "Pytest→Read"
    chain.register_navitrust(unique_shipment_id, valid_supplier_address, route)
    full = chain.read_shipment_full(unique_shipment_id)
    assert full.get("status") in ("In_Transit", "IN_TRANSIT", "In_Transit")
    assert full.get("route") == route


@pytest.mark.testnet
def test_activate_is_noop_on_deployed_contract(unique_shipment_id, valid_supplier_address):
    chain.register_navitrust(unique_shipment_id, valid_supplier_address, "A→B")
    result = chain.activate_shipment_chain(unique_shipment_id)
    assert result is not None
    assert result.get("skipped") is True
    assert result.get("status") == "In_Transit"
