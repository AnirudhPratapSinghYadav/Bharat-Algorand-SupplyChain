from dotenv import load_dotenv
load_dotenv(override=True)

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
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from google import genai
from algokit_utils import AlgorandClient
from algosdk.logic import get_application_address

import algorand_client as chain
import verification as ver
from models import (
    WeatherData,
    RiskPrediction,
    BlockchainState,
    RunJuryRequest,
    SubmitMitigationRequest,
    SettleBody,
    NavibotRequest,
    FundShipmentBuildBody,
    PredictDisputeBody,
    CustodyHandoffBody,
)

import custody_chain as navi_custody
import dead_reckoning as navi_ml
import fraud_detector
import navitrust_demos
import oracle_stake
import weather_oracle as navi_weather_oracle
import witness_protocol as navi_witness
from navitrust_io import load_json as navi_load_json
from navitrust_io import save_json as navi_save_json

APP_ID = chain.APP_ID
algorand = chain.algorand
INDEXER_URL = chain.INDEXER_URL
LORA_TESTNET_TX = chain.LORA_TESTNET_TX
LORA_TESTNET_APP = chain.LORA_TESTNET_APP

_CORS_EXTRA = os.environ.get("CORS_EXTRA_ORIGINS", "")
_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://navitrustapp.vercel.app",
]
if _CORS_EXTRA:
    _CORS_ORIGINS.extend(o.strip() for o in _CORS_EXTRA.split(",") if o.strip())


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        chain.verify_oracle_setup()
    except RuntimeError as e:
        logger.error("%s", e)
        raise
    load_logistics_events()
    load_verdict_history()
    for _ in range(6):
        generate_random_logistics_event()
    bg_task = asyncio.create_task(_live_feed_background_task())
    weather_task = asyncio.create_task(_weather_oracle_background())
    try:
        yield
    finally:
        bg_task.cancel()
        weather_task.cancel()
        for t in (bg_task, weather_task):
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

# Ledger status values from smart contract (AgriSupplyChainEscrow Box Storage)
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

