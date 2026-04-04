"""
seed_blockchain.py — Fund contract MBR, idempotently register demo shipments (SHIP_*),
sync SQLite rows, and optionally reset off-chain demo state.

NaviTrust: register_shipment(id, supplier, route). Legacy: add_shipment(id).

Usage:
  python seed_blockchain.py              # Normal seed
  python seed_blockchain.py --reset      # Reset SQLite + audit trail + events, then seed chain
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys

from algokit_utils import AlgorandClient, AlgoAmount, PaymentParams
from algosdk.logic import get_application_address
from dotenv import load_dotenv

import algorand_client as chain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__) or ".", "shipments.db")
VERDICT_PATH = os.path.join(os.path.dirname(__file__) or ".", "audit_trail.json")
EVENTS_PATH = os.path.join(os.path.dirname(__file__) or ".", "offchain_events.json")

# Demo catalog — plan: SHIP_* idempotent seeding (PROD_* kept as optional aliases below).
DEMO_SHIPMENTS = [
    {
        "id": "SHIP_001",
        "origin": "Jawaharlal Nehru Port (IN)",
        "destination": "Singapore",
    },
    {
        "id": "SHIP_002",
        "origin": "Chennai",
        "destination": "Colombo",
    },
    {
        "id": "SHIP_003",
        "origin": "Mumbai",
        "destination": "Dubai",
    },
]

LEGACY_ALIASES = [
    {"id": "PROD_001", "origin": "Mumbai", "destination": "Singapore"},
    {"id": "PROD_002", "origin": "Chennai", "destination": "Colombo"},
    {"id": "PROD_003", "origin": "Mumbai", "destination": "Dubai"},
]


def reset_offchain():
    """Reset SQLite statuses, verdict history, and off-chain logistics events."""
    logger.info("=== RESETTING OFF-CHAIN STATE FOR DEMO ===")

    if os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        updated = conn.execute(
            "UPDATE shipments SET status = 'In_Transit' WHERE status != 'In_Transit'"
        ).rowcount
        conn.commit()
        conn.close()
        logger.info("SQLite: reset %s shipment(s) back to In_Transit", updated)
    else:
        logger.info("SQLite: shipments.db not found (backend will create schema)")

    with open(VERDICT_PATH, "w", encoding="utf-8") as f:
        json.dump({}, f)
    logger.info("Audit trail cleared")

    with open(EVENTS_PATH, "w", encoding="utf-8") as f:
        json.dump([], f)
    logger.info("Logistics events cleared")

    logger.info("Off-chain reset complete. Restart uvicorn to reload in-memory caches if running.\n")


def _ensure_db_rows(rows: list[dict], supplier_addr: str) -> None:
    if not os.path.exists(DB_PATH):
        logger.info("shipments.db missing — run backend once or create DB manually; skipping SQLite upsert")
        return
    conn = sqlite3.connect(DB_PATH)
    for r in rows:
        conn.execute(
            """
            INSERT INTO shipments (id, origin, destination, current_lat, current_lon, status)
            VALUES (?, ?, ?, 0.0, 0.0, 'In_Transit')
            ON CONFLICT(id) DO UPDATE SET
                origin = excluded.origin,
                destination = excluded.destination
            """,
            (r["id"], r["origin"], r["destination"]),
        )
    conn.commit()
    conn.close()
    logger.info("SQLite: upserted %s demo shipment row(s)", len(rows))


def _fund_contract_mbr(algorand: AlgorandClient, deployer_addr: str, app_address: str) -> None:
    deployer_bal = float(algorand.account.get_information(deployer_addr).amount.algo)
    app_bal = float(algorand.account.get_information(app_address).amount.algo)
    logger.info("Deployer balance : %s ALGO", deployer_bal)
    logger.info("Contract balance : %s ALGO", app_bal)

    mbr_needed = max(0, 0.5 - app_bal)
    fund_amount = min(mbr_needed, deployer_bal - 0.15) if mbr_needed > 0 else 0

    if fund_amount > 0.01:
        logger.info("Funding contract with %.3f ALGO for box MBR...", fund_amount)
        try:
            algorand.send.payment(
                PaymentParams(
                    sender=deployer_addr,
                    receiver=app_address,
                    amount=AlgoAmount(micro_algo=int(fund_amount * 1_000_000)),
                )
            )
            logger.info("Funded successfully.")
        except Exception as e:
            logger.warning("Funding skipped: %s", e)
    else:
        logger.info("Contract already funded — skipping MBR payment.")


def _register_one(ship_id: str, route: str, supplier: str) -> None:
    st = chain.read_shipment_status(ship_id)
    if st not in ("Unregistered", "Unknown"):
        logger.info("  SKIP %s (on-chain status=%s)", ship_id, st)
        return
    try:
        if chain.use_navitrust():
            chain.register_navitrust(ship_id, supplier, route)
        else:
            chain.register_legacy(ship_id, supplier)
        logger.info("  OK   %s", ship_id)
    except Exception as e:
        msg = str(e).lower()
        if "exists" in msg or "already" in msg or "assert" in msg:
            logger.info("  SKIP %s (already on-chain)", ship_id)
        else:
            logger.warning("  FAIL %s: %s", ship_id, str(e)[:200])


def seed():
    load_dotenv()

    mnemonic = os.getenv("ORACLE_MNEMONIC") or os.getenv("DEPLOYER_MNEMONIC")
    app_id = int(os.getenv("APP_ID", "0") or os.getenv("VITE_APP_ID", "0"))

    if not mnemonic or not app_id:
        logger.error("Set ORACLE_MNEMONIC or DEPLOYER_MNEMONIC and APP_ID in .env")
        return

    algorand = AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=mnemonic)
    app_address = get_application_address(app_id)

    logger.info("Oracle / deployer : %s", deployer.address)
    logger.info("APP_ID            : %s", app_id)
    logger.info("App address       : %s", app_address)
    logger.info("Mode              : %s", "NaviTrust" if chain.use_navitrust() else "Legacy AgriSupplyChainEscrow")
    logger.info(
        "Lora (application): https://lora.algokit.io/testnet/application/%s",
        app_id,
    )

    _fund_contract_mbr(algorand, deployer.address, app_address)

    rows = list(DEMO_SHIPMENTS)
    if os.getenv("SEED_LEGACY_PROD_ALIASES", "").strip() in ("1", "true", "yes"):
        rows = rows + LEGACY_ALIASES

    _ensure_db_rows(rows, deployer.address)

    supplier = deployer.address
    for r in rows:
        ship_id = r["id"]
        route = f"{r['origin']} → {r['destination']}"
        logger.info("Registering %s ...", ship_id)
        _register_one(ship_id, route, supplier)

    logger.info("\n--- On-chain read-back (algod) ---")
    for r in rows:
        sid = r["id"]
        full = chain.read_shipment_full(sid)
        logger.info("  %s => status=%s funds=%s", sid, full.get("status"), full.get("funds_microalgo"))


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset_offchain()
    seed()
