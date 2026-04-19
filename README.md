# Pramanik (प्रमाणिक) — Supply Chain Dispute Oracle on Algorand

> Buyer locks ALGO. 4-agent AI jury decides. Verdict is permanent on Algorand.

**Live Demo:** https://pramanik.vercel.app  
**API:** https://navi-trust-api.onrender.com  
**Contract on Lora:** https://lora.algokit.io/testnet/application/759018740  
**On-chain proof:** [LORA_PROOF.md](./LORA_PROOF.md)

### Deploy frontend (Vercel)

- **Root directory:** set to `frontend` *or* deploy the repo root (root `vercel.json` builds `frontend/dist`).
- **Env (build):** set `VITE_APP_ID` and optionally `VITE_ALGORAND_NODE` / `VITE_INDEXER_URL` to match TestNet. Leave **`VITE_API_URL` unset** so the app uses same-origin `/api` and `vercel.json` proxies to the API (avoids CORS). To call a custom API URL instead, set `VITE_API_URL` and add your Vercel domain to the backend `CORS_EXTRA_ORIGINS` (or the allowlist in `app.py`).
- **Backend:** host FastAPI separately (e.g. Render) and ensure `ORACLE_MNEMONIC`, `APP_ID`, and ARC56 artifacts match the contract you point wallets at.

---

## What It Solves

Supply chain disputes cost billions annually in delayed payments and litigation. Pramanik provides:

- **Trust-minimized escrow** — ALGO held by smart contract code, not a platform
- **AI-powered evidence review** — four independent agents analyze weather, compliance, and fraud
- **Immutable verdict** — decision written to an Algorand transaction note
- **Atomic settlement** — escrow payment + NFT certificate in one atomic group (where the contract supports it)
- **Public verification** — anyone verifies any shipment at `/verify/{id}` without login

---

## Why Algorand

| Algorand Feature | How Pramanik Uses It |
|---|---|
| Box Storage | Per-shipment state: status, funds, verdict, risk score, route, certificate |
| Atomic Groups | Settlement: payment to supplier + PRAMANIK-CERT NFT mint in one transaction |
| ARC-69 NFTs | Unique settlement certificate per shipment (total supply: 1) |
| Fast Finality | Jury verdict confirms in seconds on TestNet |
| AlgoKit ARC-56 | Typed smart contract client, verified ABI on Lora |
| Low Fees | Oracle writes transactions per shipment at negligible cost |

---

## 4-Agent AI Jury

Each agent runs sequentially. Live Open-Meteo weather and real box reads are required; deterministic fallbacks apply only when an API is unreachable.

```
Weather Sentinel   → Live Open-Meteo data for destination city
       ↓
Compliance Auditor → Reads Algorand box storage
       ↓
Fraud Detector     → Supplier history + anomaly signals
       ↓
Chief Arbiter      → Final binding verdict (weighted score)
       ↓
SHA-256 Hash       → Canonical hash; witness note + verdict note on-chain
       ↓
record_verdict()   → Oracle ABI call writes verdict + note
```

---

## Verifiable Jury Hash

Every verdict includes a SHA-256 hash of canonical inputs and outputs. Compare with on-chain notes via:

```bash
curl -X POST https://navi-trust-api.onrender.com/verify-hash \
  -H "Content-Type: application/json" \
  -d "{\"shipment_id\": \"SHIP_MUMBAI_001\"}"
```

---

## Smart Contract

**App ID:** 759018740 | **Network:** Algorand Testnet  
**Language:** Puya (AlgoKit) | **ABI:** ARC-56

| Method | What it does |
|---|---|
| `register_shipment` | Oracle registers shipment, writes box storage |
| `fund_shipment` | Buyer locks ALGO via atomic payment + app call |
| `record_verdict` | Oracle writes verdict to boxes + transaction note |
| `settle_shipment` | Atomic: pay supplier + mint PRAMANIK-CERT NFT |
| `pause_oracle` / `unpause_oracle` | Oracle pauses or resumes write paths that honor `is_paused` |
| `get_required_mbr` | Read-only: conservative MBR estimate for registration |
| `get_global_stats` | Read-only: totals, dispute count, pause flag |

Box prefixes: `st_` status · `fn_` funds · `vd_` verdict · `ce_` certificate · `rp_` reputation

---

## Public API

No authentication required for read endpoints:

```
GET  /verify/{shipment_id}         — Full on-chain proof for any shipment
GET  /dispute-feed                 — Active disputes + recent jury rows
GET  /price                        — Live ALGO/USD (CoinGecko)
POST /verify-hash                  — Verify jury hash vs on-chain witness
GET  /witnesses/{shipment_id}      — On-chain witnesses for a shipment
GET  /supplier/{addr}/reputation   — Supplier reputation score
```

These routes are intended as reusable building blocks for supply chain, trade finance, or insurance integrations on Algorand.

---

## Run Locally

```bash
cp .env.example .env   # set GEMINI_API_KEY, ORACLE_MNEMONIC, APP_ID
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000

python seed_blockchain.py   # optional: on-chain demo lanes (requires funded oracle)

cd frontend
npm install
npm run dev
```

---

## Demo Shipments (TestNet)

| Shipment | Route | Role in demo |
|---|---|---|
| SHIP_MUMBAI_001 | Mumbai → Dubai | In transit — run AI jury |
| SHIP_CHEN_002 | Chennai → Rotterdam | Disputed — escrow frozen |
| SHIP_DELHI_003 | Delhi → Singapore | Settled — certificate |

See [LORA_PROOF.md](./LORA_PROOF.md) for explorer links after seeding.

---

## Tech Stack

- **Blockchain:** Algorand Testnet, AlgoKit, Puya, ARC-56, ARC-69
- **AI:** Google Gemini (via `google-genai`, multi-model fallback chain)
- **Backend:** FastAPI, py-algorand-sdk, algokit-utils
- **Frontend:** React 18, TypeScript, Vite, TanStack Query, Pera Wallet
- **Data:** Open-Meteo (weather), CoinGecko (ALGO spot)

---

*Built for AlgoBharat Hackathon Round 2.*
