"""
pramanik/v1 transaction notes for Algorand — every oracle chain write should use these helpers.

Also supports merging legacy NAVI_* dicts for verdict transactions.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from pramanik_config import get_verify_public_base_url

NOTE_STANDARD = "pramanik/v1"
MAX_NOTE_BYTES = 1024

STANDARD = NOTE_STANDARD

VALID_TYPES = frozenset(
    [
        "REGISTER",
        "ACTIVATE",
        "FUND",
        "VERDICT",
        "SETTLE",
        "VOID",
        "MARK_DISPUTED",
        "JURY_HASH",
    ]
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _encode_note_dict(note_dict: dict[str, Any]) -> bytes:
    """Prefer readable JSON for Lora Note tab; fall back to compact under AVM limit."""
    pretty = json.dumps(note_dict, indent=2, sort_keys=True, ensure_ascii=False).encode("utf-8")
    if len(pretty) <= MAX_NOTE_BYTES:
        return pretty
    compact = json.dumps(note_dict, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")
    if len(compact) <= MAX_NOTE_BYTES:
        return compact
    trimmed = dict(note_dict)
    for key in ("reasoning", "route", "arc69", "weather", "verdict", "hash", "reason"):
        if key in trimmed and len(compact) > MAX_NOTE_BYTES:
            trimmed.pop(key, None)
            compact = json.dumps(trimmed, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")
    if len(compact) > MAX_NOTE_BYTES:
        raise ValueError(f"Transaction note exceeds {MAX_NOTE_BYTES} bytes ({len(compact)})")
    return compact


def build_note(event_type: str, shipment_id: str, **extra_fields: Any) -> bytes:
    """
    Build a pramanik/v1 JSON note (UTF-8 bytes). event_type must be in VALID_TYPES (uppercase).
    """
    et = (event_type or "").strip().upper()
    if et not in VALID_TYPES:
        raise ValueError(f"Invalid event type {et!r}. Must be one of: {sorted(VALID_TYPES)}")
    sid = (shipment_id or "").strip()
    if not sid:
        raise ValueError("shipment_id required")
    note_dict: dict[str, Any] = {
        "standard": STANDARD,
        "type": et,
        "shipment_id": sid,
        "timestamp": _utc_now_iso(),
    }
    for k, v in extra_fields.items():
        if v is not None and k not in ("standard", "type", "shipment_id", "timestamp"):
            note_dict[k] = v
    return _encode_note_dict(note_dict)


def parse_note(raw: bytes) -> Optional[dict[str, Any]]:
    """Parse pramanik/v1 JSON from raw note bytes; returns None if not ours."""
    if not raw:
        return None
    try:
        if not raw.startswith(b"{"):
            return None
        data = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if data.get("standard") != STANDARD:
        return None
    return data


def validate_note_bytes(raw: bytes) -> bool:
    p = parse_note(raw)
    return p is not None and "type" in p and "shipment_id" in p


def build_arc69_note(shipment_id: str, verdict_tx_id: str, app_id: int) -> bytes:
    """ARC-69 style certificate metadata (inner txn or documentation)."""
    note_dict = {
        "standard": "arc69",
        "description": "Pramanik Settlement Certificate",
        "shipment_id": shipment_id,
        "verdict_tx": verdict_tx_id,
        "external_url": f"{get_verify_public_base_url()}/verify/{shipment_id}",
        "properties": {"app_id": app_id, "shipment_id": shipment_id},
    }
    return _encode_note_dict(note_dict)


_TYPE_ALIASES = {
    "register": "REGISTER",
    "activate": "ACTIVATE",
    "fund": "FUND",
    "verdict": "VERDICT",
    "settle": "SETTLE",
    "void": "VOID",
    "mark_disputed": "MARK_DISPUTED",
    "jury_hash": "JURY_HASH",
}


def build_pramanik_note(
    event_type: str,
    shipment_id: str,
    *,
    extra: Optional[dict[str, Any]] = None,
) -> bytes:
    """Backward-compatible helper: lowercase aliases map to VALID_TYPES."""
    key = (event_type or "").strip().lower()
    et = _TYPE_ALIASES.get(key, (event_type or "").strip().upper())
    fields = dict(extra or {})
    # ARC-28 lifecycle labels must not collide with build_note(event_type=...) parameter.
    arc28 = fields.pop("event_type", None)
    if arc28 is not None:
        fields["arc28_event"] = arc28
    return build_note(et, shipment_id, **fields)


def merge_pramanik_note(legacy: dict[str, Any], event_type: str, shipment_id: str) -> bytes:
    """Wrap legacy NAVI_* notes with pramanik/v1 envelope."""
    sid = (shipment_id or legacy.get("sid") or legacy.get("shipment_id") or "").strip()
    key = (event_type or "").strip().lower()
    et = _TYPE_ALIASES.get(key, (event_type or "").strip().upper())
    merged: dict[str, Any] = {
        "standard": STANDARD,
        "type": et,
        "shipment_id": sid,
        "timestamp": _utc_now_iso(),
    }
    for k, v in legacy.items():
        if k in ("standard", "type", "shipment_id", "timestamp"):
            continue
        merged[k] = v
    try:
        return _encode_note_dict(merged)
    except ValueError:
        raw = json.dumps(merged, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")
        return raw[:MAX_NOTE_BYTES]
