# Navi-Trust: AI-Powered Supply Chain Risk Monitor

## Complete Project Report

---

## 1. Problem Statement

Global supply chains lose **$4 trillion annually** to fraud, delays, and opaque logistics. Insurance claims for shipping disasters (cargo damage, cold-chain breaches, port delays) are plagued by:

- **Double-claim fraud**: The same disaster event is claimed multiple times across different systems.
- **No single source of truth**: Off-chain logistics data (GPS, weather, carrier reports) is siloed and unverifiable.
- **Slow, manual adjudication**: Human arbitrators take days/weeks to approve or reject disaster claims.

**Navi-Trust** solves this by deploying an **AI-Powered Multi-Agent System (MAS)** that autonomously monitors shipments, cross-references real-time off-chain telemetry with immutable on-chain state (Algorand Box Storage), and renders fraud-proof settlement verdicts — all within seconds.

---

## 2. Solution Overview

Navi-Trust is an **Autonomous Agentic Commerce** platform that:

1. **Ingests real-time data** (weather via Open-Meteo API, GPS logistics events) via the **Logistics Sentry** agent.
2. **Verifies on-chain state** (Algorand ARC-4 Box Storage) via the **Compliance Auditor** agent — the single source of truth.
3. **Renders an immutable verdict** via the **Settlement Arbiter** agent — a fraud prevention oracle that authorizes or rejects smart-contract settlements.
4. **Records all verdicts** in a persistent audit trail (`audit_trail.json`) and makes them publicly verifiable via deep-links to Lora Algokit Explorer.
5. **Enforces Algorand immutability**: Once a disaster is recorded on-chain (`Delayed_Disaster`), the system permanently blocks duplicate claims (Double-Claim Fraud Detection).

---

## 3. Full Tech Stack

### Backend
| Component | Technology | Version / Details |
|---|---|---|
| Runtime | Python 3.11+ | — |
| Web Framework | FastAPI | with Uvicorn ASGI server |
| AI Engine | Google Gemini 2.0 Flash | via `google-genai` SDK |
| Blockchain SDK | AlgoKit Utils (`algokit_utils`) | Algorand Testnet |
| Blockchain Node | Algonode Cloud | `https://testnet-api.algonode.cloud` |
| Weather API | Open-Meteo | `https://api.open-meteo.com/v1/forecast` |
| Database | SQLite 3 | `shipments.db` — off-chain shipment state |
| Data Models | Pydantic v2 | `BaseModel` for all request/response types |
| Environment | python-dotenv | `.env` file for secrets |
| HTTP Client | Requests | Weather API calls |

### Frontend
| Component | Technology | Version / Details |
|---|---|---|
| Framework | React 18 | TypeScript, single `App.tsx` |
| Build Tool | Vite 5 | with `@vitejs/plugin-react` |
| Wallet | Pera Wallet Connect | `@perawallet/connect ^1.3.4` |
| Algorand SDK | algosdk | `^2.7.0` (ABI method calls, ATC) |
| HTTP Client | Axios | `^1.6.2` |
| Icons | Lucide React | `^0.294.0` |
| Styling | CSS Variables | Light enterprise theme in `index.css` |
| Polyfills | buffer | `^6.0.3` (Vite compatibility) |

### Blockchain (Algorand)
| Component | Details |
|---|---|
| Network | Algorand **Testnet** |
| Smart Contract | `AgriSupplyChainEscrow` (ARC-4 / ARC-56 compliant) |
| APP_ID | `756424573` |
| Contract Language | Algorand Python (compiled to TEAL) |
| Storage | **Box Storage** with `shipment_` prefix keys |
| Wallet Signing | Pera Wallet (mobile QR / WalletConnect) |
| Explorer | Lora Algokit (`lora.algokit.io/testnet`) |

### DevOps / Scripts
| Script | Purpose |
|---|---|
| `v2_testnet_deploy.py` | Deploys the smart contract to Algorand Testnet, writes `APP_ID` to `.env` |
| `seed_blockchain.py` | Funds contract MBR, registers shipments on-chain, optional `--reset` for demo re-runs |

