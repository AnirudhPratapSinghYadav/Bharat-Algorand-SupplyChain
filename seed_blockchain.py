"""
Idempotent Pramanik testnet demo seed: 3 judge-story shipments on-chain + SQLite + audit trail.

Run:  python seed_blockchain.py

Requires .env: ORACLE_MNEMONIC (or DEPLOYER_MNEMONIC), APP_ID, NaviTrust deployed.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests
from algokit_utils import AlgorandClient, AlgoAmount, PaymentParams
from algosdk.logic import get_application_address
from dotenv import load_dotenv

# Repo root — must be set before load_dotenv / import chain (cwd may not be the repo).
ROOT = os.path.dirname(os.path.abspath(__file__)) or "."

# Load .env before algorand_client — that module reads ORACLE_MNEMONIC / APP_ID at import time.
load_dotenv(os.path.join(ROOT, ".env"))

import algorand_client as chain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
DB_PATH = os.path.join(ROOT, "shipments.db")
AUDIT_PATH = os.path.join(ROOT, "audit_trail.json")

LORA_TX = "https://lora.algokit.io/testnet/transaction"
LORA_APP = "https://lora.algokit.io/testnet/application"
LORA_ACCOUNT = "https://lora.algokit.io/testnet/account"
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


def _maybe_retry_settle_pending(sid: str, spec: dict, summary: dict[str, dict]) -> None:
    """
    If a prior run registered + funded + verdict but settle failed (e.g. box-ref bug),
    retry settle when still In_Transit with escrow. Skips Disputed rows.
    """
    if not spec.get("settle"):
        return
    status = chain.read_shipment_status(sid)
    full = chain.read_shipment_full(sid)
    funds = int(full.get("funds_microalgo") or 0)
    logger.info(
        "settle-retry probe: %s chain_status=%s funds_microalgo=%s",
        sid,
        status,
        funds,
    )
    if status in ("Unregistered", "Unknown", "Settled"):
        logger.info("  -> no settle retry (already terminal: %s)", status)
        return
    if status == "Disputed":
        logger.info("  -> no settle retry (Disputed — settle not attempted)")
        return
    if funds < 100_000:
        logger.warning(
            "  -> no settle retry (escrow %s < 100000 microAlgo — fund or inspect fn_ box)",
            funds,
        )
        return
    logger.info(
        "=== Retry settle_shipment %s (status=%s, escrow=%s microAlgo) ===",
        sid,
        status,
        funds,
    )
    res = chain.settle_shipment_chain(sid)
    if not res:
        logger.warning("settle_shipment retry failed for %s", sid)
        return
    cid_raw = res.get("certificate_asa_id")
    try:
        cid = int(cid_raw) if cid_raw is not None else 0
    except (TypeError, ValueError):
        cid = 0
    if cid <= 1:
        logger.error("settle retry: invalid certificate ASA id %r", cid_raw)
        sys.exit(1)
    stx = res.get("tx_id")
    if stx and not _verify_settle_inner_txns(stx):
        logger.error("settle retry: indexer missing inner pay+acfg on %s", stx)
        sys.exit(1)
    summary.setdefault(sid, {})
    summary[sid]["skipped"] = True
    summary[sid]["settle_tx"] = stx
    summary[sid]["cert_asa"] = cid_raw
    summary[sid]["recovered_settle"] = True
    _merge_audit(
        {
            sid: [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "sentinel_score": int(spec.get("risk") or 0),
                    "verdict": "SETTLE",
                    "reasoning_narrative": "Shipment settled on-chain (retry after prior failure).",
                    "summary": "Settled",
                    "tx_id": res.get("tx_id"),
                }
            ]
        }
    )


def _fund_contract_mbr(algorand: AlgorandClient, deployer_addr: str, app_address: str) -> None:
    """If app account balance < 2M microAlgo, top up with 2 ALGO (box MBR headroom)."""
    deployer_bal = float(algorand.account.get_information(deployer_addr).amount.algo)
    info = algorand.client.algod.account_info(app_address)
    micro = int(info.get("amount", 0))
    app_bal = micro / 1_000_000.0
    logger.info("Deployer balance : %s ALGO", deployer_bal)
    logger.info("Contract balance : %s ALGO (%s microAlgo)", app_bal, micro)
    # Boxes cost ~base_mbr + per_box; 2 ALGO top-up when below 2M µAlgo keeps register/settle safe.
    if micro < 2_000_000:
        logger.info("Funding contract with 2 ALGO (balance < 2M microAlgo)...")
        try:
            algorand.send.payment(
                PaymentParams(
                    sender=deployer_addr,
                    receiver=app_address,
                    amount=AlgoAmount(micro_algo=2_000_000),
                )
            )
            logger.info("MBR top-up sent.")
        except Exception as e:
            logger.warning("MBR top-up skipped: %s", e)
    else:
        logger.info("Contract balance ≥ 2M microAlgo — skipping MBR payment.")


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


def _sqlite_upsert_demo_rows(oracle_addr: str) -> None:
    if not os.path.isfile(DB_PATH):
        logger.warning("shipments.db not found — start the API once to create schema, then re-run seed")
        return
    created = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(DB_PATH)
    for r in DEMO_ROWS:
        conn.execute(
            """
            INSERT INTO shipments (
                id, origin, destination, current_lat, current_lon, status,
                dest_lat, dest_lon, supplier_address, created_at
            )
            VALUES (?, ?, ?, ?, ?, 'In_Transit', ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                origin = excluded.origin,
                destination = excluded.destination,
                current_lat = excluded.current_lat,
                current_lon = excluded.current_lon,
                dest_lat = excluded.dest_lat,
                dest_lon = excluded.dest_lon,
                supplier_address = COALESCE(excluded.supplier_address, supplier_address),
                created_at = COALESCE(shipments.created_at, excluded.created_at)
            """,
            (
                r["id"],
                r["origin"],
                r["destination"],
                r["lat"],
                r["lon"],
                r["dlat"],
                r["dlon"],
                oracle_addr,
                created,
            ),
        )
    conn.commit()
    conn.close()
    logger.info("SQLite: upserted 3 demo shipment rows (supplier_address + created_at)")


def _stats_check(app_id: int) -> None:
    env_url = os.environ.get("NAVITRUST_STATS_URL", "").strip()
    bases = [env_url, "http://127.0.0.1:8000", "http://127.0.0.1:12445"]
    seen: set[str] = set()
    for raw in bases:
        if not raw:
            continue
        base = raw.rstrip("/")
        if base in seen:
            continue
        seen.add(base)
        try:
            stats = requests.get(f"{base}/stats", timeout=5).json()
            logger.info("Stats from API (%s): %s", base, stats)
            ts = int(stats.get("total_shipments") or 0)
            settled = int(stats.get("total_settled") or 0)
            disputed = int(stats.get("total_disputed") or 0)
            if ts == 3 and settled == 1 and disputed == 1:
                logger.info("Stats OK: total_shipments=3, total_settled=1, total_disputed=1")
            else:
                logger.warning(
                    "Stats mismatch (want total_shipments=3, total_settled=1, total_disputed=1): got ts=%s settled=%s disputed=%s. Same APP_ID=%s?",
                    ts,
                    settled,
                    disputed,
                    app_id,
                )
            return
        except Exception as e:
            logger.debug("stats check %s: %s", base, e)
    logger.warning("Could not GET /stats — start API on :8000 with matching APP_ID or set NAVITRUST_STATS_URL")


def _verify_settle_inner_txns(settle_tx_id: str) -> bool:
    """Indexer check: settle group should include inner pay + asset config (PRAMANIK-CERT)."""
    if not settle_tx_id or not chain.INDEXER_URL:
        return False
    url = f"{chain.INDEXER_URL.rstrip('/')}/v2/transactions/{settle_tx_id.strip()}"
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            tx = r.json().get("transaction") or {}
            inner = tx.get("inner-txns") or []
            has_pay = any(x.get("tx-type") == "pay" for x in inner)
            has_acfg = any(x.get("tx-type") == "acfg" for x in inner)
            if has_pay and has_acfg:
                return True
        except Exception as e:
            logger.debug("settle inner verify attempt %s: %s", attempt, e)
        if attempt < 3:
            time.sleep(2.0)
    return False


def _write_lora_proof(app_id: int, app_address: str, summary: dict[str, dict]) -> None:
    """Write LORA_PROOF.md with tx links from this seed run (Lora URLs)."""
    path = os.path.join(ROOT, "LORA_PROOF.md")

    def tx_line(tid: str | None) -> str:
        return f"`{LORA_TX}/{tid}`" if tid else "`(n/a)`"

    m = summary.get("SHIP_MUMBAI_001", {})
    c = summary.get("SHIP_CHEN_002", {})
    d = summary.get("SHIP_DELHI_003", {})

    cert = d.get("cert_asa")
    cert_line = f"`{LORA_ASSET}/{cert}`" if cert and int(cert) > 0 else "`(n/a)`"

    body = f"""# Pramanik — on-chain proof (Lora)

Generated by `python seed_blockchain.py`. Open each link in [Lora](https://lora.algokit.io/testnet).

## Application

- **App:** `{LORA_APP}/{app_id}`
- **Contract account (escrow):** `{LORA_ACCOUNT}/{app_address}`

---

## SHIP_MUMBAI_001 — in transit, 2 ALGO locked

| Step     | Lora link |
|----------|-----------|
| Register | {tx_line(m.get("register_tx"))} |
| Fund     | {tx_line(m.get("fund_tx"))} |

---

## SHIP_CHEN_002 — disputed, 3 ALGO locked, risk 87

| Step     | Lora link |
|----------|-----------|
| Register | {tx_line(c.get("register_tx"))} |
| Fund     | {tx_line(c.get("fund_tx"))} |
| Verdict  | {tx_line(c.get("verdict_tx"))} |

---

## SHIP_DELHI_003 — settled, certificate minted

| Step        | Lora link |
|-------------|-----------|
| Register    | {tx_line(d.get("register_tx"))} |
| Fund        | {tx_line(d.get("fund_tx"))} |
| Verdict     | {tx_line(d.get("verdict_tx"))} |
| Settle      | {tx_line(d.get("settle_tx"))} |
| Cert (ASA)  | {cert_line} |

**Check:** open the settle transaction → **Inner transactions** → (1) payment to supplier, (2) asset config creating **PRAMANIK-CERT** / **PCERT**.

---

## Quick verification

```bash
curl -s http://127.0.0.1:8000/stats
# Expect total_shipments=3, total_settled=1, total_disputed=1
```
"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    logger.info("Wrote %s", path)


def main() -> None:
    load_dotenv(os.path.join(ROOT, ".env"))
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

    oracle_micro = int(algorand.client.algod.account_info(oracle_addr).get("amount", 0))
    # ~7 ALGO covers MBR top-up + fees for the 3-lane demo after prior attempts (override via SEED_MIN_ORACLE_MICRO).
    min_oracle_micro = int(os.getenv("SEED_MIN_ORACLE_MICRO", "7000000"))
    if oracle_micro < min_oracle_micro:
        logger.error(
            "Oracle balance is %s microAlgo — need at least %s microAlgo (~%.1f ALGO) before seeding. "
            "Fund the oracle on testnet or set SEED_MIN_ORACLE_MICRO lower for dev only.",
            oracle_micro,
            min_oracle_micro,
            min_oracle_micro / 1_000_000.0,
        )
        sys.exit(1)

    _fund_contract_mbr(algorand, oracle_addr, app_address)

    summary: dict[str, dict] = {}
    audit_merge: dict[str, list] = {}

    for spec in DEMO_ROWS:
        sid = spec["id"]
        if _box_seeded(sid):
            logger.info("%s already seeded on-chain — skipping register/fund/verdict", sid)
            summary[sid] = {"skipped": True}
            _maybe_retry_settle_pending(sid, spec, summary)
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
            cert_id = st.get("certificate_asa_id")
            summary[sid]["cert_asa"] = cert_id
            try:
                cid = int(cert_id) if cert_id is not None else 0
            except (TypeError, ValueError):
                cid = 0
            if cid <= 1:
                logger.error(
                    "settle_shipment returned invalid certificate ASA id %r (expected > 1). Inspect contract/client.",
                    cert_id,
                )
                sys.exit(1)
            settle_txid = st.get("tx_id")
            if settle_txid and not _verify_settle_inner_txns(settle_txid):
                logger.error(
                    "Indexer did not show inner pay + acfg on settle tx %s — check Lora or INDEXER_URL.",
                    settle_txid,
                )
                sys.exit(1)
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

    _sqlite_upsert_demo_rows(oracle_addr)

    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(" SEED COMPLETE — Pramanik Testnet")
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
    elif delhi.get("settle_tx"):
        cert = delhi.get("cert_asa")
        print("  SHIP_DELHI_003   Settled     (recovered settle from prior failed run)")
        print(_line("Settle", delhi.get("settle_tx")))
        if cert and int(cert) > 0:
            print(f"    Cert:   {LORA_ASSET}/{cert}")
    else:
        print("  SHIP_DELHI_003   (already on-chain)")

    print(" ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    _write_lora_proof(app_id, app_address, summary)
    _stats_check(app_id)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        logger.info("--reset ignored for idempotent seed (boxes cannot be deleted here).")
    main()
