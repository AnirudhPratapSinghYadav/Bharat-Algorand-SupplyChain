#!/usr/bin/env python3
"""Send a test Telegram ping using .env credentials."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


async def main() -> int:
    from services.telegram_service import normalize_telegram_token, send_test_ping

    raw = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    norm = normalize_telegram_token(raw)
    print(f"Token configured: {'yes' if norm else 'no'} (normalized length {len(norm)})")
    print(f"Chat IDs: {(os.environ.get('TELEGRAM_CHAT_IDS') or '').strip()}")
    out = await send_test_ping()
    print(out)
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
