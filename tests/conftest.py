"""
Global pytest fixtures for Pramanik backend tests.
Unit tests run without chain credentials. testnet/e2e require ORACLE_MNEMONIC + APP_ID.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.test", override=False)
load_dotenv(ROOT / ".env", override=False)

# Safe defaults for CI / local unit runs
os.environ.setdefault("SKIP_ORACLE_VERIFY", "1")
os.environ.setdefault("AUTO_SEED_DEMO", "0")
os.environ.setdefault("PYTEST_CURRENT_TEST", "1")


def _has_testnet_credentials() -> bool:
    mnemonic = (os.environ.get("ORACLE_MNEMONIC") or os.environ.get("DEPLOYER_MNEMONIC") or "").strip()
    app_id = int(os.environ.get("APP_ID", "0") or "0")
    return bool(mnemonic and len(mnemonic.split()) == 25 and app_id > 0)


@pytest.fixture(scope="session")
def root_dir() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def testnet_configured() -> bool:
    return _has_testnet_credentials()


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    """FastAPI TestClient with isolated SQLite DB."""
    db_file = tmp_path / "test_shipments.db"
    monkeypatch.setenv("SKIP_ORACLE_VERIFY", "1")
    monkeypatch.setenv("AUTO_SEED_DEMO", "0")

    import app as app_module
    import algorand_client as chain

    monkeypatch.setattr(app_module, "DB_PATH", str(db_file))
    monkeypatch.setattr(chain, "SHIPMENTS_DB_PATH", db_file)
    app_module.init_db()

    from starlette.testclient import TestClient

    with TestClient(app_module.app) as client:
        yield client


@pytest.fixture
def sample_shipment_id() -> str:
    return "TEST_SHIP_001"


@pytest.fixture
def valid_supplier_address(testnet_configured) -> str:
    if not testnet_configured:
        pytest.skip("ORACLE_MNEMONIC + APP_ID required")
    import algorand_client as chain

    chain._sync_env_globals()
    acct = chain.oracle_account()
    if not acct:
        pytest.skip("Could not load oracle account")
    return acct.address


@pytest.fixture
def unique_shipment_id() -> str:
    import time

    return f"PYTEST_{int(time.time())}"


def pytest_collection_modifyitems(config, items):
    """Skip testnet/e2e tests when ORACLE_MNEMONIC + APP_ID are not configured."""
    if _has_testnet_credentials():
        return
    skip = pytest.mark.skip(reason="ORACLE_MNEMONIC (25 words) and APP_ID>0 required for TestNet tests")
    for item in items:
        if "testnet" in item.keywords or "e2e" in item.keywords:
            item.add_marker(skip)
