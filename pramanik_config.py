"""
Load Pramanik runtime config from config.json + environment (no hardcoded secrets or app IDs in code).
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env", override=False)
CONFIG_PATH = ROOT / "config.json"


def _env_int(key: str, default: int = 0) -> int:
    raw = (os.environ.get(key) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(key: str, default: bool = False) -> bool:
    return (os.environ.get(key) or "").strip().lower() in ("1", "true", "yes", "on")


@lru_cache(maxsize=1)
def load_config() -> dict[str, Any]:
    data: dict[str, Any] = {}
    if CONFIG_PATH.is_file():
        with open(CONFIG_PATH, encoding="utf-8") as f:
            data = json.load(f)
    # Environment overrides (never hardcode APP_ID in Python modules)
    if _env_int("APP_ID") or _env_int("VITE_APP_ID"):
        data["app_id"] = _env_int("APP_ID") or _env_int("VITE_APP_ID")
    if os.environ.get("ALGO_NETWORK"):
        data["network"] = os.environ.get("ALGO_NETWORK")
    if os.environ.get("ALGOD_ADDRESS"):
        data["algod_url"] = os.environ.get("ALGOD_ADDRESS")
    if os.environ.get("VITE_INDEXER_URL") or os.environ.get("INDEXER_URL"):
        data["indexer_url"] = os.environ.get("VITE_INDEXER_URL") or os.environ.get("INDEXER_URL")
    if os.environ.get("LORA_BASE_URL"):
        base = os.environ["LORA_BASE_URL"].rstrip("/")
        data["lora_base_url"] = base
        data["lora_tx_url"] = f"{base}/transaction"
    elif data.get("lora_base_url"):
        base = str(data["lora_base_url"]).rstrip("/")
        data["lora_tx_url"] = f"{base}/transaction"
    if data.get("app_id") and data.get("lora_base_url"):
        data["lora_app_url"] = f"{data['lora_base_url'].rstrip('/')}/application/{int(data['app_id'])}"
    return data


def get_app_id() -> int:
    return int(load_config().get("app_id") or 0)


def get_network() -> str:
    return str(load_config().get("network") or os.environ.get("ALGO_NETWORK") or "testnet")


def get_algod_url() -> str:
    cfg = load_config()
    return str(cfg.get("algod_url") or os.environ.get("ALGOD_ADDRESS") or "").strip()


def get_indexer_url() -> str:
    cfg = load_config()
    return str(
        cfg.get("indexer_url")
        or os.environ.get("VITE_INDEXER_URL")
        or os.environ.get("INDEXER_URL")
        or ""
    ).strip()


def get_lora_base_url() -> str:
    cfg = load_config()
    return str(cfg.get("lora_base_url") or os.environ.get("LORA_BASE_URL") or "").rstrip("/")


def get_verify_public_base_url() -> str:
    """
    Public HTTPS base for deep links in ARC-69 notes and supplier passport URLs (no trailing slash).
    Override with VERIFY_PUBLIC_BASE_URL or PASSPORT_URL_BASE in env, or verify_public_base_url in config.json.
    """
    cfg = load_config()
    return str(
        os.environ.get("VERIFY_PUBLIC_BASE_URL")
        or os.environ.get("PASSPORT_URL_BASE")
        or cfg.get("verify_public_base_url")
        or "https://pramanik.vercel.app"
    ).rstrip("/")


def get_box_prefixes() -> dict[str, str]:
    return dict(load_config().get("box_prefixes") or {})


def get_demo_shipments() -> list[str]:
    return list(load_config().get("demo_shipments") or [])


def get_demo_labels() -> dict[str, str]:
    raw = load_config().get("demo_labels") or {}
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    return {}


def get_elevenlabs_api_key() -> str:
    return (os.environ.get("ELEVENLABS_API_KEY") or "").strip().strip('"').strip("'")


def get_elevenlabs_agent_id() -> str:
    return (
        (os.environ.get("ELEVENLABS_AGENT_ID") or os.environ.get("NEXT_PUBLIC_ELEVENLABS_AGENT_ID") or "")
        .strip()
        .strip('"')
        .strip("'")
    )


def get_elevenlabs_default_voice_id() -> str:
    cfg = load_config()
    return (
        (os.environ.get("ELEVENLABS_VOICE_ID") or cfg.get("elevenlabs_default_voice_id") or "")
        .strip()
        .strip('"')
        .strip("'")
    )


def get_status_values() -> list[str]:
    return list(load_config().get("status_values") or ["In_Transit", "Disputed", "Settled"])


def auto_jury_enabled() -> bool:
    return _env_bool("AUTO_JURY_ENABLED", False)


def auto_jury_interval_seconds() -> int:
    mins = _env_int("AUTO_JURY_INTERVAL_MINUTES", 0)
    if mins > 0:
        return max(300, mins * 60)
    cfg = load_config()
    return max(300, _env_int("AUTO_JURY_INTERVAL_SECONDS", int(cfg.get("auto_jury_interval_seconds") or 1800)))


def auto_jury_interval_minutes() -> int:
    return max(5, auto_jury_interval_seconds() // 60)


def auto_jury_min_hours_since_last() -> float:
    return max(0.5, float(_env_int("AUTO_JURY_MIN_HOURS_SINCE_LAST", 6)))


def risk_threshold_settle() -> int:
    return int(load_config().get("risk_threshold_settle") or 65)


def risk_threshold_dispute() -> int:
    return int(load_config().get("risk_threshold_dispute") or 50)


def weather_cache_ttl_seconds() -> int:
    return int(load_config().get("weather_cache_ttl_seconds") or 300)


def api_cache_ttl_seconds() -> float:
    return float(load_config().get("api_cache_ttl_seconds") or 15)


def price_cache_ttl_seconds() -> float:
    return float(load_config().get("price_cache_ttl_seconds") or 60)


def navibot_rate_limit_per_minute() -> int:
    return int(load_config().get("navibot_rate_limit_per_minute") or 24)


def settle_fee_microalgo() -> int:
    return int(load_config().get("settle_fee_microalgo") or 4000)


def recommended_contract_fund_algo() -> float:
    return float(load_config().get("recommended_contract_fund_algo") or 0.5)


def event_poll_interval_seconds() -> int:
    return max(2, _env_int("EVENT_POLL_INTERVAL_SECONDS", 10))


def get_predefined_ports() -> dict[str, dict[str, float]]:
    return dict(load_config().get("predefined_ports") or {})


def get_jury_timeout_seconds() -> int:
    return max(5, int(load_config().get("jury_timeout_seconds") or 30))


def get_min_escrow_microalgo() -> int:
    return int(load_config().get("min_escrow_microalgo") or 100_000)


def get_max_route_bytes() -> int:
    return int(load_config().get("max_route_bytes") or 64)


def coingecko_simple_price_url() -> str:
    cfg = load_config()
    return str(
        cfg.get("coingecko_simple_price_url")
        or cfg.get("coingecko_url")
        or os.environ.get("COINGECKO_SIMPLE_PRICE_URL")
        or "https://api.coingecko.com/api/v3/simple/price"
    ).strip()


def websocket_poll_seconds() -> int:
    env = _env_int("WEBSOCKET_POLL_SECONDS", 0)
    if env > 0:
        return max(2, min(60, env))
    cfg = load_config()
    v = cfg.get("websocket_poll_seconds")
    if v is None:
        return 2
    return max(2, min(60, int(v)))