---

## 4. Project File Structure

```
algo-hack/
├── app.py                          # FastAPI backend — MAS agents + all API endpoints
├── .env                            # Secrets (GEMINI_API_KEY, DEPLOYER_MNEMONIC, APP_ID)
├── shipments.db                    # SQLite database (auto-created on startup)
├── offchain_events.json            # Persisted logistics events (supplier-injected)
├── audit_trail.json                # Persisted MAS verdict history
├── v2_testnet_deploy.py            # Smart contract deployment script
├── seed_blockchain.py              # Blockchain seeding + off-chain reset script
├── artifacts/
│   └── AgriSupplyChainEscrow.arc56.json  # ARC-56 app spec (ABI + TEAL)
├── frontend/
│   ├── index.html                  # HTML entry point
│   ├── package.json                # NPM dependencies
│   ├── vite.config.ts              # Vite config (global polyfill, buffer alias)
│   └── src/
│       ├── main.tsx                # React entry point
│       ├── App.tsx                 # Full UI — landing page, dashboard, modals
│       └── index.css               # Global theme (light enterprise, CSS variables)
└── COMPLETE_PROJECT.md             # This file
```

---

## 5. Smart Contract ABI (AgriSupplyChainEscrow)

The on-chain contract is an ARC-4/ARC-56 compliant Algorand application with 5 methods:

| Method | Args | Returns | Description |
|---|---|---|---|
| `add_shipment` | `shipment_id: string` | `void` | Registers a new shipment in Box Storage with status `"In_Transit"` |
| `get_shipment_status` | `shipment_id: string` | `string` | Reads the current status from Box Storage (readonly) |
| `report_disaster_delay` | `shipment_id: string` | `void` | **Creator-only.** Changes status to `"Delayed_Disaster"` and triggers a 10% escrow refund to the buyer |
| `fund_escrow` | `shipment_id: string`, `payment: pay` | `void` | Accepts ALGO to fund the escrow for a specific shipment |
| `log_alert` | `message: string` | `void` | Logs an alert event on-chain |

**Box Storage Schema:**
- Key: `shipment_{SHIP_ID}` (e.g., `shipment_SHIP_001`)
- Value: UTF-8 status string, either `"In_Transit"` or `"Delayed_Disaster"`
- The first 2 bytes may be ABI length-prefix (`\x00`) — the backend handles both formats.

---

## 6. Multi-Agent System (MAS) — Detailed Architecture

The MAS is a **sequential 3-agent pipeline** that executes on every `POST /run-jury` call:

```
[Logistics Sentry] → [Compliance Auditor] → [Settlement Arbiter]
       ↓                      ↓                       ↓
  Risk Score 1-100    On-Chain Box Status     AUTHORIZED / REJECTED
  + Delay Prediction  + disaster_reported     + Fraud Prevention
```

### Agent 1: Logistics Sentry (Amber — `#d97706`)

**Class:** `LogisticsSentryAgent`
**Role:** High-level data ingestion and anomaly detection. Monitors off-chain telemetry including Open-Meteo weather and GPS logistics events to identify disruptions.

**Input:**
- Real-time weather from Open-Meteo API (temperature, precipitation, WMO code) for the shipment's GPS coordinates
- Off-chain logistics events (supplier-injected: GPS loss, cold chain breach, port congestion)

**AI Prompt Logic (Gemini 2.0 Flash):**
- WMO code >= 80 OR precipitation > 5mm → score >= 75
- Temperature > 40°C → score += 20
- Clear weather + GPS Lost event → score MUST be > 70
- Cold chain breach → score >= 80
- Port congestion / carrier delay → score += 15
- Multiple events compound
- Must predict: delay in hours, cargo damage risk, delivery failure probability

**Output:** `{ risk_score: int (1-100), reasoning: string }`

