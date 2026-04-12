import json
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def test_navitrust_arc56_present():
    p = ROOT / "artifacts" / "NaviTrust.arc56.json"
    assert p.is_file(), "Run algokit compile and copy ARC56 to artifacts/"


def test_navitrust_abi_methods():
    p = ROOT / "artifacts" / "NaviTrust.arc56.json"
    if not p.is_file():
        return
    data = json.loads(p.read_text(encoding="utf-8"))
    names = {m["name"] for m in data.get("methods", [])}
    for required in (
        "register_shipment",
        "fund_shipment",
        "record_verdict",
        "settle_shipment",
        "update_oracle",
        "get_global_stats",
    ):
        assert required in names, f"missing ABI method {required}"


@patch("algorand_client.encoding.encode_address", return_value="ORACLE_ADDR_TEST")
@patch("algorand_client.algorand.client.algod.application_info")
def test_get_display_global_state_filters_keys(mock_app_info, _mock_enc):
    """Only NAVITRUST_DISPLAY_KEYS survive; oracle_address decodes to base32."""
    import algorand_client as ac

    fake_gs = [
        {
            "key": "dG90YWxfc2hpcG1lbnRz",  # total_shipments
            "value": {"type": 2, "uint": 3},
        },
        {
            "key": "bGVnYWN5X2JhZGdl",  # legacy_badge — must be dropped
            "value": {"type": 1, "bytes": "AA=="},
        },
        {
            "key": "b3JhY2xlX2FkZHJlc3M=",  # oracle_address (32 bytes)
            "value": {
                "type": 1,
                "bytes": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            },
        },
    ]
    mock_app_info.return_value = {"params": {"global-state": fake_gs}}
    out = ac.get_display_global_state(12345)
    assert "total_shipments" in out and out["total_shipments"] == 3
    assert "legacy_badge" not in out
    assert out.get("oracle_address") == "ORACLE_ADDR_TEST"
