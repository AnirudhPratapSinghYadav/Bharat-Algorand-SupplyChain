#!/usr/bin/env python3
"""Send one sample verdict alert using APP_ID from .env (no fake tx URLs)."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


async def main() -> int:
    import algorand_client as chain
    from services.telegram_service import notify_verdict

    app_id = int(os.environ.get("APP_ID") or "0")
    lora = chain.lora_app_url() if app_id else ""

    await notify_verdict(
        route_label="Mumbai to Rotterdam (Cotton Fabric)",
        verdict="SETTLE",
        confidence_pct=87.0,
        escrow_line="about ₹5,923, 2.50 ALGO in escrow",
        lora_tx_url=lora,
    )
    print("Sample verdict alert sent. Lora link included only if APP_ID is set.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