**Fallback:** If Gemini API fails, a deterministic rule-based scoring engine kicks in with the same thresholds. It flags `[Fallback-Predictive]` in the reasoning string. The fallback also estimates arrival delay (`24-48h`, `6-12h`, or `minimal`).

---

### Agent 2: Compliance Auditor (Blue — `#2563eb`)

**Class:** `ComplianceAuditorAgent`
**Role:** The Single Source of Truth. Queries the Algorand Blockchain Box Storage (APP_ID: 756424573) and verifies if the shipment status is legally `"In_Transit"` or if a claim has already been filed.

**How it works:**
1. Constructs the box key: `b"shipment_" + shipment_id.encode()`
2. Calls `algorand.client.algod.application_box_by_name(APP_ID, box_name)`
3. Base64-decodes the value and parses the status string
4. Determines `disaster_reported = (status == "Delayed_Disaster")`

**Output:** `{ blockchain_status: string, audit_report: string }`

The audit report explicitly states:
- `disaster_reported = True` → "ALERT: Disaster penalty was ALREADY claimed on-chain — any new claim is a DOUBLE-CLAIM attempt."
- `disaster_reported = False` → "Shipment is legally In_Transit — no prior claim filed. Eligible for risk assessment."
- Box not found → `"Unregistered"` — possible fraud.

**No AI is used** — this agent is purely deterministic blockchain reads.

---

### Agent 3: Settlement Arbiter (Green — `#16a34a`)

**Class:** `SettlementArbiterAgent`
**Role:** The final decision-maker in the Agentic Commerce workflow. Adjudicates the risk reports from the Logistics Sentry and the on-chain data from the Compliance Auditor to authorize a smart contract settlement. Primary goal: **Fraud Prevention (Double-Claim Rejection).**

**AI Prompt Logic (Gemini 2.0 Flash):**
Strict rule priority (no exceptions):

1. **DOUBLE-CLAIM FRAUD BLOCK (HARD REQUIREMENT):** If `disaster_reported = True` (status is `Delayed_Disaster`), MUST return `trigger_contract=false` with judgment containing `"Double-Claim Fraud Detected"`. **This is the immutability guarantee.**
2. **UNREGISTERED FRAUD BLOCK:** If status is `Unregistered`, REJECT — potential fraud.
3. **SETTLEMENT AUTHORIZATION:** If Risk Score > 80 AND status is `In_Transit`, APPROVE the smart-contract settlement trigger.
4. **INSUFFICIENT EVIDENCE:** If Risk Score <= 80, REJECT.

**Output:** `{ trigger_contract: bool, judgment: string }`

**Fallback:** Mirrors the same 4-rule cascade deterministically if Gemini fails.

---

## 7. API Endpoints (FastAPI)

Base URL: `http://localhost:8000`

| Method | Endpoint | Description | Request Body | Response |
|---|---|---|---|---|
| `GET` | `/shipments` | Returns all shipments with live weather + cached jury results | — | Array of shipment objects |
| `POST` | `/run-jury` | Executes the full MAS pipeline for one shipment | `{ shipment_id: string }` | Full jury payload with agent dialogue |
| `GET` | `/audit-trail/{shipment_id}` | Returns immutable audit history + on-chain box state | — | `{ verdicts, on_chain_status, app_id, total_scans }` |
| `POST` | `/simulate-event` | Supplier injects a logistics event | `{ shipment_id, event, severity }` | `{ status, event, total_events }` |
| `POST` | `/trigger-disaster` | Human-in-the-loop disaster confirmation after Pera signing | `?shipment_id=...` | `{ status: "authorized" }` |
| `GET` | `/stats` | Network Intelligence KPI stats | — | `{ total_scans, verified_anomalies }` |
| `GET` | `/config` | Frontend bootstrap config | — | `{ app_id, network, shipments[] }` |

### Startup Lifecycle (`on_startup`):
1. `init_db()` — Creates SQLite table + auto-seeds 3 shipments if empty
2. `load_logistics_events()` — Loads `offchain_events.json`
3. `load_verdict_history()` — Loads `audit_trail.json` into `AUDIT_TRAIL` dict

