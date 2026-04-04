"""Oracle stakes micro-ALGO on jury verdicts (accountability demo)."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import algorand_client as chain
from navitrust_io import load_json, save_json

logger = logging.getLogger(__name__)

STAKE_AMOUNT_MICROALGO = 100_000
STAKES_FILE = "oracle_stakes.json"


def _stake_receiver() -> str | None:
    env = (os.environ.get("ORACLE_STAKE_ESCROW_ADDRESS") or "").strip()
    if env and len(env) > 50:
        return env
    return chain.oracle_address_string()


def place_oracle_stake(shipment_id: str, verdict: str) -> dict:
    recv = _stake_receiver()
    if not recv:
        return {"error": "no oracle address"}
    note = json.dumps(
        {
            "type": "NAVI_ORACLE_STAKE",
            "shipment_id": shipment_id,
            "verdict": verdict,
            "stake_algo": 0.1,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    res = chain.send_oracle_payment_microalgo(recv, STAKE_AMOUNT_MICROALGO, note)
    tx_id = (res or {}).get("tx_id")
    stakes = load_json(STAKES_FILE, {})
    if not isinstance(stakes, dict):
        stakes = {}
    stakes[shipment_id] = {
        "verdict": verdict,
        "stake_microalgo": STAKE_AMOUNT_MICROALGO,
        "stake_tx": tx_id,
        "status": "PENDING",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    save_json(STAKES_FILE, stakes)
    return {"tx_id": tx_id, "stake_algo": 0.1, "lora_url": (res or {}).get("lora_url")}


def resolve_oracle_stake(shipment_id: str, was_correct: bool) -> dict:
    stakes = load_json(STAKES_FILE, {})
    if not isinstance(stakes, dict):
        return {"error": "No stake store"}
    stake = stakes.get(shipment_id)
    if not stake:
        return {"error": "No stake found"}
    stake["status"] = "CORRECT" if was_correct else "SLASHED"
    stakes[shipment_id] = stake
    save_json(STAKES_FILE, stakes)
    return {
        "resolved": True,
        "outcome": "RETURNED" if was_correct else "SLASHED",
        "message": "Oracle stake resolved (recorded off-chain; payout path is operator-specific)",
    }


def list_stakes() -> dict:
    stakes = load_json(STAKES_FILE, {})
    if not isinstance(stakes, dict):
        stakes = {}
    open_n = sum(1 for s in stakes.values() if isinstance(s, dict) and s.get("status") == "PENDING")
    return {"stakes": stakes, "open_count": open_n}


def reputation_summary() -> dict:
    stakes = load_json(STAKES_FILE, {})
    if not isinstance(stakes, dict):
        stakes = {}
    resolved = [s for s in stakes.values() if isinstance(s, dict) and s.get("status") in ("CORRECT", "SLASHED")]
    wins = sum(1 for s in resolved if s.get("status") == "CORRECT")
    losses = sum(1 for s in resolved if s.get("status") == "SLASHED")
    total = wins + losses
    ratio = round(100 * wins / total) if total else None
    total_staked = sum(int(s.get("stake_microalgo", 0)) for s in stakes.values() if isinstance(s, dict))
    return {
        "win_rate_pct": ratio,
        "wins": wins,
        "losses": losses,
        "total_staked_microalgo": total_staked,
        "total_staked_algo": round(total_staked / 1_000_000, 4),
        "open_stakes": sum(1 for s in stakes.values() if isinstance(s, dict) and s.get("status") == "PENDING"),
    }
