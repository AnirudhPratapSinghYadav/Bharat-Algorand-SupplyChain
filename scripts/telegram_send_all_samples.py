#!/usr/bin/env python3
"""Send sample Pramanik Telegram alerts using real Lora links when APP_ID and tx exist."""
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
    from services.telegram_service import notify_registered, notify_settlement, notify_verdict, send_test_ping
    import algorand_client as chain

    ping = await send_test_ping()
    if not ping.get("ok"):
        print("Telegram not configured:", ping.get("error"))
        return 1
    print("1/4 Connection message sent")

    app_id = int(os.environ.get("APP_ID") or "0")
    lora_app = chain.lora_app_url() if app_id else ""

    await notify_registered(
        route_label="Mumbai to Rotterdam (Cotton Fabric)",
        escrow_algo=2.5,
        inr=5923.0,
        lora_tx_url=lora_app,
        note="Next: deposit ALGO in Pera Wallet.",
    )
    print("2/4 Registration alert sent")

    await notify_verdict(
        route_label="Mumbai to Rotterdam (Cotton Fabric)",
        verdict="SETTLE",
        confidence_pct=87.0,
        escrow_line="about ₹5,923, 2.50 ALGO in escrow",
        lora_tx_url=lora_app,
    )
    print("3/4 Verdict alert sent (app link only if APP_ID set)")

    await notify_settlement(
        route_label="Mumbai to Rotterdam (Cotton Fabric)",
        supplier_paid_algo=2.45,
        inr=5800.0,
        cert_asa_id=None,
        lora_tx_url="",
        lora_cert_url="",
    )
    print("4/4 Settlement alert sent (no fake certificate link)")
    print("Check Telegram. Real proof links appear only after on-chain settle with cert ASA id.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