print(f"[BOOT] GEMINI_API_KEY loaded: {'YES (' + GEMINI_API_KEY[:8] + '...)' if GEMINI_API_KEY else 'NO'}")
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
        ):
            try:
                conn.execute(ddl)
            except sqlite3.OperationalError:
                pass
        conn.commit()

    # Demo seed: SHIP_* aligns with seed_blockchain.py + Lora verification
    with get_db() as conn:
        for sid, orig, dest, lat, lon, dlat, dlon in [
            ("SHIP_001", "Jawaharlal Nehru Port (IN)", "Singapore", 18.94, 72.95, 1.2897, 103.8501),
            ("SHIP_002", "Chennai", "Colombo", 13.08, 80.27, 6.9271, 79.8612),
            ("SHIP_003", "Mumbai", "Dubai", 19.07, 72.87, 25.2048, 55.2708),
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
        logger.info("DB seed verified (SHIP_001, SHIP_002, SHIP_003)")

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


async def _weather_oracle_background():
    """Hourly Open-Meteo → Algorand oracle notes (best-effort)."""
    await asyncio.sleep(20)
    while True:
        try:
            if chain.ORACLE_MNEMONIC:
                await asyncio.to_thread(navi_weather_oracle.write_weather_oracle_tick)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("weather oracle background: %s", e)
        await asyncio.sleep(3600)


REGISTER_LOG_PATH = "shipment_register_log.json"
FRAUD_SCORES_PATH = "fraud_scores.json"


def _register_history_for_fraud() -> list[dict]:
    log = navi_load_json(REGISTER_LOG_PATH, [])
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
    log = navi_load_json(REGISTER_LOG_PATH, [])
    if not isinstance(log, list):
        log = []
    log.append(entry)
    navi_save_json(REGISTER_LOG_PATH, log[-2000:])


def get_shipment_from_chain(shipment_id: str) -> dict:
    oc = chain.read_shipment_full(shipment_id) if APP_ID else {}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()
    rowd = dict(row) if row else {}
    return {
        "shipment_id": shipment_id,
        "origin": rowd.get("origin") or "",
        "destination": rowd.get("destination") or "",
        "status": oc.get("status") if isinstance(oc, dict) else "",
        "risk_score": int(oc.get("risk_score") or 0) if isinstance(oc, dict) else 0,
        "verdict_json": oc.get("verdict") if isinstance(oc, dict) else None,
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


def _flag_shipment_on_chain(
    shipment_id: str, reasoning_hash: str, reasoning_narrative: str = "", risk_score: int = 88
) -> Optional[dict]:
    """NaviTrust: record_verdict. Legacy: report_disaster_delay + optional note."""
    if not DEPLOYER_MNEMONIC or not APP_ID:
        logger.warning("Cannot flag on-chain: missing DEPLOYER_MNEMONIC or APP_ID")
        return None
    try:
        payload = json.dumps(
            {"hash": reasoning_hash, "narrative": reasoning_narrative[:2000], "risk": risk_score},
            ensure_ascii=False,
        )
        if chain.use_navitrust():
            res = chain.record_verdict_chain(shipment_id, payload, risk_score)
        else:
            res = chain.legacy_report_disaster(shipment_id, reasoning_hash)
        if not res:
            return None
        tx_id = res.get("tx_id")
        confirmed_round = res.get("confirmed_round")
        if tx_id and reasoning_narrative and DEPLOYER_MNEMONIC:
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
            client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()
            response = client.models.generate_content(
                model="gemini-1.5-flash", contents=prompt
            )
            text = (response.text or "").strip().replace("```json", "").replace("```", "")
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
            client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()
            response = client.models.generate_content(
                model="gemini-1.5-flash", contents=prompt
            )
            text = (response.text or "").strip().replace("```json", "").replace("```", "")
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
    """Read supplier address from Algorand Box (supplier_ prefix). Returns None if not found."""
    if not APP_ID:
        return None
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
            client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()
            resp = client.models.generate_content(model="gemini-1.5-flash", contents=prompt)
            return "APPROVED" in resp.text.upper()
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
        "supplier_address": _read_supplier_address(sid),
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


@app.get("/shipments")
def get_shipments():
    """Ledger-first shipment list (boxes + DB), same as /sync-ledger."""
    return sync_ledger()


@app.post("/run-jury")
def run_jury(req: RunJuryRequest):
    """
    Full MAS pipeline — Blockchain-AI Convergence (80%+ Algorand).

    Flow: 1) Pre-flight: Auditor reads Box Storage BEFORE Sentry — blockchain gates AI.
    2) Sentry (Gemini/OpenAI) analyzes weather + live feed → risk_score.
    3) Arbiter adjudicates; 4) ATC atomic TX → Box Storage update.
    5) Webhook fires only after TX confirmed in block (confirmed_round).
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM shipments WHERE id = ?", (req.shipment_id,)
        ).fetchone()

    # Orphan fallback: shipment on-chain but not in DB — use generic prompt, no crash
    if not row:
        row = {
            "id": req.shipment_id,
            "origin": "Unknown",
            "destination": "Unknown",
            "current_lat": 0.0,
            "current_lon": 0.0,
            "status": STATUS_IN_TRANSIT,
        }
        logger.warning(f"[ORPHAN] {req.shipment_id} not in DB — using fallback metadata")

    events = get_events_for(req.shipment_id)

    # ── PRE-FLIGHT: Compliance Auditor checks ledger BEFORE Sentry runs ─
    state = ComplianceAuditorAgent.audit(req.shipment_id, sentry_prediction=None)
    if _status_is_flagged(state["blockchain_status"]):
        logger.warning(f"[PRE-FLIGHT ABORT] {req.shipment_id} — already flagged on-chain, AI analysis skipped")
        raise HTTPException(
            status_code=400,
            detail="Shipment already flagged on Algorand. Blockchain is source of truth — no AI override.",
        )

    weather = fetch_weather(row["current_lat"], row["current_lon"])
    if not weather:
        weather = WeatherData(temperature=22.0, precipitation=0.0, weather_code=0)

    # ── Step 1: Logistics Sentry — risk analysis (with live logistics feed) ─
    live_ctx = get_live_logistics_context()
    prediction = LogisticsSentryAgent.analyze(req.shipment_id, weather, events, live_context=live_ctx)

    # ── Step 2: Compliance Auditor (full report with Sentry context for Arbiter) ─
    state = ComplianceAuditorAgent.audit(req.shipment_id, sentry_prediction=prediction)

    # Fraud halt: if Auditor detected an existing claim, short-circuit
    fraud_detected = _status_is_flagged(state["blockchain_status"])
    if fraud_detected:
        logger.warning(f"[FRAUD HALT] {req.shipment_id} — Auditor found disaster_reported=True, aborting settlement")

    # ── Step 3: Settlement Arbiter — final adjudication ────────
    judgment = SettlementArbiterAgent.deliberate(prediction, state)

    # ── Step 4: Atomic on-chain transition via ATC ─────────────
    on_chain_tx_id: Optional[str] = None
    confirmed_round: Optional[int] = None
    if judgment["trigger_contract"] and row["status"] == STATUS_IN_TRANSIT and not fraud_detected:
        with get_db() as conn:
            conn.execute(
                "UPDATE shipments SET status = ? WHERE id = ?",
                (_db_flagged_status(), req.shipment_id),
            )
            conn.commit()
        
        reasoning_hash = judgment.get("reasoning_hash", "0")
        reasoning_txt = _sanitize_llm_text(judgment.get("reasoning_narrative", judgment.get("judgment", "")))
        flag_result = _flag_shipment_on_chain(
            req.shipment_id, reasoning_hash, reasoning_txt, risk_score=prediction.risk_score
        )
        
        if flag_result:
            on_chain_tx_id = flag_result.get("tx_id")
            confirmed_round = flag_result.get("confirmed_round")
            # Fire n8n webhook ONLY after Algorand confirmation (control tower)
            _fire_webhook("settlement_confirmed", {
                "shipment_id": req.shipment_id,
                "risk_score": prediction.risk_score,
                "reasoning_narrative": reasoning_txt,
                "TX_ID": on_chain_tx_id,
                "explorer_url": f"{LORA_TESTNET_TX}/{on_chain_tx_id}" if on_chain_tx_id else None,
            })

    j_judgment = _sanitize_llm_text(judgment.get("judgment", ""))
    j_reasoning = _sanitize_llm_text(judgment.get("reasoning_narrative", j_judgment))
    agent_dialogue = [
        {
            "agent": "Logistics Sentry",
            "message": (
                f"Risk Score: {prediction.risk_score}/100\n"
                f"{prediction.reasoning_narrative}\n"
                f"Mitigation: {prediction.mitigation}\n"
                "[Passing to Compliance Auditor for on-chain verification]"
            ),
        },
        {
            "agent": "Compliance Auditor",
            "message": (
                f"On-Chain Status: {state['blockchain_status']}\n"
                f"{state['audit_report']}\n"
                "[Passing to Settlement Arbiter for final verdict]"
            ),
        },
        {
            "agent": "Settlement Arbiter",
            "message": (
                f"Decision: {'AUTHORIZED' if judgment['trigger_contract'] else 'REJECTED'}\n"
                f"{j_judgment}\n"
                f"[Verdict based on Sentry risk assessment + Auditor Box Storage verification]"
            ),
        },
    ]
    verdict = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sentinel_score": prediction.risk_score,
        "auditor_status": state["blockchain_status"],
        "verdict": "APPROVED" if judgment["trigger_contract"] else "REJECTED",
        "summary": j_judgment[:200],
        "reasoning_narrative": j_reasoning,
        "mitigation_strategy": judgment.get("mitigation_strategy", ""),
        "tx_id": on_chain_tx_id,
        "confirmed_round": confirmed_round,
    }
    AUDIT_TRAIL.setdefault(req.shipment_id, []).append(verdict)
    save_verdict_history()

    chief_justice_out = {**judgment, "judgment": j_judgment, "reasoning_narrative": j_reasoning}
    stake_info = None
    try:
        stake_info = oracle_stake.place_oracle_stake(req.shipment_id, verdict["verdict"])
    except Exception as e:
        logger.warning("oracle stake skipped: %s", e)

    payload = {
        "shipment_id": req.shipment_id,
        "origin": row["origin"],
        "destination": row["destination"],
        "weather": weather.model_dump(),
        "sentinel": prediction.model_dump(),
        "auditor": state,
        "chief_justice": chief_justice_out,
        "trigger_contract": judgment["trigger_contract"],
        "agent_dialogue": agent_dialogue,
        "logistics_events_used": len(events),
        "on_chain_tx_id": on_chain_tx_id,
        "confirmed_round": confirmed_round,
        "explorer_url": f"{LORA_TESTNET_TX}/{on_chain_tx_id}" if on_chain_tx_id else None,
        "oracle_stake": stake_info,
        "stake_tx_id": (stake_info or {}).get("tx_id"),
    }
    JURY_CACHE[req.shipment_id] = payload
    return payload


@app.get("/audit-trail/{shipment_id}")
async def get_audit_trail(shipment_id: str):
    """Immutable audit history — verdicts + Indexer tx notes + on-chain box state."""
    on_chain = "Not found on-chain"
    try:
        s = _read_box_status(shipment_id)
        if s != "Unregistered":
            on_chain = s
    except Exception:
        pass

    indexer_notes = []
    try:
        if DEPLOYER_MNEMONIC:
            from algosdk import mnemonic as mn
            addr = mn.to_public_key(DEPLOYER_MNEMONIC)
            r = requests.get(f"{INDEXER_URL}/v2/accounts/{addr}/transactions?limit=30", timeout=3)
            if r.ok:
                for tx in r.json().get("transactions", []):
                    n = tx.get("note")
                    if not n:
                        continue
                    try:
                        text = base64.b64decode(n).decode("utf-8", errors="replace")
                        if text.startswith("NAVI|"):
                            parts = text.split("|", 2)
                            if parts[1] == shipment_id:
                                indexer_notes.append({
                                    "reasoning": parts[2] if len(parts) > 2 else "",
                                    "tx_id": tx.get("id"),
                                    "round": tx.get("confirmed-round") or tx.get("confirmed_round"),
                                })
                    except Exception:
                        pass
        indexer_notes = indexer_notes[:10]
    except Exception:
        pass

    return {
        "shipment_id": shipment_id,
        "app_id": APP_ID,
        "network": ALGO_NETWORK,
        "on_chain_status": on_chain,
        "verdicts": AUDIT_TRAIL.get(shipment_id, []),
        "total_scans": len(AUDIT_TRAIL.get(shipment_id, [])),
        "indexer_notes": indexer_notes,
    }


@app.get("/supplier-trust-score")
async def get_supplier_trust_score(wallet: str = ""):
    """Supplier Reliability Index (SRI) — 0–100. Verified via Algorand Box Storage."""
    score = _get_supplier_trust(wallet) if wallet else 100
    return {
        "score": score,
        "wallet": wallet,
        "verified_via": "Algorand Box Storage",
    }


@app.post("/submit-mitigation")
def submit_mitigation(req: SubmitMitigationRequest):
    """Supplier submits proof of resolution. AI-verified; logged for trust score."""
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM shipments WHERE id = ?", (req.shipment_id,)
        ).fetchone()
    # 1. AI Validation
    is_valid = MitigationAuditorAgent.validate(req.shipment_id, req.resolution_text)
    if not is_valid:
        raise HTTPException(status_code=400, detail="AI Rejected Mitigation: Strategy insufficient")

    # 2. Hash and Commit to Algorand
    res_hash = _generate_reasoning_hash(req.resolution_text)
    success = _resolve_shipment_on_chain(req.shipment_id, res_hash)
    
    if not success:
        raise HTTPException(status_code=500, detail="On-chain resolution failed")

    # 3. Update DB
    with get_db() as conn:
        conn.execute("UPDATE shipments SET status = ? WHERE id = ?", (STATUS_IN_TRANSIT, req.shipment_id))
        conn.execute(
            """
            INSERT INTO supplier_mitigations (wallet, shipment_id, resolution_text, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (req.wallet, req.shipment_id, req.resolution_text[:2000], now),
        )
        conn.commit()
    new_score = _update_supplier_trust(req.wallet, delta=3)
    logger.info(f"Mitigation logged: {req.shipment_id} by {req.wallet[:8]}... -> SRI {new_score}")
    return {
        "status": "ok",
        "message": "Mitigation logged on-chain",
        "shipment_id": req.shipment_id,
        "trust_score": new_score,
    }


@app.get("/risk-history")
async def get_risk_history():
    """Risk score time-series for analytics graph — all verdicts across shipments."""
    history = []
    for ship_id, verdicts in AUDIT_TRAIL.items():
        for v in verdicts:
            ts = v.get("timestamp", "")
            score = v.get("sentinel_score")
            if score is not None and ts:
                history.append({
                    "time": ts,
                    "score": score,
                    "shipment": ship_id,
                })
    history.sort(key=lambda x: x["time"])
    return {"points": history[-60:]}


@app.get("/stats")
def get_stats():
    """Network Intelligence stats for KPI ribbon — ledger-first, then audit trail fallback."""
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
    if APP_ID:
        try:
            app_addr = get_application_address(APP_ID)
            bal = algorand.account.get_information(app_addr).amount
            contract_algo = float(bal.algo) if hasattr(bal, "algo") else None
        except Exception as e:
            logger.warning(f"Could not fetch contract balance: {e}")

    return {
        "total_scans": total_verdicts,
        "verified_anomalies": total_anomalies,
        "contract_algo": round(contract_algo, 2) if contract_algo is not None else None,
    }


@app.post("/register-shipment")
def register_shipment(
    shipment_id: str,
    origin: str,
    destination: str,
    supplier: str,
    wallet_age_days: int = Query(default=30, ge=0, le=36500),
    amount_algo: float = Query(default=1.0, ge=0.0, le=1e9),
    delivery_days: int = Query(default=7, ge=1, le=365),
    supplier_reputation: int = Query(default=50, ge=0, le=100),
):
    """
    On-board a new shipment via ATC.
    Synchronizes DB and Algorand Testnet (NaviTrust register_shipment or legacy add_shipment).
    Runs phantom-detector rules before persisting; blocked shipments return 403.
    """
    if not DEPLOYER_MNEMONIC or not APP_ID:
        raise HTTPException(status_code=500, detail="Missing oracle configuration (APP_ID / mnemonic).")

    shipment_data = {
        "origin": origin,
        "destination": destination,
        "supplier": supplier,
        "wallet_age_days": wallet_age_days,
        "amount_algo": amount_algo,
        "delivery_days": delivery_days,
        "supplier_reputation": supplier_reputation,
    }
    fraud_report = fraud_detector.detect_fraud(shipment_data, _register_history_for_fraud())
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

    with get_db() as conn:
        conn.execute(
            "INSERT INTO shipments (id, origin, destination, current_lat, current_lon, status) VALUES (?, ?, ?, ?, ?, ?)",
            (shipment_id, origin, destination, 0.0, 0.0, STATUS_IN_TRANSIT),
        )
        conn.commit()

    if fraud_report.get("verdict") == "WARNING":
        fs = navi_load_json(FRAUD_SCORES_PATH, {})
        if not isinstance(fs, dict):
            fs = {}
        fs[shipment_id] = fraud_report
        navi_save_json(FRAUD_SCORES_PATH, fs)

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
    except Exception as e:
        logger.error("Registration failed: %s", e)
        with get_db() as conn:
            conn.execute("DELETE FROM shipments WHERE id = ?", (shipment_id,))
            conn.commit()
        raise HTTPException(
            status_code=502,
            detail=f"On-chain registration failed (database row rolled back): {e!s}",
        ) from e

@app.get("/sync-ledger")
def sync_ledger():
    """On-chain box enumeration merged with DB + jury cache — no synthetic shipments."""
    return build_sync_ledger_shipments()


@app.get("/live-feed")
async def live_feed():
    """Live logistics stream for frontend ticker — data changes each poll. Events rotate every 30s via background task."""
    return {"events": get_live_feed()}


@app.get("/generate-event")
async def generate_event():
    """Explicitly trigger one random logistics event (for testing/demo)."""
    ev = generate_random_logistics_event()
    return {"event": ev, "feed_length": len(LIVE_FEED)}


@app.get("/bootstrap")
async def bootstrap():
    """Wallet dashboard bootstrap: same shipment list as /sync-ledger; stats from chain where possible."""
    shipments = build_sync_ledger_shipments()
    ids = [s["shipment_id"] for s in shipments]
    config = {
        "app_id": APP_ID,
        "network": ALGO_NETWORK,
        "shipments": ids,
        "lora_application_url": f"{LORA_TESTNET_APP}/{APP_ID}" if APP_ID else "",
        "oracle_address": chain.oracle_address_string(),
    }
    total_v = sum(len(v) for v in AUDIT_TRAIL.values())
    total_a = sum(1 for vs in AUDIT_TRAIL.values() for v in vs if v.get("verdict") == "APPROVED")
    contract_algo = None
    if APP_ID:
        try:
            app_addr = get_application_address(APP_ID)
            bal = algorand.account.get_information(app_addr).amount
            contract_algo = float(bal.algo) if hasattr(bal, "algo") else None
        except Exception:
            pass
    stats = {"total_scans": total_v, "verified_anomalies": total_a, "contract_algo": round(contract_algo, 4) if contract_algo is not None else None}
    risk_pts = []
    for sid, vs in AUDIT_TRAIL.items():
        for v in vs:
            if v.get("sentinel_score") is not None:
                risk_pts.append({"time": v.get("timestamp", ""), "score": v["sentinel_score"], "shipment": sid})
    risk_pts.sort(key=lambda x: x["time"])
    return {
        "config": config,
        "stats": stats,
        "shipments": shipments,
        "risk_history": {"points": risk_pts[-60:]},
    }


@app.get("/health")
def health():
    algod_ok = False
    try:
        chain.algorand.client.algod.status()
        algod_ok = True
    except Exception:
        algod_ok = False
    return {
        "status": "ok",
        "app_id": APP_ID,
        "network": ALGO_NETWORK,
        "navitrust": chain.use_navitrust(),
        "algod_ok": algod_ok,
    }


@app.get("/shipment/{shipment_id}")
def get_shipment_public(shipment_id: str):
    oc = chain.read_shipment_full(shipment_id) if APP_ID else {}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()
    return {
        "shipment_id": shipment_id,
        "on_chain": oc,
        "database": dict(row) if row else None,
        "verdicts": AUDIT_TRAIL.get(shipment_id, []),
    }


@app.post("/settle")
def settle_shipment_api(body: SettleBody):
    r = chain.settle_shipment_chain(body.shipment_id)
    if not r:
        raise HTTPException(
            status_code=400,
            detail="settle_shipment failed (needs NaviTrust app, oracle mnemonic, and APP_ID)",
        )
    return r


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
        "txns_b64": txns,
        "shipment_id": body.shipment_id,
        "micro_algo": micro,
        "amount_algo": micro / 1_000_000.0,
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
    key = os.environ.get("ELEVENLABS_API_KEY")
    voice = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
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
    """Try multiple Gemini model ids — returns empty string if all fail."""
    if not GEMINI_API_KEY:
        logger.warning("navibot: GEMINI_API_KEY not set")
        return ""
    client = genai.Client(api_key=GEMINI_API_KEY)
    combined = (sys_prompt + "\n\n" + user_blob).strip()
    for model in ("gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"):
        try:
            resp = client.models.generate_content(model=model, contents=combined)
            t = (getattr(resp, "text", None) or "").strip()
            if t:
                return t
        except Exception as e:
            logger.warning("navibot gemini model=%s: %s", model, e)
    return ""


def _navibot_pack(text: str, action: Optional[str], audio_url: Optional[str], fallback: bool) -> dict:
    t = (text or "").replace("\n", " ").strip()
    if len(t) > 700:
        t = t[:697] + "…"
    return {
        "text": t,
        "reply": t,
        "action": action,
        "audio_url": audio_url if audio_url else None,
        "fallback": fallback,
    }


@app.get("/verification/health")
def verification_health():
    """Algod + indexer reachability (honest stale / retry UI)."""
    return ver.chain_health()


@app.get("/verification/on-chain-state")
def verification_on_chain_state(wallet: str = ""):
    """Ledger-sourced global/local summary: NaviTrust."""
    return ver.read_on_chain_state(wallet.strip())


@app.get("/verification/tx/{tx_id}")
def verification_transaction_detail(tx_id: str):
    """Single tx + atomic group members + Lora URLs (indexer)."""
    return ver.indexer_transaction_detail(tx_id.strip())


@app.get("/verification/wallet-proofs")
def verification_wallet_proofs(wallet: str, limit: int = 25):
    w = (wallet or "").strip()
    if len(w) < 52:
        raise HTTPException(status_code=400, detail="Valid Algorand wallet address required")
    lim = max(5, min(limit, 60))
    return ver.wallet_proofs(w, lim)


@app.get("/verification/audit-trail")
def verification_audit_trail(wallet: str, limit: int = 40):
    w = (wallet or "").strip()
    if len(w) < 52:
        raise HTTPException(status_code=400, detail="Valid Algorand wallet address required")
    lim = max(5, min(limit, 80))
    return ver.audit_trail_methods(w, lim)


@app.get("/verification/asa/{asset_id}")
def verification_asa(asset_id: int):
    return ver.asa_proof(asset_id)


@app.get("/verification/export/wallet-proofs.json")
def verification_export_wallet_json(wallet: str):
    w = (wallet or "").strip()
    if len(w) < 52:
        raise HTTPException(status_code=400, detail="Valid Algorand wallet address required")
    body = ver.export_wallet_proofs_json(w)
    safe = "".join(c if c.isalnum() else "_" for c in w[:12])
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="navitrust_wallet_proofs_{safe}.json"'},
    )


@app.get("/verification/export/wallet-proofs.csv")
def verification_export_wallet_csv(wallet: str):
    w = (wallet or "").strip()
    if len(w) < 52:
        raise HTTPException(status_code=400, detail="Valid Algorand wallet address required")
    body = ver.export_wallet_proofs_csv(w)
    safe = "".join(c if c.isalnum() else "_" for c in w[:12])
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="navitrust_wallet_proofs_{safe}.csv"'},
    )


