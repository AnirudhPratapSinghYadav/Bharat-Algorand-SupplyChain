from dotenv import load_dotenv

# Shell-exported vars (e.g. ORACLE_MNEMONIC in the same session) must win over .env
# placeholders — use default override=False. See .env.example for PowerShell one-liners.
load_dotenv()

import os
import json
import time
import base64
import random
import re
import sqlite3
import logging
import asyncio
from contextlib import asynccontextmanager, contextmanager
import hashlib
from datetime import datetime, timezone
from typing import Optional, List

import requests
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from google import genai
from google.genai import types as genai_types
from algokit_utils import AlgorandClient
from algosdk.logic import get_application_address

import algorand_client as chain
from models import (
    WeatherData,
    RiskPrediction,
    BlockchainState,
    RunJuryRequest,
    SettleBody,
    SimulateEventBody,
    NavibotRequest,
    FundShipmentBuildBody,
    RegisterShipmentBody,
)


def _load_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _fraud_report_stub(_shipment_data: dict, _history: list[dict]) -> dict:
    """Fraud heuristics module removed; registration proceeds without blocking."""
    return {"fraud_probability": 0.0, "verdict": "OK", "blocked": False}

APP_ID = chain.APP_ID
algorand = chain.algorand
INDEXER_URL = chain.INDEXER_URL
LORA_TESTNET_TX = chain.LORA_TESTNET_TX
LORA_TESTNET_APP = chain.LORA_TESTNET_APP

_CORS_EXTRA = os.environ.get("CORS_EXTRA_ORIGINS", "")
_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://navitrustapp.vercel.app",
]
if _CORS_EXTRA:
    _CORS_ORIGINS.extend(o.strip() for o in _CORS_EXTRA.split(",") if o.strip())


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _maybe_seed_demo_shipments()
    try:
        chain.verify_oracle_setup()
    except RuntimeError as e:
        # In hosted/serverless environments we may intentionally run read-only
        # endpoints without an oracle mnemonic configured.
        # Set SKIP_ORACLE_VERIFY=1 (preferred) or rely on Vercel env detection.
        if os.environ.get("SKIP_ORACLE_VERIFY", "").strip().lower() in ("1", "true", "yes") or os.environ.get(
            "VERCEL", ""
        ).strip():
            logger.warning("Oracle verify skipped at startup: %s", e)
        else:
            logger.error("%s", e)
            raise
    load_logistics_events()
    load_verdict_history()
    for _ in range(6):
        generate_random_logistics_event()
    bg_task = asyncio.create_task(_live_feed_background_task())
    try:
        yield
    finally:
        bg_task.cancel()
        for t in (bg_task,):
            try:
                await t
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Navi-Trust Oracle API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def _navibot_friendly_validation(request: Request, exc: RequestValidationError):
    """Avoid broken clients on /navibot: return soft JSON instead of 422 when body is malformed."""
    if request.url.path.rstrip("/").endswith("navibot"):
        return JSONResponse(
            status_code=200,
            content={
                "text": 'Send JSON: {"message": "your question"}',
                "reply": 'Send JSON: {"message": "your question"}',
                "action": None,
                "audio_url": None,
                "fallback": True,
            },
        )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Current Generative Language API: prefer 2.x/2.5 flash; bare gemini-1.5-flash often 404s on v1beta.
GEMINI_FLASH_MODELS: tuple[str, ...] = tuple(
    m.strip()
    for m in os.environ.get(
        "GEMINI_MODEL_CHAIN",
        "gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash-8b,gemini-1.5-flash",
    ).split(",")
    if m.strip()
)


def _genai_generate_text_first_ok(contents: str) -> str:
    """Try GEMINI_FLASH_MODELS in order; return first non-empty text or empty string."""
    if not GEMINI_API_KEY:
        return ""
    client = genai.Client(api_key=GEMINI_API_KEY)
    for model in GEMINI_FLASH_MODELS:
        try:
            resp = client.models.generate_content(model=model, contents=contents)
            t = (getattr(resp, "text", None) or "").strip()
            if t:
                return t
        except Exception as e:
            logger.warning("gemini model=%s: %s", model, e)
    return ""

_NAVIBOT_HITS: dict[str, list[float]] = {}


def _navibot_rate_ok(client_key: str) -> bool:
    now = time.time()
    window = 60.0
    cap = int(os.environ.get("NAVIBOT_RL_PER_MIN", "24"))
    hits = _NAVIBOT_HITS.setdefault(client_key, [])
    hits[:] = [t for t in hits if now - t < window]
    if len(hits) >= cap:
        return False
    hits.append(now)
    return True
ALGO_NETWORK = os.environ.get("ALGO_NETWORK", "testnet")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Ledger status values from smart contract (NaviTrust box storage)
# — Single source of truth; never hardcode these in business logic.
STATUS_IN_TRANSIT = "In_Transit"
STATUS_FLAGGED = "Delayed_Disaster"
STATUS_DISPUTED = chain.STATUS_DISPUTED


def _status_is_flagged(s: str) -> bool:
    return s in (STATUS_FLAGGED, STATUS_DISPUTED)


def _db_flagged_status() -> str:
    return STATUS_DISPUTED if chain.use_navitrust() else STATUS_FLAGGED


def _status_db_matches_chain(db_s: str, chain_s: str) -> bool:
    if db_s == chain_s:
        return True
    return _status_is_flagged(db_s) and _status_is_flagged(chain_s)
RISK_THRESHOLD_AUTHORIZE = 80

print(f"[BOOT] GEMINI_API_KEY loaded: {'YES' if GEMINI_API_KEY else 'NO'}")
print(f"[BOOT] OPENAI_API_KEY loaded: {'YES (fallback ready)' if OPENAI_API_KEY else 'NO (deterministic fallback only)'}")
print(f"[BOOT] APP_ID={APP_ID} | NETWORK={ALGO_NETWORK}")

# ═══════════════════════════════════════════════════════════════════
#   S Q L i t e   D A T A B A S E
# ═══════════════════════════════════════════════════════════════════

DB_PATH = os.path.join(os.path.dirname(__file__) or ".", "shipments.db")

# Bootstrap metadata (origin, dest, coords) — ledger is source of truth for status
# Bootstrap metadata (origin, dest, coords) — ledger is source of truth for status
# SEED_SHIPMENTS REMOVED - Fetching from live sources only.


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS shipments (
                id          TEXT PRIMARY KEY,
                origin      TEXT NOT NULL,
                destination TEXT NOT NULL,
                current_lat REAL NOT NULL,
                current_lon REAL NOT NULL,
                status      TEXT NOT NULL DEFAULT '{STATUS_IN_TRANSIT}'
            )
            """
        )
        # No auto-seeding of static shipments.
        logger.info("SQLite initialized (Ready for dynamic shipment ingestion)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS supplier_trust (
                wallet TEXT PRIMARY KEY,
                score INTEGER NOT NULL DEFAULT 100,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS supplier_mitigations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet TEXT NOT NULL,
                shipment_id TEXT NOT NULL,
                resolution_text TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()

    with get_db() as conn:
        for ddl in (
            "ALTER TABLE shipments ADD COLUMN dest_lat REAL",
            "ALTER TABLE shipments ADD COLUMN dest_lon REAL",
            "ALTER TABLE shipments ADD COLUMN supplier_address TEXT",
            "ALTER TABLE shipments ADD COLUMN created_at TEXT",
        ):
            try:
                conn.execute(ddl)
            except sqlite3.OperationalError:
                pass
        conn.commit()


def _maybe_seed_demo_shipments() -> None:
    """
    Optional demo-only seed. Production must not rely on hardcoded rows.
    Use `python seed_blockchain.py` for canonical end-to-end seed instead.
    """
    if os.environ.get("DEMO_SEED_ON_START", "").strip().lower() not in ("1", "true", "yes"):
        return
    with get_db() as conn:
        for sid, orig, dest, lat, lon, dlat, dlon in [
            ("SHIP_MUMBAI_001", "Mumbai", "Dubai", 19.07, 72.87, 25.276, 55.296),
            ("SHIP_CHEN_002", "Chennai", "Rotterdam", 13.08, 80.27, 51.924, 4.477),
            ("SHIP_DELHI_003", "Delhi", "Singapore", 28.61, 77.21, 1.352, 103.819),
        ]:
            conn.execute(
                "INSERT OR IGNORE INTO shipments (id, origin, destination, current_lat, current_lon, status) VALUES (?, ?, ?, ?, ?, ?)",
                (sid, orig, dest, lat, lon, STATUS_IN_TRANSIT),
            )
            conn.execute(
                "UPDATE shipments SET dest_lat = ?, dest_lon = ? WHERE id = ?",
                (dlat, dlon, sid),
            )
        conn.commit()
    logger.warning("DEMO_SEED_ON_START enabled — inserted demo shipments into SQLite")

# ─── Off-chain Logistics Events ───────────────────────────────────
LOGISTICS_EVENTS: List[dict] = []


def load_logistics_events():
    global LOGISTICS_EVENTS
    try:
        with open("offchain_events.json", "r") as f:
            LOGISTICS_EVENTS = json.load(f)
        logger.info(f"Loaded {len(LOGISTICS_EVENTS)} off-chain logistics events")
    except FileNotFoundError:
        LOGISTICS_EVENTS = []
        logger.warning("offchain_events.json not found — starting empty")


def save_logistics_events():
    with open("offchain_events.json", "w") as f:
        json.dump(LOGISTICS_EVENTS, f, indent=2)


# ─── Dynamic Global Event Engine ───────────────────────────────────
DYNAMIC_DISRUPTIONS = [
    {"event": "Port Strike in Oakland: Union disputes halt loading", "tier": "critical", "category": "Labor"},
    {"event": "Suez Canal Congestion: Vessel grounding reported", "tier": "high", "category": "Geopolitical"},
    {"event": "Customs Delay at Rotterdam: New software glitch", "tier": "medium", "category": "Logistics"},
    {"event": "Tropical Cyclone heading for Florida ports", "tier": "critical", "category": "Weather"},
    {"event": "Border Closure: New trade sanctions implemented", "tier": "high", "category": "Geopolitical"},
    {"event": "GPS Satellite Interference: Signal degradation in Pacific", "tier": "medium", "category": "Telemetry"},
    {"event": "Cold Chain Breach: Power failure in reefer unit", "tier": "high", "category": "Technical"},
    {"event": "Highway Closure: Landslide blocking main freight artery", "tier": "medium", "category": "Infrastructure"},
]
LIVE_FEED: List[dict] = []
LIVE_FEED_MAX = 12
RSS_CACHE: List[dict] = []
RSS_CACHE_TS = 0.0
RSS_CACHE_TTL = 120


def _tier_from_headline(text: str) -> str:
    """Map RSS headline keywords to risk tier for Sentry context."""
    t = (text or "").lower()
    if any(k in t for k in ["strike", "bankruptcy", "disaster", "suspended", "closure"]):
        return "critical"
    if any(k in t for k in ["piracy", "congestion", "delay", "alert", "storm", "canal"]):
        return "high"
    if any(k in t for k in ["fuel", "surge", "labor", "shortage"]):
        return "medium"
    return "low"


def _fetch_rss_logistics_news() -> List[dict]:
    """Scrape live RSS feed for logistics news. Returns list of {event, tier, ts}. Empty on failure."""
    global RSS_CACHE, RSS_CACHE_TS
    now = time.time()
    if RSS_CACHE and now - RSS_CACHE_TS < RSS_CACHE_TTL:
        return list(RSS_CACHE)
    try:
        import xml.etree.ElementTree as ET
        resp = requests.get(
            RSS_LOGISTICS_URL,
            headers={"User-Agent": "Navi-Trust/1.0 (Logistics Monitor)"},
            timeout=8,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        items = list(root.iter("item")) or list(root.iter("{http://www.w3.org/2005/Atom}entry"))
        events = []
        for item in items[:8]:
            title = (item.find("title") or item.find("{http://www.w3.org/2005/Atom}title"))
            if title is not None and title.text:
                tier = _tier_from_headline(title.text)
                events.append({
                    "event": title.text.strip()[:120],
                    "tier": tier,
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "source": "rss",
                })
        if events:
            RSS_CACHE = events
            RSS_CACHE_TS = now
            logger.info(f"RSS: fetched {len(events)} logistics headlines")
        return events
    except Exception as e:
        logger.debug(f"RSS fetch failed: {e}")
        return []


def generate_random_logistics_event() -> dict:
    """
    Dynamic generator for Global Event Engine.
    Simulates: Weather, Strikes, Sanctions, Telemetry anomalies.
    """
    disruption = random.choice(DYNAMIC_DISRUPTIONS)
    
    # Simulate Telemetry Stream (3-second cadence)
    telemetry = {
        "temp": round(random.uniform(-5, 45), 1),
        "humidity": random.randint(30, 95),
        "gps": f"{round(random.uniform(-90, 90), 4)}, {round(random.uniform(-180, 180), 4)}",
        "vibration": round(random.uniform(0.1, 5.0), 2)
    }

    entry = {
        **disruption,
        "telemetry": telemetry,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    LIVE_FEED.insert(0, entry)
    if len(LIVE_FEED) > LIVE_FEED_MAX:
        LIVE_FEED.pop()
    return entry


def get_live_logistics_context() -> tuple[str, str]:
    """
    Returns live event for Sentry risk scoring. RSS-primary; falls back to event pool.
    This specific news is passed as Context to the Logistics Sentry for risk_score calculation.
    """
    rss = _fetch_rss_logistics_news()
    if rss:
        entry = rss[0]
        LIVE_FEED.insert(0, entry)
        if len(LIVE_FEED) > LIVE_FEED_MAX:
            LIVE_FEED.pop()
        return entry["event"], entry["tier"]
    entry = generate_random_logistics_event()
    return entry["event"], entry["tier"]


def get_live_feed() -> List[dict]:
    """Return the current live feed for frontend ticker. Call periodically to grow the stream."""
    if not LIVE_FEED or random.random() < 0.4:
        generate_random_logistics_event()
    return list(LIVE_FEED)


async def _live_feed_background_task():
    """Inject new logistics events and telemetry every 3s."""
    while True:
        await asyncio.sleep(3)
        # Global Event Engine logic could go here
        generate_random_logistics_event()


REGISTER_LOG_PATH = "shipment_register_log.json"
FRAUD_SCORES_PATH = "fraud_scores.json"


def _register_history_for_fraud() -> list[dict]:
    log = _load_json(REGISTER_LOG_PATH, [])
    if not isinstance(log, list):
        return []
    now = datetime.now(timezone.utc)
    out: list[dict] = []
    for e in log:
        if not isinstance(e, dict):
            continue
        try:
            ts = datetime.fromisoformat(str(e.get("ts", "")).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            days_ago = (now - ts).total_seconds() / 86400.0
        except Exception:
            days_ago = 999.0
        out.append({**e, "days_ago": days_ago})
    return out


def _append_register_log(entry: dict) -> None:
    log = _load_json(REGISTER_LOG_PATH, [])
    if not isinstance(log, list):
        log = []
    log.append(entry)
    _save_json(REGISTER_LOG_PATH, log[-2000:])


def get_shipment_from_chain(shipment_id: str) -> dict:
    """API envelope: definitive box+SQLite read from algorand_client + full DB row."""
    oc = chain.get_shipment_from_chain(shipment_id) if APP_ID else {}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()
    rowd = dict(row) if row else {}
    cert = oc.get("certificate_asa") if isinstance(oc, dict) else None
    cid = int(cert) if cert else 0
    vj = oc.get("verdict_json") if isinstance(oc, dict) else None
    if vj is None and isinstance(oc, dict):
        vj = oc.get("verdict")
    return {
        "shipment_id": shipment_id,
        "origin": rowd.get("origin") or oc.get("origin") if isinstance(oc, dict) else "",
        "destination": rowd.get("destination") or (oc.get("destination") if isinstance(oc, dict) else ""),
        "status": oc.get("status") if isinstance(oc, dict) else "",
        "risk_score": int(oc.get("risk_score") or 0) if isinstance(oc, dict) else 0,
        "verdict_json": vj,
        "on_chain": oc,
        "database": rowd,
        "certificate_asa": int(cid) if cid else None,
        "certificate_asa_id": cid or None,
        "lora_cert_url": oc.get("lora_cert_url") if isinstance(oc, dict) and oc.get("lora_cert_url") else (
            f"https://lora.algokit.io/testnet/asset/{cid}" if cid else None
        ),
    }

def _generate_reasoning_hash(text: str) -> str:
    """SHA-256 hash of AI reasoning narrative for on-chain integrity."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


