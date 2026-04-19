"""
Generate a new oracle mnemonic, fund on TestNet (AlgoKit dispenser), build + deploy NaviTrust, update repo .env.

Prerequisites (commands):
  cd e:\\algo-hack\\smart_contracts\\navi_trust && poetry install

Funding (pick one):
  A) One-time browser login, then this script can call the CLI:
       algokit dispenser login
  B) CI token (30 days): algokit dispenser login --ci -o stdout
       set ALGOKIT_DISPENSER_ACCESS_TOKEN=...   (PowerShell: $env:ALGOKIT_DISPENSER_ACCESS_TOKEN="...")
  C) Manual fund after script prints the address:
       algokit dispenser fund -r <ADDRESS> -a 15 --whole-units

Run from repo root:
  python scripts/bootstrap_testnet_oracle.py

Options:
  --skip-fund     Skip funding (you already sent ALGO to the new address)
  --skip-deploy   Only generate mnemonic + update .env (no build/deploy)
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
DISPENSER_API = "https://api.dispenser.algorandfoundation.tools"


def _generate_account() -> tuple[str, str]:
    from algosdk import account, mnemonic

    sk, addr = account.generate_account()
    return mnemonic.from_private_key(sk), addr


def _fund_via_api(receiver: str, amount_micro: int) -> bool:
    token = (os.environ.get("ALGOKIT_DISPENSER_ACCESS_TOKEN") or "").strip()
    if not token:
        return False
    try:
        import urllib.error
        import urllib.request

        body = json.dumps({"receiver": receiver, "amount": amount_micro}).encode("utf-8")
        req = urllib.request.Request(
            f"{DISPENSER_API}/fund/0",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status == 200:
                return True
    except Exception as e:
        print(f"[fund-api] {e}", file=sys.stderr)
    return False


def _fund_via_algokit_cli(receiver: str) -> bool:
    """Uses `algokit dispenser fund` (works if user ran `algokit dispenser login` earlier)."""
    try:
        r = subprocess.run(
            ["algokit", "dispenser", "fund", "-r", receiver, "-a", "15", "--whole-units"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode == 0:
            return True
        print(r.stdout + r.stderr, file=sys.stderr)
    except FileNotFoundError:
        print("algokit CLI not found on PATH.", file=sys.stderr)
    except Exception as e:
        print(f"[fund-cli] {e}", file=sys.stderr)
    return False


def _wait_for_algo(address: str, min_micro: int, timeout_sec: int = 180) -> bool:
    import time
    import urllib.request

    for _ in range(timeout_sec // 3):
        try:
            url = f"https://testnet-api.algonode.cloud/v2/accounts/{address}"
            with urllib.request.urlopen(url, timeout=10) as r:
                data = json.loads(r.read().decode())
            amt = int(data.get("amount", 0))
            if amt >= min_micro:
                return True
        except Exception:
            pass
        time.sleep(3)
    return False


def _run_poetry(*args: str) -> None:
    if sys.platform == "win32":
        poetry = shutil.which("poetry")
        if not poetry:
            raise RuntimeError("poetry not found on PATH")
        cmd = [poetry, *args]
    else:
        cmd = ["poetry", *args]
    p = subprocess.run(cmd, cwd=str(NAVI), text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}")


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
    keys_done = set()
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
    ap = argparse.ArgumentParser(description="Bootstrap oracle mnemonic + TestNet deploy")
    ap.add_argument("--skip-fund", action="store_true", help="Assume address already has TestNet ALGO")
    ap.add_argument("--skip-deploy", action="store_true", help="Only generate account + write .env keys")
    args = ap.parse_args()

    os.chdir(ROOT)
    if not NAVI.is_dir():
        print(f"Missing {NAVI}", file=sys.stderr)
        return 1

    mn, addr = _generate_account()
    print(f"New oracle address: {addr}")
    print("(Keep the mnemonic secret; never commit it.)")

    env_path = ROOT / ".env"
    if not env_path.is_file():
        ex = ROOT / ".env.example"
        if ex.is_file():
            shutil.copy(ex, env_path)
            print(f"Created {env_path} from .env.example")

    if args.skip_deploy:
        _merge_env_file(
            env_path,
            {
                "ORACLE_MNEMONIC": mn,
                "DEPLOYER_MNEMONIC": mn,
            },
        )
        print(f"Updated {env_path} (ORACLE_MNEMONIC / DEPLOYER_MNEMONIC). APP_ID unchanged.")
        return 0

    if not args.skip_fund:
        print("Funding TestNet account (~15 ALGO target for deploy + fees)...")
        ok = _fund_via_api(addr, 15_000_000) or _fund_via_algokit_cli(addr)
        if not ok:
            print(
                "\nAutomatic funding failed. Do ONE of the following, then re-run with:\n"
                f"  python scripts/bootstrap_testnet_oracle.py --skip-fund\n\n"
                f"  1) algokit dispenser login\n"
                f"     algokit dispenser fund -r {addr} -a 15 --whole-units\n"
                f"  2) Set ALGOKIT_DISPENSER_ACCESS_TOKEN and re-run this script without --skip-fund\n"
                f"  3) Use https://bank.testnet.algorand.network/ to fund {addr}\n",
                file=sys.stderr,
            )
            _merge_env_file(
                env_path,
                {
                    "ORACLE_MNEMONIC": mn,
                    "DEPLOYER_MNEMONIC": mn,
                },
            )
            print(f"Saved mnemonic to {env_path} — fund the address above, then re-run with --skip-fund")
            return 2

        print("Waiting for balance on algonode...")
        if not _wait_for_algo(addr, min_micro=2_000_000):
            print("Timeout waiting for funds — check explorer / re-run with --skip-fund after funding.", file=sys.stderr)
            return 3

    env = os.environ.copy()
    env["DEPLOYER_MNEMONIC"] = mn
    env["ORACLE_MNEMONIC"] = mn
    env["ALGO_NETWORK"] = "testnet"

    print("Building contract (poetry)...")
    _run_poetry("run", "python", "-m", "smart_contracts", "build")

    if not ARTIFACT_SRC.is_file():
        print(f"Build did not produce {ARTIFACT_SRC}", file=sys.stderr)
        return 4

    ARTIFACT_DST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ARTIFACT_SRC, ARTIFACT_DST_DIR / "NaviTrust.arc56.json")
    print(f"Copied ARC56 to {ARTIFACT_DST_DIR / 'NaviTrust.arc56.json'}")

    print("Deploying to TestNet...")
    poetry_exe = shutil.which("poetry") or "poetry"
    proc = subprocess.run(
        [poetry_exe, "run", "python", "-m", "smart_contracts", "deploy"],
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

    _merge_env_file(
        env_path,
        {
            "ORACLE_MNEMONIC": mn,
            "DEPLOYER_MNEMONIC": mn,
            "APP_ID": str(app_id),
        },
    )
    fe = ROOT / "frontend" / ".env"
    if fe.is_file():
        _merge_env_file(fe, {"VITE_APP_ID": str(app_id)})
        print(f"Updated frontend/.env VITE_APP_ID={app_id}")
    else:
        print("Optional: set VITE_APP_ID in frontend/.env for static builds")

    print("\nDone.")
    print(f"  APP_ID={app_id}")
    print(f"  Oracle address={addr}")
    print(f"  Updated {env_path}")
    print("Restart: python -m uvicorn app:app --host 127.0.0.1 --port 8000")
    return 0


if __name__ == "__main__":
    sys.exit(main())
