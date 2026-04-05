"""ARC-69 style custody handoff ASA mints (demo: oracle creates ASA per handoff)."""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone

import requests
from algosdk import encoding as algo_encoding
from algosdk import mnemonic as algosdk_mnemonic
from algosdk.account import address_from_private_key
from algosdk import transaction as txn_mod
from algosdk.transaction import wait_for_confirmation

import algorand_client as chain
from navitrust_io import load_json, save_json

logger = logging.getLogger(__name__)

CUSTODY_FILE = "custody_chain.json"


def mint_custody_nft(
    shipment_id: str,
    handler_address: str,
    location: str,
    handler_name: str,
    prev_nft_id: int = 0,
    photo_hash: str = "",
) -> dict:
    if not chain.ORACLE_MNEMONIC:
        return {"error": "oracle not configured"}
    arc69_note = json.dumps(
        {
            "standard": "arc69",
            "description": f"Navi-Trust Custody Handoff — {shipment_id}",
            "properties": {
                "shipment_id": shipment_id,
                "handler": handler_address,
                "handler_name": handler_name,
                "location": location,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "prev_custody_nft": prev_nft_id,
                "photo_hash": photo_hash,
                "type": "CUSTODY_HANDOFF",
            },
        }
    )
    try:
        sk = algosdk_mnemonic.to_private_key(chain.ORACLE_MNEMONIC.strip())
        sender = address_from_private_key(sk)
        sp = chain.algorand.client.algod.suggested_params()
        loc6 = (location or "LOC")[:6]
        aname = f"NAVI-{shipment_id}-{loc6}"[:32]
        note_b = arc69_note.encode("utf-8")[:1000]
        url = f"https://navitrustapp.vercel.app/custody/{shipment_id}"[:96]
        txn = txn_mod.AssetConfigTxn(
            sender=sender,
            sp=sp,
            index=0,
            total=1,
            decimals=0,
            default_frozen=False,
            unit_name="NCUST",
            asset_name=aname,
            manager=sender,
            reserve=sender,
            freeze=sender,
            clawback=sender,
            url=url,
            note=note_b,
            strict_empty_address_check=False,
        )
        stxn = txn.sign(sk)
        tx_id = chain.algorand.client.algod.send_transaction(stxn)
        info = wait_for_confirmation(chain.algorand.client.algod, tx_id, 12)
        asa_id = info.get("asset-index") or info.get("asset_index")
        if asa_id is None:
            pool = info.get("pool-error")
            logger.warning("custody mint: no asset-index in confirmation: %s", pool)
            asa_id = 0
        entry = {
            "asa_id": int(asa_id),
            "tx_id": tx_id,
            "handler": handler_address,
            "handler_name": handler_name,
            "location": location,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "prev_nft_id": prev_nft_id,
            "lora_asset_url": f"https://lora.algokit.io/testnet/asset/{asa_id}",
            "lora_tx_url": f"https://lora.algokit.io/testnet/transaction/{tx_id}",
        }
        data = load_json(CUSTODY_FILE, {})
        if not isinstance(data, dict):
            data = {}
        chain_list = data.get(shipment_id) or []
        if not isinstance(chain_list, list):
            chain_list = []
        chain_list.append(entry)
        data[shipment_id] = chain_list
        save_json(CUSTODY_FILE, data)
        return {
            "asa_id": int(asa_id),
            "tx_id": tx_id,
            "lora_asset_url": entry["lora_asset_url"],
            "lora_tx_url": entry["lora_tx_url"],
            "message": f"Custody NFT minted for handoff at {location}",
        }
    except Exception as e:
        logger.exception("custody mint failed: %s", e)
        return {"error": str(e)}


def get_chain(shipment_id: str) -> list[dict]:
    data = load_json(CUSTODY_FILE, {})
    if not isinstance(data, dict):
        return []
    lst = data.get(shipment_id) or []
    return lst if isinstance(lst, list) else []


def build_custody_handoff_txn_b64(
    handler_address: str,
    shipment_id: str,
    location: str,
    handler_name: str,
    prev_nft_id: int = 0,
    photo_hash: str = "",
) -> list[str]:
    """Unsigned ASA create for the handler wallet to sign (opens Pera)."""
    if not algo_encoding.is_valid_address(handler_address):
        raise ValueError("handler_address must be a valid Algorand address")
    arc69_note = json.dumps(
        {
            "standard": "arc69",
            "description": f"Navi-Trust Custody Handoff — {shipment_id}",
            "properties": {
                "shipment_id": shipment_id,
                "handler": handler_address,
                "handler_name": handler_name,
                "location": location,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "prev_custody_nft": prev_nft_id,
                "photo_hash": photo_hash or "",
                "type": "CUSTODY_HANDOFF",
            },
        }
    )
    sp = chain.algorand.client.algod.suggested_params()
    loc6 = (location or "LOC")[:6]
    aname = f"NAVI-{shipment_id}-{loc6}"[:32]
    note_b = arc69_note.encode("utf-8")[:1000]
    url = f"https://navitrustapp.vercel.app/custody/{shipment_id}"[:96]
    txn = txn_mod.AssetConfigTxn(
        sender=handler_address,
        sp=sp,
        index=0,
        total=1,
        decimals=0,
        default_frozen=False,
        unit_name="NCUST",
        asset_name=aname,
        manager=handler_address,
        reserve=handler_address,
        freeze=handler_address,
        clawback=handler_address,
        url=url,
        note=note_b,
        strict_empty_address_check=False,
    )
    return [base64.b64encode(algo_encoding.msgpack_encode(txn)).decode("ascii")]


def record_custody_handoff_from_indexer(tx_id: str, shipment_id: str) -> dict:
    """After user submits mint tx, persist custody entry from indexer (no oracle key)."""
    url = f"{chain.INDEXER_URL}/v2/transactions"
    r = requests.get(url, params={"txid": tx_id}, timeout=20)
    r.raise_for_status()
    txs = r.json().get("transactions") or []
    if not txs:
        return {"error": "Transaction not found on indexer yet — wait a few seconds and retry."}
    tx = txs[0]
    if tx.get("tx-type") != "acfg":
        return {"error": "Transaction is not an asset configuration (custody mint) tx."}
    asa_id = tx.get("created-asset-index") or tx.get("asset-config-transaction", {}).get("asset-id")
    if asa_id is None:
        return {"error": "Could not read created ASA id from transaction."}
    asa_id = int(asa_id)
    sender = tx.get("sender") or ""
    entry = {
        "asa_id": asa_id,
        "tx_id": tx_id,
        "handler": sender,
        "handler_name": "",
        "location": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "prev_nft_id": 0,
        "lora_asset_url": f"https://lora.algokit.io/testnet/asset/{asa_id}",
        "lora_tx_url": f"https://lora.algokit.io/testnet/transaction/{tx_id}",
        "wallet_signed": True,
    }
    data = load_json(CUSTODY_FILE, {})
    if not isinstance(data, dict):
        data = {}
    chain_list = data.get(shipment_id) or []
    if not isinstance(chain_list, list):
        chain_list = []
    if any(isinstance(x, dict) and x.get("tx_id") == tx_id for x in chain_list):
        return {"asa_id": asa_id, "tx_id": tx_id, "message": "Already recorded", "duplicate": True}
    chain_list.append(entry)
    data[shipment_id] = chain_list
    save_json(CUSTODY_FILE, data)
    return {
        "asa_id": asa_id,
        "tx_id": tx_id,
        "lora_asset_url": entry["lora_asset_url"],
        "lora_tx_url": entry["lora_tx_url"],
        "message": "Custody handoff recorded",
    }
