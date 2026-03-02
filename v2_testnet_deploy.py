import os
import json
import logging
import time
from algokit_utils import AlgorandClient
from dotenv import load_dotenv, set_key

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def deploy():
    load_dotenv()
    
    mnemonic = os.getenv("DEPLOYER_MNEMONIC")
    if not mnemonic:
        logger.error("DEPLOYER_MNEMONIC not found in .env")
        return

    logger.info("Connecting to Algorand Testnet...")
    algorand = AlgorandClient.testnet()
    
    try:
        deployer = algorand.account.from_mnemonic(mnemonic=mnemonic)
        logger.info(f"Using address: {deployer.address}")
    except Exception as e:
        logger.error(f"Failed to load account: {e}")
        return

    # Retry loop for balance check to handle node lag
    max_retries = 3
    for i in range(max_retries):
        try:
            acct_info = algorand.account.get_information(deployer.address)
            balance = acct_info.amount
            logger.info(f"Attempt {i+1}: Balance: {balance.algo} ALGO")
            if balance.algo >= 0.1:
                break
        except Exception as e:
            logger.warning(f"Attempt {i+1}: Balance check failed: {e}")
        
        if i < max_retries - 1:
            logger.info("Retrying in 5 seconds...")
            time.sleep(5)
    else:
        logger.error("Failed to verify balance after retries.")
        # Proceed anyway, factory.deploy will do its own check

    # Load artifacts
    with open("artifacts/AgriSupplyChainEscrow.arc56.json", "r") as f:
        app_spec_content = f.read()

    # Use factory
    factory = algorand.client.get_app_factory(
        app_spec=app_spec_content,
        default_sender=deployer.address
    )

    logger.info("Deploying to Testnet...")
    try:
        app_client, deploy_result = factory.deploy()
        app_id = deploy_result.app.app_id
        logger.info(f"Success! APP_ID: {app_id}")
        
        # Update .env
        set_key(".env", "APP_ID", str(app_id))
        logger.info("Updated .env")
        return True
    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        return False

if __name__ == "__main__":
    deploy()
