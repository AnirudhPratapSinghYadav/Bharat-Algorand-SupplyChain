"""
seed_blockchain.py — Fund the contract MBR, register shipments, and optionally
reset off-chain state for demo re-runs.

Usage:
  python seed_blockchain.py              # Normal seed
  python seed_blockchain.py --reset      # Reset SQLite + verdict history + re-seed
"""

import os
import sys
import json
import sqlite3
import logging
from algokit_utils import (
    AlgorandClient,
    PaymentParams,
    AlgoAmount,
    AppClientMethodCallParams,
)
from algosdk.logic import get_application_address
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SHIPMENT_IDS = ["SHIP_001", "SHIP_002", "SHIP_003"]
DB_PATH = os.path.join(os.path.dirname(__file__) or ".", "shipments.db")
VERDICT_PATH = os.path.join(os.path.dirname(__file__) or ".", "audit_trail.json")
EVENTS_PATH = os.path.join(os.path.dirname(__file__) or ".", "offchain_events.json")


def reset_offchain():
    """Reset SQLite statuses to In_Transit and clear verdict history."""
    logger.info("=== RESETTING OFF-CHAIN STATE FOR DEMO ===")

    # Reset SQLite
    if os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        updated = conn.execute(
            "UPDATE shipments SET status = 'In_Transit' WHERE status != 'In_Transit'"
        ).rowcount
        conn.commit()
        conn.close()
        logger.info(f"SQLite: reset {updated} shipment(s) back to In_Transit")
    else:
        logger.info("SQLite: shipments.db not found (will be created on backend startup)")

    # Clear verdict history
    with open(VERDICT_PATH, "w") as f:
        json.dump({}, f)
    logger.info("Audit trail cleared → audit_trail.json = {}")

    # Clear off-chain logistics events
    with open(EVENTS_PATH, "w") as f:
        json.dump([], f)
    logger.info("Logistics events cleared → offchain_events.json = []")

    logger.info("Off-chain reset complete. Restart the backend (uvicorn) to reload.\n")


def seed():
    load_dotenv()

    mnemonic = os.getenv("DEPLOYER_MNEMONIC")
    app_id = int(os.getenv("APP_ID", "0"))

    if not mnemonic or not app_id:
        logger.error("DEPLOYER_MNEMONIC and APP_ID must be set in .env")
        return

    algorand = AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=mnemonic)
    app_address = get_application_address(app_id)

    logger.info(f"Deployer : {deployer.address}")
    logger.info(f"APP_ID   : {app_id}")
    logger.info(f"App Addr : {app_address}")

    deployer_bal = float(
        algorand.account.get_information(deployer.address).amount.algo
    )
    app_bal = float(
        algorand.account.get_information(app_address).amount.algo
    )
    logger.info(f"Deployer balance : {deployer_bal} ALGO")
    logger.info(f"Contract balance : {app_bal} ALGO")

    mbr_needed = max(0, 0.5 - app_bal)
    fund_amount = min(mbr_needed, deployer_bal - 0.15) if mbr_needed > 0 else 0

    if fund_amount > 0.01:
        logger.info(f"Funding contract with {fund_amount:.3f} ALGO for box MBR...")
        try:
            algorand.send.payment(
                PaymentParams(
                    sender=deployer.address,
                    receiver=app_address,
                    amount=AlgoAmount(micro_algo=int(fund_amount * 1_000_000)),
                )
            )
            logger.info("Funded successfully.")
        except Exception as e:
            logger.warning(f"Funding skipped: {e}")
    else:
        logger.info("Contract already funded — skipping MBR payment.")

    with open("artifacts/AgriSupplyChainEscrow.arc56.json", "r") as f:
        app_spec = f.read()

    app_client = algorand.client.get_app_client_by_id(
        app_spec=app_spec,
        app_id=app_id,
        default_sender=deployer.address,
    )

    for ship_id in SHIPMENT_IDS:
        try:
            logger.info(f"Adding shipment: {ship_id} ...")
            app_client.send.call(
                params=AppClientMethodCallParams(
                    method="add_shipment",
                    args=[ship_id],
                    sender=deployer.address,
                )
            )
            logger.info(f"  OK  {ship_id}")
        except Exception as e:
            msg = str(e)
            if "already exists" in msg.lower() or "assert" in msg.lower():
                logger.info(f"  SKIP {ship_id} (already on-chain)")
            else:
                logger.warning(f"  FAIL {ship_id}: {msg[:120]}")

    logger.info("\n--- Verification ---")
    for ship_id in SHIPMENT_IDS:
        try:
            result = app_client.send.call(
                params=AppClientMethodCallParams(
                    method="get_shipment_status",
                    args=[ship_id],
                    sender=deployer.address,
                )
            )
            logger.info(f"  {ship_id} => {result.abi_return}")
        except Exception as e:
            logger.warning(f"  {ship_id} => READ FAILED: {e}")

    logger.info("Blockchain seeding complete!")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset_offchain()
    seed()