---

## 8. Data Persistence

| Store | File | Purpose | Loaded On |
|---|---|---|---|
| Shipments | `shipments.db` (SQLite) | Shipment records with status | Startup |
| Logistics Events | `offchain_events.json` | Supplier-injected events (GPS loss, cold breach, etc.) | Startup |
| Verdict History | `audit_trail.json` | All MAS verdicts with timestamps | Startup |
| Weather Cache | In-memory dict | 300s TTL per GPS coordinate | Runtime |
| Jury Cache | In-memory dict | Latest jury result per shipment | Runtime |

### Shipments SQLite Schema:
```sql
CREATE TABLE shipments (
    id          TEXT PRIMARY KEY,    -- e.g., "SHIP_001"
    origin      TEXT NOT NULL,       -- e.g., "Kochi, India"
    destination TEXT NOT NULL,       -- e.g., "Rotterdam, Netherlands"
    current_lat REAL NOT NULL,       -- GPS latitude for weather API
    current_lon REAL NOT NULL,       -- GPS longitude for weather API
    status      TEXT NOT NULL DEFAULT 'In_Transit'  -- "In_Transit" | "Delayed_Disaster"
)
```

### Seed Shipments:
| ID | Origin | Destination | Lat | Lon |
|---|---|---|---|---|
| SHIP_001 | Kochi, India | Rotterdam, Netherlands | 9.93 | 76.26 |
| SHIP_002 | Wayanad, India | Dubai, UAE | 11.68 | 76.13 |
| SHIP_003 | São Paulo, Brazil | Tokyo, Japan | -23.55 | -46.63 |

---

## 9. Frontend Architecture (App.tsx)

### State Management
All state is managed via React `useState` hooks in a single `App` component:

| State | Type | Purpose |
|---|---|---|
| `accountAddress` | `string \| null` | Connected Pera Wallet address (null = unauthenticated) |
| `role` | `'stakeholder' \| 'supplier'` | Active dashboard view |
| `shipments` | `Shipment[]` | All shipments from backend |
| `appId` | `number \| null` | Algorand APP_ID from `/config` |
| `juryRunning` | `string \| null` | Currently-running shipment ID |
| `juryResult` | `JuryResult \| null` | Settlement log modal data |
| `auditTrail` | `AuditTrailData \| null` | Audit trail modal data |
| `selectedShipment` | `Shipment \| null` | Full report modal data |
| `simulateModal` | `string \| null` | Simulate event modal target |
| `txId` | `string \| null` | Confirmed transaction ID for banner |
| `isTriggering` | `boolean` | Pera signing in progress |
| `stats` | `{ total_scans, verified_anomalies }` | KPI stats from `/stats` |

### Wallet-Gated Architecture
- **Unauthenticated** (`accountAddress === null`): Shows a full-viewport split-screen landing page
  - Left 50%: Professional supply chain hero image (Unsplash) with dark gradient overlay, "Algorand Testnet" badge, and feature tags
  - Right 50%: Navi-Trust branding, wallet selector (Pera functional, Defly/WalletConnect placeholders), "Create a wallet" link
- **Authenticated**: Shows the full dashboard with header, KPI ribbon, shipment cards, and modals

### Dashboard Layout (Authenticated)
1. **Header**: Navi-Trust logo, APP_ID, Stakeholder/Supplier role toggle, wallet pill (truncated address + green dot), disconnect button
2. **Network Intelligence Ribbon** (4 cards, all roles):
   - Active Shipments (In_Transit count / total)
   - Blockchain Status: Testnet (Online) with blinking green dot
   - Verified Anomalies (from `/stats`)
   - Tokens Locked (5,000 ALGO)
3. **Shipment Cards Grid** (responsive, min 340px):
   - Header: shipment ID, origin → destination, status badge
   - Stats: live weather, event count, risk score
   - Latest Settlement Verdict: Logistics Sentry reasoning + Compliance Auditor report
   - Actions: Authorize Settlement, Trigger (Pera signing), Audit Trail, Full Report, Simulate Delay (supplier)
