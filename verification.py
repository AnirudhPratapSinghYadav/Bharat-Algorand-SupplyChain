"""
Navi-Trust — chain-verification helpers (algod + indexer only).
"""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

import algorand_client as chain

logger = logging.getLogger(__name__)

INDEXER_URL = chain.INDEXER_URL.rstrip("/")
ALGOD_URL = chain.ALGOD_URL.rstrip("/")
LORA_TX = chain.LORA_TESTNET_TX
LORA_APP = chain.LORA_TESTNET_APP
LORA_ACCT = "https://lora.algokit.io/testnet/account"
LORA_ASSET = "https://lora.algokit.io/testnet/asset"

# ARC-4 selector (first 4 bytes of SHA-512/256 of UTF-8 method signature) → signature string
_ARC4_SELECTOR_TO_SIG: Dict[str, str] = {}


def _abi_arg_types(method_obj: dict) -> List[str]:
    return [str(a.get("type", "")).lower() for a in (method_obj.get("args") or [])]


def _register_arc56_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return
    for m in data.get("methods") or []:
        name = m.get("name")
        if not name:
            continue
        types = _abi_arg_types(m)
        sig = f"{name}({','.join(types)})"
        h = hashlib.new("sha512_256", sig.encode("utf-8")).digest()[:4].hex()
        _ARC4_SELECTOR_TO_SIG[h] = sig


def _ensure_arc4_map() -> None:
    if _ARC4_SELECTOR_TO_SIG:
        return
    _register_arc56_file(chain.arc56_spec_path())
    # Runtime NaviTrust calls not always in checked-in ARC56 — common settlement path
    for extra in ("report_disaster_delay(string)", "report_disaster_delay(string,string)"):
        h = hashlib.new("sha512_256", extra.encode("utf-8")).digest()[:4].hex()
        _ARC4_SELECTOR_TO_SIG[h] = extra


def arc4_dictionary() -> dict[str, Any]:
    _ensure_arc4_map()
    return {
        "source": "arc56_files_plus_runtime_hint",
        "selectors": dict(sorted(_ARC4_SELECTOR_TO_SIG.items(), key=lambda x: x[0])),
    }


def _enrich_arc4_row(row: dict[str, Any]) -> None:
    sel = row.get("method_selector_hex")
    if not isinstance(sel, str) or len(sel) < 8:
        return
    _ensure_arc4_map()
    hit = _ARC4_SELECTOR_TO_SIG.get(sel.lower().strip())
    if hit:
        row["arc4_method"] = hit


def _get(url: str, timeout: float = 12) -> Optional[dict]:
    try:
        r = requests.get(url, timeout=timeout)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("verification GET %s: %s", url[:80], e)
        return None


def chain_health() -> dict:
    """Algod + indexer reachability for honest stale UI."""
    out: dict[str, Any] = {
        "fetched_at_unix": int(time.time()),
        "algod_last_round": None,
        "algod_ok": False,
        "indexer_ok": False,
        "network": chain.ALGO_NETWORK,
    }
    st = _get(f"{ALGOD_URL}/v2/status", 6)
    if st and "last-round" in st:
        out["algod_ok"] = True
        out["algod_last_round"] = int(st["last-round"])
    # light indexer probe (/health often missing on public nodes)
    ping = _get(f"{INDEXER_URL}/v2/health", 6)
    if ping is not None:
        out["indexer_ok"] = True
    else:
        g = _get(f"{INDEXER_URL}/v2/genesis", 6)
        if g is not None:
            out["indexer_ok"] = True
        else:
            sm = _get(f"{INDEXER_URL}/v2/transactions?limit=1", 8)
            out["indexer_ok"] = sm is not None
    return out


def _decode_global_state(gs: list) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for item in gs or []:
        try:
            k = base64.b64decode(item["key"]).decode("ascii", errors="replace")
            v = item.get("value") or {}
            if "uint" in v:
                out[k] = int(v["uint"])
            elif "bytes" in v:
                out[k] = base64.b64decode(v["bytes"]).hex()[:64] + ("…" if len(v.get("bytes", "")) > 32 else "")
            else:
                out[k] = None
        except Exception:
            continue
    return out


def read_on_chain_state(wallet: str) -> dict[str, Any]:
    """Global + local-ish reads for NaviTrust (ledger-sourced)."""
    w = (wallet or "").strip()
    out: dict[str, Any] = {
        "wallet": w,
        "navitrust": None,
        "lora_account_url": f"{LORA_ACCT}/{w}" if len(w) >= 52 else "",
    }
    if chain.APP_ID:
        app = _get(f"{ALGOD_URL}/v2/applications/{chain.APP_ID}")
        if app:
            gs = (app.get("params") or {}).get("global-state") or []
            out["navitrust"] = {
                "app_id": chain.APP_ID,
                "global_state": _decode_global_state(gs),
                "lora_application_url": f"{LORA_APP}/{chain.APP_ID}",
                "source": "algod",
            }
        if w:
            try:
                lr = requests.get(f"{ALGOD_URL}/v2/accounts/{w}/applications/{chain.APP_ID}", timeout=12)
                out["navitrust"] = out["navitrust"] or {"app_id": chain.APP_ID}
                if lr.status_code == 404:
                    out["navitrust"]["opted_in"] = False
                elif lr.ok:
                    jd = lr.json()
                    if jd.get("app-local-state"):
                        kv = (jd["app-local-state"].get("key-value")) or []
                        out["navitrust"]["local_state"] = _decode_global_state(kv)
                        out["navitrust"]["opted_in"] = True
                    else:
                        out["navitrust"]["opted_in"] = False
            except Exception:
                pass
    return out


