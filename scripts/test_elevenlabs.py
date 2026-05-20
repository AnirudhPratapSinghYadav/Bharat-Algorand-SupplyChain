#!/usr/bin/env python3
"""Verify ElevenLabs agent config endpoint."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


def main() -> int:
    import pramanik_config as pcfg

    key = pcfg.get_elevenlabs_api_key()
    agent = pcfg.get_elevenlabs_agent_id()
    print(f"API key set: {bool(key)} (len={len(key)})")
    print(f"Agent id: {agent[:24]}…" if agent else "Agent id: (missing)")

    from fastapi.testclient import TestClient

    import app as application

    client = TestClient(application.app)
    r = client.get("/elevenlabs/config")
    body = r.json()
    print("GET /elevenlabs/config", r.status_code, body)
    ok = r.status_code == 200 and body.get("enabled")
    if key and not body.get("tts_configured"):
        print("Note: API key in .env but tts_configured false — restart shell after editing .env")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
