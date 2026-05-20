import pramanik_config as pcfg


def test_get_config_keys():
    assert pcfg.get("risk_threshold_settle", 65) == 65
    assert pcfg.min_oracle_balance_micro() >= 1_000_000


def test_commodity_types_from_config():
    types = pcfg.get_commodity_types()
    assert "Cotton Fabric" in types
    assert "Spices" in types
