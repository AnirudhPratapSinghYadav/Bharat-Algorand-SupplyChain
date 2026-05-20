"""Input validation helpers for shipment registration and chain writes."""

from __future__ import annotations

import re

from algosdk import encoding

import pramanik_config as pcfg


def validate_shipment_id(shipment_id: str) -> str:
    sid = (shipment_id or "").strip()
    if not sid:
        raise ValueError("shipment_id must not be empty")
    if len(sid) > 32:
        raise ValueError(f"shipment_id exceeds 32 characters ({len(sid)})")
    if not re.match(r"^[A-Za-z0-9_\-]+$", sid):
        raise ValueError("shipment_id must be alphanumeric, underscore, or hyphen only")
    return sid


def validate_incoterm(incoterm: str) -> str:
    valid = {"FOB", "CIF", "DDP", "EXW", "CPT", "CIP", "FCA", "DAP", "DPU"}
    s = (incoterm or "FOB").strip().upper()
    if s not in valid:
        raise ValueError(f"Invalid incoterm {incoterm!r}; must be one of {sorted(valid)}")
    return s


def validate_risk_score(score: int) -> None:
    if not (0 <= int(score) <= 100):
        raise ValueError(f"Risk score {score} out of range [0, 100]")


def validate_verdict(verdict: str) -> str:
    valid = {"SETTLE", "HOLD", "DISPUTE"}
    v = (verdict or "").strip().upper()
    if v not in valid:
        raise ValueError(f"Invalid verdict {verdict!r}; must be one of {sorted(valid)}")
    return v


def validate_escrow_amount(amount_microalgo: int) -> None:
    cfg = pcfg.load_config()
    minimum = int(cfg.get("min_escrow_microalgo") or 100_000)
    if int(amount_microalgo) < minimum:
        raise ValueError(
            f"Escrow {amount_microalgo} microALGO is below minimum {minimum} ({minimum / 1e6:.4f} ALGO)"
        )


def validate_algorand_address(addr: str) -> str:
    a = (addr or "").strip()
    if not a:
        raise ValueError("Algorand address is required")
    encoding.decode_address(a)
    return a


def validate_route(route: str, max_bytes: int | None = None) -> str:
    r = (route or "").strip()
    if not r:
        raise ValueError("route is required")
    if max_bytes is None:
        max_bytes = int(pcfg.load_config().get("max_route_bytes") or 64)
    if len(r.encode("utf-8")) > max_bytes:
        raise ValueError(f"route must be at most {max_bytes} bytes UTF-8")
    return r


def validate_lat_lon(lat: float, lon: float) -> tuple[float, float]:
    if lat < -90 or lat > 90:
        raise ValueError("origin_lat must be between -90 and 90")
    if lon < -180 or lon > 180:
        raise ValueError("origin_lon must be between -180 and 180")
    return float(lat), float(lon)
