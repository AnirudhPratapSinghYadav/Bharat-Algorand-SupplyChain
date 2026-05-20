# smart_contracts/navi_trust/deploy_config.py
# Deploy NaviTrust to TestNet.
# From repo root: python scripts/full_deploy.py
# From this dir: poetry run python deploy_config.py

from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path

import algokit_utils

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
NAVI_DIR = Path(__file__).resolve().parent

import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import pramanik_config as pcfg  # noqa: E402


def _quote_env_value(v: str) -> str:
    if re.search(r'[\s#"\\]', v):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return v


def merge_env_file(env_path: Path, updates: dict[str, str]) -> None:
    text = env_path.read_text(encoding="utf-8") if env_path.is_file() else ""
    lines = text.splitlines()
    keys_done: set[str] = set()
    new_lines: list[str] = []
    key_pat = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")
    for line in lines:
        m = key_pat.match(line)
        if m and m.group(1) in updates:
            k = m.group(1)
            new_lines.append(f"{k}={_quote_env_value(updates[k])}")
            keys_done.add(k)
        else:
            new_lines.append(line)
    for k, v in updates.items():
        if k not in keys_done:
            new_lines.append(f"{k}={_quote_env_value(v)}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _load_mnemonic() -> str:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
        load_dotenv(NAVI_DIR / ".env")
    except ImportError:
        pass
    mn = (os.environ.get("ORACLE_MNEMONIC") or os.environ.get("DEPLOYER_MNEMONIC") or "").strip()
    if not mn:
        raise RuntimeError(
            "Set ORACLE_MNEMONIC or DEPLOYER_MNEMONIC (25 words) in the environment or repo-root .env"
        )
    if len(mn.split()) != 25:
        raise RuntimeError("Mnemonic must be exactly 25 words")
    return mn


def deploy() -> tuple[int, str, str | None]:
    """Returns (app_id, app_address, fund_tx_id)."""
    from smart_contracts.artifacts.navi_trust.navi_trust_client import NaviTrustFactory

    net = (os.environ.get("ALGO_NETWORK") or "testnet").strip().lower()
    if net == "mainnet":
        algorand = algokit_utils.AlgorandClient.mainnet()
    else:
        algorand = algokit_utils.AlgorandClient.testnet()

    deployer = algorand.account.from_mnemonic(mnemonic=_load_mnemonic())

    factory = algorand.client.get_typed_app_factory(
        NaviTrustFactory,
        default_sender=deployer.address,
        default_signer=deployer.signer,
    )

    app_client, result = factory.deploy(
        on_update=algokit_utils.OnUpdate.AppendApp,
        on_schema_break=algokit_utils.OnSchemaBreak.AppendApp,
    )

    fund_tx_id: str | None = None
    if result.operation_performed in (
        algokit_utils.OperationPerformed.Create,
        algokit_utils.OperationPerformed.Replace,
    ):
        fund_algo = float(os.environ.get("CONTRACT_FUND_ALGO", "0.5") or "0.5")
        pay_res = algorand.send.payment(
            algokit_utils.PaymentParams(
                amount=algokit_utils.AlgoAmount(algo=fund_algo),
                sender=deployer.address,
                receiver=app_client.app_address,
            )
        )
        fund_tx_id = getattr(pay_res, "tx_id", None) or (
            pay_res.get("tx_id") if isinstance(pay_res, dict) else None
        )

    app_id = int(app_client.app_id)
    app_addr = str(app_client.app_address)

    updates = {"APP_ID": str(app_id), "ALGO_NETWORK": net}
    root_env = ROOT / ".env"
    if root_env.is_file() or os.environ.get("WRITE_ROOT_ENV", "1") == "1":
        merge_env_file(root_env, updates)
    fe = ROOT / "frontend" / ".env"
    fe_example = ROOT / "frontend" / ".env.example"
    if not fe.is_file() and fe_example.is_file():
        shutil.copy2(fe_example, fe)
    merge_env_file(fe, {"VITE_APP_ID": str(app_id), "VITE_ALGORAND_NETWORK": net})

    lora_base = pcfg.get_lora_base_url() or (os.environ.get("LORA_BASE_URL") or "https://lora.algokit.io/testnet").rstrip("/")
    print(f"[DEPLOY] APP_ID: {app_id}")
    print(f"[DEPLOY] App address: {app_addr}")
    print(f"PRAMANIK_APP_ID={app_id}")
    print(f"Lora: {lora_base}/application/{app_id}")
    if fund_tx_id:
        print(f"[DEPLOY] Contract funded ({fund_algo} ALGO): {lora_base}/transaction/{fund_tx_id}")
    print(".env updated automatically. No manual copy needed.")
    return app_id, app_addr, fund_tx_id


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    deploy()