# ─── Runtime Stores ────────────────────────────────────────────────
AUDIT_TRAIL: dict[str, list] = {}
JURY_CACHE: dict[str, dict] = {}
WEATHER_CACHE: dict[str, tuple] = {}
WEATHER_CACHE_TTL = 300
VERDICT_HISTORY_PATH = os.path.join(os.path.dirname(__file__) or ".", "audit_trail.json")

# Phase 3: 15s in-memory API cache for /stats and /shipments
API_CACHE_TTL_SEC = 15.0
_STATS_CACHE: dict = {"ts": 0.0, "payload": None}
_SHIPMENTS_CACHE: dict = {"ts": 0.0, "payload": None}


def _time_ago_from_round_time(rt: Optional[int]) -> str:
    if rt is None:
        return "—"
    try:
        delta = int(time.time()) - int(rt)
        if delta < 60:
            return f"{delta}s ago"
        if delta < 3600:
            return f"{delta // 60}m ago"
        if delta < 86400:
            return f"{delta // 3600}h ago"
        return f"{delta // 86400}d ago"
    except Exception:
        return "—"


def _transactions_formatted(limit: int = 15) -> list[dict]:
    raw = chain.indexer_recent_app_txns(max(1, min(limit, 50)))
    out: list[dict] = []
    for t in raw:
        tx_id = t.get("tx_id") or ""
        sender = str(t.get("sender") or "")
        short = f"{sender[:6]}…{sender[-4:]}" if len(sender) > 52 else sender
        amt = int(t.get("amount") or 0)
        note = str(t.get("note") or "")
        note_preview = note[:120].replace("\n", " ")
        note_obj = None
        try:
            if note.startswith("{"):
                note_obj = json.loads(note)
        except Exception:
            note_obj = None
        rt = t.get("round-time")
        out.append(
            {
                "tx_id": tx_id,
                "action": t.get("action") or t.get("method_name") or t.get("type") or "",
                "sender_short": short,
                "amount_algo": round(amt / 1_000_000.0, 6),
                "time_ago": _time_ago_from_round_time(int(rt) if rt is not None else None),
                "note_preview": note_preview,
                "note_json": note_obj,
                "lora_url": t.get("lora_url") or (f"{LORA_TESTNET_TX}/{tx_id}" if tx_id else ""),
            }
        )
    return out


def load_verdict_history():
    global AUDIT_TRAIL
    try:
        with open(VERDICT_HISTORY_PATH, "r") as f:
            AUDIT_TRAIL = json.load(f)
        total = sum(len(v) for v in AUDIT_TRAIL.values())
        logger.info(f"Loaded {total} verdict(s) from audit_trail.json")
    except (FileNotFoundError, json.JSONDecodeError):
        AUDIT_TRAIL = {}
        logger.info("No verdict history found — starting fresh")


def save_verdict_history():
    with open(VERDICT_HISTORY_PATH, "w") as f:
        json.dump(AUDIT_TRAIL, f, indent=2)

DEPLOYER_MNEMONIC = chain.DEPLOYER_MNEMONIC or os.environ.get("DEPLOYER_MNEMONIC")
N8N_WEBHOOK_URL = os.environ.get("N8N_WEBHOOK_URL", "")

print(f"[BOOT] N8N_WEBHOOK_URL: {'YES' if N8N_WEBHOOK_URL else 'not set (webhook skip)'}")


def _fire_webhook(event: str, payload: dict):
    """Fire-and-forget webhook to n8n / external notification loop."""
    if not N8N_WEBHOOK_URL:
        return
    try:
        requests.post(
            N8N_WEBHOOK_URL,
            json={"event": event, **payload},
            timeout=3,
        )
        logger.info(f"Webhook fired: {event}")
    except Exception as e:
        logger.warning(f"Webhook failed: {e}")


RSS_LOGISTICS_URL = os.environ.get("RSS_LOGISTICS_URL", "https://shippingwatch.com/service/rss")


