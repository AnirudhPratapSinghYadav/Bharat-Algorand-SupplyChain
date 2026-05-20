#!/usr/bin/env python3
"""Send a sample Pramanik verdict alert (not the wiring ping)."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


async def main() -> int:
    from services.telegram_service import notify_verdict

    await notify_verdict(
        route_label="Mumbai → Rotterdam | Cotton Fabric | May 2026",
        verdict="SETTLE",
        confidence_pct=87.0,
        escrow_line="≈ ₹5,923 · 2.50 digital escrow (ALGO)",
        lora_tx_url="https://lora.algokit.io/testnet/application/759052600",
    )
    print("Sample verdict alert sent — check Telegram")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