4. **Modals**:
   - **Settlement Log**: Dark terminal-style display of all 3 agent messages + verdict
   - **Audit Trail**: On-chain status with Lora Explorer deep-link, verdict history
   - **Simulate Event**: 3 preset logistics events (GPS loss, cold breach, port congestion)
   - **Full Report**: Detailed breakdown of all 3 agent analyses

### Pera Wallet Transaction Signing
When the Settlement Arbiter approves a trigger, the stakeholder can click "Trigger" to:
1. Create an `AtomicTransactionComposer` with `report_disaster_delay` ABI method call
2. Sign via Pera Wallet (mobile QR scan)
3. Execute against Algorand Testnet
4. Display TX success banner with explorer link

---

## 10. Complete User Workflow (End-to-End)

### Phase 1: Setup
```bash
# 1. Deploy smart contract (one-time)
python v2_testnet_deploy.py
# → Writes APP_ID to .env

# 2. Seed shipments on-chain
python seed_blockchain.py
# → Funds contract MBR, registers SHIP_001/002/003 in Box Storage

# 3. Start backend
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# 4. Start frontend
cd frontend && npm run dev
```

### Phase 2: Demo Flow
1. **Connect Wallet**: User opens the app → split-screen landing → clicks "Pera Wallet" → scans QR with Pera mobile app → connected
2. **View Dashboard**: Sees 3 shipment cards with live weather data, all `In_Transit`
3. **Inject Event (Supplier View)**: Switch to Supplier → click "Simulate Delay" on SHIP_001 → select "GPS signal lost" (HIGH severity)
4. **Authorize Settlement (Stakeholder View)**: Switch to Stakeholder → click "Authorize Settlement" on SHIP_001
   - **Logistics Sentry** ingests weather + GPS loss event → outputs risk score > 70 (e.g., 82)
   - **Compliance Auditor** reads Algorand Box → `status = "In_Transit"`, `disaster_reported = False`
   - **Settlement Arbiter** evaluates → Risk 82 > 80, status is In_Transit → **AUTHORIZED**
5. **View Settlement Log**: Modal shows all 3 agents' reasoning in a dark terminal view
6. **Trigger On-Chain**: Red "Trigger" button appears → click → Pera Wallet signing → TX confirmed → status changes to `Delayed_Disaster` on-chain
7. **Fraud Prevention Demo**: Click "Authorize Settlement" on SHIP_001 again:
   - **Compliance Auditor** reads Box → `status = "Delayed_Disaster"`, `disaster_reported = True`
   - **Settlement Arbiter** → **REJECTED: "Double-Claim Fraud Detected"** (regardless of risk score)
8. **Audit Trail**: Click "Audit Trail" on any shipment → see all historical verdicts, on-chain status, deep-link to Lora Explorer

### Phase 3: Demo Reset
```bash
python seed_blockchain.py --reset
# Resets SQLite statuses to In_Transit, clears audit_trail.json
# Note: On-chain status (Delayed_Disaster) is IMMUTABLE — this only resets off-chain
```

---

## 11. Environment Variables (.env)

| Variable | Description | Example |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `ALGOD_ADDRESS` | Algorand node URL | `https://testnet-api.algonode.cloud` |
| `ALGOD_TOKEN` | Algorand node token (empty for Algonode) | `""` |
| `DEPLOYER_MNEMONIC` | 25-word Algorand account mnemonic | `major inhale ...` |
| `APP_ID` | Deployed smart contract application ID | `756424573` |
| `ALGO_NETWORK` | Network identifier | `testnet` |
| `WEATHER_API_URL` | Open-Meteo base URL | `https://api.open-meteo.com/v1/forecast` |

---

## 12. Key Design Decisions

### Why Box Storage (not Global/Local State)?
- Box Storage allows **per-shipment key-value pairs** with arbitrary keys (`shipment_SHIP_001`)
- No limit on the number of shipments (unlike 64-key global state limit)
- Each box is independently addressable and verifiable on-chain