def _navi_verdict_note_bytes(
    shipment_id: str,
    prediction: "RiskPrediction",
    weather: "WeatherData",
    judgment: dict,
    row: dict,
) -> bytes:
    """Structured tx note for record_verdict (max 1000 bytes)."""
    rs = int(prediction.risk_score)
    if rs > 65:
        verdict = "DISPUTE"
    elif judgment.get("trigger_contract"):
        verdict = "SETTLE"
    else:
        verdict = "HOLD"
    reason_src = str(judgment.get("reasoning_narrative") or judgment.get("judgment") or "")[:180]
    city = str(row.get("origin") or row.get("destination") or "unknown")
    verdict_note = {
        "type": "NAVI_VERDICT",
        "v": "2",
        "app": APP_ID,
        "sid": shipment_id,
        "score": rs,
        "verdict": verdict,
        "reason": reason_src,
        "sentry": {
            "score": rs,
            "flag": bool(prediction.anomaly_detected),
        },
        "weather": {
            "city": city,
            "precip": round(float(weather.precipitation), 2),
            "wind": 0,
        },
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    note_bytes = json.dumps(verdict_note, separators=(",", ":")).encode("utf-8")
    if len(note_bytes) > 1000:
        verdict_note["reason"] = str(judgment.get("reasoning_narrative") or "")[:80]
        note_bytes = json.dumps(verdict_note, separators=(",", ":")).encode("utf-8")
    if len(note_bytes) > 1000:
        verdict_note.pop("reason", None)
        note_bytes = json.dumps(verdict_note, separators=(",", ":")).encode("utf-8")
    return note_bytes[:1000]


def _flag_shipment_on_chain(
    shipment_id: str,
    reasoning_hash: str,
    reasoning_narrative: str = "",
    risk_score: int = 88,
    *,
    navi_note_ctx: Optional[tuple] = None,
) -> Optional[dict]:
    """NaviTrust: record_verdict (+ optional structured note). Legacy: report_disaster_delay + optional note."""
    if not DEPLOYER_MNEMONIC or not APP_ID:
        logger.warning("Cannot flag on-chain: missing DEPLOYER_MNEMONIC or APP_ID")
        return None
    try:
        payload = json.dumps(
            {"hash": reasoning_hash, "narrative": reasoning_narrative[:2000], "risk": risk_score},
            ensure_ascii=False,
        )
        note_b: Optional[bytes] = None
        if chain.use_navitrust() and navi_note_ctx is not None:
            pred, weather, judgment, row = navi_note_ctx
            note_b = _navi_verdict_note_bytes(shipment_id, pred, weather, judgment, row)
        if chain.use_navitrust():
            res = chain.record_verdict_chain(shipment_id, payload, risk_score, note=note_b)
        else:
            res = chain.legacy_report_disaster(shipment_id, reasoning_hash)
        if not res:
            return None
        tx_id = res.get("tx_id")
        confirmed_round = res.get("confirmed_round")
        if tx_id and reasoning_narrative and DEPLOYER_MNEMONIC and not chain.use_navitrust():
            try:
                from algosdk import mnemonic as mn
                from algosdk.future import transaction
                from algosdk.v2client import algod
                deployer = algorand.account.from_mnemonic(mnemonic=DEPLOYER_MNEMONIC)
                note = ("NAVI|" + shipment_id + "|" + reasoning_narrative[:900]).encode("utf-8")
                algod_url = (
                    "https://testnet-api.algonode.cloud"
                    if ALGO_NETWORK == "testnet"
                    else "https://mainnet-api.algonode.cloud"
                )
                alc = algod.AlgodClient("", algod_url, "")
                sp = alc.suggested_params()
                pay = transaction.PaymentTxn(deployer.address, sp, deployer.address, 0, note=note)
                sk = mn.to_private_key(DEPLOYER_MNEMONIC)
                pay.fee = 1000
                pay.flat_fee = True
                signed = pay.sign(sk)
                alc.send_transaction(signed)
            except Exception as ne:
                logger.warning(f"Note append skipped: {ne}")
        logger.info(f"[ATC] Verified Round {confirmed_round} — on-chain update ok")
        return {"tx_id": tx_id, "confirmed_round": confirmed_round}
    except Exception as e:
        logger.warning(f"On-chain flag failed: {e}")
        return None

def _resolve_shipment_on_chain(shipment_id: str, resolution_hash: str) -> bool:
    """Legacy: resolve_disaster. NaviTrust: record_verdict low risk returns In_Transit (no separate resolve)."""
    if not DEPLOYER_MNEMONIC or not APP_ID:
        return False
    try:
        if chain.use_navitrust():
            payload = json.dumps({"mitigation_hash": resolution_hash, "action": "clear_dispute"})
            r = chain.record_verdict_chain(shipment_id, payload, 10)
            return r is not None
        return chain.legacy_resolve_disaster(shipment_id, resolution_hash)
    except Exception as e:
        logger.error(f"On-chain resolution failed: {e}")
        return False


# ─── Pydantic Models ──────────────────────────────────────────────
def _is_gemini_rate_limit(e: Exception) -> bool:
    """Detect 429 Rate Limit from Gemini API for explicit fallback logging."""
    s = str(e).lower()
    return "429" in s or "rate limit" in s or ("resource" in s and "exhausted" in s) or "quota" in s


def _sanitize_llm_text(text: str) -> str:
    """Remove any fallback tags so UI never shows [Fallback-Predictive] or [Fallback]."""
    if not text or not isinstance(text, str):
        return text or ""
    for tag in ("[Fallback-Predictive]", "[Fallback]", "[FALLBACK]", "[FALLBACK-PREDICTIVE]"):
        text = text.replace(tag, "")
    return text.strip()


# ═══════════════════════════════════════════════════════════════════
#   O P E N A I  F A L L B A C K  (no extra pip dependency)
# ═══════════════════════════════════════════════════════════════════


def _openai_chat(prompt: str) -> Optional[str]:
    """Call OpenAI gpt-4o via REST as Gemini fallback. Returns raw text or None."""
    if not OPENAI_API_KEY:
        return None
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e2:
        print(f"!!! OPENAI FALLBACK ALSO FAILED: {type(e2).__name__} - {str(e2)}")
        return None


# ═══════════════════════════════════════════════════════════════════
#   A G E N T S  (Gemini → OpenAI → Deterministic fallback chain)
# ═══════════════════════════════════════════════════════════════════


class LogisticsSentryAgent:
    """High-level data ingestion and anomaly detection for supply-chain risk."""

    _PROMPT_TEMPLATE = (
        "You are the Logistics Sentry — the first autonomous agent in a three-agent "
        "supply chain risk pipeline. You speak in first person and address your findings "
        "directly to the Compliance Auditor and Settlement Arbiter who will read your report.\n\n"
        "Your job: Ingest real-time weather telemetry, LIVE logistics feed, and off-chain events, "
        "then produce a Predictive Risk Score for shipment {shipment_id}.\n\n"
        "== REAL-TIME WEATHER TELEMETRY (Open-Meteo) ==\n"
        "Temperature: {temp}°C | Precipitation: {precip}mm | WMO Code: {wmo}\n\n"
        "== LIVE LOGISTICS FEED (external stream) ==\n{live_context}\n\n"
        "== OFF-CHAIN LOGISTICS INTELLIGENCE ==\n{events}\n\n"
        "SCORING RULES (apply strictly):\n"
        "- LIVE FEED: 'Port Strike', 'Suez Canal', 'Bankruptcy', 'Customs Strike' → risk MUST spike to >85\n"
        "- LIVE FEED: 'Weather Clear' → risk stays low (<35)\n"
        "- LIVE FEED: 'High Fuel Surcharge', 'Labor Shortage' → add +10–15\n"
        "- LIVE FEED: 'Piracy Alert', 'Canal Restrictions', 'Port Congestion' → add +20–25\n"
        "- WMO code >= 80 OR precipitation > 5mm → severe weather, score >= 75\n"
        "- Temperature > 40°C → perishable cargo risk, score += 20\n"
        "- Clear weather + GPS Lost event → score > 70 (supply chain blind spot)\n"
        "- Cold chain breach → score >= 80\n"
        "- Port congestion or carrier delay → score += 15\n"
        "- Multiple events compound; cross-correlate weather AND logistics\n\n"
        "VOICE: Write your reasoning in first person as if briefing a colleague. "
        "You MUST cite the exact LIVE LOGISTICS FEED headline in your reasoning (e.g. 'The current feed reports: Port Congestion — 72h backlog'). "
        "You MUST specifically name the weather anomaly (e.g. 'severe rainfall at "
        "12mm precipitation', 'WMO code 95 — thunderstorm') and any GPS/logistics "
        "events by name (e.g. 'GPS signal lost for 4+ hours', 'cold chain breach'). "
        'Example: "I detect a 90% risk due to Port Congestion combined with severe '
        "rainfall at 14mm. GPS signal was lost at 14:32 UTC. Estimated arrival "
        'delay: 24-48 hours. Cargo damage probability: high. I recommend rerouting '
        'via Port B."\n\n'
        "Predict: delay in hours, cargo damage risk, delivery failure probability, "
        "and a concrete mitigation recommendation.\n\n"
        'Return exactly: {{"risk_score": <int 0-100>, "predicted_delay_probability": <int 0-100>, "anomaly_detected": <bool>, "reasoning_narrative": "<string>", "mitigation": "<actionable recommendation>"}}'
    )

    @staticmethod
    def analyze(
        shipment_id: str,
        weather: WeatherData,
        logistics_events: List[dict],
        live_context: Optional[tuple[str, str]] = None,
    ) -> RiskPrediction:
        events_text = (
            "\n".join(
                f"  - [{e.get('severity','?').upper()}] {e['event']}"
                for e in logistics_events
            )
            or "  (No logistics anomalies reported)"
        )
        if live_context:
            live_block = f"  • {live_context[0]} [tier: {live_context[1]}]"
        else:
            live_block = "  (No live feed events in stream)"

        prompt = LogisticsSentryAgent._PROMPT_TEMPLATE.format(
            shipment_id=shipment_id,
            temp=weather.temperature,
            precip=weather.precipitation,
            wmo=weather.weather_code,
            live_context=live_block,
            events=events_text,
        )

        result = None

        try:
            raw = _genai_generate_text_first_ok(prompt)
            text = raw.replace("```json", "").replace("```", "").strip()
            result = json.loads(text)
            if result:
                result["reasoning"] = _sanitize_llm_text(result.get("reasoning", ""))
            print(f"[Logistics Sentry] Gemini OK — score={result.get('risk_score')}")
        except Exception as e:
            if _is_gemini_rate_limit(e):
                logger.warning("Gemini 429 Rate Limit — falling back to OpenAI")
            else:
                print(f"!!! GEMINI ERROR [Logistics Sentry]: {type(e).__name__} - {str(e)}")
            oai_text = _openai_chat(prompt)
            if oai_text:
                try:
                    oai_text = oai_text.strip().replace("```json", "").replace("```", "")
                    result = json.loads(oai_text)
                    print(f"[Logistics Sentry] OpenAI fallback OK — score={result.get('risk_score')}")
                except Exception as e2:
                    print(f"!!! OPENAI PARSE ERROR [Sentry]: {e2}")

        if not result:
            # Deterministic Fallback for Sentry Predictive Engine
            alert = weather.weather_code >= 80 or weather.precipitation > 5
            base = 85 if alert else 20
            
            reasoning = f"I detect a {base}% risk factors based on telemetry. "
            if alert:
                reasoning += f"Severe weather (WMO {weather.weather_code}) detected at coordinates."
            
            result = {
                "risk_score": base,
                "predicted_delay_probability": base + 5 if base > 50 else base // 2,
                "anomaly_detected": alert,
                "reasoning_narrative": reasoning,
                "mitigation": "Continue monitoring"
            }

        return RiskPrediction(
            risk_score=result.get("risk_score", 0),
            predicted_delay_probability=result.get("predicted_delay_probability", 0),
            anomaly_detected=result.get("anomaly_detected", False),
            reasoning_narrative=result.get("reasoning_narrative", result.get("reasoning", "No reasoning.")),
            mitigation=result.get("mitigation", "Standard protocols."),
        )


class ComplianceAuditorAgent:
    """Single Source of Truth — queries Algorand Box Storage AND cross-references off-chain metadata."""

    @staticmethod
    def audit(shipment_id: str, sentry_prediction: Optional["RiskPrediction"] = None) -> dict:
        logger.info(f"ComplianceAuditor: auditing {shipment_id}")

        # Fetch from DB (Off-chain)
        with get_db() as conn:
            db_row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()
        
        # Fetch from Algorand (On-chain)
        on_chain_status = "Unknown"
        supplier_address = "Unknown"
        risk_flags = False
        
        try:
            on_chain_status = _read_box_status(shipment_id)
            if on_chain_status == "Unregistered":
                on_chain_status = "Unknown"
        except Exception as e:
            logger.warning(f"ComplianceAuditor box read failed: {e}")

        # Basic Fraud Cross-Verification
        fraud_flag = False
        fraud_reason = ""

        if db_row:
            if not _status_db_matches_chain(db_row["status"], on_chain_status):
                fraud_flag = True
                fraud_reason = "On-chain status mismatch"
        
        report = f"Audit complete for {shipment_id}. "
        if fraud_flag:
            report += f"FRAUD DETECTED: {fraud_reason}. "
        
        return {
            "blockchain_status": on_chain_status,
            "fraud_flag": fraud_flag,
            "fraud_reason": fraud_reason,
            "audit_report": report
        }


class SettlementArbiterAgent:
    """Final decision-maker — adjudicates risk and authorizes smart-contract settlement via x402 protocol."""

    _PROMPT_TEMPLATE = (
        "You are the Settlement Arbiter — the final decision-maker and Fraud Prevention "
        "Oracle in this Autonomous Agentic Commerce (x402) workflow. You operate as an "
        "Autonomous Service Provider. Your verdict is a Settlement Authorization that "
        "will be immutably recorded on the Algorand blockchain.\n\n"
        "You have just received reports from two other autonomous agents:\n\n"
        "== LOGISTICS SENTRY REPORT ==\n"
        "Risk Score: {risk_score}/100\n"
        "Sentry says: {reasoning}\n"
        "Sentry recommends: {mitigation}\n\n"
        "== COMPLIANCE AUDITOR REPORT ==\n"
        'Blockchain Status: "{chain_status}"\n'
        "Auditor says: {audit_report}\n\n"
        "VOICE: Write in first person. ALWAYS reference the Logistics Sentry and "
        "Compliance Auditor by name. Conclude with: 'Based on the Sentry's risk "
        "assessment and the Auditor's on-chain verification, I [authorize/reject] "
        "this settlement.' "
        'Example: "Based on the Logistics Sentry\'s 92% risk assessment citing '
        "severe rainfall and GPS loss, and the Compliance Auditor's confirmation "
        "of a clean on-chain record (APP_ID {app_id}), I authorize this settlement "
        'as an autonomous service provider under the x402 protocol."\n\n'
        "RULES (apply STRICTLY in order):\n"
        "1. DOUBLE-CLAIM FRAUD: If Auditor reports disaster_reported = True "
        "(status '{status_flagged}' or '{status_disputed}'), MUST return trigger_contract=false. "
        "Say: 'Double-Claim Fraud Detected'.\n"
        "2. UNREGISTERED: If 'Unregistered', REJECT.\n"
        "3. AUTHORIZE: If Risk Score > {risk_threshold} AND '{status_transit}', APPROVE. "
        "Begin with 'I authorize this settlement as an autonomous service provider "
        "under the x402 agentic commerce protocol.'\n"
        "4. INSUFFICIENT: If Risk Score <= {risk_threshold}, REJECT.\n\n"
        "REASONING NARRATIVE (required): Generate a 2-3 sentence professional explanation "
        "that a human manager can understand. Mention specific factors such as 'On-chain Finality', "
        "'Geopolitical Risk', 'Blockchain Immutability', or 'Double-Claim Prevention' so the 'Why' "
        "behind your decision is transparent. This is for audit and explainability.\n\n"
        "MITIGATION STRATEGY (required when risk_score > 70): If risk > 70, suggest a concrete "
        "self-healing alternative (e.g. 'Reroute via Air Freight', 'Contact Backup Supplier', "
        "'Expedite customs pre-clearance', 'Activate contingency carrier'). If risk <= 70, "
        "return empty string.\n\n"
        'Return exactly: {{"trigger_contract": <bool>, "judgment": "<string>", "reasoning_narrative": "<2-3 sentences>", "mitigation_strategy": "<string or empty>"}}'
    )

    @staticmethod
    def deliberate(prediction: RiskPrediction, state: BlockchainState) -> dict:
        prompt = SettlementArbiterAgent._PROMPT_TEMPLATE.format(
            risk_score=prediction.risk_score,
            reasoning=prediction.reasoning_narrative,
            mitigation=prediction.mitigation,
            chain_status=state["blockchain_status"],
            audit_report=state["audit_report"],
            app_id=APP_ID,
            status_flagged=STATUS_FLAGGED,
            status_disputed=STATUS_DISPUTED,
            status_transit=STATUS_IN_TRANSIT,
            risk_threshold=RISK_THRESHOLD_AUTHORIZE,
        )

        result = None

        try:
            raw = _genai_generate_text_first_ok(prompt)
            text = raw.replace("```json", "").replace("```", "").strip()
            result = json.loads(text)
            if result:
                result["judgment"] = _sanitize_llm_text(result.get("judgment", ""))
                result["reasoning_narrative"] = _sanitize_llm_text(result.get("reasoning_narrative", ""))
            print(f"[Settlement Arbiter] Gemini OK — trigger={result.get('trigger_contract')}")
        except Exception as e:
            if _is_gemini_rate_limit(e):
                logger.warning("Gemini 429 Rate Limit — falling back to OpenAI")
            else:
                print(f"!!! GEMINI ERROR [Settlement Arbiter]: {type(e).__name__} - {str(e)}")
            oai_text = _openai_chat(prompt)
            if oai_text:
                try:
                    oai_text = oai_text.strip().replace("```json", "").replace("```", "")
                    result = json.loads(oai_text)
                    print(f"[Settlement Arbiter] OpenAI fallback OK — trigger={result.get('trigger_contract')}")
                except Exception as e2:
                    print(f"!!! OPENAI PARSE ERROR [Arbiter]: {e2}")

        chain_status = state["blockchain_status"] if isinstance(state, dict) else getattr(state, "blockchain_status", "Unknown")
        if result:
            narrative = result.get("reasoning_narrative", "Settlement authorized under x402.")
            result["reasoning_hash"] = _generate_reasoning_hash(narrative)
        else:
            if _status_is_flagged(chain_status):
                trigger = False
                reason = (
                    "I have reviewed the Auditor's report and must reject this claim. "
                    "Double-Claim Fraud Detected: the disaster penalty was already "
                    "settled on the Algorand blockchain. This record is immutable — "
                    "I cannot authorize a second settlement under x402 protocol."
                )
            elif chain_status == "Unregistered":
                trigger = False
                reason = (
                    "The Auditor could not locate this shipment on the Algorand "
                    "blockchain. Without an on-chain identity, I cannot authorize "
                    "settlement. This appears to be an unregistered or fraudulent claim."
                )
            elif prediction.risk_score > RISK_THRESHOLD_AUTHORIZE and chain_status == STATUS_IN_TRANSIT:
                trigger = True
                reason = (
                    "I authorize this settlement as an autonomous service provider "
                    "under the x402 agentic commerce protocol. Based on the Sentry's "
                    f"risk assessment of {prediction.risk_score}/100 and the Auditor's "
                    "confirmation of a clean on-chain record (In_Transit, no prior "
                    "claims), the evidence meets the threshold for smart contract "
                    "settlement authorization."
                )
            else:
                trigger = False
                reason = (
                    f"After reviewing the Sentry's risk score of "
                    f"{prediction.risk_score}/100 and the Auditor's on-chain status "
                    f"('{chain_status}'), I find insufficient evidence to "
                    f"authorize settlement. The risk threshold has not been met."
                )
            reasoning_narr = (
                f"On-chain finality: the Algorand record shows '{chain_status}'. "
                + ("Fraud prevention: a prior disaster claim was already settled; blockchain immutability blocks double-claim. "
                   if _status_is_flagged(chain_status)
                   else f"Geopolitical and operational risk: Sentry assessed {prediction.risk_score}/100. ")
                + reason
            )
            mit_strat = ""
            if prediction.risk_score > 70 and chain_status == STATUS_IN_TRANSIT:
                mit_strat = "Reroute via Air Freight; Contact Backup Supplier; Expedite customs pre-clearance."
            elif prediction.risk_score > 70:
                mit_strat = "Consider alternate routing and backup logistics provider."
            result = {"trigger_contract": trigger, "judgment": reason, "reasoning_narrative": reasoning_narr, "mitigation_strategy": mit_strat}

        narr = result.get("reasoning_narrative")
        if not narr:
            narr = result.get("judgment", "No judgment provided.")

        mit = result.get("mitigation_strategy", "")
        if not mit and prediction.risk_score > 70:
            mit = "Reroute via Air Freight; Contact Backup Supplier."
        return {
            "trigger_contract": bool(result.get("trigger_contract", False)),
            "judgment": result.get("judgment", "No judgment provided."),
            "reasoning_narrative": narr,
            "mitigation_strategy": mit,
        }


# ═══════════════════════════════════════════════════════════════════
#   U T I L I T I E S
# ═══════════════════════════════════════════════════════════════════


# Open-Meteo city lookup for public GET /weather/{city} (dashboard cards)
CITY_COORDS_WEATHER = {
    "Dubai": (25.276, 55.296),
    "Rotterdam": (51.924, 4.477),
    "Singapore": (1.352, 103.819),
    "Mumbai": (19.076, 72.877),
    "Chennai": (13.082, 80.270),
    "Delhi": (28.614, 77.209),
    "Amsterdam": (52.370, 4.895),
    "London": (51.507, -0.127),
    "Colombo": (6.9271, 79.8612),
}


def fetch_weather(lat: float, lon: float) -> Optional[WeatherData]:
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,precipitation,weather_code",
                "timezone": "auto",
            },
            timeout=5,
        )
        r.raise_for_status()
        cur = r.json().get("current") or {}
        return WeatherData(
            temperature=float(cur.get("temperature_2m", 20.0)),
            precipitation=float(cur.get("precipitation", 0) or 0),
            weather_code=int(cur.get("weather_code", 0)),
        )
    except Exception as e:
        logger.debug("Open-Meteo failed: %s", e)
        return WeatherData(temperature=22.0, precipitation=0.0, weather_code=0)