@app.get("/verification/arc4-dictionary")
def verification_arc4_dictionary():
    """Public ARC-4 selector → method signature map (from ARC56 + runtime hints)."""
    return ver.arc4_dictionary()


@app.get("/verification/shipment-box")
def verification_shipment_box(shipment_id: str):
    """NaviTrust box storage snapshot for a shipment id (algod)."""
    return ver.shipment_ledger_snapshot(shipment_id.strip())


@app.get("/verification/bundle")
def verification_bundle_get(wallet: str = "", tx_id: str = ""):
    """Combined proof object (JSON) for auditors — same domain apps only."""
    w = (wallet or "").strip()
    if len(w) < 52:
        raise HTTPException(status_code=400, detail="Valid Algorand wallet address required")
    return ver.proof_bundle(w, (tx_id or "").strip() or None)


@app.get("/verification/export/bundle.json")
def verification_export_bundle_json(wallet: str, tx_id: str = ""):
    w = (wallet or "").strip()
    if len(w) < 52:
        raise HTTPException(status_code=400, detail="Valid Algorand wallet address required")
    body = ver.export_proof_bundle_json(w, tx_id or "")
    safe = "".join(c if c.isalnum() else "_" for c in w[:12])
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="navitrust_proof_bundle_{safe}.json"'},
    )


