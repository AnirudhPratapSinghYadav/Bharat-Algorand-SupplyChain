#!/usr/bin/env python3
"""Verify on-chain shipment boxes and optional jury hash note (manual audit)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.test", override=False)

import algorand_client as chain  # noqa: E402


def verify(shipment_id: str) -> int:
    sid = (shipment_id or "").strip()
    if not sid:
        print("Usage: python scripts/verify_onchain_data.py <shipment_id>")
        return 2
    chain._sync_env_globals()
    if not chain.APP_ID:
        print("APP_ID not configured")
        return 1
    state = chain.get_shipment_full_state(sid)
    stored_hash = chain.read_verdict_hash(sid)
    print(f"Shipment: {sid}")
    print(f"  app_id: {chain.APP_ID}")
    print(f"  status: {state.get('on_chain_status') or state.get('status')}")
    print(f"  funds_microalgo: {state.get('funds_microalgo')}")
    print(f"  risk_on_chain: {state.get('risk_on_chain')}")
    if stored_hash:
        print(f"  verdict_hash (indexer note): {stored_hash[:16]}...")
    else:
        print("  verdict_hash: (none found in recent indexer notes)")
    print("  Recompute jury hash from audit_trail.json inputs when auditing off-chain.")
    return 0


if __name__ == "__main__":
    raise SystemExit(verify(sys.argv[1] if len(sys.argv) > 1 else ""))
