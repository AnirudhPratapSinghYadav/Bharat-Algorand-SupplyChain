"""
Idempotent Navi-Trust testnet demo seed: 3 judge-story shipments on-chain + SQLite + audit trail.

Run:  python seed_blockchain.py

Requires .env: ORACLE_MNEMONIC (or DEPLOYER_MNEMONIC), APP_ID, NaviTrust deployed.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
from datetime import datetime, timezone

import requests
from algokit_utils import AlgorandClient, AlgoAmount, PaymentParams
from algosdk.logic import get_application_address
from dotenv import load_dotenv

import algorand_client as chain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT = os.path.dirname(os.path.abspath(__file__)) or "."
DB_PATH = os.path.join(ROOT, "shipments.db")
AUDIT_PATH = os.path.join(ROOT, "audit_trail.json")

LORA_TX = "https://lora.algokit.io/testnet/transaction"
LORA_APP = "https://lora.algokit.io/testnet/application"
LORA_ASSET = "https://lora.algokit.io/testnet/asset"

VERDICT_CHEN = (
    '{"verdict":"DISPUTE","score":87,"reasoning":"Active storm system over Arabian Sea '
    'with 12mm precipitation and 78km/h winds at destination port. Weather risk exceeds '
    'safe threshold for cargo delivery confirmation.","sentry_flag":true,"auditor_passed":false}'
)

VERDICT_DELHI = (
    '{"verdict":"SETTLE","score":18,"reasoning":"Clear weather at Singapore port, 0mm precipitation, '
    '12km/h winds. Compliance check passed. Safe to release escrow to supplier.",'
    '"sentry_flag":false,"auditor_passed":true}'
)

DEMO_ROWS = [
    {
        "id": "SHIP_MUMBAI_001",
        "origin": "Mumbai",
        "destination": "Dubai",
        "lat": 19.076,
        "lon": 72.877,
        "dlat": 25.276,
        "dlon": 55.296,
        "route": "Mumbai,India|Dubai,UAE",
        "fund_micro": 2_000_000,
        "verdict_json": None,
        "risk": None,
        "settle": False,
    },
    {
        "id": "SHIP_CHEN_002",
        "origin": "Chennai",
        "destination": "Rotterdam",
        "lat": 13.082,
        "lon": 80.270,
        "dlat": 51.924,
        "dlon": 4.477,
        "route": "Chennai,India|Rotterdam,Netherlands",
        "fund_micro": 3_000_000,
        "verdict_json": VERDICT_CHEN,
        "risk": 87,
        "settle": False,
    },
    {
        "id": "SHIP_DELHI_003",
        "origin": "Delhi",
        "destination": "Singapore",
        "lat": 28.614,
        "lon": 77.209,
        "dlat": 1.352,
        "dlon": 103.819,
        "route": "Delhi,India|Singapore,Singapore",
        "fund_micro": 2_000_000,
        "verdict_json": VERDICT_DELHI,
        "risk": 18,
        "settle": True,
    },
]


def _box_seeded(shipment_id: str) -> bool:
    st = chain.read_shipment_status(shipment_id)
    return st not in ("Unregistered", "Unknown")


def _fund_contract_mbr(algorand: AlgorandClient, deployer_addr: str, app_address: str) -> None:
    deployer_bal = float(algorand.account.get_information(deployer_addr).amount.algo)
    app_bal = float(algorand.account.get_information(app_address).amount.algo)
    logger.info("Deployer balance : %s ALGO", deployer_bal)
    logger.info("Contract balance : %s ALGO", app_bal)
    mbr_needed = max(0, 0.5 - app_bal)
    fund_amount = min(mbr_needed, deployer_bal - 0.15) if mbr_needed > 0 else 0
    if fund_amount > 0.01:
        logger.info("Funding contract with %.3f ALGO for box MBR...", fund_amount)
        try:
            algorand.send.payment(
                PaymentParams(
                    sender=deployer_addr,
                    receiver=app_address,
                    amount=AlgoAmount(micro_algo=int(fund_amount * 1_000_000)),
                )
            )
            logger.info("Funded successfully.")
        except Exception as e:
            logger.warning("Funding skipped: %s", e)
    else:
        logger.info("Contract already funded — skipping MBR payment.")


def _merge_audit(updates: dict[str, list]) -> None:
    data: dict = {}
    if os.path.isfile(AUDIT_PATH):
        try:
            with open(AUDIT_PATH, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    if not isinstance(data, dict):
        data = {}
    now = datetime.now(timezone.utc).isoformat()
    for sid, entries in updates.items():
        for e in entries:
            e = dict(e)
            e.setdefault("timestamp", now)
            data.setdefault(sid, [])
            data[sid].append(e)
    with open(AUDIT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    logger.info("Merged %s shipment key(s) into audit_trail.json", len(updates))


def _sqlite_upsert_demo_rows() -> None:
    if not os.path.isfile(DB_PATH):
        logger.warning("shipments.db not found — start the API once to create schema, then re-run seed")
        return
    conn = sqlite3.connect(DB_PATH)
    for r in DEMO_ROWS:
        conn.execute(
            """
            INSERT INTO shipments (id, origin, destination, current_lat, current_lon, status)
            VALUES (?, ?, ?, ?, ?, 'In_Transit')
            ON CONFLICT(id) DO UPDATE SET
                origin = excluded.origin,
                destination = excluded.destination,
                current_lat = excluded.current_lat,
                current_lon = excluded.current_lon
            """,
            (r["id"], r["origin"], r["destination"], r["lat"], r["lon"]),
        )
        conn.execute(
            "UPDATE shipments SET dest_lat = ?, dest_lon = ? WHERE id = ?",
            (r["dlat"], r["dlon"], r["id"]),
        )
    conn.commit()
    conn.close()
    logger.info("SQLite: upserted 3 demo shipment rows")


def _stats_check(app_id: int) -> None:
    bases = [
        os.environ.get("NAVITRUST_STATS_URL", "").strip(),
        "http://127.0.0.1:12445",
        "http://127.0.0.1:8000",
    ]
    for base in bases:
        if not base:
            continue
        base = base.rstrip("/")
        try:
            stats = requests.get(f"{base}/stats", timeout=5).json()
            logger.info("Stats from API (%s): %s", base, stats)
            ts = int(stats.get("total_shipments") or 0)
            if ts >= 3:
                logger.info("Stats OK: total_shipments=%s", ts)
            else:
                logger.warning(
                    "Stats total_shipments=%s (expected >= 3 after seed). Is the API using the same APP_ID=%s?",
                    ts,
                    app_id,
                )
            return
        except Exception as e:
            logger.debug("stats check %s: %s", base, e)
    logger.warning("Could not GET /stats from NAVITRUST_STATS_URL, :12445, or :8000 — skip assert")


def main() -> None:
    load_dotenv()
    mnemonic = os.getenv("ORACLE_MNEMONIC") or os.getenv("DEPLOYER_MNEMONIC")
    app_id = int(os.getenv("APP_ID", "0") or os.getenv("VITE_APP_ID", "0"))

    if not mnemonic or not app_id:
        logger.error("Set ORACLE_MNEMONIC or DEPLOYER_MNEMONIC and APP_ID in .env")
        sys.exit(1)

    if not chain.use_navitrust():
        logger.error("NaviTrust ARC56 not found — this seed requires NaviTrust.")
        sys.exit(1)

    algorand = AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=mnemonic)
    oracle_addr = deployer.address
    app_address = get_application_address(app_id)

    logger.info("Oracle : %s", oracle_addr)
    logger.info("APP_ID : %s", app_id)
    logger.info("Lora app: %s/%s", LORA_APP, app_id)

    _fund_contract_mbr(algorand, oracle_addr, app_address)

    summary: dict[str, dict] = {}
    audit_merge: dict[str, list] = {}

    for spec in DEMO_ROWS:
        sid = spec["id"]
        if _box_seeded(sid):
            logger.info("%s already seeded on-chain — skipping chain steps", sid)
            summary[sid] = {"skipped": True}
            continue

        route = spec["route"]
        logger.info("=== Register %s ===", sid)
        reg = chain.register_navitrust(sid, oracle_addr, route)
        reg_tx = reg.get("tx_id")
        summary[sid] = {"register_tx": reg_tx, "fund_tx": None, "verdict_tx": None, "settle_tx": None, "cert_asa": None}

        logger.info("=== Fund %s (%s microAlgo) ===", sid, spec["fund_micro"])
        fund = chain.fund_shipment_oracle_microalgo(sid, spec["fund_micro"])
        if not fund:
            logger.error("Fund failed for %s", sid)
            sys.exit(1)
        summary[sid]["fund_tx"] = fund.get("tx_id")

        if spec["verdict_json"] and spec["risk"] is not None:
            logger.info("=== record_verdict %s ===", sid)
            rv = chain.record_verdict_chain(sid, spec["verdict_json"], int(spec["risk"]))
            if not rv:
                logger.error("record_verdict failed for %s", sid)
                sys.exit(1)
            summary[sid]["verdict_tx"] = rv.get("tx_id")
            vnote = json.loads(spec["verdict_json"])
            audit_merge[sid] = [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "sentinel_score": int(spec["risk"]),
                    "verdict": str(vnote.get("verdict", "UNKNOWN")).upper(),
                    "reasoning_narrative": str(vnote.get("reasoning", ""))[:800],
                    "summary": str(vnote.get("reasoning", ""))[:200],
                    "tx_id": rv.get("tx_id"),
                }
            ]

        if spec["settle"]:
            logger.info("=== settle_shipment %s ===", sid)
            st = chain.settle_shipment_chain(sid)
            if not st:
                logger.error("settle_shipment failed for %s", sid)
                sys.exit(1)
            summary[sid]["settle_tx"] = st.get("tx_id")
            summary[sid]["cert_asa"] = st.get("certificate_asa_id")
            audit_merge.setdefault(sid, []).append(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "sentinel_score": int(spec["risk"] or 0),
                    "verdict": "SETTLE",
                    "reasoning_narrative": "Shipment settled on-chain; escrow released to supplier.",
                    "summary": "Settled",
                    "tx_id": st.get("tx_id"),
                }
            )

    if audit_merge:
        _merge_audit(audit_merge)

    _sqlite_upsert_demo_rows()

    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(" SEED COMPLETE — Navi-Trust Testnet")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f" App: {LORA_APP}/{app_id}")
    print()

    def _line(label: str, tid: str | None) -> str:
        if not tid:
            return f"    {label}: (n/a)"
        return f"    {label}: {LORA_TX}/{tid}"

    mumbai = summary.get("SHIP_MUMBAI_001", {})
    chen = summary.get("SHIP_CHEN_002", {})
    delhi = summary.get("SHIP_DELHI_003", {})

    if not mumbai.get("skipped"):
        print("  SHIP_MUMBAI_001  In_Transit  2 ALGO locked")
        print(_line("Register", mumbai.get("register_tx")))
        print(_line("Fund", mumbai.get("fund_tx")))
    else:
        print("  SHIP_MUMBAI_001  (already on-chain)")

    print()
    if not chen.get("skipped"):
        print("  SHIP_CHEN_002    Disputed    3 ALGO locked")
        print(_line("Register", chen.get("register_tx")))
        print(_line("Fund", chen.get("fund_tx")))
        print(_line("Verdict", chen.get("verdict_tx")))
    else:
        print("  SHIP_CHEN_002    (already on-chain)")

    print()
    cert = delhi.get("cert_asa")
    if not delhi.get("skipped"):
        print(f"  SHIP_DELHI_003   Settled     Certificate return value: {cert}")
        print(_line("Register", delhi.get("register_tx")))
        print(_line("Fund", delhi.get("fund_tx")))
        print(_line("Verdict", delhi.get("verdict_tx")))
        print(_line("Settle", delhi.get("settle_tx")))
        if cert and int(cert) > 0:
            print(f"    Cert:   {LORA_ASSET}/{cert}")
    else:
        print("  SHIP_DELHI_003   (already on-chain)")

    print(" ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    _stats_check(app_id)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        logger.info("--reset ignored for idempotent seed (boxes cannot be deleted here).")
    main()
