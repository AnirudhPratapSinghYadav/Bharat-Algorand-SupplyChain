import json

import pytest

from pramanik_notes import (
    NOTE_STANDARD,
    build_note,
    build_pramanik_note,
    merge_pramanik_note,
    parse_note,
    validate_note_bytes,
)


def test_build_pramanik_note_valid_json():
    raw = build_pramanik_note("register", "SHIP_1", extra={"supplier": "ADDR"})
    note = json.loads(raw.decode("utf-8"))
    assert note["standard"] == NOTE_STANDARD
    assert note["type"] == "REGISTER"
    assert note["shipment_id"] == "SHIP_1"
    assert "timestamp" in note


def test_merge_pramanik_note_keeps_legacy_fields():
    raw = merge_pramanik_note({"type": "NAVI_VERDICT", "verdict": "SETTLE", "sid": "S1"}, "verdict", "S1")
    note = json.loads(raw.decode("utf-8"))
    assert note["standard"] == NOTE_STANDARD
    assert note["type"] == "VERDICT"
    assert note["verdict"] == "SETTLE"


def test_build_note_invalid_type():
    with pytest.raises(ValueError, match="Invalid event type"):
        build_note("NOT_A_TYPE", "S1")


def test_parse_note_roundtrip():
    raw = build_note("FUND", "X1", amount_microalgo=100000)
    p = parse_note(raw)
    assert p is not None
    assert p["type"] == "FUND"
    assert validate_note_bytes(raw) is True


def test_parse_note_wrong_standard():
    assert parse_note(json.dumps({"standard": "other", "type": "REGISTER"}).encode()) is None