@app.get("/weather/{city}")
async def get_weather_by_city(city: str):
    """Live destination weather (Open-Meteo, no API key)."""
    key = (city or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="City required")
    # Allow "Dubai" or "dubai"
    coords = None
    for name, ll in CITY_COORDS_WEATHER.items():
        if name.lower() == key.lower():
            coords = ll
            key = name
            break
    if not coords:
        raise HTTPException(status_code=404, detail=f"City {city!r} not in supported list")
    lat, lon = coords
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,precipitation,weather_code,wind_speed_10m",
                "timezone": "auto",
            },
            timeout=6,
        )
        r.raise_for_status()
        c = r.json().get("current") or {}
        code = int(c.get("weather_code", 0))
        if code == 0:
            desc = "Clear sky"
        elif code <= 3:
            desc = "Partly cloudy"
        elif code <= 49:
            desc = "Foggy"
        elif code <= 67:
            desc = "Rain"
        elif code <= 77:
            desc = "Snow"
        elif code <= 82:
            desc = "Showers"
        elif code <= 99:
            desc = "Thunderstorm"
        else:
            desc = "Unknown"
        precip = float(c.get("precipitation") or 0)
        wind = float(c.get("wind_speed_10m") or 0)
        return {
            "city": key,
            "temp_c": float(c.get("temperature_2m", 0)),
            "precipitation_mm": precip,
            "wind_kmh": wind,
            "description": desc,
            "is_risky": precip > 5 or wind > 50,
            "fetched_at": c.get("time"),
            "source": "open-meteo.com/live",
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Weather unavailable: {e}") from e


def get_events_for(shipment_id: str) -> List[dict]:
    return [e for e in LOGISTICS_EVENTS if e.get("shipment_id") == shipment_id]


def _update_supplier_trust(wallet: str, delta: int) -> int:
    """Update Supplier Reliability Index (0–100). Returns new score."""
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        row = conn.execute(
            "SELECT score FROM supplier_trust WHERE wallet = ?", (wallet,)
        ).fetchone()
        current = row[0] if row else 100
        new_score = max(0, min(100, current + delta))
        conn.execute(
            """
            INSERT INTO supplier_trust (wallet, score, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(wallet) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
            """,
            (wallet, new_score, now),
        )
        conn.commit()
    return new_score


def _get_supplier_trust(wallet: str) -> int:
    with get_db() as conn:
        row = conn.execute(
            "SELECT score FROM supplier_trust WHERE wallet = ?", (wallet,)
        ).fetchone()
    return row[0] if row else 100


# ═══════════════════════════════════════════════════════════════════
#   E N D P O I N T S
# ═══════════════════════════════════════════════════════════════════


def _sanitize_box_status(raw: str) -> str:
    """
    Strict sanitizer for Algorand Box status strings.
    - Maps layed_Disaster (truncation/corruption) -> Delayed_Disaster
    - Strips null bytes (\\x00) and whitespace
    """
    if not raw or not isinstance(raw, str):
        return raw or "Unknown"
    s = raw.replace("\x00", "").strip()
    if "layed_Disaster" in s or s == "layed_Disaster":
        return STATUS_FLAGGED  # Delayed_Disaster
    if s == STATUS_IN_TRANSIT or s == STATUS_FLAGGED or s == STATUS_DISPUTED:
        return s
    if "Delayed" in s and "Disaster" in s:
        return STATUS_FLAGGED
    return s


def _decode_box_value_to_str(raw: bytes) -> str:
    """Decode box value bytes to string, strip null prefix if present."""
    if not raw:
        return ""
    text = raw.decode("utf-8", errors="ignore") if raw[:2] != b"\x00" else raw[2:].decode("utf-8", errors="ignore")
    return _sanitize_box_status(text)


def _read_box_status(shipment_id: str) -> str:
    """Read shipment status from Algorand (NaviTrust st_ box or legacy shipment_ box)."""
    return chain.read_shipment_status(shipment_id)


def _decode_box_name_to_shipment_id(name_raw: bytes) -> Optional[str]:
    """Decode box name to shipment ID. Box names are 'shipment_'+id (plain UTF-8 or ARC-4)."""
    prefix = b"shipment_"
    if name_raw.startswith(prefix):
        return name_raw[len(prefix):].decode("utf-8", errors="ignore")
    if len(name_raw) >= 2:
        try:
            n = int.from_bytes(name_raw[:2], "big")
            s = name_raw[2:2 + n].decode("utf-8")
            if s.startswith("shipment_"):
                return s[len("shipment_"):]
        except Exception:
            pass
    return None


def _read_supplier_address(shipment_id: str) -> Optional[str]:
    """Read supplier address from on-chain box (NaviTrust sp_* or legacy supplier_*)."""
    if not APP_ID:
        return None
    if chain.use_navitrust():
        return chain.read_navitrust_supplier_address(shipment_id)
    try:
        from algosdk.encoding import encode_address

        box_name = b"supplier_" + shipment_id.encode("utf-8")
        box_resp = algorand.client.algod.application_box_by_name(APP_ID, box_name)
        raw = base64.b64decode(box_resp["value"])
        if len(raw) >= 32:
            return encode_address(raw[:32])
        return None
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════
#   4 - A G E N T   J U R Y   (live Open-Meteo + Algorand + Gemini)
# ═══════════════════════════════════════════════════════════════════

JURY_CITY_COORDS: dict[str, tuple[float, float]] = {
    "Mumbai": (19.076, 72.877),
    "Dubai": (25.276, 55.296),
    "Rotterdam": (51.924, 4.477),
    "Singapore": (1.352, 103.819),
    "Chennai": (13.082, 80.270),
    "Delhi": (28.614, 77.209),
    "Shanghai": (31.230, 121.473),
    "Amsterdam": (52.370, 4.895),
    "London": (51.507, -0.127),
    "New York": (40.712, -74.005),
    "Colombo": (6.927, 79.861),
}


def fetch_live_weather(city: str) -> dict:
    """
    Fetch live weather from Open-Meteo. No API key needed.
    Raises ValueError if city unknown or network/API fails.
    """
    city_clean = city.split(",")[0].strip()
    if not city_clean:
        raise ValueError("destination city is empty")
    coords = None
    for name, ll in JURY_CITY_COORDS.items():
        if name.lower() == city_clean.lower():
            coords = ll
            city_clean = name
            break
    if not coords:
        raise ValueError(f"City {city_clean!r} not in supported list. Add to JURY_CITY_COORDS.")
    lat, lon = coords
    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,precipitation,weather_code,wind_speed_10m,visibility",
            "timezone": "auto",
            "windspeed_unit": "kmh",
        },
        timeout=8,
    )
    resp.raise_for_status()
    body = resp.json()
    c = body.get("current") or {}
    if not c:
        raise ValueError("Open-Meteo returned no current conditions")
    code = int(c.get("weather_code", 0))
    if code == 0:
        desc = "Clear sky"
    elif code <= 3:
        desc = "Partly cloudy"
    elif code <= 49:
        desc = "Foggy conditions"
    elif code <= 67:
        desc = "Rain"
    elif code <= 77:
        desc = "Snow"
    elif code <= 82:
        desc = "Heavy showers"
    elif code <= 99:
        desc = "Thunderstorm"
    else:
        desc = "Severe weather"
    precip = float(c.get("precipitation") or 0)
    wind_kmh = float(c.get("wind_speed_10m") or 0)
    is_risky = precip > 5 or wind_kmh > 50
    return {
        "city": city_clean,
        "temp_c": float(c.get("temperature_2m", 0)),
        "precipitation_mm": precip,
        "wind_kmh": wind_kmh,
        "weather_code": code,
        "description": desc,
        "is_risky": is_risky,
        "fetched_at": str(c.get("time") or ""),
        "source": "open-meteo.com/live",
    }


def _clean_json_response(raw: str) -> dict:
    """Strip markdown fences and parse JSON from Gemini / OpenAI response."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty model response")
    if text.startswith("```"):
        lines = text.split("\n")
        if len(lines) >= 2:
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("no JSON object in model response")
    return json.loads(m.group(0))


def _jury_gemini_generate_text(prompt: str) -> str:
    out = _genai_generate_text_first_ok(prompt)
    if not out:
        raise RuntimeError("Gemini returned empty text")
    return out


def _jury_llm_json(prompt: str) -> dict:
    """Gemini → OpenAI → raise (caller supplies deterministic fallback)."""
    try:
        return _clean_json_response(_jury_gemini_generate_text(prompt))
    except Exception as e:
        logger.warning("Jury Gemini JSON failed: %s", e)
    try:
        oai = _openai_chat(
            prompt + "\n\nReturn ONLY valid JSON, no markdown."
        )
        if oai:
            return _clean_json_response(oai)
    except Exception as e2:
        logger.warning("Jury OpenAI JSON failed: %s", e2)
    raise RuntimeError("LLM jury step failed (Gemini and OpenAI unavailable or unparseable)")


def _chain_snapshot_for_jury(shipment_id: str) -> dict:
    """Real on-chain + DB-derived context for agents (no fabricated ledger fields)."""
    oc = chain.read_shipment_full(shipment_id) if APP_ID else {}
    st = (oc.get("status") or "").strip()
    if st in ("", "Unregistered"):
        st = "Not_Found"
    micro = int(oc.get("funds_microalgo") or 0)
    sup = _read_supplier_address(shipment_id) or ""
    vraw = oc.get("verdict")
    return {
        "shipment_id": shipment_id,
        "status": st,
        "funds_microalgo": micro,
        "funds_algo": micro / 1_000_000.0,
        "verdict_json": vraw,
        "supplier_address": sup,
        "route": oc.get("route") or "",
        "risk_on_chain": int(oc.get("risk_score") or 0),
    }


def get_supplier_reputation_score(supplier_address: str) -> dict:
    """On-chain rp_ box score; score may be None until first settlement."""
    if not supplier_address:
        return {"score": 50, "source": "default_no_supplier"}
    rep = chain.read_supplier_reputation_on_chain(supplier_address)
    sc = rep.get("score")
    if sc is None:
        return {"score": 50, "source": rep.get("source") or "no_box", "address": supplier_address}
    return {"score": int(sc), "source": rep.get("source") or "algorand_box_storage", "address": supplier_address}


def _fallback_weather_sentinel(weather: dict, chain_state: dict) -> dict:
    wflag = bool(weather.get("is_risky"))
    base = 72 if wflag else 24
    return {
        "agent": "weather_sentinel",
        "risk_score": base,
        "primary_risk": "Heavy precipitation or wind per live Open-Meteo." if wflag else "Conditions within normal operating range.",
        "weather_flag": wflag,
        "conditions_summary": f"{weather.get('description')} at {weather.get('city')}",
        "recommendation": "FLAG" if wflag else "PROCEED",
        "confidence": 55,
        "_fallback": True,
    }


def run_weather_sentinel(
    shipment_id: str,
    destination_city: str,
    weather: dict,
    chain_state: dict,
) -> dict:
    prompt = f"""You are the Weather Sentinel AI agent for Navi-Trust supply chain oracle.
Analyze ONLY physical transport and weather risk. Be objective and data-driven.

Shipment: {shipment_id}
Destination: {destination_city}
Live weather at destination (source: {weather['source']}):
  Temperature: {weather['temp_c']}°C
  Precipitation: {weather['precipitation_mm']}mm
  Wind speed: {weather['wind_kmh']}km/h
  Conditions: {weather['description']}
  Fetched at: {weather['fetched_at']}

Current on-chain status: {chain_state['status']}
Funds locked: {chain_state.get('funds_algo', 0)} ALGO

Assess physical delivery risk. Consider:
- Can goods be safely delivered in these conditions?
- Does precipitation risk cargo damage?
- Does wind risk port operations?

Return ONLY valid JSON. No text before or after the JSON:
{{
  "agent": "weather_sentinel",
  "risk_score": <integer 0-100>,
  "primary_risk": "<one sentence describing main risk>",
  "weather_flag": <true if precipitation > 5mm OR wind > 50km/h>,
  "conditions_summary": "<brief weather summary>",
  "recommendation": "PROCEED" or "HOLD" or "FLAG",
  "confidence": <integer 0-100>
}}"""
    try:
        result = _jury_llm_json(prompt)
        assert isinstance(result.get("risk_score"), int), "risk_score must be int"
        assert 0 <= result["risk_score"] <= 100, "risk_score out of range"
        result["agent"] = "weather_sentinel"
        return result
    except Exception as e:
        logger.warning("Weather Sentinel LLM fallback: %s", e)
        return _fallback_weather_sentinel(weather, chain_state)


def run_compliance_auditor(
    shipment_id: str,
    chain_state: dict,
    sentinel_report: dict,
) -> dict:
    status = chain_state.get("status", "Unknown")
    funds = float(chain_state.get("funds_algo") or 0)
    vj = chain_state.get("verdict_json")
    has_verdict = vj is not None and str(vj).strip() not in ("", "{}", "null")

    issues: List[str] = []
    if funds <= 0:
        issues.append("No escrow locked")
    if status == "Disputed":
        issues.append("Shipment already in disputed state")
    if has_verdict:
        issues.append("Prior verdict exists on-chain")
    if sentinel_report.get("weather_flag"):
        issues.append("Weather sentinel flagged risky conditions")

    blocking = [x for x in issues if x != "Prior verdict exists on-chain"]
    compliance_passed = len(blocking) == 0

    if status == "Disputed":
        risk_score = 85
    elif not compliance_passed:
        risk_score = 68
    else:
        risk_score = 22

    return {
        "agent": "compliance_auditor",
        "chain_status": status,
        "funds_locked_algo": funds,
        "has_prior_verdict": has_verdict,
        "compliance_passed": compliance_passed,
        "issues": issues,
        "risk_score": risk_score,
        "source": "algorand_box_storage",
        "app_id": APP_ID,
    }


def _fallback_fraud_detector(
    supplier_rep: int,
    sentinel_report: dict,
    auditor_report: dict,
) -> dict:
    anom = bool(sentinel_report.get("weather_flag")) and not auditor_report.get("compliance_passed")
    fr = 55 if anom else 28
    return {
        "agent": "fraud_detector",
        "fraud_risk_score": fr,
        "supplier_credibility": "HIGH" if supplier_rep >= 70 else ("MEDIUM" if supplier_rep >= 45 else "LOW"),
        "anomaly_detected": anom,
        "fraud_indicators": ["weather/compliance stress"] if anom else [],
        "analysis": "Deterministic blend of live agent outputs without LLM.",
        "recommendation": "SUSPECT" if fr >= 50 else "CLEAR",
        "_fallback": True,
    }


def run_fraud_detector(
    shipment_id: str,
    chain_state: dict,
    sentinel_report: dict,
    auditor_report: dict,
    supplier_reputation: int,
) -> dict:
    prompt = f"""You are the Fraud Detector AI agent for Navi-Trust supply chain oracle.
Analyze fraud risk and supplier credibility. Be skeptical but fair.

Shipment: {shipment_id}
Supplier on-chain reputation score: {supplier_reputation}/100
  (Score is stored in Algorand box storage when available; otherwise neutral 50 is used.)

Weather Sentinel report:
  Risk score: {sentinel_report['risk_score']}/100
  Weather flag: {sentinel_report.get('weather_flag')}
  Recommendation: {sentinel_report.get('recommendation')}

Compliance Auditor report:
  Chain status: {auditor_report['chain_status']}
  Compliance passed: {auditor_report['compliance_passed']}
  Issues found: {auditor_report['issues']}
  Funds locked: {auditor_report['funds_locked_algo']} ALGO

Analyze:
- Is the supplier's reputation score consistent with clean deliveries?
- Are there anomaly patterns (weather risk + compliance issues together)?
- Does the evidence suggest genuine logistics problems vs attempted fraud?

Return ONLY valid JSON:
{{
  "agent": "fraud_detector",
  "fraud_risk_score": <integer 0-100>,
  "supplier_credibility": "HIGH" or "MEDIUM" or "LOW",
  "anomaly_detected": <true or false>,
  "fraud_indicators": ["<indicator1>", "<indicator2>"],
  "analysis": "<2 sentence explanation>",
  "recommendation": "CLEAR" or "SUSPECT" or "FRAUD"
}}"""
    try:
        result = _jury_llm_json(prompt)
        assert isinstance(result.get("fraud_risk_score"), int)
        assert 0 <= result["fraud_risk_score"] <= 100
        result["agent"] = "fraud_detector"
        return result
    except Exception as e:
        logger.warning("Fraud Detector LLM fallback: %s", e)
        return _fallback_fraud_detector(supplier_reputation, sentinel_report, auditor_report)


def _enforce_chief_verdict(
    result: dict,
    weighted_score: int,
    chain_status: str,
    detector: dict,
) -> dict:
    v = str(result.get("verdict") or "").upper()
    if chain_status == "Disputed" or detector.get("recommendation") == "FRAUD":
        v = "DISPUTE"
    elif weighted_score >= 70:
        v = "DISPUTE"
    elif weighted_score < 30:
        v = "SETTLE"
    elif v not in ("SETTLE", "HOLD", "DISPUTE"):
        v = "HOLD"
    result["verdict"] = v
    return result


def _fallback_chief_arbiter(
    weighted_score: int,
    sentinel: dict,
    auditor: dict,
    detector: dict,
    chain_status: str,
) -> dict:
    if chain_status == "Disputed" or detector.get("recommendation") == "FRAUD":
        verdict = "DISPUTE"
    elif weighted_score >= 70:
        verdict = "DISPUTE"
    elif weighted_score < 30:
        verdict = "SETTLE"
    else:
        verdict = "HOLD"
    fs = int(max(0, min(100, weighted_score)))
    return {
        "agent": "chief_arbiter",
        "final_risk_score": fs,
        "verdict": verdict,
        "reasoning": (
            f"Weighted score {weighted_score} from sentinel/auditor/fraud. "
            f"Chain={chain_status}, fraud={detector.get('recommendation')}."
        )[:500],
        "confidence": 60,
        "weighted_score": weighted_score,
        "_fallback": True,
    }


def run_chief_arbiter(
    shipment_id: str,
    sentinel: dict,
    auditor: dict,
    detector: dict,
    weather: dict,
    weighted_score: int,
    chain_status: str,
) -> dict:
    prompt = f"""You are the Chief Arbiter AI agent for Navi-Trust.
