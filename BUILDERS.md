# Pramanik — A Builder’s Guide  
### *Story, vision, architecture, and how we built it*

---

## The story we’re telling

Global supply chains move trillions of dollars of goods—and an enormous amount of **trust** is still negotiated by email, lawyers, and slow dispute resolution. A supplier says the cargo was delayed by weather; a buyer says the documents were late. Everyone has a spreadsheet; nobody has a **single source of truth** that is both **tamper-evident** and **machine-checkable**.

**Pramanik** (प्रमाणिक — “authentic,” “evidential”) is our answer in miniature: a **dispute oracle** where **money and truth meet on-chain**.

- **Money:** escrow is not “in our database”—it is **ALGO locked in smart contract logic** on Algorand Testnet.
- **Truth:** an **AI jury** (four agents) reads real-world signals (weather, chain state, reputation) and produces a **verdict** that is **hashed**, **witnessed**, and **written into the ledger** through the oracle.
- **Settlement:** when the story allows it, **settlement** is designed to be **atomic**—release escrow and mint a **certificate-style NFT** so the outcome is not just a row in SQLite but something you can point to on an explorer.

We built this as a **hackathon-grade vertical slice**: not a slide deck, but a **working stack**—wallet, API, contract, AI, and a dashboard a judge can click through.

---

## Why this problem

| Pain | What happens today | What Pramanik pushes toward |
|------|--------------------|-----------------------------|
| Disputes are slow | Weeks of back-and-forth | Verdict path + on-chain notes in minutes (TestNet) |
| Escrow is fuzzy | “We’ll pay when legal agrees” | Escrow rules encoded; oracle-signed transitions |
| Evidence is scattered | PDFs in inboxes | Canonical jury hash + verify endpoints |
| Trust is brand-based | “Believe the platform” | **Verify** any shipment id via public API—no login |

We’re not claiming to replace courts or full trade finance stacks. We **demonstrate** how **Algorand + structured AI + open APIs** can anchor a supply-chain narrative in **verifiable state**.

---

## Why Algorand (and not “just a database”)

1. **Boxes** — Per-shipment state (status, funds, verdict fragments, routes, reputation pointers) lives in **application box storage**, readable by indexers and our backend with clear semantics.
2. **Atomic groups** — **Settlement** is expressed as **one user- or oracle-driven atomic group** where the contract can move value and create assets in a single bound—reducing “paid but cert not minted” style races.
3. **Finality & cost** — TestNet rounds confirm quickly; fees stay negligible for demo-scale throughput—so the **oracle can afford** to write real transactions for demos and tests.
4. **AlgoKit + ARC-56** — Typed clients and ABI discipline mean the **Python backend** and **TypeScript wallet flows** don’t guess method selectors—we **compile and call** against the same contract the explorer shows.

In one line: **we wanted the dispute outcome to be something you could paste into Lora or Pera’s explorer and still recognize tomorrow.**

---

## What we built (the vertical slice)

### 1. Smart contract (NaviTrust — Puya / AlgoKit)

- **Register** shipments with route metadata.
- **Fund** escrow from the buyer path (`fund_shipment`).
- **Record verdicts** from the oracle (`record_verdict`) with notes that support auditability.
- **Settle** when policy allows—escrow release + **PRAMANIK-CERT** style NFT (ARC-69) where the contract supports it.
- **Global stats**, **pause** levers, **MBR** hints—so ops and demos don’t fly blind.

Box naming is intentional: prefixes like `st_`, `fn_`, `vd_`, `ce_`, `rp_` map to **status**, **funds**, **verdict**, **certificate**, **reputation**—so builders can grep the code and the chain with the same mental model.

### 2. Backend (`app.py` — FastAPI)

- **REST API** for dashboards, verification, dispute feed, prices, supplier reputation, NaviBot, and jury orchestration.
- **Oracle signing** using **algokit-utils** + **py-algorand-sdk**—the server holds the oracle mnemonic in **hosting env**, never in the browser.
- **Gemini** (and optional fallbacks) for multi-agent reasoning—**deterministic fallbacks** when APIs fail so demos don’t white-screen.
- **SQLite** for indexing and UX (shipments list, timestamps, off-chain enrichment)—**source of truth for funds** remains the contract; SQLite is a **cache and join layer** for the UI.
- **CORS** tuned for **Vercel** (including preview URLs via regex) so the static frontend can call the API from real browser origins.

### 3. Frontend (React + Vite + TypeScript)

- **Pera Wallet** for real TestNet accounts—no fake “demo wallet” in the critical path for hackathon judging.
- **Client-built transaction groups** where needed (e.g. funding flows) so the browser isn’t trying to decode Python msgpack blobs—**Algokit + algosdk v3** on the wire the chain expects.
- **Dashboard** — escrow story, jury education, live verdict terminal, verify tab, protocol page, **NaviBot** panel for conversational access to the same backend brain.
- **Production config** via **`VITE_API_URL`** and **`VITE_APP_ID`** so one codebase targets **local**, **Vercel**, and **any** hosted API.