def indexer_transaction_detail(tx_id: str) -> dict[str, Any]:
    """Single tx + atomic group members for transparency."""
    tx_id = (tx_id or "").strip()
    out: dict[str, Any] = {
        "tx_id": tx_id,
        "found": False,
        "primary": None,
        "group_id": None,
        "group_transactions": [],
        "lora_primary_url": f"{LORA_TX}/{tx_id}" if tx_id else "",
    }
    if not tx_id:
        return out
    data = _get(f"{INDEXER_URL}/v2/transactions/{tx_id}")
    if not data or "transaction" not in data:
        return out
    out["found"] = True
    tx = dict(data["transaction"])
    if not tx.get("id"):
        tx["id"] = data.get("id") or tx_id
    cr = data.get("confirmed-round")
    out["primary"] = _normalize_indexer_tx(tx, cr)
    gid = tx.get("group")
    out["group_id"] = gid
    if gid:
        try:
            gr = requests.get(
                f"{INDEXER_URL}/v2/transactions",
                params={"group": gid, "limit": 16},
                timeout=12,
            )
            gr.raise_for_status()
            grp = gr.json()
        except Exception as e:
            logger.warning("indexer group lookup: %s", e)
            grp = None
        if grp:
            for t in grp.get("transactions") or []:
                rnd = t.get("confirmed-round")
                out["group_transactions"].append(_normalize_indexer_tx(t, rnd))
        if not out["group_transactions"]:
            out["group_transactions"] = [out["primary"]]
    else:
        out["group_transactions"] = [out["primary"]]
    return out


def _normalize_indexer_tx(tx: dict, confirmed_round: Any) -> dict[str, Any]:
    tid = tx.get("id", "")
    row: dict[str, Any] = {
        "tx_id": tid,
        "round": int(confirmed_round) if confirmed_round is not None else None,
        "type": tx.get("tx-type"),
        "sender": tx.get("sender"),
        "lora_url": f"{LORA_TX}/{tid}" if tid else "",
    }
    app_tx = tx.get("application-transaction") or {}
    if app_tx:
        row["application_id"] = app_tx.get("application-id")
        row["on_completion"] = app_tx.get("on-completion")
        args = app_tx.get("application-args") or []
        row["application_args_count"] = len(args)
        # first arg often ABI method selector (4 bytes) for ARC-4 calls
        if args:
            try:
                raw = base64.b64decode(args[0])
                row["method_selector_hex"] = raw[:4].hex() if len(raw) >= 4 else raw.hex()
            except Exception:
                row["method_selector_hex"] = None
        row["method_label"] = _guess_method_label(row.get("type"), app_tx)
    pay = tx.get("payment-transaction") or {}
    if pay:
        row["amount_microalgo"] = int(pay.get("amount", 0))
        row["receiver"] = pay.get("receiver")
    ast = tx.get("asset-transfer-transaction") or {}
    if ast:
        row["asset_id"] = ast.get("asset-id")
        row["asset_amount"] = ast.get("amount")
    acfg = tx.get("asset-config-transaction") or {}
    if acfg:
        row["asset_config"] = True
    _enrich_arc4_row(row)
    return row


def _guess_method_label(tx_type: Optional[str], app_tx: dict) -> str:
    oc = (app_tx.get("on-completion") or "").upper()
    if oc == "OPTIN":
        return "app_opt_in"
    if oc == "CLOSEOUT":
        return "app_close_out"
    if tx_type == "appl" and app_tx.get("application-args"):
        return "app_call"
    return tx_type or "unknown"


