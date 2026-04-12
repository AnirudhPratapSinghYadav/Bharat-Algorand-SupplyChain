"""
Algorand reads/writes for Navi-Trust.
Requires artifacts/NaviTrust.arc56.json (legacy escrow ABI removed).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from algokit_utils import AlgorandClient, AppClientMethodCallParams, PaymentParams
from algokit_utils.models.amount import AlgoAmount
from algokit_utils.models.state import BoxReference
from algosdk import encoding
from algosdk import mnemonic as algosdk_mnemonic
from algosdk.account import address_from_private_key
from algosdk.atomic_transaction_composer import EmptySigner, TransactionWithSigner
from algosdk import transaction as txn_mod
from algosdk.logic import get_application_address
from algosdk.transaction import wait_for_confirmation

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
NAVITRUST_SPEC = ROOT / "artifacts" / "NaviTrust.arc56.json"

APP_ID = int(os.environ.get("APP_ID", 0) or os.environ.get("VITE_APP_ID", 0))
ALGO_NETWORK = os.environ.get("ALGO_NETWORK", "testnet")
ORACLE_MNEMONIC = os.environ.get("ORACLE_MNEMONIC") or os.environ.get("DEPLOYER_MNEMONIC")
DEPLOYER_MNEMONIC = ORACLE_MNEMONIC

ALGOD_URL = os.environ.get("ALGOD_ADDRESS", "https://testnet-api.algonode.cloud")
INDEXER_URL = os.environ.get(
    "VITE_INDEXER_URL",
    "https://testnet-idx.algonode.cloud" if ALGO_NETWORK == "testnet" else "https://mainnet-idx.algonode.cloud",
)

LORA_TESTNET_TX = "https://lora.algokit.io/testnet/transaction"
LORA_TESTNET_APP = "https://lora.algokit.io/testnet/application"


def lora_tx_url(tx_id: str | None) -> str:
    if not tx_id:
        return ""
    return f"{LORA_TESTNET_TX}/{tx_id}"


def fetch_transaction_note_json(tx_id: str) -> Optional[dict]:
    """Decode top-level transaction `note` from indexer (e.g. NAVI_VERDICT JSON)."""
    if not tx_id or not INDEXER_URL:
        return None
    try:
        url = f"{INDEXER_URL.rstrip('/')}/v2/transactions/{tx_id.strip()}"
        r = requests.get(url, timeout=12)
        if r.status_code != 200:
            return None
        body = r.json()
        tx = body.get("transaction") if isinstance(body, dict) else None
        if not isinstance(tx, dict):
            return None
        note_b64 = tx.get("note")
        if not note_b64:
            return None
        raw = base64.b64decode(note_b64)
        if not raw.startswith(b"{"):
            return None
        return json.loads(raw.decode("utf-8"))
    except Exception as e:
        logger.debug("fetch_transaction_note_json: %s", e)
        return None

STATUS_IN_TRANSIT = "In_Transit"
STATUS_LEGACY_FLAGGED = "Delayed_Disaster"
STATUS_DISPUTED = "Disputed"
STATUS_SETTLED = "Settled"

# Global-state keys shown on /protocol (hide legacy badge / pact fields).
NAVITRUST_DISPLAY_KEYS = frozenset(
    {"total_shipments", "total_settled", "total_disputed", "oracle_address"}
)


def _arc4_method_selector_hex(signature: str) -> str:
    """First 4 bytes of SHA-512/256 of ARC-4 method signature string."""
    return hashlib.new("sha512_256", signature.encode()).digest()[:4].hex()


def _build_navitrust_arc4_name_map() -> Dict[str, str]:
    """Map 8-char hex selector -> method name for NaviTrust ARC-4 methods."""
    specs = [
        ("register_shipment", ["string", "address", "string"], "void"),
        ("fund_shipment", ["string", "pay"], "void"),
        ("record_verdict", ["string", "string", "uint64"], "void"),
        ("settle_shipment", ["string"], "uint64"),
        ("update_oracle", ["address"], "void"),
        ("get_global_stats", [], "(uint64,uint64,uint64)"),
    ]
    out: Dict[str, str] = {}
    for name, types, ret in specs:
        sig = f"{name}({','.join(types)}){ret}"
        out[_arc4_method_selector_hex(sig)] = name
    return out


ARC4_SELECTOR_TO_METHOD = _build_navitrust_arc4_name_map()

# Human-readable labels for Recent Activity / protocol tables
METHOD_ACTION_LABELS = {
    "register_shipment": "Shipment registered",
    "record_verdict": "Verdict recorded",
    "settle_shipment": "Shipment settled",
    "fund_shipment": "Escrow funded",
    "update_oracle": "Oracle address updated",
    "get_global_stats": "Global stats lookup",
}


def decode_method_name(selector_hex: str) -> str:
    """Plain English method from 8-char hex selector (or prefix)."""
    h = (selector_hex or "").strip().lower().replace("0x", "")
    if len(h) >= 8:
        h8 = h[:8]
        return ARC4_SELECTOR_TO_METHOD.get(h8, f"app_call ({h8})")
    return "app_call"


def get_display_global_state(app_id: int) -> Dict[str, Any]:
    """Supply-chain-relevant global state only (filters legacy contract clutter)."""
    if not app_id:
        return {}
    try:
        info = algorand.client.algod.application_info(app_id)
        gs = info.get("params", {}).get("global-state", [])
        result: Dict[str, Any] = {}
        for kv in gs:
            key = base64.b64decode(kv.get("key", "")).decode("utf-8", errors="ignore")
            if key not in NAVITRUST_DISPLAY_KEYS:
                continue
            val = kv.get("value") or {}
            if val.get("type") == 2:
                result[key] = int(val.get("uint", 0))
            else:
                raw_b = val.get("bytes", "")
                if raw_b:
                    raw = base64.b64decode(raw_b)
                    if key == "oracle_address" and len(raw) == 32:
                        result[key] = encoding.encode_address(raw)
                    else:
                        result[key] = raw.decode("utf-8", errors="ignore")
                else:
                    result[key] = ""
        return result
    except Exception as e:
        logger.warning("get_display_global_state: %s", e)
        return {}


def _indexer_tx_selector_hex(tx: dict) -> Optional[str]:
    at = tx.get("application-transaction")
    if not isinstance(at, dict):
        return None
    args = at.get("application-args") or []
    if not args:
        return None
    try:
        raw = base64.b64decode(args[0])
        return raw[:4].hex() if len(raw) >= 4 else None
    except Exception:
        return None


def _tx_type_plain(tx_type: Optional[str]) -> str:
    if not tx_type:
        return "Transaction"
    mapping = {
        "appl": "Application call",
        "pay": "Payment",
        "axfer": "Asset transfer",
        "acfg": "Certificate minted",
        "keyreg": "Key registration",
    }
    return mapping.get(tx_type, tx_type.replace("_", " ").title())


def decode_tx_action(tx: dict) -> str:
    """Plain-English action for indexer transaction objects (top-level or inner)."""
    tt = tx.get("tx-type") or ""
    if tt == "appl":
        sel = _indexer_tx_selector_hex(tx)
        if sel:
            mn = decode_method_name(sel)
            if mn.startswith("app_call"):
                return "Blockchain action"
            return METHOD_ACTION_LABELS.get(mn, mn.replace("_", " ").title())
        return "Blockchain action"
    if tt == "pay":
        return "Payment"
    if tt == "acfg":
        return "Certificate minted"
    if tt == "axfer":
        return "Asset transfer"
    return _tx_type_plain(tt)

try:
    algorand = (
        AlgorandClient.testnet()
        if ALGO_NETWORK == "testnet"
        else AlgorandClient.default_localnet()
    )
except Exception:
    algorand = AlgorandClient.testnet()


def use_navitrust() -> bool:
    return NAVITRUST_SPEC.is_file()


def arc56_spec_path() -> Path:
    if use_navitrust():
        return NAVITRUST_SPEC
    raise FileNotFoundError(
        "artifacts/NaviTrust.arc56.json is required. Copy from smart_contracts build output."
    )


def _load_spec_text() -> str:
    p = arc56_spec_path()
    if not p.is_file():
        raise FileNotFoundError(f"ARC56 not found: {p}")
    return p.read_text(encoding="utf-8")


def _oracle_account():
    if not ORACLE_MNEMONIC:
        raise ValueError("ORACLE_MNEMONIC or DEPLOYER_MNEMONIC not set")
    return algorand.account.from_mnemonic(mnemonic=ORACLE_MNEMONIC)


def oracle_address_string() -> Optional[str]:
    """Public Algorand address for the oracle/deployer account, if mnemonic is configured."""
    if not ORACLE_MNEMONIC:
        return None
    try:
        return _oracle_account().address
    except Exception:
        return None


def verify_oracle_setup() -> Optional[str]:
    """
    Validate ORACLE_MNEMONIC / DEPLOYER_MNEMONIC and log funded address at startup.
    Raises RuntimeError if mnemonic is missing or malformed (skipped under pytest).
    """
    if os.environ.get("PYTEST_CURRENT_TEST"):
        logger.info("Oracle verify skipped (pytest)")
        return None

    if os.environ.get("SKIP_ORACLE_VERIFY", "").strip().lower() in ("1", "true", "yes"):
        logger.warning("SKIP_ORACLE_VERIFY is set — skipping oracle startup check (not for production)")
        return None

    mnemonic_str = (os.environ.get("ORACLE_MNEMONIC") or os.environ.get("DEPLOYER_MNEMONIC") or "").strip()
    if not mnemonic_str or len(mnemonic_str.split()) != 25:
        raise RuntimeError(
            "ORACLE_MNEMONIC not set or invalid. "
            "Add a funded TestNet deployer mnemonic to .env (see .env.example)."
        )
    try:
        pk = algosdk_mnemonic.to_private_key(mnemonic_str)
        addr = address_from_private_key(pk)
        info = algorand.client.algod.account_info(addr)
        amt = int(info.get("amount", 0))
        balance = amt / 1_000_000.0
        print(f"✅ Oracle: {addr[:12]}... | {balance:.2f} ALGO")
        if balance < 2:
            print("⚠️ WARNING: Oracle balance low. Fund at bank.testnet.algorand.network")
        return addr
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Oracle setup failed: {e}") from e


def send_oracle_payment_microalgo(
    receiver: str,
    amount_micro: int,
    note: str,
    wait_rounds: int = 8,
) -> Optional[dict]:
    """
    Sign and submit a payment from the oracle account (e.g. 0-ALGO self-transfer with JSON note).
    Returns tx_id and lora_url on success.
    """
    if not ORACLE_MNEMONIC or amount_micro < 0:
        return None
    try:
        sk = algosdk_mnemonic.to_private_key(ORACLE_MNEMONIC.strip())
        sender = address_from_private_key(sk)
        sp = algorand.client.algod.suggested_params()
        note_b = (note or "").encode("utf-8")[:1000]
        pay = txn_mod.PaymentTxn(sender, sp, receiver, amount_micro, note=note_b)
        stxn = pay.sign(sk)
        tx_id = algorand.client.algod.send_transaction(stxn)
        wait_for_confirmation(algorand.client.algod, tx_id, wait_rounds)
        return {"tx_id": tx_id, "lora_url": lora_tx_url(tx_id)}
    except Exception as e:
        logger.warning("send_oracle_payment_microalgo failed: %s", e)
        return None


def send_oracle_zero_note(note: str) -> Optional[dict]:
    """0-ALGO self-payment carrying a note (witness, oracle ticks, testimony hash, etc.)."""
    addr = oracle_address_string()
    if not addr:
        return None
    return send_oracle_payment_microalgo(addr, 0, note)


def get_app_client():
    if not APP_ID:
        raise ValueError("APP_ID not set")
    deployer = _oracle_account()
    return algorand.client.get_app_client_by_id(
        app_spec=_load_spec_text(),
        app_id=APP_ID,
        default_sender=deployer.address,
    )


def _decode_arc4_string(raw: bytes) -> str:
    if not raw or len(raw) < 2:
        return ""
    n = int.from_bytes(raw[:2], "big")
    return raw[2 : 2 + n].decode("utf-8", errors="replace").replace("\x00", "").strip()


def _navi_str_key_box_name(prefix: bytes, shipment_id: str) -> bytes:
    """BoxMap key encoding: prefix + UTF-8 shipment id (matches Puya BoxMap[Bytes] keys)."""
    return prefix + shipment_id.encode("utf-8")


def _navi_status_box_name(shipment_id: str) -> bytes:
    return _navi_str_key_box_name(b"st_", shipment_id)


def _navi_rep_box_name(supplier_address: str) -> bytes:
    """BoxMap(Account, _) key: prefix + 32-byte pubkey."""
    return b"rp_" + encoding.decode_address(supplier_address)


def navitrust_shipment_box_refs(shipment_id: str, include_supplier_rep: bool) -> list[BoxReference]:
    """Box references for a shipment (string-keyed maps + optional supplier reputation box)."""
    if not APP_ID:
        return []
    prefixes = (b"st_", b"sp_", b"by_", b"fn_", b"rs_", b"vd_", b"rt_", b"ce_")
    refs = [BoxReference(APP_ID, _navi_str_key_box_name(pr, shipment_id)) for pr in prefixes]
    if include_supplier_rep:
        sup = read_navitrust_supplier_address(shipment_id)
        if sup:
            refs.append(BoxReference(APP_ID, _navi_rep_box_name(sup)))
    return refs


def read_navitrust_supplier_address(shipment_id: str) -> Optional[str]:
    """Supplier Algorand address from sp_ box (32-byte ARC4 address)."""
    if not APP_ID or not use_navitrust():
        return None
    try:
        name = _navi_str_key_box_name(b"sp_", shipment_id)
        box_resp = algorand.client.algod.application_box_by_name(APP_ID, name)
        raw = base64.b64decode(box_resp["value"])
        if len(raw) >= 32:
            return encoding.encode_address(raw[:32])
    except Exception:
        pass
    return None


def read_shipment_status(shipment_id: str) -> str:
    """On-chain status string or Unregistered / Unknown."""
    if not APP_ID:
        return "Unknown"
    try:
        if use_navitrust():
            name = _navi_status_box_name(shipment_id)
            box_resp = algorand.client.algod.application_box_by_name(APP_ID, name)
            raw = base64.b64decode(box_resp["value"])
            return _decode_arc4_string(raw) or "Unknown"
        # Legacy AgriSupplyChainEscrow: shipment_ + utf8 id
        box_name = b"shipment_" + shipment_id.encode("utf-8")
        box_resp = algorand.client.algod.application_box_by_name(APP_ID, box_name)
        raw = base64.b64decode(box_resp["value"])
        return _decode_arc4_string(raw) or "Unknown"
    except Exception:
        return "Unregistered"


def read_shipment_full(shipment_id: str) -> dict[str, Any]:
    """NaviTrust: decode status box + optional route via get_shipment simulate would be ideal; use boxes."""
    status = read_shipment_status(shipment_id)
    out: dict[str, Any] = {
        "shipment_id": shipment_id,
        "status": status if status != "Unregistered" else "Not_Found",
        "funds_microalgo": 0,
        "risk_score": 0,
        "route": "",
        "verdict": None,
        "certificate_asa": None,
        "app_id": APP_ID,
        "source": "algorand_box_storage",
        "lora_url": f"{LORA_TESTNET_APP}/{APP_ID}" if APP_ID else "",
    }
    if not APP_ID or status in ("Unknown", "Unregistered", "Not_Found"):
        return out
    if use_navitrust():
        for prefix, key in (
            ("fn_", "funds_microalgo"),
            ("rs_", "risk_score"),
            ("rt_", "route"),
            ("vd_", "verdict"),
            ("ce_", "certificate_asa"),
        ):
            try:
                name = _navi_str_key_box_name(prefix.encode("utf-8"), shipment_id)
                box_resp = algorand.client.algod.application_box_by_name(APP_ID, name)
                raw = base64.b64decode(box_resp["value"])
                if key in ("funds_microalgo", "risk_score", "certificate_asa"):
                    if len(raw) == 8:
                        out[key] = int.from_bytes(raw, "big")
                else:
                    out[key] = _decode_arc4_string(raw)
            except Exception as e:
                logger.debug("box read %s: %s", key, e)
        cert = out.get("certificate_asa")
        if cert:
            cid = int(cert)
            out["lora_cert_url"] = f"https://lora.algokit.io/testnet/asset/{cid}"
    return out


def record_verdict_chain(
    shipment_id: str,
    verdict_json: str,
    risk_score: int,
    note: Optional[bytes] = None,
) -> Optional[dict]:
    if not ORACLE_MNEMONIC or not APP_ID or not use_navitrust():
        return None
    try:
        deployer = _oracle_account()
        app_client = get_app_client()
        result = app_client.send.call(
            params=AppClientMethodCallParams(
                method="record_verdict",
                args=[shipment_id, verdict_json[:3500], risk_score],
                sender=deployer.address,
                note=note[:1000] if note else None,
                box_references=navitrust_shipment_box_refs(shipment_id, include_supplier_rep=False),
                extra_fee=AlgoAmount(micro_algo=1000),
            )
        )
        tx_id = result.tx_ids[0] if result.tx_ids else None
        cr = result.confirmation.get("confirmed-round") if result.confirmation else None
        return {"tx_id": tx_id, "confirmed_round": cr, "lora_url": lora_tx_url(tx_id)}
    except Exception as e:
        logger.warning("record_verdict failed: %s", e)
        return None


def legacy_report_disaster(shipment_id: str, reasoning_hash: str) -> Optional[dict]:
    if not ORACLE_MNEMONIC or not APP_ID:
        return None
    try:
        deployer = _oracle_account()
        app_client = algorand.client.get_app_client_by_id(
            app_spec=_load_spec_text(),
            app_id=APP_ID,
            default_sender=deployer.address,
        )
        result = app_client.send.call(
            params=AppClientMethodCallParams(
                method="report_disaster_delay",
                args=[shipment_id, reasoning_hash],
                sender=deployer.address,
            )
        )
        tx_id = result.tx_ids[0] if result.tx_ids else None
        cr = result.confirmation.get("confirmed-round") if result.confirmation else None
        return {"tx_id": tx_id, "confirmed_round": cr}
    except Exception as e:
        logger.warning("legacy report_disaster failed: %s", e)
        return None


def settle_shipment_chain(shipment_id: str) -> Optional[dict]:
    if not ORACLE_MNEMONIC or not APP_ID or not use_navitrust():
        return None
    try:
        deployer = _oracle_account()
        app_client = get_app_client()
        result = app_client.send.call(
            params=AppClientMethodCallParams(
                method="settle_shipment",
                args=[shipment_id],
                sender=deployer.address,
                box_references=navitrust_shipment_box_refs(shipment_id, include_supplier_rep=True),
                extra_fee=AlgoAmount(micro_algo=4000),
            )
        )
        tx_id = result.tx_ids[0] if result.tx_ids else None
        cr = result.confirmation.get("confirmed-round") if result.confirmation else None
        cert = 0
        try:
            if result.abi_return is not None:
                cert = int(result.abi_return)
        except (TypeError, ValueError):
            cert = 0
        return {
            "tx_id": tx_id,
            "confirmed_round": cr,
            "certificate_asa_id": cert,
            "lora_url": lora_tx_url(tx_id),
            "certificate_created": cert > 0,
        }
    except Exception as e:
        logger.warning("settle_shipment failed: %s", e)
        return None


def legacy_resolve_disaster(shipment_id: str, resolution_hash: str) -> bool:
    if not ORACLE_MNEMONIC or not APP_ID:
        return False
    try:
        deployer = _oracle_account()
        app_client = algorand.client.get_app_client_by_id(
            app_spec=_load_spec_text(),
            app_id=APP_ID,
            default_sender=deployer.address,
        )
        app_client.send.call(
            params=AppClientMethodCallParams(
                method="resolve_disaster",
                args=[shipment_id, resolution_hash],
                sender=deployer.address,
            )
        )
        return True
    except Exception as e:
        logger.error("legacy resolve failed: %s", e)
        return False


def ensure_navitrust_app_mbr(min_balance_algo: float = 2.5) -> None:
    """
    Top up the app account for box storage. register_shipment creates several boxes;
    a low app balance often surfaces as err opcode / assert in TEAL (not a clear MBR message).
    """
    if not APP_ID or not ORACLE_MNEMONIC or not use_navitrust():
        return
    try:
        app_addr = get_application_address(APP_ID)
        deployer = _oracle_account()
        info = algorand.client.algod.account_info(app_addr)
        bal_algo = int(info.get("amount", 0)) / 1_000_000.0
        if bal_algo >= min_balance_algo:
            return
        fund_amount = min_balance_algo - bal_algo + 0.25
        dep_micro = int(algorand.client.algod.account_info(deployer.address).get("amount", 0))
        dep_algo = dep_micro / 1_000_000.0
        if fund_amount > max(0, dep_algo - 0.3):
            logger.warning(
                "NaviTrust app #%s balance %.4f ALGO — need ~%.2f more for new boxes; oracle balance %.4f ALGO",
                APP_ID,
                bal_algo,
                fund_amount,
                dep_algo,
            )
            return
        micro = int(fund_amount * 1_000_000)
        algorand.send.payment(
            PaymentParams(
                sender=deployer.address,
                receiver=app_addr,
                amount=AlgoAmount(micro_algo=micro),
            )
        )
        logger.info("Funded app #%s with %.4f ALGO for box MBR before register", APP_ID, fund_amount)
    except Exception as e:
        logger.warning("ensure_navitrust_app_mbr: %s", e)


def register_navitrust(shipment_id: str, supplier: str, route: str) -> dict:
    if not ORACLE_MNEMONIC or not APP_ID:
        raise ValueError("Missing oracle or APP_ID")
    st = read_shipment_status(shipment_id)
    if st not in ("Unregistered", "Unknown"):
        raise ValueError(f"Shipment already on-chain (status: {st}). Use a new shipment_id.")
    ensure_navitrust_app_mbr()
    deployer = _oracle_account()
    app_client = get_app_client()
    result = app_client.send.call(
        params=AppClientMethodCallParams(
            method="register_shipment",
            args=[shipment_id, supplier, route],
            sender=deployer.address,
        )
    )
    tx_id = result.tx_ids[0] if result.tx_ids else None
    return {
        "tx_id": tx_id,
        "app_id": APP_ID,
        "lora_url": f"{LORA_TESTNET_APP}/{APP_ID}",
        "lora_tx_url": lora_tx_url(tx_id),
    }


def register_legacy(shipment_id: str, _supplier: str = "") -> dict:
    """Legacy escrow contract support removed; use NaviTrust + artifacts/NaviTrust.arc56.json."""
    raise RuntimeError(
        "Legacy AgriSupplyChainEscrow flow removed. Deploy NaviTrust and keep artifacts/NaviTrust.arc56.json."
    )


def list_shipment_statuses_from_boxes() -> List[Tuple[str, str]]:
    if not APP_ID:
        return []
    try:
        resp = algorand.client.algod.application_boxes(APP_ID)
        boxes = resp.get("boxes", [])
        seen: set[str] = set()
        out: List[Tuple[str, str]] = []
        prefix = b"st_"
        for box_desc in boxes:
            try:
                name_raw = base64.b64decode(box_desc.get("name", ""))
                if not name_raw.startswith(prefix):
                    continue
                rest = name_raw[len(prefix) :]
                if len(rest) < 1:
                    continue
                sid = rest.decode("utf-8", errors="ignore")
                if sid in seen:
                    continue
                seen.add(sid)
                st = read_shipment_status(sid)
                out.append((sid, st))
            except Exception:
                continue
        return out
    except Exception as e:
        logger.warning("list boxes failed: %s", e)
        return []


def build_register_shipment_txn_b64(sender_address: str, shipment_id: str, supplier: str, route: str) -> list[str]:
    """
    NaviTrust register_shipment is oracle-only on-chain; use POST /register-shipment (server-signed).
    """
    raise ValueError(
        "register_shipment must be sent by the oracle account. Use POST /register-shipment with server signing."
    )


def build_fund_shipment_txns_b64(payer_address: str, shipment_id: str, micro_algo: int = 500_000) -> list[str]:
    """
    Unsigned payment + fund_shipment app call (same group) for wallet signing.
    Min 100_000 micro-ALGO (0.1 ALGO) per on-chain contract rule.
    """
    if not APP_ID or not use_navitrust():
        raise ValueError("NaviTrust APP_ID and ARC56 required")
    if micro_algo < 100_000:
        raise ValueError("Minimum funding is 100000 microAlgo (0.1 ALGO)")
    app_addr = get_application_address(APP_ID)
    sp = algorand.client.algod.suggested_params()
    pay = txn_mod.PaymentTxn(payer_address, sp, app_addr, micro_algo)
    pay.fee = 2000
    pay.flat_fee = True
    twos = TransactionWithSigner(txn=pay, signer=EmptySigner())
    app_client = algorand.client.get_app_client_by_id(
        app_spec=_load_spec_text(),
        app_id=APP_ID,
        default_sender=payer_address,
    )
    built = app_client.create_transaction.call(
        AppClientMethodCallParams(
            method="fund_shipment",
            args=[shipment_id, twos],
            sender=payer_address,
        )
    )
    txn_mod.assign_group_id(built.transactions)
    transactions = built.transactions
    encoded: list[str] = []
    for t in transactions:
        if isinstance(t, bytes):
            encoded.append(base64.b64encode(t).decode("ascii"))
        else:
            packed = encoding.msgpack_encode(t)
            if isinstance(packed, str):
                packed = packed.encode("latin-1")
            encoded.append(base64.b64encode(packed).decode("ascii"))
    return encoded


def fund_shipment_oracle_microalgo(shipment_id: str, micro_algo: int) -> Optional[dict]:
    """
    Oracle signs and submits pay + fund_shipment atomic group (demo seed / ops).
    """
    if not ORACLE_MNEMONIC or not APP_ID or not use_navitrust():
        logger.warning("fund_shipment_oracle: missing oracle, APP_ID, or not NaviTrust")
        return None
    if micro_algo < 100_000:
        raise ValueError("Minimum funding is 100000 microAlgo (0.1 ALGO)")
    pk = algosdk_mnemonic.to_private_key(ORACLE_MNEMONIC.strip())
    addr = address_from_private_key(pk)
    b64s = build_fund_shipment_txns_b64(addr, shipment_id, micro_algo)
    txns = [encoding.msgpack_decode(base64.b64decode(b)) for b in b64s]
    stxns = [t.sign(pk) for t in txns]
    algod = algorand.client.algod
    txid = algod.send_transactions(stxns)
    conf = wait_for_confirmation(algod, txid, 25)
    rnd = conf.get("confirmed-round") if isinstance(conf, dict) else None
    return {"tx_id": txid, "confirmed_round": rnd, "lora_url": lora_tx_url(txid)}


def indexer_recent_app_txns(limit: int = 20) -> List[dict]:
    if not APP_ID:
        return []
    try:
        url = f"{INDEXER_URL}/v2/transactions?application-id={APP_ID}&limit={limit}"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        txs = r.json().get("transactions", [])
        result = []
        for tx in txs:
            note = ""
            if tx.get("note"):
                try:
                    note = base64.b64decode(tx["note"]).decode("utf-8", errors="replace")
                except Exception:
                    pass
            tt = tx.get("tx-type") or ""
            sel = _indexer_tx_selector_hex(tx)
            if tt == "appl" and sel:
                method_name = decode_method_name(sel)
                action_plain = method_name
            else:
                method_name = ""
                action_plain = _tx_type_plain(tt)
            action = decode_tx_action(tx)
            inner = tx.get("inner-txns") or []
            if inner and action == "Blockchain action":
                for itx in inner:
                    if isinstance(itx, dict) and itx.get("tx-type") == "acfg":
                        action = "Certificate minted"
                        break
            rt = tx.get("round-time")
            ts_iso = ""
            if rt is not None:
                try:
                    ts_iso = datetime.fromtimestamp(int(rt), tz=timezone.utc).isoformat()
                except (TypeError, ValueError, OSError):
                    ts_iso = ""
            result.append(
                {
                    "tx_id": tx.get("id"),
                    "type": tt,
                    "sender": tx.get("sender"),
                    "amount": (tx.get("payment-transaction") or {}).get("amount", 0),
                    "note": note[:500],
                    "round": tx.get("confirmed-round") or tx.get("confirmed_round"),
                    "timestamp": ts_iso,
                    "lora_url": f"{LORA_TESTNET_TX}/{tx.get('id')}" if tx.get("id") else "",
                    "method_selector_hex": sel or "",
                    "method_name": method_name,
                    "action_plain": action_plain,
                    "action": action,
                }
            )
        return result
    except Exception as e:
        logger.warning("indexer txns: %s", e)
        return []


def global_stats_navitrust() -> dict:
    out = {
        "total_shipments": 0,
        "total_settled": 0,
        "total_disputed": 0,
        "app_id": APP_ID,
        "source": "algorand_box_enumeration",
    }
    if not APP_ID:
        return out
    gs = get_display_global_state(APP_ID)
    if gs and "total_shipments" in gs:
        out["total_shipments"] = int(gs.get("total_shipments") or 0)
        out["total_settled"] = int(gs.get("total_settled") or 0)
        out["total_disputed"] = int(gs.get("total_disputed") or 0)
        out["source"] = "algorand_global_state"
        return out
    pairs = list_shipment_statuses_from_boxes()
    out["total_shipments"] = len(pairs)
    for _, st in pairs:
        if st == STATUS_SETTLED:
            out["total_settled"] += 1
        elif st == STATUS_DISPUTED:
            out["total_disputed"] += 1
    return out


def read_supplier_reputation_on_chain(supplier_address: str) -> dict:
    """Read supplier_reputation from rp_ + address box. score is null until a box exists (no fake defaults)."""
    if not APP_ID or not use_navitrust():
        return {
            "address": supplier_address,
            "score": None,
            "source": "no_app",
            "lora_url": "",
        }
    try:
        name = _navi_rep_box_name(supplier_address)
        box_resp = algorand.client.algod.application_box_by_name(APP_ID, name)
        raw = base64.b64decode(box_resp["value"])
        if len(raw) == 8:
            score = int.from_bytes(raw, "big")
            return {
                "address": supplier_address,
                "score": score,
                "source": "algorand_box_storage",
                "lora_url": f"{LORA_TESTNET_APP}/{APP_ID}",
            }
    except Exception:
        pass
    return {
        "address": supplier_address,
        "score": None,
        "source": "no_box",
        "lora_url": f"{LORA_TESTNET_APP}/{APP_ID}",
    }