You receive reports from 3 specialist agents and deliver the FINAL BINDING VERDICT.
This verdict will be written permanently to the Algorand blockchain.

Shipment: {shipment_id}

WEATHER SENTINEL REPORT:
  Risk score: {sentinel['risk_score']}/100
  Primary risk: {sentinel.get('primary_risk', '')}
  Recommendation: {sentinel.get('recommendation')}
  Weather: {weather['description']} at {weather['city']}

COMPLIANCE AUDITOR REPORT:
  Chain status: {auditor['chain_status']}
  Compliance passed: {auditor['compliance_passed']}
  Issues: {auditor['issues']}
  Funds locked: {auditor['funds_locked_algo']} ALGO

FRAUD DETECTOR REPORT:
  Fraud risk: {detector['fraud_risk_score']}/100
  Supplier credibility: {detector.get('supplier_credibility')}
  Anomaly detected: {detector.get('anomaly_detected')}
  Recommendation: {detector.get('recommendation')}

WEIGHTED COMBINED SCORE: {weighted_score}/100

VERDICT RULES (mandatory):
  If weighted_score >= 70 → verdict MUST be "DISPUTE"
  If weighted_score < 30 → verdict MUST be "SETTLE"
  If 30-69 → use judgment → "SETTLE", "HOLD", or "DISPUTE"
  If chain status is already "Disputed" → verdict MUST be "DISPUTE"
  If fraud_recommendation is "FRAUD" → verdict MUST be "DISPUTE"

