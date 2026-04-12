import json
from pathlib import Path

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
