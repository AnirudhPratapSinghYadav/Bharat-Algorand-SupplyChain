# PRAMANIK — Backend + Smart Contract (Cursor Prompt)

**AlgoBharat Grand Finale | Use with existing repo at `e:\algo-hack`**

---

## CRITICAL: Deployed contract truth (read first)

**DO NOT TOUCH** `artifacts/NaviTrust.arc56.json` for a **live** deployment without rebuilding clients. Set **`APP_ID` in `.env`** to the application id returned by your **`algokit project deploy`** (or equivalent) — there is no fixed global testnet id in this repo.

The aspirational 8-box spec (`rk_`, `vh_`, `CREATED`, `fund_escrow`, `activate_shipment`) in older docs **does not match** the committed ARC-56 file. Building against that spec will break testnet reads/writes.

| Topic | Deployed (use this) | Wrong in old prompts |
|--------|---------------------|----------------------|
| Fund method | `fund_shipment` + pay txn in group | `fund_escrow` |
| Risk box | `rs_` | `rk_` |
| Verdict hash | Tx note `NAVI_VERDICT` / `NAVI_JURY_HASH` | `vh_` box |
| Status strings | `In_Transit`, `Disputed`, `Settled` | `CREATED`, `IN_TRANSIT` |
| Register | Sets `In_Transit` immediately | `CREATED` → `activate_shipment` |
| Dispute | `record_verdict` when risk > 65 | `mark_disputed` ABI |
| Rep box | `rp_` keyed by **supplier address** | per-shipment `rp_` |
| Source of truth | `smart_contracts/navi_trust/smart_contracts/navi_trust/contract.py` | root `contract.py` with wrong layout |

**Contract source to compile:** `smart_contracts/navi_trust/contract.py` (matches ARC-56).

**Jury hash (Rule 2):** SHA-256 in tx note + `store_jury_hash_box()` witness payment — not `vh_` on deployed app.

---

## SECTION 0 — What exists (do not rebuild)

- Landing page / `frontend/` — done
- `artifacts/NaviTrust.arc56.json` — committed, immutable for this APP_ID
- Backend at repo root: `app.py`, `algorand_client.py`, `models.py`, `seed_blockchain.py`

---

## SECTION 1 — Absolute rules

1. **Chain boxes** = only source of truth for status, escrow, verdict, risk, route, certificate ASA.
2. **SQLite** = metadata only (origin, destination, lat/lon, supplier_address, created_at). **No `status` column.**
3. Every verdict → `record_verdict` on-chain + JSON in **transaction note**.
4. Every mutating endpoint → real `https://lora.algokit.io/testnet/transaction/{tx_id}`.
5. Missing `GEMINI_API_KEY` → deterministic agent fallbacks, never 500.
6. All chain logic in **`algorand_client.py`** only — not in `app.py`.
7. Oracle mnemonic from **`ORACLE_MNEMONIC`** env only.
8. Errors: JSON `{"detail": "..."}` only.
9. Arbiter `final_risk_score` drives UI confidence — never fabricated.

---

## SECTION 2 — File structure (repo root)

```
app.py
algorand_client.py
models.py
seed_blockchain.py
config.json
.env.example
requirements.txt
smart_contracts/navi_trust/contract.py
smart_contracts/navi_trust/deploy_config.py
artifacts/NaviTrust.arc56.json   # DO NOT EDIT
shipments.db
audit_trail.json
offchain_events.json
```

---

## SECTION 3 — Toolchain (mandatory)

| Tool | Use for |
|------|---------|
| **AlgoKit** | `algokit compile python`, deploy, project commands |
| **Puya (algopy)** | `contract.py` → TEAL v11 |
| **algokit_utils** | `AlgorandClient`, `AppClientMethodCallParams`, `PaymentParams` |
| **algosdk** | Low-level only inside `algorand_client.py` |
| **FastAPI** | `app.py` |
| **google-genai** | Sentinel + Arbiter (with fallbacks) |
| **VibeKit MCP** (if configured) | `github_search_code` on `algorandfoundation/*` before inventing patterns |

Before writing Algorand code: search docs (Kappa/Context7) + canonical examples (`devportal-code-examples`, `puya`).

---

## SECTION 4 — `algorand_client.py` (required surface)

**Reads:** `read_shipment_status`, `get_shipment_from_chain` / `get_shipment_full_state`, `read_supplier_reputation_on_chain`, `read_verdict_hash` (from indexer notes).

**Writes:** `register_navitrust`, `fund_shipment_oracle_microalgo` (pay + `fund_shipment`), `record_verdict_chain`, `settle_shipment_chain`, `store_jury_hash_box`, `submit_signed_txns_b64`.

