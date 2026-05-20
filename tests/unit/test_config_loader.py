"""Config must load from config.json without hardcoded APP_ID in code."""

import os

import pramanik_config as pcfg


def test_load_config_has_box_prefixes():
    cfg = pcfg.load_config()
    prefixes = cfg.get("box_prefixes") or {}
    assert prefixes.get("risk") == "rs_"
    assert prefixes.get("status") == "st_"


def test_app_id_from_env(monkeypatch):
    monkeypatch.setenv("APP_ID", "12345")
    pcfg.load_config.cache_clear()
    assert pcfg.get_app_id() == 12345
    pcfg.load_config.cache_clear()
