"""Box decoding helpers (matches deployed NaviTrust ARC-4 encoding)."""

from algorand_client import _decode_arc4_string


def _decode_uint64_box(raw: bytes) -> int:
    if not raw or len(raw) < 8:
        return 0
    return int.from_bytes(raw[-8:], "big")


def test_decode_arc4_string_in_transit_deployed():
    # Deployed contract uses "In_Transit" as ARC-4 string
    s = "In_Transit"
    raw = len(s.encode()).to_bytes(2, "big") + s.encode()
    assert _decode_arc4_string(raw) == "In_Transit"


def test_decode_arc4_string_empty():
    assert _decode_arc4_string(b"") == ""


def test_decode_uint64_five():
    raw = (5).to_bytes(8, "big")
    assert _decode_uint64_box(raw) == 5


def test_decode_uint64_short():
    assert _decode_uint64_box(b"\x05") == 0


def test_navi_str_key_prefix():
    from algorand_client import _navi_str_key_box_name

    key = _navi_str_key_box_name(b"st_", "SHIP_TEST")
    assert key == b"st_SHIP_TEST"