**Imports (algokit_utils v3+):**

```python
from algokit_utils import AlgorandClient, AppClientMethodCallParams, PaymentParams, AlgoAmount
from algokit_utils.models.state import BoxReference
from algosdk.atomic_transaction_composer import TransactionWithSigner
```

**Box refs for app calls:** `navitrust_shipment_box_refs()` — 8 refs: `st_, sp_, by_, fn_, rs_, vd_, rt_, ce_`.

---

## SECTION 5 — 4-agent jury (app.py)

| Agent | AI? | Role |
|-------|-----|------|
| Weather Sentinel | Gemini + fallback rules | Open-Meteo risk 0–100 |
| Compliance Auditor | **No** | Deterministic chain audit, `blocked` flag |
| Fraud Detector | **No** | Heuristics (rep, re-jury timing, dispute history) |
| Chief Arbiter | Gemini + rule mirror fallback | `SETTLE` / `HOLD` / `DISPUTE` |

**Pipeline:** SQLite row → chain state → weather → agents → `compute_jury_hash()` → `record_verdict_chain` → optional `settle_shipment_chain` if `AUTO_SETTLE=1` → audit trail.

---

## SECTION 6 — API endpoints (all required)

### Read
- `GET /health` — `oracle_ready`, `app_id`, `network`
- `GET /config` — `demo_shipments`, truncated oracle address
- `GET /price` — CoinGecko + fallback, never 500
- `GET /shipments` — chain + SQLite + weather cache
- `GET /verify/{id}` — public proof
- `GET /audit-trail/{id}`, `GET /stats`, `GET /dispute-feed`
- `GET /live-transactions`, `GET /live-feed`
- `GET /logistics-events/{id}`, `GET /supplier-trust/{wallet}`

### Write
- `POST /run-jury`, `POST /settle`, `POST /register-shipment`
- `POST /verify-hash`, `POST /simulate-event`, `POST /navibot` (24/min IP limit)
- `POST /fund-shipment/build` — validate fund params (tx built in browser)
- `POST /submit-signed-txn` — broadcast Pera-signed txn(s), return Lora URL

### Wallet flow (dashboard)
1. `POST /fund-shipment/build` → microAlgo, app address
2. Browser: `buildNavitrustFundShipmentTransactions` (Algokit JS + arc56)
3. Pera sign → `POST /submit-signed-txn` **or** direct `algod.sendRawTransaction`

---

## SECTION 7 — Demo seed

`python seed_blockchain.py` — idempotent seed for the three IDs in `config.json` → **`demo_shipments`** (currently `PRM-EX-MUM-RDM-001`, `PRM-EX-CHN-SGP-002`, `PRM-EX-DEL-DXB-003`).

Requires: `ORACLE_MNEMONIC`, **`APP_ID`** matching your deployed NaviTrust, oracle ≥ 7 ALGO, contract MBR top-up.

---

## SECTION 8 — Env (`.env.example`)

```
ORACLE_MNEMONIC=...
APP_ID=<your_deployed_app_id>
ALGO_NETWORK=testnet
GEMINI_API_KEY=...
AUTO_SEED_DEMO=1
AUTO_SETTLE=0
SKIP_ORACLE_VERIFY=0
```

---

## SECTION 9 — Verification checklist

- [ ] `python -c "from app import app"`
- [ ] `GET /health` → `oracle_ready: true`
- [ ] `POST /run-jury` `{"shipment_id":"PRM-EX-MUM-RDM-001"}` (or first `demo_shipments` id) → verdict + Lora URL
- [ ] Unset `GEMINI_API_KEY` → jury still returns (fallback)
- [ ] `POST /settle` on settled shipment → 409
- [ ] `POST /submit-signed-txn` accepts signed group after Pera fund

---

## SECTION 10 — Do NOT

- Edit `artifacts/NaviTrust.arc56.json` for the live APP_ID
- Add SQLite `status` column
- Return fake Lora URLs
- Use Gemini for Auditor or Fraud Detector
- Instantiate `algod` in `app.py`
- Follow old `backend/main.py` router layout from unrelated docs

---

## SECTION 11 — Build order

1. `models.py`
2. `algorand_client.py`
3. `smart_contracts/navi_trust/contract.py` (match ARC-56, not fantasy spec)
4. `app.py`
5. `seed_blockchain.py`
6. `config.json`, `.env.example`, `requirements.txt`

---

*Set `APP_ID` after deploy | Network: Algorand Testnet | Team: AlgoBharat*