### 4. AI jury pipeline (four agents)

A **pipeline**, not a monolith prompt:

1. **Weather Sentinel** — Open-Meteo (and fallbacks) for **destination-relevant** risk.
2. **Compliance Auditor** — reads **on-chain/box context** so the model isn’t inventing ledger state.
3. **Fraud Detector** — supplier reputation and anomaly framing—**skeptical but bounded** copy in prompts.
4. **Chief Arbiter** — merges into a **binding-style** verdict with scores and narrative.

Then we **hash** canonical inputs/outputs so **`/verify-hash`** and on-chain notes can be compared—**integrity by design**, not by trust in a single log line.

### 5. Operations & demo data

- **`seed_blockchain.py`** — idempotent TestNet lanes (Mumbai→Dubai in transit, Chennai→Rotterdam disputed, Delhi→Singapore settled) when the oracle is **funded** and `APP_ID` matches.
- **Auto-seed** path on API boot (when balance/env allow) so Render-style hosts can spin up with **something to show**—with clear logs when skipped (e.g. low oracle balance).

---

## How it works — user journeys

### Buyer / operator

1. Open the web app (local or Vercel).
2. Connect **Pera** on **TestNet**.
3. **Register** a shipment (oracle-signed path)—route and ids land in boxes + DB.
4. **Fund** escrow—client builds the group; user signs in wallet.
5. Run **jury** from the dashboard—backend calls Gemini, writes verdict through **`record_verdict`** when appropriate.
6. **Settle** when policy allows—atomic release + cert NFT where supported.

### Public verifier (no wallet)

- Hit **`GET /verify/{shipment_id}`** or use the **Verify** page—explorer links and structured JSON for **“show me the proof”** demos.

### Builder integrating externally

- Use **`/dispute-feed`**, **`/price`**, **`/supplier/{addr}/reputation`**, **`POST /verify-hash`** as **composable HTTP**—no OAuth wall for reads; add your own auth at the edge if you fork for production.

---

## What we actually *did* (engineering choices worth stealing)

| Choice | Why |
|--------|-----|
| **Oracle on server, wallet on client** | Mnemonics never ship to Vite; only `VITE_*` public config does. |
| **ARC-56 clients** | Fewer “wrong method / wrong type” bugs across Python + TS. |
| **Box-first mental model** | Docs, code, and explorer line up—easier handoff to the next builder. |
| **Hash + verify endpoints** | Makes “AI said so” **auditable** instead of magical. |
| **SQLite + chain** | Fast UI; chain remains authoritative for value and final status. |
| **CORS + `VITE_API_URL`** | Realistic split deploy: **static edge + Python API** without coupling repos. |

---

## Repository map (where to look first)

| Path | What |
|------|------|
| `app.py` | FastAPI app, routes, jury, NaviBot, CORS, lifespan hooks |
| `algorand_client.py` | Chain reads/writes, register/fund/settle helpers |
| `frontend/src/` | UI, wallet, transaction builders, API constants |
| `frontend/src/constants/api.ts` | **`BACKEND_URL`** resolution (`VITE_API_URL`, prod fallback) |
| `seed_blockchain.py` | Canonical TestNet seed script |
| `smart_contracts/` | Contract sources (AlgoKit / Puya) |
| `LORA_PROOF.md` | On-chain proof notes / explorer anchors |
| `.env.example` | Backend env template |
| `frontend/.env.example` | Frontend `VITE_*` template |

---

## For builders who fork this

1. **Deploy the contract** (or point to an existing `APP_ID` you control).
2. Set **`APP_ID`**, **`ORACLE_MNEMONIC`**, **`GEMINI_API_KEY`**, **`ALGO_NETWORK`** on the API host.
3. Set **`VITE_APP_ID`** and **`VITE_API_URL`** on Vercel; **redeploy** after env changes.
4. **Fund the oracle** on TestNet—auto-seed and write paths expect **real microAlgos**.
5. Read the shorter **[README.md](./README.md)** for command cheatsheets and endpoint lists.

---

## Closing — the pitch in one breath

**Pramanik** is a **story about trust you can verify**: escrow on **Algorand**, disputes informed by **real weather and real chain state**, outcomes that leave **hashes and transactions** behind—not just a row in someone else’s admin panel.

Built for builders who want **code that demos**, **architecture that scales in principle**, and **honesty** about what’s simulated vs. what’s on-chain.

---

*AlgoBharat Hackathon Round 2 — Pramanik team.*
