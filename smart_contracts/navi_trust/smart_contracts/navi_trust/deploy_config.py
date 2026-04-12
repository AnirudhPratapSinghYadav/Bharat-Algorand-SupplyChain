"""Deploy NaviTrust to Algorand TestNet (public algod; deployer from DEPLOYER_MNEMONIC)."""

import logging
import os

import algokit_utils

logger = logging.getLogger(__name__)


def deploy() -> None:
    from smart_contracts.artifacts.navi_trust.navi_trust_client import NaviTrustFactory

    # Use public TestNet algod — from_environment() often points at localnet (127.0.0.1) and breaks deploy.
    net = (os.environ.get("ALGO_NETWORK") or "testnet").strip().lower()
    if net == "mainnet":
        algorand = algokit_utils.AlgorandClient.mainnet()
    else:
        algorand = algokit_utils.AlgorandClient.testnet()
    deployer_ = algorand.account.from_environment("DEPLOYER")

    factory = algorand.client.get_typed_app_factory(
        NaviTrustFactory, default_sender=deployer_.address
    )

    app_client, result = factory.deploy(
        on_update=algokit_utils.OnUpdate.AppendApp,
        on_schema_break=algokit_utils.OnSchemaBreak.AppendApp,
    )

    if result.operation_performed in [
        algokit_utils.OperationPerformed.Create,
        algokit_utils.OperationPerformed.Replace,
    ]:
        algorand.send.payment(
            algokit_utils.PaymentParams(
                amount=algokit_utils.AlgoAmount(algo=1),
                sender=deployer_.address,
                receiver=app_client.app_address,
            )
        )

    logger.info(
        "NaviTrust deployed: app_id=%s address=%s op=%s",
        app_client.app_id,
        app_client.app_address,
        result.operation_performed,
    )
