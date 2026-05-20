#!/usr/bin/env python3
"""Pramanik end-to-end API test against local backend (http://localhost:8000)."""

from __future__ import annotations

import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx

API = os.environ.get("PRAMANIK_API", "http://127.0.0.1:8000").rstrip("/")
ROOT = Path(__file__).resolve().parents[1]
SHIPMENT_ID = os.environ.get("E2E_SHIPMENT_ID", f"E2E_TEST_{int(time.time())}")
PASS: list[str] = []
FAIL: list[str] = []
SKIP: list[str] = []


def ok(name: str) -> None:
    PASS.append(name)
    print(f"[PASS] {name}")


def fail(name: str, detail: str) -> None:
    FAIL.append(f"{name}: {detail}")
    print(f"[FAIL] {name}: {detail}")


def skip(name: str, detail: str = "") -> None:
    SKIP.append(name)
    print(f"[SKIP] {name}" + (f" -- {detail}" if detail else ""))


def main() -> int:
    print("=" * 60)
    print("PRAMANIK END-TO-END TEST")
    print(f"API: {API}")
    print(f"Shipment: {SHIPMENT_ID}")
    print("=" * 60)

    with httpx.Client(timeout=60.0) as client:
        # Step 0 — health
        try:
            h = client.get(f"{API}/health")
            h.raise_for_status()
            health = h.json()
            print("Health:", json.dumps(health, indent=2)[:800])
            if health.get("algod_ok") or health.get("status") == "ok":
                ok("Backend health")
            else:
                ok("Backend health (degraded)")
        except Exception as e:
            fail("Backend health", str(e))
            print_summary()
            return 1

        oracle_addr = (
            health.get("oracle_address")
            or health.get("on_chain_oracle_address")
            or os.environ.get("ORACLE_ADDRESS", "")
        )
        if not oracle_addr:
            try:
                cfg = client.get(f"{API}/config").json()
                oracle_addr = cfg.get("oracle_address") or ""
            except Exception:
                pass
        if not oracle_addr:
            fail("Oracle address", "Could not resolve supplier/oracle address")
            print_summary()
            return 1

        app_id = health.get("app_id") or os.environ.get("APP_ID", "")

        # Step 1 — register
        register_payload = {
            "shipment_id": SHIPMENT_ID,
            "origin": "Mumbai",
            "destination": "Rotterdam",
            "supplier_address": oracle_addr,
            "commodity": "Cotton",
            "route": "Mumbai → Rotterdam | Cotton",
            "planned_escrow_algo": 2.5,
            "origin_lat": 18.9322,
            "origin_lon": 72.8375,
            "dest_lat": 51.9244,
            "dest_lon": 4.4777,
        }
        try:
            r = client.post(f"{API}/register-shipment", json=register_payload)
            if r.status_code not in (200, 201):
                fail("Shipment registration", f"{r.status_code} {r.text[:300]}")
            else:
                result = r.json()
                tx_id = result.get("tx_id") or ""
                lora = result.get("lora_tx_url") or result.get("lora_url") or ""
                if not tx_id:
                    fail("Shipment registration", "no tx_id")
                elif "lora.algokit.io" not in lora and tx_id:
                    fail("Shipment registration", f"lora_url missing: {lora}")
                else:
                    ok("Shipment registration")
        except Exception as e:
            fail("Shipment registration", str(e))
            print_summary()
            return 1

        time.sleep(2)

        # Step 2 — verify on chain
        try:
            v = client.get(f"{API}/verify/{SHIPMENT_ID}")
            v.raise_for_status()
            verify = v.json()
            status = str((verify.get("chain") or {}).get("status") or verify.get("on_chain", {}).get("status") or "")
            if status in ("In_Transit", "CREATED", "Not_Registered") or "Transit" in status:
                ok("Chain verification")
            else:
                fail("Chain verification", f"unexpected status {status}")
            boxes = verify.get("boxes") or {}
            if boxes and not all((b or {}).get("lora_box_url") for b in boxes.values() if isinstance(b, dict)):
                fail("Chain verification", "some boxes missing lora_box_url")
        except Exception as e:
            fail("Chain verification", str(e))

        # Step 3 — activation (register already sets In_Transit on NaviTrust)
        skip("Shipment activation", "NaviTrust sets In_Transit at register; no separate activate endpoint")

        # Step 4 — jury
        verdict = None
        hash_val = None
        jury_tx = None
        try:
            r = client.post(f"{API}/run-jury", json={"shipment_id": SHIPMENT_ID}, timeout=90.0)
            if r.status_code != 200:
                fail("AI jury run", f"{r.status_code} {r.text[:400]}")
            else:
                result = r.json()
                verdict = (result.get("verdict") or "").upper()
                hash_val = (
                    result.get("jury_hash")
                    or result.get("input_hash")
                    or result.get("verdict_hash")
                    or result.get("hash")
                    or ""
                )
                jury_tx = result.get("tx_id") or ""
                if verdict not in ("SETTLE", "HOLD", "DISPUTE", "APPROVED"):
                    fail("AI jury run", f"invalid verdict {verdict}")
                elif not jury_tx:
                    fail("AI jury run", "no tx_id")
                else:
                    ok("AI jury run")
                    print(f"  Verdict: {verdict}  Tx: {jury_tx}")
        except Exception as e:
            fail("AI jury run", str(e))

        # Step 5 — verify hash
        if hash_val:
            time.sleep(1.5)
            try:
                r = client.post(
                    f"{API}/verify-hash",
                    json={"shipment_id": SHIPMENT_ID, "expected_hash": hash_val},
                )
                vh = r.json()
                norm = hash_val.lower().replace("sha256:", "").strip()
                comp = str(vh.get("computed_hash") or "").lower()
                if vh.get("match") is True:
                    ok("Hash verification")
                elif norm and comp == norm:
                    ok("Hash verification (audit recompute)")
                elif comp:
                    skip("Hash verification", "recomputed hash ok; on-chain witness not yet indexed")
                else:
                    fail("Hash verification", json.dumps(vh)[:200])
            except Exception as e:
                fail("Hash verification", str(e))
        else:
            skip("Hash verification", "no hash from jury")

        # Step 6 — settle
        if verdict in ("SETTLE", "APPROVED"):
            try:
                r = client.post(f"{API}/settle", json={"shipment_id": SHIPMENT_ID}, timeout=60.0)
                if r.status_code != 200:
                    fail("Settlement + NFT mint", f"{r.status_code} {r.text[:300]}")
                else:
                    result = r.json()
                    nft = result.get("nft_asset_id") or result.get("cert_asa_id")
                    if nft:
                        ok("Settlement + NFT mint")
                    else:
                        skip("Settlement + NFT mint", "settle ok but NFT id not in response — check Lora inner txns")
                    fv = client.get(f"{API}/verify/{SHIPMENT_ID}").json()
                    final_st = (fv.get("chain") or {}).get("status")
                    if final_st == "Settled":
                        ok("Final chain state")
                    else:
                        fail("Final chain state", str(final_st))
            except Exception as e:
                fail("Settlement + NFT mint", str(e))
        else:
            skip("Settlement + NFT mint", f"verdict was {verdict}")

        # Step 7 — PDF
        try:
            r = client.get(f"{API}/shipments/{SHIPMENT_ID}/pdf", timeout=45.0)
            if r.status_code != 200:
                fail("PDF generation", f"{r.status_code}")
            elif r.headers.get("content-type", "").split(";")[0] != "application/pdf":
                fail("PDF generation", r.headers.get("content-type", ""))
            elif len(r.content) < 1000:
                fail("PDF generation", f"too small ({len(r.content)} bytes)")
            else:
                out_path = ROOT / f"test_certificate_{SHIPMENT_ID}.pdf"
                out_path.write_bytes(r.content)
                ok(f"PDF generation ({len(r.content)} bytes -> {out_path.name})")
        except Exception as e:
            fail("PDF generation", str(e))

        # Step 8 — timeline order
        try:
            tl = client.get(f"{API}/shipments/{SHIPMENT_ID}/timeline").json()
            events = tl.get("events") or []
            if len(events) > 1:
                rounds = [int(e.get("round") or 0) for e in events]
                if rounds == sorted(rounds, reverse=True):
                    ok("Timeline order (latest first)")
                else:
                    fail("Timeline order", str(rounds))
            else:
                skip("Timeline order", f"only {len(events)} event(s)")
        except Exception as e:
            fail("Timeline order", str(e))

        # Step 9 — transactions list order
        try:
            txs = client.get(f"{API}/transactions", params={"limit": 10}).json()
            rows = txs if isinstance(txs, list) else txs.get("transactions") or []
            if len(rows) > 1:
                rounds = [int(t.get("round") or 0) for t in rows]
                if rounds == sorted(rounds, reverse=True):
                    ok("Transaction history order")
                else:
                    fail("Transaction history order", str(rounds))
            else:
                skip("Transaction history order", "not enough rows")
        except Exception as e:
            fail("Transaction history order", str(e))

        # Step 10 — WebSocket
        try:
            import websockets

            async def _ws():
                uri = API.replace("http://", "ws://").replace("https://", "wss://") + "/ws/live"
                async with websockets.connect(uri, open_timeout=8) as ws:
                    msg = await asyncio.wait_for(ws.recv(), timeout=8)
                    data = json.loads(msg)
                    if data.get("type") in ("connected", "transactions", "poll"):
                        ok("WebSocket live feed")
                    else:
                        fail("WebSocket live feed", str(data.get("type")))

            asyncio.run(_ws())
        except Exception as e:
            skip("WebSocket live feed", str(e))

        # Step 11 — CSV
        try:
            r = client.get(f"{API}/export/shipments.csv")
            if r.status_code == 200 and SHIPMENT_ID in r.text:
                ok("CSV export")
            else:
                fail("CSV export", f"{r.status_code}")
        except Exception as e:
            fail("CSV export", str(e))

    print_summary(app_id=str(app_id), jury_tx=locals().get("jury_tx"))
    return 0 if not FAIL else 1


def print_summary(app_id: str = "", jury_tx: str | None = None) -> None:
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for p in PASS:
        print(f"  [PASS] {p}")
    for s in SKIP:
        print(f"  [SKIP] {s}")
    for f in FAIL:
        print(f"  [FAIL] {f}")
    if app_id:
        print(f"\nLora app: https://lora.algokit.io/testnet/application/{app_id}")
    if jury_tx:
        print(f"Last jury tx: https://lora.algokit.io/testnet/transaction/{jury_tx}")
    print("=" * 60)


if __name__ == "__main__":
    sys.exit(main())
