"""Telegram alerts for verdicts, settlements, and auto-jury (optional)."""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _clean_lora_link(url: str) -> str:
    """Drop placeholder or incomplete explorer URLs before sending to users."""
    u = (url or "").strip()
    if not u:
        return ""
    upper = u.upper()
    if "EXAMPLE" in upper or "YOUR_APP_ID" in u or "PLACEHOLDER" in upper:
        return ""
    if u.rstrip("/").endswith("/transaction") or u.rstrip("/").endswith("/application"):
        return ""
    if "/asset/0" in u or u.rstrip("/").endswith("/asset"):
        return ""
    return u


def _chat_ids() -> list[str]:
    raw = (os.environ.get("TELEGRAM_CHAT_IDS") or "").strip()
    if not raw:
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


def normalize_telegram_token(raw: str) -> str:
    """
    Accept standard BotFather tokens or pasted forms like
    @mybot:123456789:AAHxxx… → 123456789:AAHxxx…
    """
    t = (raw or "").strip().strip('"').strip("'")
    if not t:
        return ""
    if t.startswith("@"):
        parts = t.lstrip("@").split(":")
        if len(parts) >= 3 and parts[-2].isdigit():
            return f"{parts[-2]}:{parts[-1]}"
    return t


def _token() -> str:
    return normalize_telegram_token(os.environ.get("TELEGRAM_BOT_TOKEN") or "")


def fire_async(coro) -> None:
    """Run async telegram coroutine from sync or async contexts."""
    import asyncio
    import threading

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()


async def send_test_ping() -> dict:
    """Send a test message; returns {ok, error?, chats}."""
    token = _token()
    chats = _chat_ids()
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set or invalid format", "chats": chats}
    if not chats:
        return {"ok": False, "error": "TELEGRAM_CHAT_IDS empty", "chats": []}
    msg = (
        "Pramanik is connected.\n"
        "You will receive alerts when a shipment is registered, when the AI jury issues a verdict, "
        "and when payment is released to the exporter."
    )
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    results: list[dict] = []
    ok = True
    async with httpx.AsyncClient(timeout=15.0) as client:
        for chat_id in chats:
            try:
                r = await client.post(url, json={"chat_id": chat_id, "text": msg})
                results.append({"chat_id": chat_id, "status": r.status_code, "body": r.text[:300]})
                if r.status_code >= 400:
                    ok = False
            except Exception as e:
                ok = False
                results.append({"chat_id": chat_id, "error": str(e)})
    return {"ok": ok, "chats": chats, "results": results}


async def send_telegram(
    message: str,
    *,
    tx_id: str | None = None,
    shipment_id: str | None = None,
) -> None:
    """Central Telegram sender — always appends Lora proof when tx_id is known."""
    from algorand_client import lora_app_url, lora_tx_url

    full = (message or "").strip()
    if tx_id:
        link = _clean_lora_link(lora_tx_url(tx_id))
        if link:
            full += f"\n\n🔗 Verify Tx:\n{link}"
    if shipment_id and not tx_id:
        full += f"\n\n📊 App:\n{_clean_lora_link(lora_app_url()) or lora_app_url()}"
    await send_alert(full)


async def send_alert(message: str) -> None:
    """Send plain-text alert to all configured chat IDs. No-op if bot not configured."""
    token = _token()
    chats = _chat_ids()
    if not token or not chats:
        if not token and chats:
            logger.warning("TELEGRAM_CHAT_IDS set but TELEGRAM_BOT_TOKEN missing — alerts disabled")
        return
    text = (message or "").strip()
    if not text:
        return
    if len(text) > 4000:
        text = text[:3990] + "…"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=15.0) as client:
        for chat_id in chats:
            try:
                r = await client.post(url, json={"chat_id": chat_id, "text": text, "disable_web_page_preview": False})
                if r.status_code >= 400:
                    logger.warning("Telegram send failed chat=%s status=%s body=%s", chat_id, r.status_code, r.text[:200])
            except Exception as e:
                logger.warning("Telegram send error chat=%s: %s", chat_id, e)


def format_route_label(origin: str, destination: str, commodity: str = "") -> str:
    o = (origin or "").split(",")[0].strip() or "Origin"
    d = (destination or "").split(",")[0].strip() or "Destination"
    base = f"{o} to {d}"
    if commodity:
        return f"{base} ({commodity})"
    return base