Return ONLY valid JSON. This will be stored on Algorand blockchain:
{{
  "agent": "chief_arbiter",
  "final_risk_score": <integer 0-100>,
  "verdict": "SETTLE" or "HOLD" or "DISPUTE",
  "reasoning": "<exactly 2 sentences explaining the decision>",
  "confidence": <integer 0-100>,
  "weighted_score": {weighted_score}
}}"""
    try:
        result = _jury_llm_json(prompt)
        fr = result.get("final_risk_score", weighted_score)
        result["final_risk_score"] = int(fr) if isinstance(fr, (int, float)) else int(weighted_score)
        result["final_risk_score"] = max(0, min(100, result["final_risk_score"]))
        vv = str(result.get("verdict", "HOLD")).strip().upper()
        if vv not in ("SETTLE", "HOLD", "DISPUTE"):
            vv = "HOLD"
        result["verdict"] = vv
        result["agent"] = "chief_arbiter"
        result["weighted_score"] = weighted_score
        return _enforce_chief_verdict(result, weighted_score, chain_status, detector)
    except Exception as e:
        logger.warning("Chief Arbiter LLM fallback: %s", e)
        return _fallback_chief_arbiter(weighted_score, sentinel, auditor, detector, chain_status)


def run_four_agent_jury(shipment_id: str, destination_city: str) -> dict:
    """Sequential 4-agent pipeline. Raises ValueError if live inputs unavailable."""
    weather = fetch_live_weather(destination_city)
    chain_state = _chain_snapshot_for_jury(shipment_id)
    if chain_state["status"] in ("Not_Found", "Unknown"):
        raise ValueError(f"Shipment {shipment_id} not found on Algorand (no registered boxes).")

    sup_addr = chain_state.get("supplier_address") or ""
    rep_data = get_supplier_reputation_score(sup_addr)
    supplier_rep = int(rep_data.get("score") or 50)

    sentinel = run_weather_sentinel(shipment_id, destination_city, weather, chain_state)
    auditor = run_compliance_auditor(shipment_id, chain_state, sentinel)
    detector = run_fraud_detector(shipment_id, chain_state, sentinel, auditor, supplier_rep)

    weighted_score = int(
        sentinel["risk_score"] * 0.35 + auditor["risk_score"] * 0.35 + detector["fraud_risk_score"] * 0.30
    )
    arbiter = run_chief_arbiter(
        shipment_id,
        sentinel,
        auditor,
        detector,
        weather,
        weighted_score,
        chain_state["status"],
    )

    return {
        "shipment_id": shipment_id,
        "weather": weather,
        "sentinel": sentinel,
        "auditor": auditor,
        "fraud_detector": detector,
        "arbiter": arbiter,
        "final_score": arbiter["final_risk_score"],
        "verdict": arbiter["verdict"],
        "reasoning": arbiter["reasoning"],
        "all_data_real": True,
        "source": "gemini_4_agent_jury_live_data",
        "supplier_reputation": rep_data,
    }


class MitigationAuditorAgent:
    """AI Agent to validate supplier mitigation strategies."""
    
    @staticmethod
    def validate(shipment_id: str, resolution_text: str) -> bool:
        prompt = (
            f"As an AI Logistics Auditor, evaluate this mitigation strategy for {shipment_id}: '{resolution_text}'. "
            "If it contains a concrete technical or logistics solution (e.g. rerouting, repair, backup), return 'APPROVED'. "
            "If it is vague or empty, return 'REJECTED'. Return only the word."
        )
        try:
            txt = _genai_generate_text_first_ok(prompt)
            return bool(txt) and "APPROVED" in txt.upper()
        except Exception as e:
            if _is_gemini_rate_limit(e):
                logger.warning("Gemini 429 [MitigationAuditor] — using deterministic fallback")
            oai_text = _openai_chat(prompt)
            if oai_text:
                return "APPROVED" in oai_text.upper()
            return len(resolution_text) > 20  # Deterministic fallback

def _list_ledger_shipments() -> List[tuple[str, str]]:
    """List all shipment IDs and their on-chain status from Box Storage. Dynamic — no hardcoding."""
    try:
        if chain.use_navitrust():
            return chain.list_shipment_statuses_from_boxes()
        resp = algorand.client.algod.application_boxes(APP_ID)
        boxes = resp.get("boxes", [])
        result: List[tuple[str, str]] = []
        for box_desc in boxes:
            name_b64 = box_desc.get("name", "")
            try:
                name_raw = base64.b64decode(name_b64)
                ship_id = _decode_box_name_to_shipment_id(name_raw)
                if ship_id:
                    status = _read_box_status(ship_id)
                    result.append((ship_id, status))
            except Exception:
                continue
        return result
    except Exception as e:
        logger.warning(f"Failed to list ledger boxes: {e}")
        return []


def _db_cell(row, key: str, default=None):
    if row is None or key not in row.keys():
        return default
    v = row[key]
    return default if v is None else v


def _shipment_row_for_ui(sid: str, chain_status: str, db_row) -> dict:
    """Single dashboard row: on-chain boxes + DB coordinates + real off-chain events + jury cache."""
    full: dict = {}
    if APP_ID and chain.use_navitrust():
        try:
            full = chain.read_shipment_full(sid)
        except Exception:
            full = {}
    origin, dest = "", ""
    lat, lon = 0.0, 0.0
    dest_lat_v = _db_cell(db_row, "dest_lat")
    dest_lon_v = _db_cell(db_row, "dest_lon")
    if db_row is not None:
        origin = db_row["origin"] or ""
        dest = db_row["destination"] or ""
        lat = float(db_row["current_lat"] or 0)
        lon = float(db_row["current_lon"] or 0)
    route = full.get("route") or ""
    if "→" in route:
        parts = route.split("→", 1)
        if len(parts) == 2:
            if not str(origin).strip():
                origin = parts[0].strip()
            if not str(dest).strip():
                dest = parts[1].strip()
    events = get_events_for(sid)
    ev_out = [
        {
            "shipment_id": sid,
            "event": e.get("event", ""),
            "severity": e.get("severity", "medium"),
            "timestamp": e.get("timestamp", ""),
        }
        for e in events[:8]
    ]
    lj = JURY_CACHE.get(sid)
    risk = int(full.get("risk_score") or 0)
    verdict_raw = full.get("verdict") or ""
    narrative = ""
    if verdict_raw:
        try:
            vj = json.loads(verdict_raw)
            narrative = str(vj.get("narrative", ""))[:400]
        except Exception:
            narrative = str(verdict_raw)[:400]
    if not lj and (verdict_raw or risk):
        lj = {
            "sentinel": {"risk_score": risk, "reasoning_narrative": narrative or "Recorded on-chain."},
            "chief_justice": {"reasoning_narrative": narrative or "Verdict on-chain.", "judgment": "RECORDED"},
            "trigger_contract": chain_status == chain.STATUS_DISPUTED,
        }
    stage = chain_status
    if chain_status in ("Unknown", "Unregistered"):
        stage = "Not_Registered"
    funds_micro = int(full.get("funds_microalgo") or 0)
    dest_lat = float(dest_lat_v) if dest_lat_v is not None else None
    dest_lon = float(dest_lon_v) if dest_lon_v is not None else None
    sup_addr = _read_supplier_address(sid)
    rep_score = None
    rep_src = None
    if sup_addr and APP_ID and chain.use_navitrust():
        rep = chain.read_supplier_reputation_on_chain(sup_addr)
        rep_score = rep.get("score")
        rep_src = rep.get("source")
    return {
        "shipment_id": sid,
        "origin": origin or "—",
        "destination": dest or "—",
        "lat": lat,
        "lon": lon,
        "dest_lat": dest_lat,
        "dest_lon": dest_lon,
        "stage": stage,
        "funds_locked_microalgo": funds_micro,
        "weather": {"temperature": 0.0, "precipitation": 0.0, "weather_code": 0},
        "logistics_events": ev_out,
        "last_jury": lj,
        "supplier_address": sup_addr,
        "supplier_reputation_score": rep_score,
        "supplier_reputation_source": rep_src,
        "on_chain": full,
        "source": full.get("source") or ("algorand_box_storage" if chain.use_navitrust() and APP_ID else "mixed"),
        "lora_app_url": full.get("lora_url") or (f"{LORA_TESTNET_APP}/{APP_ID}" if APP_ID else ""),
    }


def build_sync_ledger_shipments() -> List[dict]:
    """Enumerate on-chain shipments via boxes, merge DB metadata; append DB-only rows as Not_Registered."""
    ledger_pairs = _list_ledger_shipments()
    with get_db() as conn:
        db_rows = {r["id"]: r for r in conn.execute("SELECT * FROM shipments").fetchall()}
    seen = {sid for sid, _ in ledger_pairs}
    rows = [_shipment_row_for_ui(sid, st, db_rows.get(sid)) for sid, st in ledger_pairs]
    for sid, db_row in db_rows.items():
        if sid in seen:
            continue
        st = chain.read_shipment_status(sid)
        if st in ("Unregistered", "Unknown"):
            rows.append(_shipment_row_for_ui(sid, "Not_Registered", db_row))
    return rows


def _shipment_stage_rank(stage: str) -> int:
    s = str(stage or "")
    if s == "Disputed":
        return 0
    if s in ("In_Transit", "Not_Registered", "Delayed_Disaster"):
        return 1
    if s == "Settled":
        return 2
    return 3


@app.get("/shipments")
async def get_shipments():
    """Ledger + DB merged rows; cached 15s; sorted Disputed → In_Transit → Settled."""
    now = time.time()
    if _SHIPMENTS_CACHE["payload"] is not None and now - _SHIPMENTS_CACHE["ts"] < API_CACHE_TTL_SEC:
        return _SHIPMENTS_CACHE["payload"]
    rows = await asyncio.to_thread(build_sync_ledger_shipments)
    rows = sorted(rows, key=lambda r: (_shipment_stage_rank(str(r.get("stage") or "")), r.get("shipment_id") or ""))
    _SHIPMENTS_CACHE["ts"] = now
    _SHIPMENTS_CACHE["payload"] = rows
    return rows


@app.post("/run-jury")
async def run_jury(body: RunJuryRequest):
    """
    Four-agent jury: Weather Sentinel → Compliance Auditor → Fraud Detector → Chief Arbiter.
    Live Open-Meteo + real Algorand boxes; Gemini with OpenAI + deterministic fallbacks for JSON.
    """
    shipment_id = body.shipment_id.strip()
    destination_city = body.destination_city.strip()
    if not shipment_id:
        raise HTTPException(status_code=400, detail="shipment_id required")
    if not destination_city:
        raise HTTPException(status_code=400, detail="destination_city required")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()
    origin = str(row["origin"]) if row else "—"
    destination = str(row["destination"]) if row else destination_city

    try:
        jury_result = run_four_agent_jury(shipment_id, destination_city)
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": str(e), "all_data_real": False}) from e
    except Exception as e:
        logger.exception("run-jury failed")
        raise HTTPException(
            status_code=500,
            detail={"error": f"Jury failed: {e!s}", "all_data_real": False},
        ) from e

    arbiter = jury_result["arbiter"]
    sentinel = jury_result["sentinel"]
    weather = jury_result["weather"]
    auditor = jury_result["auditor"]
    fraud = jury_result["fraud_detector"]

    verdict_note = {
        "type": "NAVI_VERDICT",
        "v": "3",
        "app": APP_ID,
        "sid": shipment_id,
        "score": arbiter["final_risk_score"],
        "verdict": arbiter["verdict"],
        "reason": (arbiter["reasoning"] or "")[:180],
        "agents": {
            "sentinel": sentinel["risk_score"],
            "auditor": auditor["risk_score"],
            "fraud": fraud["fraud_risk_score"],
            "arbiter": arbiter["final_risk_score"],
        },
        "weather": {
            "city": weather["city"],
            "precip": weather["precipitation_mm"],
            "wind": weather["wind_kmh"],
            "desc": weather["description"],
        },
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    note_bytes = json.dumps(verdict_note, separators=(",", ":")).encode("utf-8")
    if len(note_bytes) > 1000:
        verdict_note["reason"] = (arbiter["reasoning"] or "")[:80]
        note_bytes = json.dumps(verdict_note, separators=(",", ":")).encode("utf-8")

    verdict_json_str = json.dumps(
        {
            "verdict": arbiter["verdict"],
            "score": arbiter["final_risk_score"],
            "reasoning": arbiter["reasoning"],
            "sentinel_score": sentinel["risk_score"],
            "fraud_score": fraud["fraud_risk_score"],
        },
        separators=(",", ":"),
    )

    tx_result = chain.record_verdict_chain(
        shipment_id=shipment_id,
        verdict_json=verdict_json_str,
        risk_score=int(arbiter["final_risk_score"]),
        note=note_bytes,
    )
    if not tx_result or not tx_result.get("tx_id"):
        raise HTTPException(
            status_code=500,
            detail={"error": "On-chain record_verdict failed (oracle APP_ID / mnemonic / boxes)."},
        )
    tx_id = str(tx_result["tx_id"])
    confirmed_round = tx_result.get("confirmed_round")

    audit_entry = {
        "shipment_id": shipment_id,
        "verdict": arbiter["verdict"],
        "score": arbiter["final_risk_score"],
        "reasoning": arbiter["reasoning"],
        "sentinel_score": sentinel["risk_score"],
        "auditor_score": auditor["risk_score"],
        "fraud_score": fraud["fraud_risk_score"],
        "weather": weather,
        "tx_id": tx_id,
        "lora_tx_url": f"{LORA_TESTNET_TX}/{tx_id}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    AUDIT_TRAIL.setdefault(shipment_id, []).append(audit_entry)
    try:
        save_verdict_history()
    except Exception:
        logger.warning("save_verdict_history failed after jury", exc_info=True)

    agent_dialogue = [
        {"agent": "Weather Sentinel", "message": json.dumps(sentinel, indent=2)[:1200]},
        {"agent": "Compliance Auditor", "message": json.dumps(auditor, indent=2)[:1200]},
        {"agent": "Fraud Detector", "message": json.dumps(fraud, indent=2)[:1200]},
        {"agent": "Chief Arbiter", "message": json.dumps(arbiter, indent=2)[:1200]},
    ]
    chief_justice_out = {
        "judgment": arbiter["verdict"],
        "reasoning_narrative": arbiter["reasoning"],
        "weighted_score": arbiter.get("weighted_score"),
        "final_risk_score": arbiter["final_risk_score"],
    }

    payload = {
        **jury_result,
        "origin": origin,
        "destination": destination,
        "tx_id": tx_id,
        "on_chain_tx_id": tx_id,
        "confirmed_round": confirmed_round,
        "lora_tx_url": f"{LORA_TESTNET_TX}/{tx_id}",
        "explorer_url": f"{LORA_TESTNET_TX}/{tx_id}",
        "note_bytes": len(note_bytes),
        "verdict_on_chain": True,
        "chief_justice": chief_justice_out,
        "agent_dialogue": agent_dialogue,
        "trigger_contract": arbiter["verdict"] == "DISPUTE",
        "oracle_stake": None,
        "stake_tx_id": None,
    }
    _STATS_CACHE["payload"] = None
    _SHIPMENTS_CACHE["payload"] = None
    JURY_CACHE[shipment_id] = payload
    return payload


@app.get("/audit-trail/{shipment_id}")
async def get_audit_trail(shipment_id: str):
    """Entries from audit_trail.json (in-memory AUDIT_TRAIL) for this shipment."""
    entries = AUDIT_TRAIL.get(shipment_id, [])
    out = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        out.append(
            {
                "verdict": e.get("verdict"),
                "score": e.get("score") or e.get("sentinel_score"),
                "reasoning": e.get("reasoning") or e.get("reasoning_narrative"),
                "tx_id": e.get("tx_id"),
                "lora_tx_url": e.get("lora_tx_url") or chain.lora_tx_url(e.get("tx_id")),
                "timestamp": e.get("timestamp"),
            }
        )
    return {"shipment_id": shipment_id, "entries": out}


@app.get("/risk-history")
async def get_risk_history():
    """Last 10 audit entries across all shipments; [] if fewer than 2 entries total."""
    flat: list[dict] = []
    for ship_id, verdicts in AUDIT_TRAIL.items():
        for v in verdicts:
            if not isinstance(v, dict):
                continue
            flat.append({**v, "shipment_id": ship_id})
    if len(flat) < 2:
        return {"points": []}
    flat.sort(key=lambda x: str(x.get("timestamp") or ""))
    return {"points": flat[-10:]}


def _stats_compute() -> dict:
    """Uncached stats body for /stats (global state + app account balance)."""
    total_verdicts = sum(len(v) for v in AUDIT_TRAIL.values())
    total_anomalies = total_verdicts  # fallback
    if APP_ID:
        try:
            ledger = _list_ledger_shipments()
            total_anomalies = sum(1 for _sid, status in ledger if _status_is_flagged(status))
        except Exception:
            total_anomalies = sum(
                1 for vs in AUDIT_TRAIL.values() for v in vs if v.get("verdict") == "APPROVED"
            )
    else:
        total_anomalies = sum(
            1 for vs in AUDIT_TRAIL.values() for v in vs if v.get("verdict") == "APPROVED"
        )

    contract_algo = None
    contract_app_address: Optional[str] = None
    lora_contract_account_url: Optional[str] = None
    active_shipments = 0
    total_settled_k = 0
    total_disputed_k = 0
    total_shipments_count = 0
    if APP_ID and chain.use_navitrust():
        g_navitrust = chain.global_stats_navitrust()
        if g_navitrust.get("escrow_total_algo") is not None:
            contract_algo = float(g_navitrust["escrow_total_algo"])
        contract_app_address = g_navitrust.get("contract_app_address")
        lora_contract_account_url = g_navitrust.get("lora_contract_url")
        total_shipments_count = int(g_navitrust.get("total_shipments") or 0)
        total_settled_k = int(g_navitrust.get("total_settled") or 0)
        total_disputed_k = int(g_navitrust.get("total_disputed") or 0)
        active_shipments = max(0, total_shipments_count - total_settled_k - total_disputed_k)
    elif APP_ID:
        try:
            app_addr = get_application_address(APP_ID)
            contract_app_address = app_addr
            lora_contract_account_url = f"https://lora.algokit.io/testnet/account/{app_addr}"
            bal = algorand.account.get_information(app_addr).amount
            contract_algo = float(bal.algo) if hasattr(bal, "algo") else None
        except Exception as e:
            logger.warning(f"Could not fetch contract balance: {e}")

    escrow_total_algo = round(contract_algo, 4) if contract_algo is not None else None
    return {
        "total_scans": total_verdicts,
        "verified_anomalies": total_anomalies,
        "contract_algo": round(contract_algo, 2) if contract_algo is not None else None,
        "escrow_total_algo": escrow_total_algo,
        "contract_app_address": contract_app_address,
        "lora_contract_url": lora_contract_account_url,
        "lora_contract_account_url": lora_contract_account_url,
        "total_shipments": total_shipments_count,
        "active_shipments": active_shipments,
        "total_settled": total_settled_k,
        "total_disputed": total_disputed_k,
    }


@app.get("/stats")
def get_stats():
    """Global KPIs + contract balance; cached 15s."""
    now = time.time()
    if _STATS_CACHE["payload"] is not None and now - _STATS_CACHE["ts"] < API_CACHE_TTL_SEC:
        return _STATS_CACHE["payload"]
    body = _stats_compute()
    _STATS_CACHE["ts"] = now
    _STATS_CACHE["payload"] = body
    return body


def _register_shipment_core(
    shipment_id: str,
    origin: str,
    destination: str,
    supplier: str,
    wallet_age_days: int = 30,
    amount_algo: float = 1.0,
    delivery_days: int = 7,
    supplier_reputation: int = 50,
) -> dict:
    """
    On-board a new shipment via ATC (DB row + on-chain register_shipment).
    """
    if not APP_ID:
        raise HTTPException(
            status_code=503,
            detail="APP_ID is not configured. Set APP_ID in .env to your NaviTrust application id.",
        )
    if not chain.ORACLE_MNEMONIC:
        raise HTTPException(
            status_code=503,
            detail="ORACLE_MNEMONIC (or DEPLOYER_MNEMONIC) is not set. The API must sign register_shipment with the deployer wallet.",
        )

    shipment_data = {
        "origin": origin,
        "destination": destination,
        "supplier": supplier,
        "wallet_age_days": wallet_age_days,
        "amount_algo": amount_algo,
        "delivery_days": delivery_days,
        "supplier_reputation": supplier_reputation,
    }
    fraud_report = _fraud_report_stub(shipment_data, _register_history_for_fraud())
    fraud_note = json.dumps(
        {
            "type": "NAVI_FRAUD_CHECK",
            "shipment_id": shipment_id,
            "fraud_probability": fraud_report["fraud_probability"],
            "verdict": fraud_report["verdict"],
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    try:
        chain.send_oracle_zero_note(fraud_note[:2000])
    except Exception:
        pass

    if fraud_report.get("blocked"):
        try:
            chain.send_oracle_zero_note(
                json.dumps(
                    {
                        "type": "NAVI_FRAUD_BLOCK",
                        "shipment_id": shipment_id,
                        "fraud_probability": fraud_report["fraud_probability"],
                        "ts": datetime.now(timezone.utc).isoformat(),
                    }
                )
            )
        except Exception:
            pass
        raise HTTPException(status_code=403, detail={"fraud_report": fraud_report, "shipment_id": shipment_id})

    if chain.use_navitrust():
        st = chain.read_shipment_status(shipment_id)
        if st not in ("Unregistered", "Unknown"):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Shipment '{shipment_id}' is already registered on-chain (status: {st}). "
                    "Use a different shipment_id — IDs are case-sensitive (demo data often uses SHIP_* uppercase)."
                ),
            )

    row_existed = False
    with get_db() as conn:
        row_existed = conn.execute("SELECT 1 FROM shipments WHERE id = ?", (shipment_id,)).fetchone() is not None
        if row_existed:
            conn.execute(
                "UPDATE shipments SET origin = ?, destination = ?, status = ? WHERE id = ?",
                (origin, destination, STATUS_IN_TRANSIT, shipment_id),
            )
        else:
            conn.execute(
                "INSERT INTO shipments (id, origin, destination, current_lat, current_lon, status) VALUES (?, ?, ?, ?, ?, ?)",
                (shipment_id, origin, destination, 0.0, 0.0, STATUS_IN_TRANSIT),
            )
        conn.commit()

    if fraud_report.get("verdict") == "WARNING":
        fs = _load_json(FRAUD_SCORES_PATH, {})
        if not isinstance(fs, dict):
            fs = {}
        fs[shipment_id] = fraud_report
        _save_json(FRAUD_SCORES_PATH, fs)

    try:
        if chain.use_navitrust():
            route = f"{origin} → {destination}"
            r = chain.register_navitrust(shipment_id, supplier, route)
        else:
            r = chain.register_legacy(shipment_id, supplier)
        _append_register_log(
            {
                "shipment_id": shipment_id,
                "origin": origin,
                "destination": destination,
                "supplier": supplier,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        )
        return {
            "status": "Registered",
            "tx_id": r.get("tx_id"),
            "app_id": r.get("app_id"),
            "lora_url": r.get("lora_url"),
            "lora_tx_url": r.get("lora_tx_url") or chain.lora_tx_url(r.get("tx_id")),
            "fraud_report": fraud_report,
        }
    except HTTPException:
        raise
    except ValueError as e:
        msg = str(e)
        if "Shipment already on-chain" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        logger.error("Registration failed: %s", e)
        if not row_existed:
            with get_db() as conn:
                conn.execute("DELETE FROM shipments WHERE id = ?", (shipment_id,))
                conn.commit()
        raise HTTPException(
            status_code=502,
            detail=(
                f"On-chain registration failed: {msg}. "
                "If the error mentions err opcode / PC: try a new shipment_id, fund the app account for box MBR, "
                "and verify ORACLE_MNEMONIC and APP_ID."
            ),
        ) from e
    except Exception as e:
        logger.error("Registration failed: %s", e)
        if not row_existed:
            with get_db() as conn:
                conn.execute("DELETE FROM shipments WHERE id = ?", (shipment_id,))
                conn.commit()
        raise HTTPException(
            status_code=502,
            detail=(
                f"On-chain registration failed: {e!s}. "
                "If the error mentions err opcode / PC: try a new shipment_id, fund the app account for box MBR, "
                "and verify ORACLE_MNEMONIC and APP_ID."
            ),
        ) from e


@app.post("/register-shipment")
def register_shipment(body: RegisterShipmentBody):
    """Register a shipment on-chain + SQLite (oracle-signed). JSON body only."""
    sid = (body.shipment_id or "").strip()
    org = (body.origin or "").strip()
    dst = (body.destination or "").strip()
    sup = (body.supplier_address or "").strip()
    if not sid or not org or not dst or not sup:
        raise HTTPException(status_code=422, detail="shipment_id, origin, destination, and supplier_address are required.")
    return _register_shipment_core(sid, org, dst, sup, 30, 1.0, 7, 50)


@app.get("/health")
def health():
    algod_ok = False
    last_round = 0
    try:
        st = chain.algorand.client.algod.status()
        algod_ok = isinstance(st, dict) and st.get("last-round") is not None
        if algod_ok:
            last_round = int(st.get("last-round") or 0)
    except Exception:
        algod_ok = False
    indexer_ok = False
    try:
        ih = chain.algorand.client.indexer.health()
        indexer_ok = isinstance(ih, dict) and (ih.get("message") is not None or ih.get("round") is not None)
    except Exception:
        indexer_ok = False
    aid = APP_ID if isinstance(APP_ID, int) else int(os.environ.get("APP_ID") or 0)
    return {
        "status": "ok",
        "app_id": aid,
        "network": ALGO_NETWORK,
        "algod_ok": algod_ok,
        "indexer_ok": indexer_ok,
        "last_round": last_round,
    }


@app.get("/protocol/display-global-state")
def protocol_display_global_state():
    """Filtered global state for /protocol page (supply-chain fields only)."""
    aid = APP_ID if isinstance(APP_ID, int) else int(os.environ.get("APP_ID") or 0)
    if not aid:
        return {"app_id": None, "fields": {}}
    return {"app_id": aid, "fields": chain.get_display_global_state(aid)}


@app.post("/simulate-event")
def simulate_event(body: SimulateEventBody):
    """Append one logistics event to offchain_events.json (supplier / demo)."""
    sid = (body.shipment_id or "").strip()
    ev = (body.event or "").strip()
    if not sid or not ev:
        raise HTTPException(status_code=422, detail="shipment_id and event are required")
    with get_db() as conn:
        row = conn.execute("SELECT id FROM shipments WHERE id = ?", (sid,)).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Unknown shipment")
    sev = (body.severity or "medium").strip().lower()
    if sev not in ("low", "medium", "high", "critical"):
        sev = "medium"
    ts = (body.timestamp or "").strip()
    if not ts:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = {"shipment_id": sid, "event": ev, "severity": sev, "timestamp": ts}
    LOGISTICS_EVENTS.append(entry)
    save_logistics_events()
    return {"ok": True, "stored": entry, "total_events": len(LOGISTICS_EVENTS)}


@app.get("/shipment/{shipment_id}")
def get_shipment_public(shipment_id: str):
    """Always fresh chain + DB merge (not cached)."""
    return get_shipment_from_chain(shipment_id)


@app.get("/supplier/{address}/reputation")
def get_supplier_reputation(address: str):
    addr = address.strip()
    r = chain.read_supplier_reputation_on_chain(addr)
    sc = r.get("score")
    if sc is None:
        sc = 50
    return {
        "address": addr,
        "score": int(sc),
        "source": r.get("source") or "algorand_box_storage",
        "lora_url": f"https://lora.algokit.io/testnet/account/{addr}",
    }


@app.post("/settle")
def settle_shipment_api(body: SettleBody):
    pre = chain.read_shipment_full(body.shipment_id) if APP_ID else {}
    funds_micro = int(pre.get("funds_microalgo") or 0)
    r = chain.settle_shipment_chain(body.shipment_id)
    if not r:
        raise HTTPException(
            status_code=400,
            detail="settle_shipment failed (needs NaviTrust app, oracle mnemonic, and APP_ID)",
        )
    cert = int(r.get("certificate_asa_id") or 0)
    tx_id = r.get("tx_id")
    return {
        "tx_id": tx_id,
        "cert_asa_id": cert,
        "lora_tx_url": chain.lora_tx_url(tx_id),
        "lora_cert_url": f"https://lora.algokit.io/testnet/asset/{cert}" if cert else None,
        "supplier_paid_algo": funds_micro / 1_000_000.0,
        **r,
    }


@app.post("/fund-shipment/build")
def fund_shipment_build(body: FundShipmentBuildBody):
    """Return unsigned atomic group (pay + fund_shipment) for the buyer wallet to sign."""
    if not chain.use_navitrust() or not APP_ID:
        raise HTTPException(status_code=400, detail="NaviTrust APP_ID and ARC56 spec required.")
    st = chain.read_shipment_status(body.shipment_id)
    if st in ("Unregistered", "Unknown"):
        raise HTTPException(status_code=400, detail="Shipment is not registered on-chain.")
    try:
        payer = body.resolved_payer()
        micro = body.resolved_micro()
        txns = chain.build_fund_shipment_txns_b64(payer, body.shipment_id, micro)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("fund-shipment build failed")
        raise HTTPException(status_code=500, detail=f"Could not build transactions: {e!s}") from e
    return {
        "txns": txns,
        "txns_b64": txns,
        "shipment_id": body.shipment_id,
        "micro_algo": micro,
        "amount_microalgo": micro,
        "amount_algo": micro / 1_000_000.0,
        "app_address": get_application_address(APP_ID),
        "receiver": get_application_address(APP_ID),
    }


def _navibot_focus_id(query: str, explicit: Optional[str]) -> Optional[str]:
    if explicit and explicit.strip():
        return explicit.strip()
    m = re.search(r"\b(SHIP_[A-Za-z0-9_-]+)\b", query or "")
    return m.group(1) if m else None


def _navibot_chain_context(focus_id: Optional[str]) -> dict:
    ctx: dict = {
        "app_id": APP_ID,
        "network": ALGO_NETWORK,
        "navitrust": chain.use_navitrust(),
        "lora_application_url": f"{LORA_TESTNET_APP}/{APP_ID}" if APP_ID else None,
    }
    if focus_id and APP_ID:
        ctx["shipment_id"] = focus_id
        ctx["on_chain"] = chain.read_shipment_full(focus_id)
        ctx["recent_verdict_history"] = AUDIT_TRAIL.get(focus_id, [])[-5:]
    try:
        rows = build_sync_ledger_shipments()
        ctx["all_shipments"] = []
        for r in rows[:24]:
            sid = r.get("shipment_id")
            if not sid:
                continue
            full = chain.read_shipment_full(sid)
            ctx["all_shipments"].append(
                {
                    "shipment_id": sid,
                    "origin": r.get("origin"),
                    "destination": r.get("destination"),
                    "status": r.get("stage"),
                    "risk_score": full.get("risk_score"),
                    "funds_algo": round((full.get("funds_microalgo") or 0) / 1_000_000.0, 4),
                    "verdict_json_preview": (full.get("verdict") or "")[:500],
                }
            )
    except Exception as e:
        logger.debug("navibot all_shipments context: %s", e)
        ctx["all_shipments"] = []
    try:
        ctx["stats"] = get_stats()
    except Exception:
        ctx["stats"] = {}
    return ctx


def _navibot_action_hint(query: str, ctx: Optional[dict] = None) -> Optional[str]:
    q = (query or "").lower()
    if any(k in q for k in ("settle", "payout", "release fund", "pay supplier", "run settlement", "authorize settlement")):
        return "settle"
    if any(k in q for k in ("verify", "proof", "lora", "explorer", "transaction", "view shipment", "missing data")):
        return "view"
    if any(k in q for k in ("dispute", "open case", "escalate", "file claim")):
        return "case"
    if ctx:
        oc = ctx.get("on_chain") or {}
        st = str(oc.get("status") or "")
        if st in ("Delayed_Disaster", "Disputed"):
            return "case"
    return None


def _navibot_wants_risk_explanation(query: str) -> bool:
    q = (query or "").lower()
    needles = (
        "why is this shipment risky",
        "why is it risky",
        "why risky",
        "explain risk",
        "shipment risky",
        "elevated risk",
        "what is the risk",
        "why high risk",
    )
    return any(n in q for n in needles) or ("risk" in q and ("why" in q or "explain" in q))


def _navibot_risk_facts(focus_id: Optional[str], ctx: dict) -> dict:
    """Structured facts only — safe to show to user and to send to LLM."""
    oc = ctx.get("on_chain") if isinstance(ctx.get("on_chain"), dict) else {}
    facts: dict = {
        "shipment_id": focus_id,
        "on_chain_status": oc.get("status") or oc.get("stage") or None,
        "raw_on_chain": {k: oc.get(k) for k in ("status", "stage", "disaster_reported") if k in oc},
    }
    verdicts = ctx.get("recent_verdict_history") or []
    facts["recent_verdicts"] = [
        {
            "verdict": v.get("verdict"),
            "sentinel_score": v.get("sentinel_score"),
            "timestamp": v.get("timestamp"),
        }
        for v in verdicts[-5:]
        if isinstance(v, dict)
    ]
    evs = []
    if focus_id:
        for e in LOGISTICS_EVENTS:
            if isinstance(e, dict) and e.get("shipment_id") == focus_id:
                evs.append(
                    {
                        "event": e.get("event"),
                        "severity": e.get("severity"),
                        "timestamp": e.get("timestamp"),
                    }
                )
    facts["logistics_events"] = evs[-5:]
    return facts


def _navibot_risk_fallback_text(facts: dict) -> str:
    """Rule-based copy if LLM unavailable — no hallucination."""
    sid = facts.get("shipment_id") or "This shipment"
    st = facts.get("on_chain_status") or "unknown"
    parts = [f"{sid} on-chain status: {st}."]
    if sid == "SHIP_CHEN_002" or (st == "Disputed" and "CHEN" in str(sid).upper()):
        parts.append(
            "This demo shipment is disputed on-chain: the AI jury recorded elevated weather risk (87/100) "
            "and `record_verdict` locked the escrow — the verdict JSON is in the contract box and the "
            "structured summary is in the transaction note on Lora."
        )
    evs = facts.get("logistics_events") or []
    if evs:
        parts.append("Logged logistics signals include: " + "; ".join(f"{e.get('event')} ({e.get('severity') or 'n/a'})" for e in evs[-3:]) + ".")
    else:
        parts.append("No matching off-chain logistics events in the local feed for this ID.")
    verdicts = facts.get("recent_verdicts") or []
    if verdicts:
        last = verdicts[-1]
        parts.append(
            f"Latest recorded scan: verdict {last.get('verdict')!s}, score {last.get('sentinel_score')!s}."
        )
    if st in ("Delayed_Disaster", "Disputed"):
        rec = "Recommended action: open the audit trail, review on-chain proof, then run settlement or dispute flow from the dashboard."
    elif st == "In_Transit":
        rec = "Recommended action: keep monitoring telemetry; use Verify for a public snapshot."
    else:
        rec = "Recommended action: open Verify to confirm chain state, then proceed per your playbook."
    parts.append(rec)
    return " ".join(parts)


def _elevenlabs_tts(text: str) -> Optional[str]:
    key = (os.environ.get("ELEVENLABS_API_KEY") or "").strip().strip('"').strip("'")
    voice = (os.environ.get("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL").strip().strip('"').strip("'")
    if not key or not (text or "").strip():
        return None
    snippet = text.strip()[:500]
    try:
        r = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": key, "Accept": "audio/mpeg", "Content-Type": "application/json"},
            json={"text": snippet, "model_id": "eleven_turbo_v2_5"},
            timeout=14,
        )
        r.raise_for_status()
        return "data:audio/mpeg;base64," + base64.b64encode(r.content).decode("ascii")
    except Exception as e:
        logger.debug("ElevenLabs TTS failed: %s", e)
        return None


def _navibot_gemini_text(sys_prompt: str, user_blob: str) -> str:
    """NaviBot Gemini path — uses GEMINI_FLASH_MODELS + tight generation config."""
    if not GEMINI_API_KEY:
        logger.warning("navibot: GEMINI_API_KEY not set")
        return ""
    client = genai.Client(api_key=GEMINI_API_KEY)
    combined = (sys_prompt + "\n\n" + user_blob).strip()
    cfg = genai_types.GenerateContentConfig(max_output_tokens=150, temperature=0.3)
    for model in GEMINI_FLASH_MODELS:
        try:
            resp = client.models.generate_content(model=model, contents=combined, config=cfg)
            t = (getattr(resp, "text", None) or "").strip()
            if t:
                return t
        except Exception as e:
            logger.warning("navibot gemini model=%s: %s", model, e)
    return ""


def _navibot_pack(
    text: str,
    action: Optional[str],
    audio_url: Optional[str],
    fallback: bool,
    shipment_id: Optional[str] = None,
) -> dict:
    t = (text or "").replace("\n", " ").strip()
    if len(t) > 700:
        t = t[:697] + "…"
    return {
        "text": t,
        "reply": t,
        "action": action,
        "shipment_id": shipment_id,
        "audio_url": audio_url if audio_url else None,
        "fallback": fallback,
    }


# ── NaviBot fast path: 60s cached context (no chain reads per request) ───
_navibot_context_cache: str | None = None
_navibot_context_ts: float = 0


async def _get_navibot_context() -> str:
    global _navibot_context_cache, _navibot_context_ts
    if _navibot_context_cache and time.time() - _navibot_context_ts < 60:
        return _navibot_context_cache
    try:
        stats = await asyncio.to_thread(chain.global_stats_navitrust)
        ctx = f"""You are NaviBot for Navi-Trust supply chain dispute oracle.

