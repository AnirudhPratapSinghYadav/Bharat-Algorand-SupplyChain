#!/usr/bin/env python3
"""
Deploy NaviTrust to TestNet using the oracle mnemonic already in repo-root `.env`.

Use this when `python scripts/verify_algorand_env.py` reports oracle mismatch: your funded
account is not the creator of the current APP_ID. A fresh deploy makes creator == oracle
for the new application id.

Prerequisites:
  cd smart_contracts/navi_trust && poetry install

Usage (from repo root):
  python scripts/deploy_with_env_oracle.py

Optional:
  python scripts/deploy_with_env_oracle.py --skip-balance-check
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAVI = ROOT / "smart_contracts" / "navi_trust"
ARTIFACT_SRC = NAVI / "smart_contracts" / "artifacts" / "navi_trust" / "NaviTrust.arc56.json"
ARTIFACT_DST_DIR = ROOT / "artifacts"


def _parse_app_id(stdout: str) -> int | None:
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("PRAMANIK_APP_ID="):
            try:
                return int(line.split("=", 1)[1].strip())
            except ValueError:
                return None
    return None


def _quote_env_value(v: str) -> str:
    if re.search(r'[\s#"\\]', v):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return v


def _merge_env_file(env_path: Path, updates: dict[str, str]) -> None:
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


def main() -> int:
    ap = argparse.ArgumentParser(description="Deploy NaviTrust using ORACLE_MNEMONIC from .env")
    ap.add_argument("--skip-balance-check", action="store_true", help="Do not require min TestNet balance")
    args = ap.parse_args()

    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))

    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")

    mn = (os.environ.get("ORACLE_MNEMONIC") or os.environ.get("DEPLOYER_MNEMONIC") or "").strip()
    if not mn or len(mn.split()) != 25:
        print("Set ORACLE_MNEMONIC (25 words) in .env to the account that should own the app.", file=sys.stderr)
        return 1

    if not NAVI.is_dir():
        print(f"Missing {NAVI}", file=sys.stderr)
        return 1

    from algosdk import mnemonic as sdk_mn
    from algosdk.account import address_from_private_key
    from algokit_utils import AlgorandClient

    pk = sdk_mn.to_private_key(mn)
    addr = address_from_private_key(pk)

    if not args.skip_balance_check:
        try:
            algod = AlgorandClient.testnet().client.algod
            amt = int(algod.account_info(addr).get("amount", 0))
        except Exception as e:
            print(f"Could not read balance: {e}", file=sys.stderr)
            return 2
        if amt < 2_000_000:
            print(
                json.dumps(
                    {
                        "error": "Oracle account needs TestNet ALGO for deploy + app MBR (~2+ ALGO recommended).",
                        "address": addr,
                        "balance_microalgo": amt,
                        "fund": "https://bank.testnet.algorand.network/",
                    },
                    indent=2,
                ),
                file=sys.stderr,
            )
            return 3

    env = os.environ.copy()
    env["DEPLOYER_MNEMONIC"] = mn
    env["ORACLE_MNEMONIC"] = mn
    env["ALGO_NETWORK"] = "testnet"

    poetry = shutil.which("poetry") or "poetry"
    print("Building contract (poetry run python -m smart_contracts build)...")
    b = subprocess.run(
        [poetry, "run", "python", "-m", "smart_contracts", "build"],
        cwd=str(NAVI),
        env=env,
        text=True,
    )
    if b.returncode != 0:
        print("Build failed. Run: cd smart_contracts/navi_trust && poetry install", file=sys.stderr)
        return 4

    if not ARTIFACT_SRC.is_file():
        print(f"Build did not produce {ARTIFACT_SRC}", file=sys.stderr)
        return 4

    ARTIFACT_DST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ARTIFACT_SRC, ARTIFACT_DST_DIR / "NaviTrust.arc56.json")
    print(f"Copied ARC56 to {ARTIFACT_DST_DIR / 'NaviTrust.arc56.json'}")

    print("Deploying to TestNet (this sends transactions from your oracle account)...")
    proc = subprocess.run(
        [poetry, "run", "python", "-m", "smart_contracts", "deploy"],
        cwd=str(NAVI),
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)
    if proc.returncode != 0:
        print("Deploy failed.", file=sys.stderr)
        return 5

    app_id = _parse_app_id(proc.stdout) or _parse_app_id(proc.stderr or "")
    if not app_id:
        print("Could not parse PRAMANIK_APP_ID from deploy output.", file=sys.stderr)
        return 6

    env_path = ROOT / ".env"
    _merge_env_file(
        env_path,
        {
            "ORACLE_MNEMONIC": mn,
            "DEPLOYER_MNEMONIC": mn,
            "APP_ID": str(app_id),
        },
    )
    print(f"Updated {env_path} APP_ID={app_id}")

    fe = ROOT / "frontend" / ".env"
    if fe.is_file():
        _merge_env_file(fe, {"VITE_APP_ID": str(app_id)})
        print(f"Updated frontend/.env VITE_APP_ID={app_id}")
    else:
        print("Tip: create frontend/.env with VITE_APP_ID=%s (see frontend/.env.example)" % app_id)

    print("\n--- Next steps ---")
    print("1. Restart the API: python -m uvicorn app:app --host 127.0.0.1 --port 8000")
    print("2. Restart Vite (npm run dev) so VITE_APP_ID reloads")
    print("3. python scripts/verify_algorand_env.py   # should show oracle_matches_app_global: true")
    print("4. Optional demo chain: python seed_blockchain.py")
    print(f"\nNew Lora app URL: https://lora.algokit.io/testnet/application/{app_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