def _wallet_app_txns(wallet: str, application_id: int, limit: int) -> Tuple[List[dict], Optional[str]]:
    w = wallet.strip()
    if not w or not application_id:
        return [], None
    try:
        r = requests.get(
            f"{INDEXER_URL}/v2/transactions",
            params={"address": w, "application-id": application_id, "limit": max(1, min(limit, 100))},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning("wallet app txns: %s", e)
        return [], None
    txs = data.get("transactions") or []
    token = data.get("next-token")
    out: List[dict] = []
    for tx in txs:
        rnd = tx.get("confirmed-round")
        out.append(_normalize_indexer_tx(tx, rnd))
    return out, token


def wallet_proofs(wallet: str, limit_per_app: int = 25) -> dict[str, Any]:
    """Merged ledger receipts for this wallet (NaviTrust app)."""
    w = (wallet or "").strip()
    items: List[dict[str, Any]] = []
    nt_next: Optional[str] = None
    if chain.APP_ID:
        rows, nt_next = _wallet_app_txns(w, chain.APP_ID, limit_per_app)
        for row in rows:
            row["domain_app"] = "NaviTrust"
            row["app_id"] = chain.APP_ID
            items.append(row)
    items.sort(key=lambda x: (x.get("round") or 0), reverse=True)
    cap = max(limit_per_app * 2, 50)
    trimmed = items[:cap]
    return {
        "wallet": w,
        "source": "indexer",
        "count": len(trimmed),
        "items": trimmed,
        "lora_account_url": f"{LORA_ACCT}/{w}" if len(w) >= 52 else "",
        "next_tokens": {"navitrust": nt_next},
        "limit_per_app": limit_per_app,
    }


def audit_trail_methods(wallet: str, limit: int = 40) -> dict[str, Any]:
    """Method-oriented view (ARC-4 selector + completion) for NaviTrust."""
    base = wallet_proofs(wallet, limit_per_app=max(12, limit // 2))
    rows = []
    for it in base["items"]:
        rows.append(
            {
                "tx_id": it.get("tx_id"),
                "round": it.get("round"),
                "domain_app": it.get("domain_app"),
                "application_id": it.get("application_id"),
                "method_label": it.get("method_label"),
                "method_selector_hex": it.get("method_selector_hex"),
                "arc4_method": it.get("arc4_method"),
                "on_completion": it.get("on_completion"),
                "type": it.get("type"),
                "amount_microalgo": it.get("amount_microalgo"),
                "lora_url": it.get("lora_url"),
            }
        )
    return {"wallet": base["wallet"], "source": "indexer", "entries": rows, "next_tokens": base.get("next_tokens")}


def shipment_ledger_snapshot(shipment_id: str) -> dict[str, Any]:
    """NaviTrust box-derived shipment view (same domain as dashboard)."""
    sid = (shipment_id or "").strip()
    out: dict[str, Any] = {"shipment_id": sid, "domain": "NaviTrust_escrow"}
    if not sid:
        return out
    try:
        full = chain.read_shipment_full(sid)
        out.update(full)
        if chain.APP_ID:
            out["lora_application_url"] = f"{LORA_APP}/{chain.APP_ID}"
    except Exception as e:
        logger.warning("shipment snapshot: %s", e)
        out["error"] = "Could not read boxes from algod."
    return out


def proof_bundle(wallet: str, tx_id: Optional[str] = None) -> dict[str, Any]:
    """Single JSON object for judges: health + state + proofs + audit + optional tx expansion."""
    w = (wallet or "").strip()
    bundle: dict[str, Any] = {
        "generated_at_unix": int(time.time()),
        "network": chain.ALGO_NETWORK,
        "health": chain_health(),
        "arc4_dictionary": arc4_dictionary(),
    }
    if w:
        bundle["on_chain_state"] = read_on_chain_state(w)
        bundle["wallet_proofs"] = wallet_proofs(w, 40)
        bundle["audit_trail"] = audit_trail_methods(w, 60)
    if tx_id and tx_id.strip():
        bundle["transaction_detail"] = indexer_transaction_detail(tx_id.strip())
    return bundle


def export_proof_bundle_json(wallet: str, tx_id: str = "") -> str:
    return json.dumps(proof_bundle(wallet, tx_id.strip() or None), indent=2, default=str)


def asa_proof(asset_id: int) -> dict[str, Any]:
    """ASA params for badge / token proof."""
    data = _get(f"{INDEXER_URL}/v2/assets/{int(asset_id)}")
    if not data or "asset" not in data:
        return {"found": False, "asset_id": asset_id}
    p = (data["asset"].get("params")) or {}
    return {
        "found": True,
        "asset_id": int(asset_id),
        "name": p.get("name"),
        "unit_name": p.get("unit-name"),
        "total": int(p.get("total", 0)),
        "decimals": int(p.get("decimals", 0)),
        "creator": p.get("creator"),
        "default_frozen": p.get("default-frozen"),
        "freeze": p.get("freeze"),
        "clawback": p.get("clawback"),
        "manager": p.get("manager"),
        "reserve": p.get("reserve"),
        "url": p.get("url"),
        "lora_asset_url": f"{LORA_ASSET}/{asset_id}",
        "source": "indexer",
    }


def export_wallet_proofs_csv(wallet: str) -> str:
    data = wallet_proofs(wallet, 40)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "tx_id",
            "round",
            "domain_app",
            "app_id",
            "type",
            "method_label",
            "arc4_method",
            "method_selector_hex",
            "amount_microalgo",
            "lora_url",
        ]
    )
    for it in data["items"]:
        w.writerow(
            [
                it.get("tx_id"),
                it.get("round"),
                it.get("domain_app"),
                it.get("application_id") or it.get("app_id"),
                it.get("type"),
                it.get("method_label"),
                it.get("arc4_method"),
                it.get("method_selector_hex"),
                it.get("amount_microalgo"),
                it.get("lora_url"),
            ]
        )
    return buf.getvalue()


def export_wallet_proofs_json(wallet: str) -> str:
    return json.dumps(wallet_proofs(wallet, 50), indent=2, default=str)
