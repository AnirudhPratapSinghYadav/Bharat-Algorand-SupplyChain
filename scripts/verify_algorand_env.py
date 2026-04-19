#!/usr/bin/env python3
"""
Check Algorand env vs deployed app (creator + global oracle). Exit 0 when aligned.

Run from repo root (loads .env):
  python scripts/verify_algorand_env.py

Requires: APP_ID, ORACLE_MNEMONIC or DEPLOYER_MNEMONIC (25 words), network reachable.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


def main() -> int:
    os.chdir(ROOT)
    import algorand_client as chain

    chain._sync_env_globals()
    app_id = int(chain.APP_ID or 0)
    signer = chain.oracle_address_string()
    bal = chain.oracle_balance_microalgo()
    out: dict = {
        "app_id": app_id,
        "network": os.environ.get("ALGO_NETWORK", "testnet"),
        "oracle_address_from_mnemonic": signer,
        "oracle_balance_microalgo": bal,
        "oracle_balance_algo": round(bal / 1_000_000.0, 6),
        "app_creator_address": None,
        "on_chain_oracle_address": None,
        "oracle_matches_app_global": None,
        "navitrust_arc56_present": chain.use_navitrust(),
    }
    if not signer:
        out["error"] = "Set ORACLE_MNEMONIC or DEPLOYER_MNEMONIC (25 words) in .env"
        print(json.dumps(out, indent=2))
        return 1
    if bal < chain.MIN_ORACLE_MICRO_FOR_WRITE:
        out["warning"] = (
            f"Balance below recommended {chain.MIN_ORACLE_MICRO_FOR_WRITE} µALGO — fund TestNet: "
            "https://bank.testnet.algorand.network/"
        )
    if not app_id:
        out["error"] = "Set APP_ID in .env to your deployed NaviTrust application id"
        print(json.dumps(out, indent=2))
        return 1
    try:
        info = chain.algorand.client.algod.application_info(app_id)
        creator = (info.get("params") or {}).get("creator")
        out["app_creator_address"] = creator
    except Exception as e:
        out["algod_error"] = str(e)
        print(json.dumps(out, indent=2))
        return 1

    gs = chain.get_display_global_state(app_id)
    on_chain = gs.get("oracle_address")
    if isinstance(on_chain, str) and on_chain.strip():
        out["on_chain_oracle_address"] = on_chain.strip()
        out["oracle_matches_app_global"] = signer.strip().lower() == on_chain.strip().lower()
    else:
        out["on_chain_oracle_address"] = on_chain

    ok = out.get("oracle_matches_app_global")
    if ok is True:
        out["status"] = "ok"
        print(json.dumps(out, indent=2))
        return 0
    if ok is False:
        out["status"] = "mismatch"
        out["fix"] = (
            "A) Put the original creator 25-word key in ORACLE_MNEMONIC, OR "
            "B) Deploy a NEW app owned by your current mnemonic: python scripts/deploy_with_env_oracle.py "
            "(then restart uvicorn + Vite; run seed_blockchain.py if you want demo shipments), OR "
            "C) If you still have the OLD oracle key: temporarily set ORACLE_MNEMONIC to it, call update_oracle via chain.call_update_oracle(new_addr), "
            "then set mnemonic back to the new oracle."
        )
        print(json.dumps(out, indent=2))
        return 1
    out["status"] = "unknown"
    out["note"] = "Could not read oracle_address from global state"
    print(json.dumps(out, indent=2))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
