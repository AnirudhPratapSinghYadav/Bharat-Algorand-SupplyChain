"""Deterministic jury hash (auditability)."""

from app import _safe_float
from hash_utils import compute_jury_hash


def _sample_inputs():
    return {
        "shipment_id": "SHIP_1",
        "chain_state": {
            "status": "In_Transit",
            "funds_microalgo": 2_000_000,
            "supplier_address": "",
            "risk_on_chain": 0,
            "route": "Mumbai→Dubai",
        },
        "weather": {
            "city": "Mumbai",
            "precipitation_mm": 5.0,
            "wind_kmh": 20,
            "weather_code": 61,
        },
        "sentinel": {"risk_score": 70},
        "auditor": {"risk_score": 22},
        "fraud_detector": {"fraud_risk_score": 10},
        "arbiter": {"final_risk_score": 65, "verdict": "SETTLE"},
    }


def test_hash_deterministic():
    kw = _sample_inputs()
    assert compute_jury_hash(**kw) == compute_jury_hash(**kw)


def test_hash_changes_when_verdict_changes():
    kw = _sample_inputs()
    h1 = compute_jury_hash(**kw)
    kw2 = {**kw, "arbiter": {"final_risk_score": 65, "verdict": "HOLD"}}
    h2 = compute_jury_hash(**kw2)
    assert h1 != h2
    assert len(h1) == 64


def test_safe_float_handles_none():
    assert _safe_float(None) is None