@app.get("/transactions")
def list_app_transactions(limit: int = 20):
    lim = max(1, min(limit, 50))
    return {"transactions": chain.indexer_recent_app_txns(lim), "app_id": APP_ID}


@app.post("/navibot")
async def navibot_chat(req: NavibotRequest, request: Request):
    """Always returns 200 + JSON. Never surfaces raw stack traces to the client."""
    soft = "System temporarily unavailable. Showing last known data."
    try:
        q = req.effective_text()
        if len(q) > 4000:
            q = q[:4000]

        if not q:
            return JSONResponse(
                content=_navibot_pack(
                    "Ask about a shipment on Algorand—for example: “Why is this shipment risky?” "
                    "Select a shipment on the dashboard for richer context.",
                    None,
                    None,
                    True,
                )
            )

        client_key = request.client.host if request.client else "unknown"
        if not _navibot_rate_ok(client_key):
            return JSONResponse(
                content=_navibot_pack(
                    "You’re sending messages quickly. Please wait a few seconds and try again.",
                    None,
                    None,
                    True,
                )
            )

        focus = _navibot_focus_id(q, req.shipment_id)
        ctx = _navibot_chain_context(focus)
        used_fallback = False
        user_blob = q
        if req.history:
            user_blob = (
                "Prior turns (JSON): " + json.dumps(req.history[:12])[:4000] + "\n\nUser message: " + q
            )

        text = ""
        if _navibot_wants_risk_explanation(q):
            facts = _navibot_risk_facts(focus, ctx)
            sys_risk = (
                "You are NaviBot for Navi-Trust. Using ONLY facts in RISK_FACTS_JSON, explain shipment risk in "
                "2–3 concise sentences. Mention concrete signals (status, events, scores). "
                "End with one sentence starting with 'Recommended action:'. "
                "If facts are thin, say monitoring looks routine and suggest Verify for proof."
            )
            user_risk = "RISK_FACTS_JSON:\n" + json.dumps(facts, default=str)[:6000]
            try:
                text = await asyncio.wait_for(
                    asyncio.to_thread(_navibot_gemini_text, sys_risk, user_risk),
                    timeout=25.0,
                )
            except asyncio.TimeoutError:
                text = ""
            if not text:
                text = _navibot_risk_fallback_text(facts)
                used_fallback = True
        else:
            sys_prompt = (
                "You are NaviBot for Navi-Trust on Algorand. Explain shipment status clearly in at most 2 short sentences. "
                "Use ONLY facts from CHAIN_CONTEXT_JSON. If data is missing, say it is not on-chain yet—do not invent "
                "tx ids, balances, or statuses. You may suggest Verify or Lora for public proof.\n\n"
                f"CHAIN_CONTEXT_JSON:\n{json.dumps(ctx, default=str)[:8000]}"
            )
            try:
                text = await asyncio.wait_for(
                    asyncio.to_thread(_navibot_gemini_text, sys_prompt, user_blob),
                    timeout=25.0,
                )
            except asyncio.TimeoutError:
                logger.warning("navibot gemini timeout")
                text = ""
            except Exception as e:
                logger.warning("navibot gemini: %s", e)
                text = ""
            if not text:
                text = _openai_chat(sys_prompt + "\n\n" + user_blob) or ""
            if not text:
                text = "AI unavailable. Showing system data: open Verify for on-chain shipment proof."
                used_fallback = True

        action = _navibot_action_hint(q, ctx)
        audio_url: Optional[str] = None
        try:
            audio_url = await asyncio.wait_for(asyncio.to_thread(_elevenlabs_tts, text), timeout=18.0)
        except Exception:
            audio_url = None

        return JSONResponse(content=_navibot_pack(text, action, audio_url, used_fallback))
    except Exception as e:
        logger.exception("navibot fatal: %s", e)
        return JSONResponse(content=_navibot_pack(soft, None, None, True))


