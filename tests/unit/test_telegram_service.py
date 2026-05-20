"""Telegram token normalization and optional live ping."""

import os

import pytest

from services.telegram_service import normalize_telegram_token


def test_normalize_botfather_paste():
    raw = "@mybot:8674440164:AAHHClXPgrLElUlCFs9CAD5OC5LM-qvy_t8"
    assert normalize_telegram_token(raw) == "8674440164:AAHHClXPgrLElUlCFs9CAD5OC5LM-qvy_t8"


def test_normalize_plain_token():
    raw = "8674440164:AAHtest"
    assert normalize_telegram_token(raw) == raw


@pytest.mark.asyncio
async def test_send_test_ping_skips_without_token(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    from services.telegram_service import send_test_ping

    out = await send_test_ping()
    assert out["ok"] is False
