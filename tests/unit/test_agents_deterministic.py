"""Agent fallbacks and deterministic logic (no Gemini)."""

from app import (
    _fallback_chief_arbiter,
    _fallback_fraud_detector,
    _fallback_weather_sentinel,
    run_compliance_auditor,
)


def test_weather_sentinel_fallback_risky():
    weather = {
        "is_risky": True,
        "description": "Thunderstorm",
        "city": "Chennai",
    }
    out = _fallback_weather_sentinel(weather, {"status": "In_Transit"})
    assert out["risk_score"] >= 70
    assert out.get("_fallback") is True


def test_weather_sentinel_fallback_normal():
    weather = {
        "is_risky": False,
        "description": "Clear",
        "city": "Mumbai",
    }
    out = _fallback_weather_sentinel(weather, {"status": "In_Transit"})
    assert out["risk_score"] < 50


def test_compliance_auditor_disputed_status():
    chain = {
        "status": "Disputed",
        "funds_algo": 1.0,
        "verdict_json": '{"verdict":"DISPUTE"}',
    }
    out = run_compliance_auditor("S1", chain, {"weather_flag": False})
    assert out["chain_status"] == "Disputed"
    assert out["risk_score"] >= 80


def test_compliance_auditor_no_escrow_issue():
    chain = {"status": "In_Transit", "funds_algo": 0, "verdict_json": None}
    out = run_compliance_auditor("S1", chain, {"weather_flag": False})
    assert any("escrow" in i.lower() for i in out["issues"])


def test_fraud_detector_anomaly_path():
    sentinel = {"weather_flag": True, "risk_score": 80}
    auditor = {"compliance_passed": False, "risk_score": 70}
    out = _fallback_fraud_detector(25, sentinel, auditor)
    assert out["fraud_risk_score"] >= 50
    assert out["recommendation"] == "SUSPECT"
    assert out["anomaly_detected"] is True


def test_chief_arbiter_fallback_settle_low_weight():
    out = _fallback_chief_arbiter(
        weighted_score=20,
        sentinel={"risk_score": 20},
        auditor={"compliance_passed": True},
        detector={"recommendation": "CLEAR"},
        chain_status="In_Transit",
    )
    assert out["verdict"] == "SETTLE"


def test_chief_arbiter_fallback_dispute_on_chain():
    out = _fallback_chief_arbiter(
        weighted_score=50,
        sentinel={"risk_score": 50},
        auditor={"compliance_passed": True},
        detector={"recommendation": "CLEAR"},
        chain_status="Disputed",
    )
    assert out["verdict"] == "DISPUTE"
