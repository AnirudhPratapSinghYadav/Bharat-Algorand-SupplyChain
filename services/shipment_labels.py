"""Human-readable shipment labels for UI, Telegram, and cron logs."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional

import pramanik_config as pcfg


def _parse_commodity_from_route(route: str) -> str:
    r = (route or "").strip()
    if "|" in r:
        return r.split("|", 1)[-1].strip()
    return ""


def build_display_label(
    shipment_id: str,
    origin: str = "",
    destination: str = "",
    *,
    commodity: str = "",
    route: str = "",
    created_at: str | None = None,
) -> str:
    """MSME-facing title — never raw PRM-/DEMO- ids as the primary label."""
    demo = pcfg.get_demo_labels()
    if shipment_id in demo:
        return demo[shipment_id]

    o = (origin or "").split(",")[0].strip() or "Origin"
    d = (destination or "").split(",")[0].strip() or "Destination"
    comm = (commodity or "").strip() or _parse_commodity_from_route(route) or "Goods"

    date_part = ""
    if created_at:
        try:
            raw = str(created_at).replace("Z", "+00:00")
            dt = datetime.fromisoformat(raw) if "T" in raw else datetime.strptime(raw[:10], "%Y-%m-%d")
            date_part = f" | {dt.strftime('%d %b %Y')}"
        except (ValueError, TypeError):
            pass

    return f"{o} → {d} | {comm}{date_part}"


def shipment_meta_from_db_row(row: Any) -> dict[str, str]:
    if row is None:
        return {}
    keys = row.keys() if hasattr(row, "keys") else []
    route = str(row["route"] if "route" in keys else "") if row else ""
    commodity = str(row["commodity"] if "commodity" in keys else "") if row else ""
    if not commodity:
        commodity = _parse_commodity_from_route(route)
    created = str(row["created_at"] if "created_at" in keys else "") if row else ""
    return {
        "origin": str(row["origin"] or ""),
        "destination": str(row["destination"] or ""),
        "route": route,
        "commodity": commodity,
        "created_at": created,
    }


def resolve_shipment_label(shipment_id: str, conn=None) -> str:
    """Load label from SQLite + config demo_labels."""
    sid = (shipment_id or "").strip()
    demo = pcfg.get_demo_labels()
    if sid in demo:
        return demo[sid]

    row = None
    if conn is not None:
        row = conn.execute("SELECT * FROM shipments WHERE id = ?", (sid,)).fetchone()
    else:
        try:
            from app import get_db

            with get_db() as c:
                row = c.execute("SELECT * FROM shipments WHERE id = ?", (sid,)).fetchone()
        except Exception:
            row = None

    if row is None:
        return sid or "Shipment"

    meta = shipment_meta_from_db_row(row)
    return build_display_label(
        sid,
        meta.get("origin", ""),
        meta.get("destination", ""),
        commodity=meta.get("commodity", ""),
        route=meta.get("route", ""),
        created_at=meta.get("created_at"),
    )


def verdict_label_for_cron(verdict: str) -> str:
    v = (verdict or "").upper().strip()
    if v == "SETTLE":
        return "Payment Released"
    if v == "DISPUTE":
        return "Dispute Escalated"
    return "Under Review"
