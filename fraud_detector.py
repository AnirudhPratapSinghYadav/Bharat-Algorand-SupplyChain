"""Rule-based phantom shipment signals (pre-registration gate)."""

from __future__ import annotations

from typing import Any, Callable

MIN_TRANSIT_DAYS: dict[tuple[str, str], int] = {
    ("Mumbai", "Dubai"): 2,
    ("Chennai", "Rotterdam"): 18,
    ("Delhi", "Singapore"): 5,
    ("Mumbai", "Singapore"): 8,
}


def get_min_transit_days(origin: str, destination: str) -> int:
    o = (origin or "").split(",")[0].strip()
    d = (destination or "").split(",")[0].strip()
    return MIN_TRANSIT_DAYS.get((o, d), 3)


def _check_new_wallet_large(s: dict[str, Any], _history: list[dict[str, Any]]) -> bool:
    return float(s.get("wallet_age_days", 99)) < 7 and float(s.get("amount_algo", 0)) > 10


def _check_impossible_route(s: dict[str, Any], _history: list[dict[str, Any]]) -> bool:
    dd = float(s.get("delivery_days", 99))
    return dd < float(get_min_transit_days(s.get("origin", ""), s.get("destination", "")))


def _check_round_amount(s: dict[str, Any], _history: list[dict[str, Any]]) -> bool:
    a = float(s.get("amount_algo", 0))
    return a % 10 == 0 and a > 5


def _check_duplicate_burst(s: dict[str, Any], history: list[dict[str, Any]]) -> bool:
    c = sum(
        1
        for h in history
        if h.get("origin") == s.get("origin")
        and h.get("destination") == s.get("destination")
        and h.get("supplier") == s.get("supplier")
        and float(h.get("days_ago", 999)) < 7
    )
    return c > 3


def _check_low_rep(s: dict[str, Any], _history: list[dict[str, Any]]) -> bool:
    return float(s.get("supplier_reputation", 50)) < 25


FRAUD_SIGNALS: list[dict[str, Any]] = [
    {
        "name": "new_wallet_large_amount",
        "check": _check_new_wallet_large,
        "score": 40,
        "message": "New wallet attempting large escrow",
    },
    {
        "name": "impossible_route_timing",
        "check": _check_impossible_route,
        "score": 35,
        "message": "Claimed delivery time physically impossible",
    },
    {
        "name": "round_number_amount",
        "check": _check_round_amount,
        "score": 15,
        "message": "Suspiciously round escrow amount",
    },
    {
        "name": "duplicate_route_burst",
        "check": _check_duplicate_burst,
        "score": 30,
        "message": "Same supplier flooding same route",
    },
    {
        "name": "high_dispute_history",
        "check": _check_low_rep,
        "score": 25,
        "message": "Supplier has poor on-chain reputation",
    },
]


def detect_fraud(shipment_data: dict[str, Any], history: list[dict[str, Any]]) -> dict[str, Any]:
    total_score = 0
    triggered: list[dict[str, Any]] = []
    for signal in FRAUD_SIGNALS:
        check_fn: Callable[[dict[str, Any], list[dict[str, Any]]], bool] = signal["check"]
        try:
            if check_fn(shipment_data, history):
                total_score += int(signal["score"])
                triggered.append(
                    {"signal": signal["name"], "score": signal["score"], "message": signal["message"]}
                )
        except Exception:
            continue
    fraud_probability = min(total_score, 100)
    blocked = fraud_probability > 85
    if fraud_probability > 50 and not blocked:
        verdict = "WARNING"
    elif blocked:
        verdict = "BLOCKED"
    else:
        verdict = "CLEAR"
    return {
        "fraud_probability": fraud_probability,
        "blocked": blocked,
        "triggered_signals": triggered,
        "verdict": verdict,
        "message": (
            "Shipment blocked by Navi-Trust fraud detection"
            if blocked
            else "Proceed with caution"
            if fraud_probability > 50
            else "No fraud signals detected"
        ),
    }