def format_escrow_line(algo: Optional[float], inr: Optional[float], usd: Optional[float]) -> str:
    """INR first for MSME Telegram copy; ALGO as secondary."""
    parts = []
    if inr is not None:
        parts.append(f"about ₹{inr:,.0f}")
    if algo is not None:
        parts.append(f"{algo:.2f} ALGO in escrow")
    if usd is not None:
        parts.append(f"about ${usd:.2f}")
    return ", ".join(parts) if parts else "escrow amount pending"


async def notify_verdict(
    *,
    route_label: str,
    verdict: str,
    confidence_pct: Optional[float],
    escrow_line: str,
    lora_tx_url: str,
) -> None:
    vlabel = verdict_user_label_for_telegram(verdict)
    conf = f"{confidence_pct:.0f}%" if confidence_pct is not None else "pending"
    msg = (
        f"AI jury update\n\n"
        f"Shipment: {route_label}\n"
        f"Outcome: {vlabel}\n"
        f"Confidence: {conf}\n"
        f"Escrow: {escrow_line}\n"
    )
    proof = _clean_lora_link(lora_tx_url)
    if proof:
        msg += f"\nView proof on Lora:\n{proof}"
    await send_alert(msg)


async def notify_settlement(
    *,
    route_label: str,
    supplier_paid_algo: float,
    inr: Optional[float],
    cert_asa_id: Optional[int],
    lora_tx_url: str,
    lora_cert_url: str,
) -> None:
    paid = f"{supplier_paid_algo:.2f} ALGO"
    fiat = f" (about ₹{inr:,.0f})" if inr is not None else ""
    msg = (
        f"Payment released\n\n"
        f"Shipment: {route_label}\n"
        f"Exporter received: {paid}{fiat}\n"
    )
    cert_url = _clean_lora_link(lora_cert_url)
    tx_url = _clean_lora_link(lora_tx_url)
    if cert_asa_id and int(cert_asa_id) > 0:
        msg += f"Settlement certificate: asset #{int(cert_asa_id)}\n"
    if cert_url:
        msg += f"Certificate on Lora:\n{cert_url}\n"
    elif tx_url:
        msg += f"Payment transaction on Lora:\n{tx_url}\n"
    await send_alert(msg)


async def notify_auto_jury_summary(reviewed: int, settled: int, on_hold: int) -> None:
    from datetime import datetime, timezone

    ist = datetime.now(timezone.utc).strftime("%H:%M UTC")
    await send_alert(
        f"Automatic review finished\n\n"
        f"{reviewed} shipments checked\n"
        f"{settled} ready for release\n"
        f"{on_hold} on hold\n"
        f"Time: {ist}"
    )


async def notify_registered(
    *,
    route_label: str,
    escrow_algo: float,
    inr: Optional[float],
    lora_tx_url: str = "",
    note: str = "",
) -> None:
    planned = max(0.0, float(escrow_algo or 0))
    if planned > 0:
        fiat = f", about ₹{inr:,.0f}" if inr is not None else ""
        escrow_line = f"Planned escrow: {planned:.2f} ALGO{fiat} (deposit next in Pera Wallet)"
    else:
        escrow_line = "Planned escrow: set on dashboard — deposit ALGO in Pera Wallet after registration"
    msg = (
        f"New export shipment registered\n\n"
        f"Route: {route_label}\n"
        f"{escrow_line}\n"
        f"Status: corridor active on chain"
    )
    if note:
        msg += f"\n{note}"
    proof = _clean_lora_link(lora_tx_url)
    if proof:
        msg += f"\n\nVerify registration on Lora:\n{proof}"
    else:
        from algorand_client import lora_app_url

        app_link = _clean_lora_link(lora_app_url())
        if app_link:
            msg += f"\n\n📊 App:\n{app_link}"
    await send_telegram(msg, tx_id=None, shipment_id="registered")


def verdict_user_label_for_telegram(verdict: str) -> str:
    v = (verdict or "").upper().strip()
    if v in ("SETTLE", "APPROVED"):
        return "Payment can be released to exporter"
    if v in ("DISPUTE", "DISPUTED", "HOLD"):
        return "Payment held pending review"
    return "Under review"
