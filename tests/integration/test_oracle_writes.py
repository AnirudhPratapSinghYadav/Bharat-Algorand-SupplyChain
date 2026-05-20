"""Oracle-signed on-chain writes on TestNet."""

import json

import pytest

import algorand_client as chain


@pytest.mark.testnet
def test_record_verdict_chain(unique_shipment_id, valid_supplier_address):
    chain.register_navitrust(unique_shipment_id, valid_supplier_address, "Verdict→Test")
    verdict_json = json.dumps({"verdict": "HOLD", "reasoning": "pytest"})
    note = b'{"type":"NAVI_JURY_HASH","hash":"' + b"0" * 64 + b'"}'
    result = chain.record_verdict_chain(
        unique_shipment_id,
        verdict_json,
        risk_score=42,
        note=note,
    )
    assert result is not None
    assert result.get("tx_id")
    assert str(result.get("lora_url", "")).startswith("https://lora.algokit.io/")
