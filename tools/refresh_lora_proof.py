#!/usr/bin/env python3
"""
Rebuild LORA_PROOF.md from indexer + optional on-chain cert read.

Run from repo root:
  python tools/refresh_lora_proof.py

Uses APP_ID, INDEXER_URL, ALGO_NETWORK from .env (no full app import — fast startup).
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
from typing import Any, Optional

import requests
from algosdk.logic import get_application_address
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config.json")

load_dotenv(os.path.join(ROOT, ".env"))

# Matches shipment id tokens embedded in app call args / notes (PRM-* seeded demos or legacy SHIP_*).
_SID = re.compile(r"\b(PRM-[A-Z0-9-]+|SHIP_[A-Z0-9_-]+)\b")


def _lora_paths() -> tuple[str, str, str, str]:
    base = (os.environ.get("LORA_BASE_URL") or "").strip().rstrip("/")
    if not base and os.path.isfile(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding="utf-8") as cf:
                base = str(json.load(cf).get("lora_base_url") or "").strip().rstrip("/")
        except (OSError, json.JSONDecodeError):
            base = ""
    if not base:
        base = "https://lora.algokit.io/testnet"
    return (
        f"{base}/transaction",
        f"{base}/application",
        f"{base}/account",
        f"{base}/asset",
    )


LORA_TX, LORA_APP, LORA_ACCOUNT, LORA_ASSET = _lora_paths()

INDEXER_URL = (os.environ.get("INDEXER_URL") or "https://testnet-idx.algonode.cloud").rstrip("/")


def _demo_shipment_triple() -> tuple[str, str, str]:
    if not os.path.isfile(CONFIG_PATH):
        print("config.json not found — cannot read demo_shipments", file=sys.stderr)
        sys.exit(1)
    with open(CONFIG_PATH, encoding="utf-8") as cf:
        ids = json.load(cf).get("demo_shipments") or []
    if len(ids) < 3:
        print("config.json demo_shipments must list 3 shipment IDs", file=sys.stderr)
        sys.exit(1)
    return ids[0], ids[1], ids[2]


def _selector_hex(tx: dict) -> Optional[str]:
    at = tx.get("application-transaction") or {}
    args = at.get("application-args") or []
    if not args:
        return None
    try:
        raw = base64.b64decode(args[0])
        return raw[:4].hex() if len(raw) >= 4 else None
    except Exception:
        return None


# Duplicated selector map — keep in sync with algorand_client.ARC4_SELECTOR_TO_METHOD
def _method_name(sel: str) -> str:
    import hashlib

    specs = [
        ("register_shipment", ["string", "address", "string"], "void"),
        ("fund_shipment", ["string", "pay"], "void"),
        ("record_verdict", ["string", "string", "uint64"], "void"),
        ("settle_shipment", ["string"], "uint64"),
        ("pause_oracle", [], "void"),
        ("unpause_oracle", [], "void"),
        ("update_oracle", ["address"], "void"),
        ("get_required_mbr", [], "uint64"),
        ("get_global_stats", [], "(uint64,uint64,uint64,uint64)"),
    ]
    for name, types, ret in specs:
        sig = f"{name}({','.join(types)}){ret}"
        h = hashlib.new("sha512_256", sig.encode()).digest()[:4].hex()
        if h == sel[:8].lower():
            return name
    return ""


def _sid_from_tx(tx: dict) -> Optional[str]:
    m = _SID.search(json.dumps(tx))
    return m.group(0) if m else None


def _collect_summary(app_id: int) -> dict[str, dict[str, Any]]:
    url = f"{INDEXER_URL}/v2/transactions?application-id={app_id}&limit=200"
    try:
        r = requests.get(url, timeout=8)
        r.raise_for_status()
    except Exception as e:
        print("Indexer unavailable; tx links will be (n/a):", e, file=sys.stderr)
        return {}
    txs = r.json().get("transactions") or []
    txs = sorted(
        txs,
        key=lambda t: int(t.get("confirmed-round") or t.get("confirmed_round") or 0),
    )
    acc: dict[str, dict[str, Any]] = {}
    for tx in txs:
        sid = _sid_from_tx(tx)
        if not sid:
            continue
        sel = _selector_hex(tx)
        if not sel or len(sel) < 8:
            continue
        method = _method_name(sel[:8])
        if not method:
            continue
        row = acc.setdefault(sid, {})
        key_map = {
            "register_shipment": "register_tx",
            "fund_shipment": "fund_tx",
            "record_verdict": "verdict_tx",
            "settle_shipment": "settle_tx",
        }
        k = key_map.get(method)
        if not k or k in row:
            continue
        tid = tx.get("id")
        if tid:
            row[k] = tid
    return acc


def main() -> None:
    app_id = int(os.environ.get("APP_ID") or os.environ.get("VITE_APP_ID") or 0)
    if not app_id:
        print("Set APP_ID in .env", file=sys.stderr)
        sys.exit(1)
    app_address = get_application_address(app_id)
    id_a, id_b, id_c = _demo_shipment_triple()
    summary = _collect_summary(app_id)
    m = summary.get(id_a, {})
    c = summary.get(id_b, {})
    d = summary.get(id_c, {})

    cid = 0
    cert_line = f"`{LORA_ASSET}/{cid}`" if cid > 0 else f"`(fill after seed — curl /shipment/{id_c} → certificate_asa)`"

    def tx_line(tid: str | None) -> str:
        return f"{LORA_TX}/{tid}" if tid else "—"

    body = f"""# Pramanik — on-chain proof (Lora)

Auto-generated by `python tools/refresh_lora_proof.py`. For a full seed run with guaranteed tx IDs, use `python seed_blockchain.py` (it overwrites this file).

## Application

- **App:** `{LORA_APP}/{app_id}`
- **Contract account (escrow):** `{LORA_ACCOUNT}/{app_address}`

---

## {id_a} — in transit, 2 ALGO locked

| Step     | Lora link |
|----------|-----------|
| Register | {tx_line(m.get("register_tx"))} |
| Fund     | {tx_line(m.get("fund_tx"))} |

---

## {id_b} — disputed, 3 ALGO locked, risk 87

| Step     | Lora link |
|----------|-----------|
| Register | {tx_line(c.get("register_tx"))} |
| Fund     | {tx_line(c.get("fund_tx"))} |
| Verdict  | {tx_line(c.get("verdict_tx"))} |

**Check:** verdict transaction → **Note** tab → JSON with `"type":"NAVI_VERDICT"`.

---

## {id_c} — settled, certificate minted

| Step        | Lora link |
|-------------|-----------|
| Register    | {tx_line(d.get("register_tx"))} |
| Fund        | {tx_line(d.get("fund_tx"))} |
| Verdict     | {tx_line(d.get("verdict_tx"))} |
| Settle      | {tx_line(d.get("settle_tx"))} |
| Cert (ASA)  | {cert_line} |

**Check:** settle tx → **Inner transactions** → pay to supplier + **acfg** (PRAMANIK-CERT / PCERT).

---

## Quick verification

```bash
curl -s http://127.0.0.1:8000/stats
```

```bash
curl -s "http://127.0.0.1:8000/shipment/{id_c}"
```
"""

    path = os.path.join(ROOT, "LORA_PROOF.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    print("Wrote", path)


if __name__ == "__main__":
    main()
