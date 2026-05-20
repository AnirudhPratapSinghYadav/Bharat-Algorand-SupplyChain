#!/usr/bin/env python3
"""
One-shot Pramanik deploy: build → deploy → fund contract → update .env → optional seed.

Usage (repo root, PowerShell):
  $env:ORACLE_MNEMONIC = "word1 ... word25"
  python scripts/full_deploy.py

Skips seed if --no-seed. Skips build if --no-build.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAVI = ROOT / "smart_contracts" / "navi_trust"
ARTIFACT_SRC = NAVI / "smart_contracts" / "artifacts" / "navi_trust" / "NaviTrust.arc56.json"
ARTIFACT_DST = ROOT / "artifacts" / "NaviTrust.arc56.json"


def main() -> int:
    ap = argparse.ArgumentParser(description="Full Pramanik TestNet deploy")
    ap.add_argument("--no-seed", action="store_true", help="Skip seed_blockchain.py")
    ap.add_argument("--no-build", action="store_true", help="Skip contract compile")
    ap.add_argument("--skip-balance-check", action="store_true")
    args = ap.parse_args()

    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")

    mn = (os.environ.get("ORACLE_MNEMONIC") or os.environ.get("DEPLOYER_MNEMONIC") or "").strip()
    if not mn or len(mn.split()) != 25:
        print("Set ORACLE_MNEMONIC (25 words) in .env or the shell.", file=sys.stderr)
        return 1

    os.environ["ORACLE_MNEMONIC"] = mn
    os.environ["DEPLOYER_MNEMONIC"] = mn
    os.environ["ALGO_NETWORK"] = os.environ.get("ALGO_NETWORK") or "testnet"

    from algokit_utils import AlgorandClient
    from algosdk import mnemonic as sdk_mn
    from algosdk.account import address_from_private_key

    pk = sdk_mn.to_private_key(mn)
    addr = address_from_private_key(pk)

    if not args.skip_balance_check:
        try:
            amt = int(AlgorandClient.testnet().client.algod.account_info(addr).get("amount", 0))
        except Exception as e:
            print(f"Balance check failed: {e}", file=sys.stderr)
            return 2
        if amt < 2_000_000:
            print(
                f"Oracle {addr} needs at least 2 ALGO on TestNet (~{amt / 1e6:.4f} now).\n"
                "https://bank.testnet.algorand.network/",
                file=sys.stderr,
            )
            return 3

    poetry = shutil.which("poetry") or "poetry"
    env = os.environ.copy()

    if not args.no_build:
        print("==> Building contract...")
        b = subprocess.run(
            [poetry, "run", "python", "-m", "smart_contracts", "build"],
            cwd=str(NAVI),
            env=env,
        )
        if b.returncode != 0:
            print("Build failed.", file=sys.stderr)
            return 4
        if ARTIFACT_SRC.is_file():
            ARTIFACT_DST.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ARTIFACT_SRC, ARTIFACT_DST)
            print(f"==> Copied ARC56 to {ARTIFACT_DST}")

    sys.path.insert(0, str(NAVI))
    os.chdir(NAVI)
    print("==> Deploying to TestNet...")
    from deploy_config import deploy

    app_id, app_addr, fund_tx = deploy()
    os.chdir(ROOT)
    env["APP_ID"] = str(app_id)
    os.environ["APP_ID"] = str(app_id)

    sys.path.insert(0, str(ROOT))
    import pramanik_config as pcfg

    lora_base = pcfg.get_lora_base_url() or (os.environ.get("LORA_BASE_URL") or "https://lora.algokit.io/testnet").rstrip("/")
    print()
    print("✅ Pramanik deployed successfully")
    print(f"   New APP_ID: {app_id}")
    print(f"   App address: {app_addr}")
    print(f"   Lora: {lora_base}/application/{app_id}")
    print("   .env updated automatically")
    if fund_tx:
        print(f"   Fund tx: {lora_base}/transaction/{fund_tx}")

    if not args.no_seed:
        print("==> Seeding demo shipments...")
        seed_env = {**env, "APP_ID": str(app_id), "SEED_MIN_ORACLE_MICRO": str(pcfg.min_oracle_balance_micro())}
        seed = subprocess.run([sys.executable, str(ROOT / "seed_blockchain.py")], cwd=str(ROOT), env=seed_env)
        if seed.returncode != 0:
            print("Seed failed (deploy OK). Run: python seed_blockchain.py", file=sys.stderr)
            return 5

    print("\nNext: python -m uvicorn app:app --host 127.0.0.1 --port 8000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
