# Navi-Trust — architecture (current)

This document describes the **Navi-Trust** supply-chain dispute oracle as implemented in this repository: **4-agent AI jury**, **Algorand TestNet** smart contract escrow, and a **React + FastAPI** stack.

For historical context, `ARCHITECTURE.md` retains an older **Agri-Jury** write-up; treat this file as the source of truth for the hackathon / AlgoBharat submission.

---

## 1. Smart contract (`smart_contracts/navi_trust`)

- **Globals (4 + oracle):** `total_shipments`, `total_settled`, `total_disputed`, `oracle_address`.
- **Per-shipment boxes:** `st_`, `sp_`, `by_`, `fn_`, `rs_`, `vd_`, `rt_`, `ce_` (status, supplier, buyer, funds, risk, verdict JSON, route, certificate ASA id).
- **Methods:** `register_shipment`, `fund_shipment`, `record_verdict`, `settle_shipment`, `update_oracle`, `get_global_stats`.
- **Settlement:** atomic pay-out + ARC-69 style certificate mint (see contract + client).

---

## 2. Backend (`app.py`, `algorand_client.py`)

| Concern | Implementation |
|--------|----------------|
| Chain reads / writes | `algorand_client` — Algokit, ARC56 client, box reads, oracle-signed txs |
| Stats / escrow | `GET /stats`, `global_stats_navitrust()` |
| 4-agent jury | `POST /run-jury` — Sentinel → Auditor → Fraud → Arbiter; verdict on-chain |
| NaviBot | `POST /navibot` — 60s cached context, 8s LLM cap, rule-first answers |
| Protocol proof | `GET /protocol/display-global-state` — filtered globals (`NAVITRUST_DISPLAY_KEYS`) |
| Supplier events | `POST /simulate-event` — appends to `offchain_events.json` |
| Verify | `GET /verify/{shipment_id}` — public status + certificate links |
| Witness | `POST /witness-shipment/build`, `GET /witnesses/{shipment_id}` |

**Optional env:** `N8N_WEBHOOK_URL`, ElevenLabs, OpenAI fallback. **Gemini:** override model order with `GEMINI_MODEL_CHAIN` (comma-separated, tried in order).

---

## 3. Data on disk

| File | Role |
|------|------|
| `shipments.db` | SQLite — demo rows aligned with `seed_blockchain.py` |
| `offchain_events.json` | Logistics events (`POST /simulate-event` + startup load) |
| `audit_trail.json` | Jury / verdict history for dashboard |
| `LORA_PROOF.md` | Human-readable Lora links — regenerate with `python tools/refresh_lora_proof.py` or `python seed_blockchain.py` |

---

## 4. Frontend (`frontend/`)

- **Vite + React:** dashboard with **Stakeholder / Supplier** roles, shipment cards, **Run AI Jury**, **Verify**, **NaviBot** panel, **`/protocol`** page.
- **Env:** see `frontend/.env.example` (`VITE_APP_ID`, `VITE_API_URL`, indexer URLs).

---

## 5. Scripts & ops

- **`seed_blockchain.py`:** idempotent TestNet seed (3 demo shipments), updates `LORA_PROOF.md` on success.
- **`tools/refresh_lora_proof.py`:** rebuild `LORA_PROOF.md` from indexer + `.env` (fast path, no full API import).

---

## 6. Tests

- `tests/test_health.py`, `tests/test_protocol_api.py`, `tests/test_navitrust_arc56.py`
- CI: `.github/workflows/ci.yml` (frontend build, pytest, contract build)

---

## 7. Intentional stubs

- **`_fraud_report_stub`:** registration does not block on ML fraud (module removed; stub returns OK).
