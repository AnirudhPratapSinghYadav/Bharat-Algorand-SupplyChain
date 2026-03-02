import os
import json
import logging
from algokit_utils import (
    AlgorandClient, PaymentParams, AlgoAmount, AppClientMethodCallParams
)
from algosdk.logic import get_application_address
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SHIPMENT_IDS = [
    "SHIP_KOCHI_001",
    "SHIP_WAYANAD_002",
    "SHIP_ROTTERDAM_003",
    "SHIP_SAOP_004",
    "SHIP_CALI_005",
]


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

    bal = algorand.account.get_information(deployer.address).amount
    logger.info(f"Deployer balance: {bal.algo} ALGO")

    # Fund contract for box storage MBR (~0.12 ALGO per box, 5 shipments)
    fund_amount = min(1.0, max(0, float(bal.algo) - 0.3))
    logger.info(f"Funding contract with {fund_amount} ALGO for box MBR...")
    try:
        algorand.send.payment(PaymentParams(
            sender=deployer.address,
            receiver=app_address,
            amount=AlgoAmount(algo=fund_amount),
        ))
        logger.info("Funded successfully.")
    except Exception as e:
        logger.warning(f"Funding note (may already be funded): {e}")

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

    logger.info("Seeding complete!")


if __name__ == "__main__":
    seed()