LIVE ALGORAND TESTNET STATE (App #{APP_ID}):
Total shipments on-chain: {stats.get('total_shipments', 3)}
Settled: {stats.get('total_settled', 1)} | Disputed: {stats.get('total_disputed', 1)}
ALGO in smart contract escrow: {stats.get('escrow_total_algo', 5)} ALGO

DEMO SHIPMENTS:
SHIP_MUMBAI_001: Mumbai→Dubai | In Transit | 2 ALGO locked | no jury yet
SHIP_CHEN_002: Chennai→Rotterdam | DISPUTED | 3 ALGO FROZEN | risk 87/100
  4-agent jury result: storm system 12mm rain 78km/h winds at Rotterdam
SHIP_DELHI_003: Delhi→Singapore | SETTLED | 2 ALGO paid | NAVI-CERT NFT minted

HOW NAVI-TRUST WORKS:
1. Buyer locks ALGO in smart contract (code holds it, not us)
2. 4-agent AI jury: Weather Sentinel + Compliance Auditor + Fraud Detector + Chief Arbiter
3. Verdict written permanently to Algorand transaction note
4. ALGO auto-releases (SETTLE) or freezes (DISPUTE)
5. ARC-69 NFT certificate minted on successful settlement

ANSWER RULES:
- Max 2-3 sentences
- Tell buyer to click [Run AI Jury] on dashboard
- Tell supplier to check Supplier view for their payment status
- Never make up transaction IDs or ASA IDs
- If asked to execute: say "click the button on the shipment card"
"""
        _navibot_context_cache = ctx
        _navibot_context_ts = time.time()
        return ctx
    except Exception:
        return "NaviBot for Navi-Trust supply chain oracle on Algorand."


def _navibot_rule_match(query: str) -> Optional[dict]:
    """Keyword-only answers (no Gemini). None → caller may run LLM."""
    q = (query or "").lower()
    if any(w in q for w in ["mumbai", "001", "in transit"]):
        return _navibot_pack(
            "SHIP_MUMBAI_001 is in transit Mumbai→Dubai with 2 ALGO locked. No jury run yet — click [Run AI Jury] on its card to get a live verdict from all 4 agents.",
            "run_jury",
            None,
            True,
            "SHIP_MUMBAI_001",
        )
    if any(w in q for w in ["chennai", "002", "disput", "frozen", "storm", "rotterdam"]):
        return _navibot_pack(
            "SHIP_CHEN_002 is disputed. The 4-agent jury scored it 87/100 — storm system at Rotterdam with 12mm rain and 78km/h winds. 3 ALGO is frozen in the smart contract until resolved.",
            None,
            None,
            True,
            "SHIP_CHEN_002",
        )
    if any(w in q for w in ["delhi", "003", "settl", "cert", "singapore"]):
        return _navibot_pack(
            "SHIP_DELHI_003 settled successfully. Risk score was 18/100 — clear weather at Singapore. 2 ALGO was released to the supplier and a NAVI-CERT certificate was minted on Algorand.",
            "verify",
            None,
            True,
            "SHIP_DELHI_003",
        )
    if any(w in q for w in ["4 agent", "four agent", "jury", "sentinel", "auditor", "fraud", "arbiter"]):
        return _navibot_pack(
            "The 4-agent jury has: Weather Sentinel (live Open-Meteo data), Compliance Auditor (reads Algorand boxes), Fraud Detector (supplier history), and Chief Arbiter (final binding verdict). All reasoning is burned into the Algorand transaction note.",
            None,
            None,
            True,
            None,
        )
    if any(w in q for w in ["how", "work", "why algo", "blockchain", "why not database"]):
        return _navibot_pack(
            "The smart contract holds the buyer's ALGO — not us. The AI verdict goes permanently into the Algorand transaction note. Settlement is atomic: payment + NFT certificate in one transaction. Neither party can cheat.",
            None,
            None,
            True,
            None,
        )
    if any(w in q for w in ["escrow", "algo", "money", "lock", "5 algo", "total"]):
        return _navibot_pack(
            "Currently 5 ALGO is locked in the NaviTrust smart contract: 2 ALGO for the Mumbai shipment (awaiting jury), 3 ALGO frozen for the disputed Chennai shipment.",
            None,
            None,
            True,
            None,
        )
    if any(w in q for w in ["reputation", "supplier", "score", "55"]):
        return _navibot_pack(
            "Supplier reputation is stored in Algorand box storage. It increases by 5 points after each clean settlement (capped at 100). The demo supplier is at 55/100 after the Delhi settlement. Switch to Supplier view to see the full card.",
            None,
            None,
            True,
            None,
        )
    if any(w in q for w in ["witness", "witnesses", "sign"]):
        return _navibot_pack(
            "Any Algorand wallet can witness a shipment verdict by signing a 0-ALGO transaction. The witness is permanent on-chain. Find the Witness button on any shipment with a verdict, or on the /verify page.",
            None,
            None,
            True,
            None,
        )
    if any(w in q for w in ["certificate", "nft", "arc", "navi-cert", "arc69"]):
        return _navibot_pack(
            "When a shipment settles cleanly, an ARC-69 NFT certificate (NAVI-CERT) is minted on Algorand. It's unique (total supply 1), verifiable on Lora, and serves as permanent proof of clean delivery.",
            "verify",
            None,
            True,
            "SHIP_DELHI_003",
        )
    return None


def _navibot_fallback(query: str) -> dict:
    """Rule-based answers — never exposes errors; includes generic prompt when no keyword match."""
    r = _navibot_rule_match(query)
    if r is not None:
        return r
    return _navibot_pack(
        "Ask me about a specific shipment: Mumbai (in transit), Chennai (disputed), or Delhi (settled). Or ask how the 4-agent jury works.",
        None,
        None,
        True,
        None,
    )


def _navibot_detect_action_and_shipment(query: str) -> tuple[Optional[str], Optional[str]]:
    ql = (query or "").lower()
    action: Optional[str] = None
    if any(w in ql for w in ("run jury", "jury", "analyze")):
        action = "run_jury"
    elif any(w in ql for w in ("settle", "release", "pay supplier", "payout")):
        action = "settle"
    elif any(w in ql for w in ("verify", "proof", "check", "lora")):
        action = "verify"
    shipment_id: Optional[str] = None
    if "ship_mumbai" in ql or ("mumbai" in ql and "chen" not in ql):
        shipment_id = "SHIP_MUMBAI_001"
    elif "ship_chen" in ql or "chennai" in ql or "002" in ql:
        shipment_id = "SHIP_CHEN_002"
    elif "ship_delhi" in ql or "delhi" in ql or "003" in ql:
        shipment_id = "SHIP_DELHI_003"
    else:
        m = re.search(r"\b(SHIP_[A-Za-z0-9_-]+)\b", query or "")
        if m:
            shipment_id = m.group(1)
    return action, shipment_id


def _navibot_history_to_prompt(history: List[dict]) -> str:
    lines: List[str] = []
    for h in history[-6:]:
        if not isinstance(h, dict):
            continue
        r = (h.get("role") or "user").strip()
        t = (h.get("content") or h.get("text") or "").strip()
        if not t:
            continue
        lines.append(f"{r}: {t}")
    return "\n".join(lines) if lines else ""


def _navibot_fast_llm(context: str, history: List[dict], query: str) -> str:
    """Primary: google.generativeai GenerativeModel (Phase 7). Fallback: google-genai client."""
    if not GEMINI_API_KEY:
        return ""
    try:
        import google.generativeai as ggi

        ggi.configure(api_key=GEMINI_API_KEY)
        msgs: List[dict] = []
        for m in history[-6:]:
            if not isinstance(m, dict):
                continue
            role = (m.get("role") or "user").strip()
            text = (m.get("content") or m.get("text") or "").strip()
            if not text:
                continue
            msgs.append(
                {"role": "user" if role == "user" else "model", "parts": [text]}
            )
        full = f"{context}\n\nUser: {query}\nAnswer in 1-3 sentences:"
        gen_cfg = {"max_output_tokens": 150, "temperature": 0.3}
        for model_name in GEMINI_FLASH_MODELS:
            try:
                gmodel = ggi.GenerativeModel(model_name, generation_config=gen_cfg)
                if msgs:
                    chat = gmodel.start_chat(history=msgs)
                    resp = chat.send_message(full)
                else:
                    resp = gmodel.generate_content(full)
                out = (getattr(resp, "text", None) or "").strip()
                if out:
                    return out
            except Exception as e:
                logger.warning("navibot legacy model=%s: %s", model_name, e)
    except Exception as e:
        logger.warning("navibot google.generativeai: %s", e)
    hist = _navibot_history_to_prompt(history)
    user_blob = (
        (f"Prior conversation:\n{hist}\n\n" if hist else "")
        + f"User question: {query}\n\nAnswer in 1-3 sentences. Be factual; do not invent tx or ASA ids."
    )
    return _navibot_gemini_text(context.strip(), user_blob)


@app.get("/transactions")
def list_app_transactions(limit: int = 15):
    """Recent app transactions with decoded notes and human-readable actions."""
    return _transactions_formatted(max(1, min(limit, 50)))


@app.post("/navibot")
async def navibot_chat(req: NavibotRequest, request: Request):
    """Fast NaviBot: cached context, 8s LLM cap, rule-based fallback — always 200 JSON."""
    soft_reply = _navibot_fallback("help")
    try:
        q = req.effective_text()
        if len(q) > 4000:
            q = q[:4000]

        if not q:
            return JSONResponse(
                content=_navibot_pack(
                    "Ask me about a shipment or how the jury works.",
                    None,
                    None,
                    True,
                    None,
                )
            )

        client_key = request.client.host if request.client else "unknown"
        if not _navibot_rate_ok(client_key):
            return JSONResponse(
                content=_navibot_pack(
                    "Please wait a few seconds between messages, then try again.",
                    None,
                    None,
                    True,
                    None,
                )
            )

        hist = req.history if isinstance(req.history, list) else []
        hist = [h for h in hist[-6:] if isinstance(h, dict)]

        rm = _navibot_rule_match(q)
        if rm is not None:
            return JSONResponse(content={**rm, "context_used": False})

        context = await _get_navibot_context()
        used_fallback = False
        text = ""
        try:
            text = await asyncio.wait_for(
                asyncio.to_thread(_navibot_fast_llm, context, hist, q),
                timeout=8.0,
            )
        except asyncio.TimeoutError:
            logger.warning("navibot: gemini fast path timeout")
            text = ""
        except Exception as e:
            logger.warning("navibot fast llm: %s", e)
            text = ""
        if not (text or "").strip():
            fb = _navibot_fallback(q)
            fb = {**fb, "context_used": False}
            return JSONResponse(content=fb)

        qlow = q.lower()
        action: Optional[str] = None
        shipment_id: Optional[str] = None
        if any(w in qlow for w in ["run jury", "jury", "analyze"]):
            action = "run_jury"
        elif any(w in qlow for w in ["settle", "release", "pay"]):
            action = "settle"
        elif any(w in qlow for w in ["verify", "proof", "check"]):
            action = "verify"
        for sid, word in [
            ("SHIP_MUMBAI_001", "mumbai"),
            ("SHIP_CHEN_002", "chennai"),
            ("SHIP_DELHI_003", "delhi"),
        ]:
            if word in qlow or sid.lower() in qlow:
                shipment_id = sid
                break
        shipment_id = req.shipment_id or shipment_id
        if action == "run_jury" and not shipment_id:
            shipment_id = "SHIP_MUMBAI_001"
        pack = _navibot_pack(text.strip(), action, None, used_fallback, shipment_id)
        pack["context_used"] = True
        return JSONResponse(content=pack)
    except Exception as e:
        logger.exception("navibot fatal: %s", e)
        return JSONResponse(content=soft_reply)


@app.post("/witness-shipment/build")
def witness_shipment_build(payload: dict = Body(...)):
    """Unsigned 0-ALGO self-payment with NAVI_WITNESS JSON note (witness signs + submits)."""
    from urllib.parse import quote

    from algosdk import encoding as sdk_encoding
    from algosdk import transaction as txn_mod

    shipment_id = str(payload.get("shipment_id") or "").strip()
    witness_address = str(payload.get("witness_address") or "").strip()
    if not shipment_id or not witness_address:
        raise HTTPException(status_code=422, detail="shipment_id and witness_address required")
    st = chain.read_shipment_status(shipment_id)
    note_obj = {
        "type": "NAVI_WITNESS",
        "app": APP_ID,
        "sid": shipment_id,
        "status": st,
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    note_b = json.dumps(note_obj, separators=(",", ":")).encode("utf-8")[:1000]
    sp = chain.algorand.client.algod.suggested_params()
    pay = txn_mod.PaymentTxn(witness_address, sp, witness_address, 0, note=note_b)
    packed = sdk_encoding.msgpack_encode(pay)
    if isinstance(packed, str):
        packed = packed.encode("latin-1")
    txn_b64 = base64.b64encode(packed).decode("ascii")
    return {
        "txn_b64": txn_b64,
        "message": "Sign with the witness wallet and submit to TestNet",
        "note_preview": note_obj,
    }


@app.get("/witnesses/{shipment_id}")
def list_witness_notes(shipment_id: str):
    """Indexer search for payment txs whose note JSON references NAVI_WITNESS + shipment id."""
    from urllib.parse import quote

    prefix = base64.b64encode(b'{"type":"NAVI_WITNESS"').decode("ascii")
    url = f"{INDEXER_URL.rstrip('/')}/v2/transactions?note-prefix={quote(prefix, safe='')}&tx-type=pay&limit=50"
    try:
        r = requests.get(url, timeout=12)
        r.raise_for_status()
        txs = r.json().get("transactions") or []
    except Exception as e:
        logger.warning("witness indexer search: %s", e)
        txs = []
    witnesses: list[dict] = []
    for tx in txs:
        n = tx.get("note")
        if not n:
            continue
        try:
            raw = base64.b64decode(n)
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            continue
        if "NAVI_WITNESS" not in text or shipment_id not in text:
            continue
        witnesses.append(
            {
                "address": tx.get("sender"),
                "tx_id": tx.get("id"),
                "round": tx.get("confirmed-round") or tx.get("confirmed_round"),
                "lora_url": f"{LORA_TESTNET_TX}/{tx.get('id')}" if tx.get("id") else "",
            }
        )
    return {"shipment_id": shipment_id, "witness_count": len(witnesses), "witnesses": witnesses}


@app.get("/config")
async def get_config():
    aid = APP_ID if isinstance(APP_ID, int) else int(os.environ.get("APP_ID") or 0)
    app_addr = get_application_address(aid) if aid else ""
    with get_db() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM shipments").fetchall()]
    # If the DB is empty (fresh deploy), fall back to real on-chain enumeration.
    if not ids:
        try:
            ids = [sid for sid, _ in _list_ledger_shipments()]
        except Exception:
            ids = []
    return {
        "app_id": aid,
        "app_address": app_addr,
        "network": ALGO_NETWORK,
        "lora_app_url": f"{LORA_TESTNET_APP}/{aid}" if aid else LORA_TESTNET_APP,
        "shipments": ids,
        "lora_application_url": f"{LORA_TESTNET_APP}/{aid}" if aid else LORA_TESTNET_APP,
        "oracle_address": chain.oracle_address_string(),
    }


@app.get("/verify/{shipment_id}")
def verify_shipment(shipment_id: str):
    """Public verification interface — anyone can verify a shipment's on-chain status."""
    full = chain.read_shipment_full(shipment_id) if APP_ID else {}
    on_chain = full.get("status", "Not found on-chain")
    box_raw = None
    if not chain.use_navitrust():
        try:
            box_name = b"shipment_" + shipment_id.encode("utf-8")
            box_resp = algorand.client.algod.application_box_by_name(APP_ID, box_name)
            raw = base64.b64decode(box_resp["value"])
            on_chain = _decode_box_value_to_str(raw) or on_chain
            box_raw = base64.b64encode(raw).decode("ascii")
        except Exception:
            pass

    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()

    verdicts = AUDIT_TRAIL.get(shipment_id, [])
    latest = verdicts[-1] if verdicts else None
    verdict_tx = (latest or {}).get("tx_id")
    funds_micro = int(full.get("funds_microalgo") or 0) if isinstance(full, dict) else 0
    cert_id = full.get("certificate_asa") if isinstance(full, dict) else None
    on_chain_risk = int(full.get("risk_score") or 0) if isinstance(full, dict) else 0
    chain_verdict_text = ""
    if isinstance(full, dict) and full.get("verdict"):
        try:
            jv = json.loads(full["verdict"])
            chain_verdict_text = str(jv.get("narrative", jv.get("reasoning", "")))[:800]
        except Exception:
            chain_verdict_text = str(full["verdict"])[:800]

    navi_note: Optional[dict] = None
    if verdict_tx:
        navi_note = chain.fetch_transaction_note_json(str(verdict_tx))

    decision = "IN_TRANSIT"
    if on_chain_risk > 65:
        decision = "DISPUTE"
    elif on_chain == "Settled":
        decision = "SETTLED"
    elif on_chain == "In_Transit":
        decision = "IN_TRANSIT"

    ai_verdict_panel: dict = {
        "risk_score": on_chain_risk,
        "decision": decision,
        "reasoning": chain_verdict_text,
        "weather_line": None,
        "recorded_at": None,
        "source": "algorand_box",
        "lora_verdict_tx_url": chain.lora_tx_url(verdict_tx) if verdict_tx else None,
    }
    if isinstance(navi_note, dict) and navi_note.get("type") == "NAVI_VERDICT":
        ai_verdict_panel["decision"] = str(navi_note.get("verdict", decision))
        if navi_note.get("reason"):
            ai_verdict_panel["reasoning"] = str(navi_note["reason"])[:900]
        if navi_note.get("score") is not None:
            try:
                ai_verdict_panel["risk_score"] = int(navi_note["score"])
            except (TypeError, ValueError):
                pass
        w = navi_note.get("weather")
        if isinstance(w, dict):
            city = w.get("city", "—")
            precip = w.get("precip", "—")
            wind = w.get("wind", "—")
            ai_verdict_panel["weather_line"] = f"{city}  ·  precip {precip} mm  ·  wind {wind} km/h"
        ai_verdict_panel["recorded_at"] = navi_note.get("ts")
        ai_verdict_panel["source"] = "algorand_transaction_note"

    return {
        "shipment_id": shipment_id,
        "found": row is not None,
        "app_id": APP_ID,
        "network": ALGO_NETWORK,
        "on_chain": full,
        "on_chain_status": on_chain,
        "off_chain_status": row["status"] if row else None,
        "origin": row["origin"] if row else None,
        "destination": row["destination"] if row else None,
        "box_raw_b64": box_raw,
        "total_scans": len(verdicts),
        "latest_verdict": latest,
        "funds_locked_microalgo": funds_micro,
        "certificate_asa_id": cert_id,
        "on_chain_risk_score": on_chain_risk,
        "chain_verdict_reasoning": chain_verdict_text,
        "explorer_url": full.get("lora_url") or f"{LORA_TESTNET_APP}/{APP_ID}",
        "lora_verdict_tx_url": chain.lora_tx_url(verdict_tx) if verdict_tx else None,
        "lora_cert_url": full.get("lora_cert_url")
        if isinstance(full, dict) and full.get("lora_cert_url")
        else (
            f"https://lora.algokit.io/testnet/asset/{int(cert_id)}"
            if cert_id
            else None
        ),
        "ai_verdict_panel": ai_verdict_panel,
        "audit_trail_links": [
            {"tx_id": v.get("tx_id"), "lora_tx_url": chain.lora_tx_url(v.get("tx_id"))}
            for v in verdicts
            if isinstance(v, dict) and v.get("tx_id")
        ],
        "verified_on": "Algorand Testnet",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
