#!/usr/bin/env python3
"""Verify ElevenLabs agent config endpoint."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


def main() -> int:
    import requests

    key = (os.environ.get("ELEVENLABS_API_KEY") or "").strip()
    agent = (os.environ.get("ELEVENLABS_AGENT_ID") or os.environ.get("NEXT_PUBLIC_ELEVENLABS_AGENT_ID") or "").strip()
    print(f"API key set: {bool(key)}")
    print(f"Agent id: {agent[:20]}…" if agent else "Agent id: (missing)")

    from fastapi.testclient import TestClient

    import app as application

    client = TestClient(application.app)
    r = client.get("/elevenlabs/config")
    print("GET /elevenlabs/config", r.status_code, r.json())
    ok = r.status_code == 200 and r.json().get("enabled")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
