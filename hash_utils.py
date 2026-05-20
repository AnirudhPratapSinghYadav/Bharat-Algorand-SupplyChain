"""
Deterministic SHA-256 of canonical jury inputs (matches on-chain /verify-hash expectations).

Same canonical JSON as the live jury pipeline — do not change field names without
migrating audit trails and on-chain witness notes.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional


def safe_int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def safe_float(v: Any) -> Optional[float]:
    try:
        f = float(v)
        if f != f:
            return None
        if f in (float("inf"), float("-inf")):
            return None
        return f
    except Exception:
        return None


def compute_jury_hash(
    *,
    shipment_id: str,
    chain_state: dict,
    weather: dict,
    sentinel: dict,
    auditor: dict,
    fraud_detector: dict,
    arbiter: dict,
) -> str:
    """
    Deterministic SHA-256 hex (no prefix) of canonical jury inputs + selected agent outputs.
    `auditor` is accepted for API compatibility but is not included in the canonical blob
    (matches historical app.py behavior).
    """
    _ = auditor  # noqa: ARG001 — kept for call-site compatibility
    canonical = {
        "shipment_id": (shipment_id or "").strip(),
        "chain": {
            "status": str(chain_state.get("status") or ""),
            "funds_microalgo": int(chain_state.get("funds_microalgo") or 0),
            "supplier_address": str(chain_state.get("supplier_address") or ""),
            "risk_on_chain": int(chain_state.get("risk_on_chain") or 0),
            "route": str(chain_state.get("route") or ""),
        },
        "weather": {
            "city": str(weather.get("city") or ""),
            "precipitation_mm": safe_float(weather.get("precipitation_mm")),
            "wind_kmh": safe_float(weather.get("wind_kmh")),
            "weather_code": safe_int(weather.get("weather_code")),
        },
        "agents": {
            "sentinel_risk_score": int(sentinel.get("risk_score") or 0),
            "fraud_risk_score": int(fraud_detector.get("fraud_risk_score") or 0),
            "arbiter_final_risk_score": int(arbiter.get("final_risk_score") or 0),
            "arbiter_verdict": str(arbiter.get("verdict") or ""),
        },
    }
    raw = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def compute_jury_hash_prefixed(
    *,
    shipment_id: str,
    chain_state: dict,
    weather: dict,
    sentinel: dict,
    auditor: dict,
    fraud_detector: dict,
    arbiter: dict,
) -> str:
    """Optional sha256: prefix form for docs / external tooling."""
    return f"sha256:{compute_jury_hash(shipment_id=shipment_id, chain_state=chain_state, weather=weather, sentinel=sentinel, auditor=auditor, fraud_detector=fraud_detector, arbiter=arbiter)}"


def verify_jury_hash_prefixed(
    *,
    shipment_id: str,
    chain_state: dict,
    weather: dict,
    sentinel: dict,
    auditor: dict,
    fraud_detector: dict,
    arbiter: dict,
    expected: str,
) -> bool:
    try:
        exp = (expected or "").strip().lower()
        if exp.startswith("sha256:"):
            exp = exp[7:]
        return (
            compute_jury_hash(
                shipment_id=shipment_id,
                chain_state=chain_state,
                weather=weather,
                sentinel=sentinel,
                auditor=auditor,
                fraud_detector=fraud_detector,
                arbiter=arbiter,
            )
            == exp
        )
    except Exception:
        return False