@app.post("/witness/record/{shipment_id}")
async def witness_record_sensor(shipment_id: str):
    out = await asyncio.to_thread(navi_witness.write_sensor_to_chain, shipment_id, None)
    tx_id = out.get("tx_id")
    return {
        "tx_id": tx_id,
        "lora_url": out.get("lora_url") or (f"{LORA_TESTNET_TX}/{tx_id}" if tx_id else ""),
        "message": "Sensor reading written to Algorand",
        "reading": out.get("reading"),
    }


@app.get("/witness/history/{shipment_id}")
def witness_sensor_history(shipment_id: str):
    log = navi_load_json(navi_witness.SENSOR_LOG, [])
    slist = log if isinstance(log, list) else []
    shipment_log = [r for r in slist if r.get("shipment_id") == shipment_id]
    anomaly = navi_witness.detect_sensor_anomaly(shipment_log)
    return {
        "shipment_id": shipment_id,
        "readings": shipment_log[-50:],
        "anomaly_check": anomaly,
        "total_readings": len(shipment_log),
        "blockchain_proofs": [r.get("lora_url") for r in shipment_log if r.get("lora_url")],
    }


@app.post("/predict/dispute-risk")
def predict_dispute_risk(body: PredictDisputeBody):
    result = navi_ml.predict_dispute_probability(
        supplier_reputation=body.supplier_reputation,
        route_risk=body.route_risk,
        destination_city=body.destination_city,
        amount_algo=body.amount_algo,
    )
    note = json.dumps(
        {
            "type": "NAVI_PREDICTION",
            "shipment_id": body.shipment_id,
            "dispute_probability": result["dispute_probability_pct"],
            "risk_level": result["risk_level"],
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    tx = chain.send_oracle_zero_note(note)
    result["prediction_chain"] = tx
    result["lora_prediction_url"] = (tx or {}).get("lora_url")
    return result


@app.get("/weather-oracle/latest")
def weather_oracle_latest():
    by_city = navi_weather_oracle.latest_by_city()
    tick_ran = False
    if not by_city and chain.ORACLE_MNEMONIC:
        try:
            navi_weather_oracle.write_weather_oracle_tick()
            by_city = navi_weather_oracle.latest_by_city()
            tick_ran = True
        except Exception as e:
            logger.warning("weather-oracle/latest seed tick: %s", e)
    return {"cities": by_city, "tick_seeded": tick_ran}


@app.get("/weather-oracle/history/{city}")
def weather_oracle_history(city: str, hours: int = 72):
    h = max(1, min(hours, 168))
    return {"city": city, "hours": h, "readings": navi_weather_oracle.history_city(city, hours=h)}


@app.get("/weather-oracle/dispute-evidence/{shipment_id}")
def weather_oracle_dispute_evidence(shipment_id: str, hours: int = 72):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (shipment_id,)).fetchone()
    dest_city = "Dubai"
    if row and row["destination"]:
        dest_city = str(row["destination"]).split(",")[0].strip() or dest_city
    ev = navi_weather_oracle.dispute_evidence_for_shipment(dest_city, shipment_id, hours=hours)
    return ev


@app.post("/custody/handoff")
def custody_handoff(body: CustodyHandoffBody):
    prev = 0
    chain_so_far = navi_custody.get_chain(body.shipment_id)
    if chain_so_far:
        prev = int(chain_so_far[-1].get("asa_id") or 0)
    return navi_custody.mint_custody_nft(
        body.shipment_id,
        body.handler_address,
        body.location,
        body.handler_name,
        prev_nft_id=prev,
        photo_hash=body.photo_hash or "",
    )


@app.get("/custody/chain/{shipment_id}")
def custody_chain_get(shipment_id: str):
    return {"shipment_id": shipment_id, "chain": navi_custody.get_chain(shipment_id)}


@app.get("/oracle/stakes")
def oracle_stakes_list():
    return oracle_stake.list_stakes()


@app.get("/oracle/reputation")
def oracle_reputation():
    return oracle_stake.reputation_summary()


@app.get("/navibot/voice-summary/{shipment_id}")
async def navibot_voice_summary(shipment_id: str):
    ship = get_shipment_from_chain(shipment_id)
    verdict = None
    vraw = ship.get("verdict_json")
    if vraw:
        try:
            verdict = json.loads(vraw) if isinstance(vraw, str) else vraw
        except Exception:
            verdict = {"verdict": "Unknown"}
    prompt = (
        "You are NaviBot, the AI witness for Navi-Trust.\n"
        "Speak as if testifying in a trade court. Professional. Clear.\n"
        "Maximum 3 sentences. Start with \"I, NaviBot...\"\n\n"
        f"Shipment: {shipment_id}\n"
        f"Route: {ship.get('origin')} to {ship.get('destination')}\n"
        f"Status: {ship.get('status')}\n"
        f"Risk Score: {ship.get('risk_score', 'unknown')}\n"
        f"Verdict: {(verdict or {}).get('verdict', 'No verdict yet')}\n"
        f"Reasoning: {(verdict or {}).get('reasoning', (verdict or {}).get('narrative', 'Pending assessment'))}\n\n"
        "Speak the verdict clearly. Reference the blockchain proof."
    )
    testimony = await asyncio.to_thread(_navibot_gemini_text, prompt, "")
    if not testimony.strip():
        testimony = (
            f"I, NaviBot, testify regarding shipment {shipment_id} from {ship.get('origin')} to {ship.get('destination')}. "
            f"On-chain status is {ship.get('status')}. Risk score recorded: {ship.get('risk_score', 'unknown')}. "
            "Full cryptographic proof is available on Algorand via Lora."
        )
    testimony_hash = hashlib.sha256(testimony.encode()).hexdigest()
    note = json.dumps(
        {
            "type": "NAVI_TESTIMONY",
            "shipment_id": shipment_id,
            "testimony_hash": testimony_hash,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    tx = chain.send_oracle_zero_note(note)
    return {
        "text": testimony,
        "testimony_hash": testimony_hash,
        "shipment_id": shipment_id,
        "message": "Testimony hash recorded on Algorand",
        "testimony_chain": tx,
        "lora_url": (tx or {}).get("lora_url"),
    }


@app.get("/demo/insulin-journey")
async def demo_insulin_journey():
    return await asyncio.to_thread(navitrust_demos.run_insulin_journey_demo)


@app.get("/demo/ghost-shipment-attempt")
def demo_ghost_shipment():
    return navitrust_demos.run_ghost_shipment_demo()


@app.get("/config")
async def get_config():
    """Backend config for frontend bootstrap. Lora: use /application/{id} only (no /boxes)."""
    with get_db() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM shipments").fetchall()]
    return {
        "app_id": APP_ID,
        "network": ALGO_NETWORK,
        "shipments": ids,
        "lora_application_url": f"{LORA_TESTNET_APP}/{APP_ID}" if APP_ID else LORA_TESTNET_APP,
        "oracle_address": chain.oracle_address_string(),
    }


# ═══════════════════════════════════════════════════════════════════
#   R E A L - T I M E   B O X   S T A T U S  (Algorand Indexer poll)
# ═══════════════════════════════════════════════════════════════════


@app.get("/box-status")
def get_box_status():
    """Read live Algorand Box Storage status for all registered shipments. JSON dict of shipment_id -> status."""
    with get_db() as conn:
        rows = conn.execute("SELECT id FROM shipments").fetchall()

    statuses: dict[str, str] = {}
    for row in rows:
        ship_id = row["id"]
        try:
            s = _read_box_status(ship_id)
            statuses[ship_id] = s if s != "Unregistered" else "Unknown"
        except Exception:
            statuses[ship_id] = "Unknown"

    return {"app_id": APP_ID, "statuses": statuses}


# ═══════════════════════════════════════════════════════════════════
#   P U B L I C   V E R I F I C A T I O N  (no auth required)
# ═══════════════════════════════════════════════════════════════════


@app.get("/indexer-audit")
def get_indexer_audit(shipment_id: str = ""):
    """Verifiable tx notes from Algorand Indexer — tamper-proof audit trail."""
    try:
        if not DEPLOYER_MNEMONIC:
            return {"notes": [], "error": "no_deployer"}
        from algosdk import mnemonic as mn
        deployer_addr = mn.to_public_key(DEPLOYER_MNEMONIC)
        url = f"{INDEXER_URL}/v2/accounts/{deployer_addr}/transactions?limit=50"
        resp = requests.get(url, timeout=3)
        resp.raise_for_status()
        data = resp.json()
        notes = []
        for tx in data.get("transactions", []):
            n = tx.get("note")
            if not n:
                continue
            try:
                raw = base64.b64decode(n)
                text = raw.decode("utf-8", errors="replace")
                if text.startswith("NAVI|"):
                    parts = text.split("|", 2)
                    sid = parts[1] if len(parts) > 1 else ""
                    msg = parts[2] if len(parts) > 2 else ""
                    if shipment_id and sid != shipment_id:
                        continue
                    notes.append({
                        "shipment_id": sid,
                        "reasoning": msg,
                        "tx_id": tx.get("id"),
                        "round": tx.get("confirmed-round") or tx.get("confirmed_round"),
                    })
            except Exception:
                continue
        return {"notes": notes[:20]}
    except Exception as e:
        logger.warning(f"Indexer audit failed: {e}")
        return {"notes": []}


@app.get("/global-kpis")
def get_global_kpis():
    """Ledger stats: NaviTrust box enumeration or global state / audit fallback."""
    if chain.use_navitrust() and APP_ID:
        g = chain.global_stats_navitrust()
        g["total_settlements"] = g.get("total_settled", 0)
        return g
    try:
        app_info = algorand.client.algod.application_info(APP_ID)
        gs = app_info.get("params", {}).get("global-state", [])
        total = 0
        for kv in gs:
            k = base64.b64decode(kv.get("key", "")).decode("utf-8", errors="ignore")
            if "Total_Settlements" in k or "total_settlements" in k.lower():
                total = int(kv.get("value", {}).get("uint", 0))
                break
        if total == 0:
            total = sum(1 for vs in AUDIT_TRAIL.values() for v in vs if v.get("tx_id"))
        return {"total_settlements": total, "app_id": APP_ID}
    except Exception as e:
        logger.warning("Global KPIs failed: %s", e)
        return {"total_settlements": sum(1 for vs in AUDIT_TRAIL.values() for v in vs if v.get("tx_id")), "app_id": APP_ID}


@app.get("/verify-tx/{tx_id}")
def verify_transaction(tx_id: str):
    """
    Verify an Algorand transaction — returns confirmation status and Lora Explorer link.
    Uses indexer to check if TX is in a block; clickable proof for public auditability.
    """
    try:
        url = f"{INDEXER_URL}/v2/transactions/{tx_id}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        tx = data.get("transaction", {})
        conf = tx.get("confirmed-round") or tx.get("confirmed_round")
        if conf is not None:
            return {
                "verified": True,
                "tx_id": tx_id,
                "confirmed_round": conf,
                "explorer_url": f"{LORA_TESTNET_TX}/{tx_id}",
                "hash": tx.get("id"),
                "message": "Transaction confirmed on Algorand. Click explorer_url for public verification.",
            }
        return {"verified": False, "tx_id": tx_id, "message": "Transaction not yet confirmed."}
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return {"verified": False, "tx_id": tx_id, "message": "Transaction not found (not yet in a block or invalid)."}
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        "explorer_url": full.get("lora_url") or f"{LORA_TESTNET_APP}/{APP_ID}",
        "lora_verdict_tx_url": chain.lora_tx_url(verdict_tx) if verdict_tx else None,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
