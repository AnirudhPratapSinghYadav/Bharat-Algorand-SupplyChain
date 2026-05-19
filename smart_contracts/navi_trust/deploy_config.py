# smart_contracts/navi_trust/deploy_config.py
# AlgoKit typed factory deploy entrypoint.
# Run: algokit deploy (from smart_contracts/navi_trust/)

import os
from algokit_utils import AlgorandClient, AlgoAmount

def deploy():
    algorand = AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(
        os.environ["ORACLE_MNEMONIC"]
    )

    # Import generated factory (algokit compile python generates this)
    from artifacts.NaviTrustClient import NaviTrustFactory

    factory = algorand.client.get_typed_app_factory(
        NaviTrustFactory,
        default_sender=deployer.address,
        default_signer=deployer.signer,
    )

    app_client, result = factory.deploy(
        on_schema_break="replace",
        on_update="update",
    )

    print(f"[DEPLOY] APP_ID: {app_client.app_id}")
    print(f"[DEPLOY] App address: {app_client.app_address}")
    print(f"[DEPLOY] TX: {result.tx_id}")
    print(f"\nSet in .env: APP_ID={app_client.app_id}")

if __name__ == "__main__":
    deploy()