### Why 3 Agents Instead of 1?
- **Separation of concerns**: Data ingestion (Sentry), verification (Auditor), adjudication (Arbiter)
- **Auditability**: Each agent's output is logged separately in the settlement log
- **Fraud prevention**: The Compliance Auditor is a pure blockchain read — no AI bias. The Arbiter cannot override the Auditor's fraud detection.

### Why Gemini + Deterministic Fallback?
- Gemini provides natural-language reasoning for human-readable verdicts
- Deterministic fallback ensures the system NEVER fails — if the AI is down, the same scoring rules execute locally
- The fallback is tagged `[Fallback-Predictive]` so judges know when AI was unavailable

### Why Pera Wallet Signing for Trigger?
- The `report_disaster_delay` method is **creator-only** — only the deployer address can call it
- Pera Wallet provides a **human-in-the-loop** checkpoint before irreversible on-chain state changes
- The transaction is signed on the user's mobile device (never on the server)

---

## 13. Security Model

| Layer | Mechanism |
|---|---|
| Wallet Authentication | Pera Wallet session (no password, no backend auth) |
| On-Chain Access Control | `report_disaster_delay` is creator-only (TEAL assertion) |
| Fraud Prevention | Immutable on-chain status — `Delayed_Disaster` can NEVER be reversed |
| Double-Claim Blocking | Settlement Arbiter has a HARD REJECT rule when `disaster_reported = True` |
| API CORS | `allow_origins=["*"]` (dev mode — restrict in production) |
| Secrets | All keys in `.env` (never committed to git) |

---

## 14. External API Integrations

### Open-Meteo Weather API
- **Endpoint:** `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,precipitation,weather_code`
- **Rate Limit:** Free tier, no API key required
- **Cache:** 300-second TTL per GPS coordinate (in-memory)
- **Data Used:** `temperature_2m` (°C), `precipitation` (mm), `weather_code` (WMO standard)

### Google Gemini 2.0 Flash
- **SDK:** `google-genai` Python package
- **Model:** `gemini-2.0-flash`
- **Usage:** Called twice per jury run (Logistics Sentry prompt + Settlement Arbiter prompt)
- **Prompt Engineering:** Strict JSON output format (`{"risk_score": int, "reasoning": string}` and `{"trigger_contract": bool, "judgment": string}`)
- **Error Handling:** Full deterministic fallback on any exception

### Algorand Testnet (Algonode)
- **Algod:** `https://testnet-api.algonode.cloud` (free, no token)
- **SDK:** `algosdk` (frontend) + `algokit_utils` (backend)
- **Operations:** Box reads (Auditor), ABI method calls (Trigger), payment transactions (MBR funding)

---

## 15. UI Theme Specification

Light enterprise theme with CSS custom properties:

| Variable | Value | Usage |
|---|---|---|
| `--bg-main` | `#f9fafb` | App background |
| `--bg-card` | `#ffffff` | Card backgrounds |
| `--text-main` | `#111827` | Primary text |
| `--text-muted` | `#6b7280` | Subtitles, labels |
| `--border-color` | `#e5e7eb` | Card borders, dividers |
| `--primary-accent` | `#2563eb` | Buttons, links, Compliance Auditor |
| `--danger` | `#dc2626` | Alerts, Delayed_Disaster status |
| `--success` | `#16a34a` | Connected status, Settlement Arbiter |
| `--warning` | `#d97706` | Logistics Sentry, event indicators |

### Agent Color Map
| Agent | Color | Hex |
|---|---|---|
| Logistics Sentry | Amber | `#d97706` |
| Compliance Auditor | Blue | `#2563eb` |
| Settlement Arbiter | Green | `#16a34a` |

---

## 16. How to Run

### Prerequisites
- Python 3.11+
- Node.js 18+
- Pera Wallet mobile app (for transaction signing)
- Algorand Testnet account with ALGO (fund via [Algorand Testnet Dispenser](https://bank.testnet.algorand.network/))

### Backend
```bash
# Install dependencies
pip install fastapi uvicorn google-genai algokit-utils python-dotenv requests pydantic

# Start server
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### First-Time Blockchain Setup
```bash
# Deploy contract (writes APP_ID to .env)
python v2_testnet_deploy.py

# Seed shipments on-chain
python seed_blockchain.py
```

### Demo Reset
```bash
python seed_blockchain.py --reset
# Then restart uvicorn
```

---

## 17. Vite Configuration

```typescript
// frontend/vite.config.ts
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',          // Fix "global is not defined" for algosdk/buffer
  },
  resolve: {
    alias: {
      buffer: 'buffer',        // Polyfill for Node.js buffer in browser
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
```

---

## 18. API Response Examples

### `POST /run-jury` Response
```json
{
  "shipment_id": "SHIP_001",
  "origin": "Kochi, India",
  "destination": "Rotterdam, Netherlands",
  "weather": {
    "temperature": 28.5,
    "precipitation": 0.0,
    "weather_code": 3
  },
  "sentinel": {
    "risk_score": 82,
    "reasoning": "GPS signal lost combined with monsoon forecast indicates high risk of cold-chain breach within 6 hours. Predicted delay: 24-48h."
  },
  "auditor": {
    "blockchain_status": "In_Transit",
    "audit_report": "COMPLIANCE AUDIT (Single Source of Truth): Algorand Blockchain Box Storage (APP_ID: 756424573) confirms shipment status = 'In_Transit'. disaster_reported = False. Shipment is legally In_Transit — no prior claim filed. Eligible for risk assessment."
  },
  "chief_justice": {
    "trigger_contract": true,
    "judgment": "SETTLEMENT AUTHORIZED — Risk Score 82/100 exceeds threshold. Shipment In_Transit with no prior claims. Smart contract disaster trigger approved."
  },
  "trigger_contract": true,
  "agent_dialogue": [
    {
      "agent": "Logistics Sentry",
      "message": "[Anomaly Detection — Risk Score: 82/100] GPS signal lost..."
    },
    {
      "agent": "Compliance Auditor",
      "message": "[Single Source of Truth — Box Status: In_Transit] COMPLIANCE AUDIT..."
    },
    {
      "agent": "Settlement Arbiter",
      "message": "[Settlement Decision: AUTHORIZED] SETTLEMENT AUTHORIZED..."
    }
  ],
  "logistics_events_used": 1
}
```

### `GET /audit-trail/SHIP_001` Response
```json
{
  "shipment_id": "SHIP_001",
  "app_id": 756424573,
  "network": "testnet",
  "on_chain_status": "Delayed_Disaster",
  "verdicts": [
    {
      "timestamp": "2026-03-02T10:30:00.000Z",
      "sentinel_score": 82,
      "auditor_status": "In_Transit",
      "verdict": "APPROVED",
      "summary": "SETTLEMENT AUTHORIZED — Risk Score 82/100 exceeds threshold..."
    },
    {
      "timestamp": "2026-03-02T10:35:00.000Z",
      "sentinel_score": 85,
      "auditor_status": "Delayed_Disaster",
      "verdict": "REJECTED",
      "summary": "REJECTED — Double-Claim Fraud Detected. The disaster penalty was ALREADY claimed..."
    }
  ],
  "total_scans": 2
}
```

---

## 19. Algorand Blockchain Verification

All on-chain state is publicly verifiable:

- **Application Page:** `https://lora.algokit.io/testnet/application/756424573`
- **Box Storage:** `https://lora.algokit.io/testnet/application/756424573/boxes`
- **Transaction Explorer:** `https://testnet.explorer.perawallet.app/tx/{TX_ID}`

The Audit Trail modal in the UI provides clickable deep-links to both the application page and box storage page on Lora Explorer.

---

*Navi-Trust — AI-Powered Supply Chain Risk Monitor. Built on Algorand. Powered by Google Gemini 2.0 Flash.*
