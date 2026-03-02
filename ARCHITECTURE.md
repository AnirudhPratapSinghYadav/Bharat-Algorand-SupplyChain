# Agri-Jury — Full Technical Architecture Report

## Table of Contents
1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Component Deep Dive](#3-component-deep-dive)
4. [Algorand Blockchain Layer](#4-algorand-blockchain-layer)
5. [Smart Contract Specification](#5-smart-contract-specification)
6. [Multi-Agent System (MAS) Engine](#6-multi-agent-system-mas-engine)
7. [Data Architecture](#7-data-architecture)
8. [API Layer](#8-api-layer)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Security & Fraud Prevention](#10-security--fraud-prevention)
11. [Deployment Pipeline](#11-deployment-pipeline)
12. [Network Topology](#12-network-topology)
13. [Sequence Diagrams](#13-sequence-diagrams)
14. [Error Handling & Resilience](#14-error-handling--resilience)
15. [Caching Strategy](#15-caching-strategy)
16. [Configuration Reference](#16-configuration-reference)

---

## 1. System Overview

**Agri-Jury** is a decentralized supply-chain risk monitoring platform that combines a **Multi-Agent AI System** (powered by Google Gemini 2.0 Flash) with **Algorand blockchain** smart contracts to detect weather/logistics risks, verify on-chain shipment state, prevent double-claim fraud, and authorize escrow refunds — all with human-in-the-loop wallet signing.

### Core Thesis
> When agricultural shipments face disaster-level delays, AI agents collaboratively assess risk while the blockchain provides a single source of truth to prevent fraudulent duplicate claims. The smart contract autonomously executes a 10% escrow refund to the buyer when a disaster is confirmed.

### Key Capabilities
- Real-time weather monitoring via Open-Meteo API
- Off-chain logistics event ingestion (GPS loss, cold chain breach, port congestion)
- 3-agent AI jury: Sentinel (risk scoring) → Auditor (on-chain verification) → Chief Justice (consensus + fraud check)
- Algorand Box Storage for immutable shipment state tracking
- Pera Wallet integration for human-in-the-loop transaction signing
- Automatic 10% escrow refund on confirmed disaster
- Double-claim fraud prevention (AI + on-chain guard)

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        USER (Browser)                                │
│   ┌─────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│   │  React App  │   │  Pera Wallet │   │  algosdk (ABI calls)    │  │
│   │  (Vite/TS)  │◄─►│  @perawallet │   │  AtomicTransactionComposer│
│   └──────┬──────┘   └──────┬───────┘   └────────────┬────────────┘  │
│          │                 │                         │               │
└──────────┼─────────────────┼─────────────────────────┼───────────────┘
           │ HTTP/REST       │ WalletConnect            │ algod REST
           │ (axios)         │                          │
           ▼                 ▼                          ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────────────┐
│  FastAPI Backend  │  │  Pera Mobile │  │   Algorand Testnet           │
│  (Python 3.11+)   │  │  / Web Wallet│  │   ┌─────────────────────┐   │
│                    │  └──────────────┘  │   │ AlgoNode (algod)    │   │
│  ┌──────────────┐ │                     │   │ testnet-api.algonode │   │
│  │  Sentinel    │ │                     │   │ .cloud              │   │
│  │  Agent (AI)  │ │                     │   └──────────┬──────────┘   │
│  ├──────────────┤ │                     │              │              │
│  │  Auditor     │─┼─────────────────────┼──────────────┤              │
│  │  Agent       │ │  algod box read     │              │              │
│  ├──────────────┤ │                     │   ┌──────────▼──────────┐   │
│  │  Chief       │ │                     │   │  APP_ID: 756424573  │   │
│  │  Justice(AI) │ │                     │   │  (ARC-4 Contract)   │   │
│  └──────────────┘ │                     │   │  Box Storage:       │   │
│                    │                     │   │  shipment_SHIP_001  │   │
│  ┌──────────────┐ │                     │   │  shipment_SHIP_002  │   │
│  │  SQLite DB   │ │                     │   │  shipment_SHIP_003  │   │
│  │ shipments.db │ │                     │   │  buyer_*, funds_*   │   │
│  └──────────────┘ │                     │   └─────────────────────┘   │
│                    │                     │                             │
│  ┌──────────────┐ │                     └─────────────────────────────┘
│  │  Open-Meteo  │◄┤
│  │  Weather API │ │                     ┌─────────────────────────────┐
│  └──────────────┘ │                     │  Google Gemini 2.0 Flash    │
│                    │◄────────────────────│  (genai API)                │
│  ┌──────────────┐ │  AI inference       │  Sentinel + Chief Justice   │
│  │ offchain_    │ │                     └─────────────────────────────┘
│  │ events.json  │ │
│  └──────────────┘ │
└──────────────────┘
```

---

## 3. Component Deep Dive

### 3.1 Frontend (React + TypeScript + Vite)

| File | Purpose |
|---|---|
| `frontend/src/main.tsx` | React entry point, renders `<App />` in StrictMode |
| `frontend/src/App.tsx` | Single-file application — all state, UI, API calls, wallet logic |
| `frontend/src/index.css` | Global styles, glassmorphism theme, grid, modals |
| `frontend/vite.config.ts` | Vite config with `buffer` polyfill for algosdk browser compat |
| `frontend/package.json` | Dependencies: react 18, algosdk 2.7, perawallet 1.3.4, axios, lucide-react |

**Key Libraries:**
- `@perawallet/connect` — WalletConnect bridge to Pera mobile/web wallet
- `algosdk` — Algorand JavaScript SDK for ABI method calls, transaction composition
- `axios` — HTTP client for backend REST API
- `lucide-react` — Icon library (18 icons used)

### 3.2 Backend (FastAPI + Python)

| File | Purpose |
|---|---|
| `app.py` | Monolithic backend: agents, endpoints, SQLite, Algorand client |
| `offchain_events.json` | Persistent store for simulated logistics events |
| `shipments.db` | SQLite database (auto-created on first run) |

**Key Libraries:**
- `fastapi` + `uvicorn` — ASGI web framework and server
- `google-genai` — Google Gemini 2.0 Flash client
- `algokit_utils` — AlgoKit utilities for Algorand client, transactions, app clients
- `sqlite3` — Standard library database
- `requests` — HTTP client for Open-Meteo
- `pydantic` — Request/response validation models

### 3.3 Blockchain Scripts

| File | Purpose |
|---|---|
| `agri_escrow.py` | Algorand Python (Puya/algopy) smart contract source |
| `v2_testnet_deploy.py` | One-time deployment script → creates APP_ID, writes to .env |
| `seed_blockchain.py` | Funds MBR + registers shipments in Box Storage |
| `artifacts/AgriSupplyChainEscrow.arc56.json` | Compiled ARC-56 app spec (ABI, state schema, TEAL) |
| `artifacts/AgriSupplyChainEscrow.approval.teal` | Compiled approval program |
| `artifacts/AgriSupplyChainEscrow.clear.teal` | Compiled clear-state program |

---

## 4. Algorand Blockchain Layer

### 4.1 Network Configuration

| Parameter | Value |
|---|---|
| **Network** | Algorand Testnet |
| **Node Provider** | AlgoNode (free, public) |
| **Algod URL** | `https://testnet-api.algonode.cloud` |
| **Algod Token** | `""` (empty — AlgoNode is public) |
| **Explorer** | `https://testnet.explorer.perawallet.app` |
| **APP_ID** | `756424573` |
| **Compiler** | Puya 5.7.1 (algopy → TEAL v11) |
| **ARC Standards** | ARC-4 (ABI), ARC-22, ARC-28, ARC-56 (app spec) |

### 4.2 Application Address

The smart contract has its own Algorand address derived from `APP_ID`:
```
Application Address = get_application_address(756424573)
```
This address holds ALGO for Minimum Balance Requirement (MBR) and escrow funds.

### 4.3 Box Storage Layout

The contract uses three `BoxMap` structures. Each box key is prefixed and maps to a value:

| BoxMap | Key Prefix (raw) | Key Prefix (base64) | Key Type | Value Type | Purpose |
|---|---|---|---|---|---|
| `shipments` | `shipment_` | `c2hpcG1lbnRf` | `AVMString` | `AVMString` | Shipment status (e.g. "In_Transit", "Delayed_Disaster") |
| `shipment_buyers` | `buyer_` | `YnV5ZXJf` | `AVMString` | `address` (32 bytes) | Buyer's Algorand address |
| `shipment_funds` | `funds_` | `ZnVuZHNf` | `AVMString` | `uint64` | Escrowed ALGO amount in microAlgo |

**Concrete Box Names on Testnet:**

| Box Key (bytes) | Contains | Example Value |
|---|---|---|
| `shipment_SHIP_001` | Status string | `"In_Transit"` or `"Delayed_Disaster"` |
| `shipment_SHIP_002` | Status string | `"In_Transit"` |
| `shipment_SHIP_003` | Status string | `"In_Transit"` |
| `buyer_SHIP_001` | 32-byte address | (set after fund_escrow) |
| `funds_SHIP_001` | uint64 | (microAlgo balance for escrow) |

### 4.4 Minimum Balance Requirement (MBR)

Each box incurs an MBR cost on Algorand:
```
MBR per box = 2500 + 400 * (key_size + value_size) microAlgo
```

For a `shipment_` box with key `"SHIP_001"` (8 bytes) and value `"In_Transit"` (10 bytes):
- Key size = len("shipment_") + 8 = 17 bytes
- Value size = 10 bytes
- MBR = 2500 + 400 * (17 + 10) = **13,300 microAlgo** per box

The `seed_blockchain.py` script targets 0.5 ALGO total in the contract to cover MBR for all 3 shipment boxes plus buyer/funds boxes.

### 4.5 Box Value Encoding

Algorand stores box values as raw bytes. The `algopy.String` type stores UTF-8 directly (no ARC-4 length prefix). When reading:

```python
raw = base64.b64decode(box_resp["value"])
status = raw.decode("utf-8") if raw[:2] != b"\x00" else raw[2:].decode("utf-8")
```

This dual decode handles both raw UTF-8 and potential ARC-4 length-prefixed strings.

---

## 5. Smart Contract Specification

### 5.1 Source Code (`agri_escrow.py`)

Written in **Algorand Python (Puya)** using the `algopy` framework. Compiles to TEAL v11.

```python
class AgriSupplyChainEscrow(ARC4Contract):
    def __init__(self):
        self.shipments = BoxMap(String, String, key_prefix="shipment_")
        self.shipment_buyers = BoxMap(String, Account, key_prefix="buyer_")
        self.shipment_funds = BoxMap(String, UInt64, key_prefix="funds_")
```

### 5.2 ABI Methods

#### `create_app()` — Bare Method
- **On-Completion:** NoOp
- **Create:** Required
- **Description:** Application creation (bare call, no args)

#### `log_alert(message: string) → void`
- **Access:** Anyone
- **Action:** Emits an ARC-28 event `Alert(message)`
- **Use Case:** General-purpose on-chain logging

#### `add_shipment(shipment_id: string) → void`
- **Access:** Anyone (in practice, deployer only)
- **Guards:** `assert shipment_id not in self.shipments` (prevents duplicates)
- **Action:** Creates box `shipment_{shipment_id}` with value `"In_Transit"`
- **MBR:** Caller must cover box MBR

#### `get_shipment_status(shipment_id: string) → string`
- **Access:** Readonly (no state changes)
- **Guards:** `assert shipment_id in self.shipments`
- **Returns:** Current status string from box storage

#### `fund_escrow(shipment_id: string, payment: pay) → void`
- **Access:** Anyone (buyer)
- **Guards:**
  1. `shipment_id` must exist in `self.shipments`
  2. Status must be `"In_Transit"` (cannot fund after disaster)
  3. Payment receiver must be the contract address
  4. If buyer already recorded, sender must match
- **Action:**
  - Records buyer address in `buyer_{shipment_id}` box
  - Records/accumulates payment amount in `funds_{shipment_id}` box
- **Transaction Group:** Requires a preceding payment transaction

#### `report_disaster_delay(shipment_id: string) → void`
- **Access:** Creator only (`assert Txn.sender == Global.creator_address`)
- **Guards:**
  1. Shipment must exist
  2. Status must be `"In_Transit"` (prevents double-claim at contract level)
- **Action:**
  1. Updates box to `"Delayed_Disaster"`
  2. Calculates 10% of escrowed funds
  3. If refund > 0, executes an inner payment transaction to the buyer
  4. Deducts refund from `funds_{shipment_id}`
- **Inner Transaction:** `itxn.Payment(receiver=buyer, amount=refund_amount, fee=0)`

### 5.3 On-Chain State Transitions

```
                    add_shipment()
     ┌──────────┐ ──────────────────► ┌──────────────┐
     │  (none)  │                     │  In_Transit  │
     └──────────┘                     └──────┬───────┘
                                             │
                              report_disaster_delay()
                          (creator only, refunds 10%)
                                             │
                                     ┌───────▼────────────┐
                                     │ Delayed_Disaster    │
                                     │ (terminal state)    │
                                     └────────────────────┘
```

**Invariants:**
- A shipment can only transition from `In_Transit` → `Delayed_Disaster` (one-way)
- Only the contract creator (deployer/oracle) can trigger the transition
- Escrow funding is only possible while `In_Transit`
- Double-claim is impossible: `assert status == "In_Transit"` rejects repeated calls

### 5.4 Compiled Artifacts

| File | Size | Purpose |
|---|---|---|
| `AgriSupplyChainEscrow.arc56.json` | ~8KB | Full ABI, state schema, source maps, TEAL bytecode |
| `AgriSupplyChainEscrow.approval.teal` | ~4KB | TEAL v11 approval program |
| `AgriSupplyChainEscrow.clear.teal` | ~50B | Clear-state program (always approves) |

ARC-56 includes:
- Method selectors: `log_alert=0x7f41f336`, `add_shipment=0x6d399775`, `get_shipment_status=0x76ec76aa`, `fund_escrow=0x5610f2d6`, `report_disaster_delay=0x86f7adea`
- Error messages mapped to program counters for debuggability
- Source maps for Puya decompilation

---

## 6. Multi-Agent System (MAS) Engine

### 6.1 Architecture

The MAS runs as a **sequential pipeline** triggered on-demand via `POST /run-jury`:

```
                        POST /run-jury { shipment_id: "SHIP_001" }
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │  1. QUERY SQLite          │
                          │  Get lat, lon, status     │
                          └────────────┬─────────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │  2. FETCH WEATHER         │
                          │  Open-Meteo API           │
                          │  (cached 5 min)           │
                          └────────────┬─────────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │  3. LOAD LOGISTICS EVENTS │
                          │  Filter offchain_events   │
                          │  by shipment_id           │
                          └────────────┬─────────────┘
                                       │
               ┌───────────────────────▼───────────────────────┐
               │              SENTINEL AGENT                    │
               │  Input: weather + logistics events             │
               │  AI: Gemini 2.0 Flash (structured JSON prompt) │
               │  Fallback: deterministic threshold rules       │
               │  Output: { risk_score: 1-100, reasoning: str } │
               └───────────────────────┬───────────────────────┘
                                       │
               ┌───────────────────────▼───────────────────────┐
               │              AUDITOR AGENT                     │
               │  Input: shipment_id                            │
               │  Method: algod.application_box_by_name()       │
               │  No AI — direct Algorand node read             │
               │  Output: { blockchain_status, audit_report,    │
               │            disaster_reported: bool }           │
               └───────────────────────┬───────────────────────┘
                                       │
               ┌───────────────────────▼───────────────────────┐
               │           CHIEF JUSTICE AGENT                  │
               │  Input: Sentinel prediction + Auditor state    │
               │  AI: Gemini 2.0 Flash (rule-based prompt)      │
               │  Fallback: deterministic decision tree         │
               │  Output: { trigger_contract: bool,             │
               │            judgment: str }                     │
               └───────────────────────┬───────────────────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │  POST-PROCESSING          │
                          │  - Update SQLite if       │
                          │    APPROVED + In_Transit   │
                          │  - Cache result            │
                          │  - Append audit trail      │
                          │  - Return agent_dialogue   │
                          └──────────────────────────┘
```

### 6.2 Agent Specifications

#### Sentinel Agent
| Property | Value |
|---|---|
| **Class** | `SentinelAgent` |
| **AI Model** | Gemini 2.0 Flash (`gemini-2.0-flash`) |
| **Input** | `shipment_id`, `WeatherData`, `List[logistics_events]` |
| **Output** | `RiskPrediction { risk_score: int, reasoning: str }` |
| **Prompt Strategy** | Structured rules: WMO >= 80 → severe, precip > 5mm → severe, temp > 40 → perishable, logistics events → elevated |
| **Response Format** | JSON: `{"risk_score": <int>, "reasoning": "<str>"}` |
| **Fallback** | Deterministic: base=20, WMO>=80→85, temp>35→70, high-severity event→80, any event→55 |

**Sentinel Fallback Decision Tree:**
```
base_score = 20
if weather_code >= 80 OR precipitation > 5mm:
    base_score = 85
elif temperature > 35°C:
    base_score = 70
if any high-severity event:
    base_score = max(base_score, 80)
elif any event exists:
    base_score = max(base_score, 55)
```

#### Auditor Agent
| Property | Value |
|---|---|
| **Class** | `AuditorAgent` |
| **AI Model** | None (deterministic) |
| **Input** | `shipment_id` |
| **Output** | `BlockchainState { blockchain_status: str, audit_report: str }` |
| **Method** | `algorand.client.algod.application_box_by_name(APP_ID, box_name)` |
| **Box Name** | `b"shipment_" + shipment_id.encode("utf-8")` |
| **Key Output** | `disaster_reported = (status == "Delayed_Disaster")` embedded in audit_report |
| **Failure** | Returns `blockchain_status = "Unregistered"` |

#### Chief Justice Agent
| Property | Value |
|---|---|
| **Class** | `ChiefJusticeAgent` |
| **AI Model** | Gemini 2.0 Flash (`gemini-2.0-flash`) |
| **Input** | `RiskPrediction` from Sentinel, `BlockchainState` from Auditor |
| **Output** | `{ trigger_contract: bool, judgment: str }` |
| **Prompt Strategy** | Ordered rule evaluation (see below) |
| **Response Format** | JSON: `{"trigger_contract": <bool>, "judgment": "<str>"}` |

**Chief Justice Decision Rules (strict priority order):**

| Priority | Rule | Condition | Result |
|---|---|---|---|
| 1 | **DOUBLE-CLAIM FRAUD** | `disaster_reported = true` (status = "Delayed_Disaster") | REJECT — fraud prevention |
| 2 | **UNREGISTERED** | status = "Unregistered" | REJECT — no on-chain record |
| 3 | **TRIGGER APPROVAL** | risk_score > 80 AND status = "In_Transit" | APPROVE — authorize contract trigger |
| 4 | **INSUFFICIENT EVIDENCE** | risk_score <= 80 | REJECT — threshold not met |

**Fallback (when Gemini unavailable):**
```python
if status == "Delayed_Disaster":
    trigger = False  # Double-claim fraud prevention
elif status == "Unregistered":
    trigger = False  # Potential fraud
elif risk_score > 80 and status == "In_Transit":
    trigger = True   # Risk exceeds threshold
else:
    trigger = False  # Insufficient evidence
```

### 6.3 Agent Communication Pattern

Agents do not communicate directly. They follow a strict **pipeline** pattern where each agent's output becomes the next agent's input. The backend orchestrates the handoff:

```
Sentinel.analyze(weather, events)
    │
    └──► prediction: RiskPrediction
              │
              ├──► Auditor.audit(shipment_id)
              │        │
              │        └──► state: BlockchainState
              │                    │
              └────────────────────┤
                                   │
                    ChiefJustice.deliberate(prediction, state)
                              │
                              └──► { trigger_contract, judgment }
```

---

## 7. Data Architecture

### 7.1 Data Sources & Ownership

```
┌─────────────────────────────────────────────────────┐
│                 DATA SOURCES                         │
│                                                      │
│  ┌───────────────┐  ┌───────────────┐               │
│  │  SQLite        │  │  Algorand     │               │
│  │  (shipments.db)│  │  Box Storage  │               │
│  │                │  │               │               │
│  │  id            │  │  shipment_*   │               │
│  │  origin        │  │  buyer_*      │  ◄── Source   │
│  │  destination   │  │  funds_*      │     of Truth  │
│  │  current_lat   │  │               │     for state │
│  │  current_lon   │  └───────────────┘               │
│  │  status        │                                  │
│  └───────────────┘  ┌───────────────┐               │
│         ▲            │  Open-Meteo   │               │
│         │            │  Weather API  │               │
│  ┌──────┴────────┐  └───────────────┘               │
│  │  offchain_    │                                   │
│  │  events.json  │  ┌───────────────┐               │
│  │  (logistics)  │  │  Gemini 2.0   │               │
│  └───────────────┘  │  Flash (AI)   │               │
│                      └───────────────┘               │
│  ┌───────────────┐  ┌───────────────┐               │
│  │  JURY_CACHE   │  │  AUDIT_TRAIL  │  ◄── In-memory│
│  │  (in-memory)  │  │  (in-memory)  │     (volatile) │
│  └───────────────┘  └───────────────┘               │
│  ┌───────────────┐                                   │
│  │ WEATHER_CACHE │  TTL: 300s                        │
│  │  (in-memory)  │                                   │
│  └───────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### 7.2 SQLite Schema

```sql
CREATE TABLE shipments (
    id          TEXT PRIMARY KEY,     -- "SHIP_001", "SHIP_002", "SHIP_003"
    origin      TEXT NOT NULL,        -- "Kochi, India"
    destination TEXT NOT NULL,        -- "Rotterdam, Netherlands"
    current_lat REAL NOT NULL,        -- 9.93 (used for weather API)
    current_lon REAL NOT NULL,        -- 76.26
    status      TEXT NOT NULL         -- "In_Transit" | "Delayed_Disaster"
        DEFAULT 'In_Transit'
);
```

**Seed Data (auto-inserted on first startup):**

| id | origin | destination | lat | lon | status |
|---|---|---|---|---|---|
| SHIP_001 | Kochi, India | Rotterdam, Netherlands | 9.93 | 76.26 | In_Transit |
| SHIP_002 | Wayanad, India | Dubai, UAE | 11.68 | 76.13 | In_Transit |
| SHIP_003 | São Paulo, Brazil | Tokyo, Japan | -23.55 | -46.63 | In_Transit |

### 7.3 Off-Chain Events Schema (`offchain_events.json`)

```json
[
  {
    "shipment_id": "SHIP_001",
    "event": "GPS signal lost for 3 hours near Arabian Sea corridor",
    "severity": "high",
    "timestamp": "2026-03-02T06:30:00Z"
  }
]
```

Events are appended by the Supplier role via `POST /simulate-event` and persisted to disk.

### 7.4 In-Memory Stores

| Store | Type | Lifetime | Purpose |
|---|---|---|---|
| `JURY_CACHE` | `dict[str, dict]` | Process lifetime | Caches last jury result per shipment for dashboard display |
| `AUDIT_TRAIL` | `dict[str, list]` | Process lifetime | Accumulates all jury verdicts per shipment |
| `WEATHER_CACHE` | `dict[str, tuple]` | TTL 300s | Caches Open-Meteo responses to avoid rate limiting |
| `LOGISTICS_EVENTS` | `List[dict]` | Process lifetime (persisted to JSON) | All injected logistics events |

---

## 8. API Layer

### 8.1 Endpoint Specification

#### `GET /config`
**Purpose:** Bootstrap — provides frontend with APP_ID and shipment list.

```json
// Response
{
  "app_id": 756424573,
  "network": "testnet",
  "shipments": ["SHIP_001", "SHIP_002", "SHIP_003"]
}
```

#### `GET /shipments`
**Purpose:** Main data feed — returns all shipments with live weather and cached jury.

```json
// Response (array)
[
  {
    "shipment_id": "SHIP_001",
    "origin": "Kochi, India",
    "destination": "Rotterdam, Netherlands",
    "lat": 9.93,
    "lon": 76.26,
    "stage": "In_Transit",
    "weather": {
      "temperature": 28.4,
      "precipitation": 0.2,
      "weather_code": 3
    },
    "logistics_events": [
      {
        "shipment_id": "SHIP_001",
        "event": "GPS signal lost...",
        "severity": "high",
        "timestamp": "2026-03-02T06:30:00Z"
      }
    ],
    "last_jury": null
  }
]
```

**Data Assembly:**
1. Read all rows from SQLite
2. For each row: fetch weather (cached), filter logistics events, get cached jury
3. No AI calls — pure data aggregation

#### `POST /run-jury`
**Purpose:** Triggers the full MAS pipeline for one shipment.

```json
// Request
{ "shipment_id": "SHIP_001" }

// Response
{
  "shipment_id": "SHIP_001",
  "origin": "Kochi, India",
  "destination": "Rotterdam, Netherlands",
  "weather": { "temperature": 28.4, "precipitation": 0.2, "weather_code": 3 },
  "sentinel": { "risk_score": 85, "reasoning": "..." },
  "auditor": { "blockchain_status": "In_Transit", "audit_report": "..." },
  "chief_justice": { "trigger_contract": true, "judgment": "..." },
  "trigger_contract": true,
  "agent_dialogue": [
    { "agent": "Sentinel", "message": "[Risk Score: 85/100] ..." },
    { "agent": "Auditor", "message": "[On-Chain: In_Transit] ..." },
    { "agent": "Chief Justice", "message": "[APPROVED] ..." }
  ],
  "logistics_events_used": 2
}
```

**Side Effects:**
- If `trigger_contract == true` AND `status == "In_Transit"` → updates SQLite to `Delayed_Disaster`
- Caches result in `JURY_CACHE`
- Appends verdict to `AUDIT_TRAIL`

#### `GET /audit-trail/{shipment_id}`
**Purpose:** Returns on-chain status + off-chain verdict history.

```json
// Response
{
  "shipment_id": "SHIP_001",
  "app_id": 756424573,
  "network": "testnet",
  "on_chain_status": "In_Transit",
  "verdicts": [
    {
      "timestamp": "2026-03-02T10:15:00Z",
      "sentinel_score": 85,
      "auditor_status": "In_Transit",
      "verdict": "APPROVED",
      "summary": "Risk exceeds threshold..."
    }
  ],
  "total_scans": 1
}
```

#### `POST /simulate-event`
**Purpose:** Supplier injects a logistics anomaly.

```json
// Request
{
  "shipment_id": "SHIP_002",
  "event": "GPS signal lost — carrier unreachable for 4+ hours",
  "severity": "high"
}

// Response
{
  "status": "ok",
  "event": { "shipment_id": "SHIP_002", "event": "...", "severity": "high", "timestamp": "..." },
  "total_events": 1
}
```

#### `POST /trigger-disaster`
**Purpose:** Backend-side confirmation after Pera Wallet signing.

```json
// Request: ?shipment_id=SHIP_001
// Response
{ "status": "authorized", "shipment_id": "SHIP_001" }
```

### 8.2 CORS Configuration

```python
allow_origins=["*"]      # All origins (development)
allow_methods=["*"]      # All HTTP methods
allow_headers=["*"]      # All headers
allow_credentials=True
```

---

## 9. Frontend Architecture

### 9.1 Component Tree

```
<React.StrictMode>
  └── <App>
        ├── [!accountAddress] Landing Page
        │   └── glass-card (wallet connect)
        │
        └── [accountAddress] Dashboard
            ├── <header>
            │   ├── Logo + Title + APP_ID
            │   ├── Role Toggle (Stakeholder | Supplier)
            │   └── Wallet Address + Disconnect
            ├── Role Subtitle
            ├── [txId] TX Success Banner
            ├── Shipment Cards Grid
            │   └── <ShipmentCard> × N
            │       ├── Header (ID + Route + Stage Badge)
            │       ├── Stats (Weather + Events + Risk)
            │       ├── Jury Verdict Preview
            │       └── Action Buttons
            │
            └── Modals (conditional)
                ├── [juryResult] Jury Conversation Log
                ├── [auditTrail] Audit Trail
                ├── [simulateModal] Simulate Event
                └── [selectedShipment] Full Log Detail
```

### 9.2 Wallet Integration Flow

```
┌─────────────┐                    ┌───────────────┐
│  App Mount   │───reconnect──────►│ peraWallet    │
│  useEffect   │                   │ .reconnect    │
│              │◄──accounts[]──────│ Session()     │
└──────────────┘                   └───────────────┘
       │
       │ (if no session)
       ▼
┌──────────────┐  click CTA   ┌───────────────┐
│ Landing Page │─────────────►│ peraWallet    │
│              │              │ .connect()    │
│              │◄─accounts[]──│              │
└──────────────┘              └───────────────┘
       │
       │ setAccountAddress(accounts[0])
       ▼
┌──────────────┐
│  Dashboard   │
│  (renders)   │
└──────────────┘
```

### 9.3 Transaction Signing Flow (Pera Wallet)

When the Jury APPROVES a trigger and the user clicks "Trigger":

```
Frontend                          Pera Wallet              Algorand Testnet
────────                          ───────────              ────────────────
1. new Algodv2(algonode)
2. getTransactionParams()  ──────────────────────────────► get /v2/transactions/params
                           ◄─────────────────────────────  { fee, genesisHash, ... }
3. new ABIMethod("report_disaster_delay")
4. atc.addMethodCall({
     appID: 756424573,
     method, methodArgs: [shipment_id],
     signer: peraWallet.signTransaction
   })
5. atc.execute()
   └──► builds app call tx
   └──► calls signer                ──► peraWallet.signTransaction()
                                         └──► Pera mobile/web popup
                                         └──► User reviews & signs
                                    ◄──  signed tx bytes
   └──► submits to algod            ──────────────────────► POST /v2/transactions
                                    ◄─────────────────────  txId
   └──► waitForConfirmation(3)      ──────────────────────► GET /v2/transactions/pending/{txId}
                                    ◄─────────────────────  confirmed-round
6. setTxId(result.txIDs[0])
   └──► Green banner with explorer link
```

**Transaction Details:**
- Type: Application Call (NoOp)
- APP_ID: 756424573
- Method: `report_disaster_delay(string)void`
- Method Selector: `0x86f7adea`
- Args: ARC-4 encoded shipment_id string
- Fee: 2000 microAlgo (flat, covers inner txn fee)
- Signer: Pera Wallet (WalletConnect)

---

## 10. Security & Fraud Prevention

### 10.1 Multi-Layer Fraud Prevention

```
┌─────────────────────────────────────────────────────────┐
│                  FRAUD PREVENTION LAYERS                  │
│                                                          │
│  Layer 1: Smart Contract Guard                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ assert self.shipments[id] == String("In_Transit")  │  │
│  │ → Reverts if already "Delayed_Disaster"            │  │
│  │ → Impossible to double-trigger at protocol level   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Layer 2: Chief Justice AI Rule                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Priority 1: If disaster_reported = true → REJECT   │  │
│  │ "REGARDLESS of the Sentinel risk score"            │  │
│  │ → Prevents even recommending a trigger             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Layer 3: Chief Justice Fallback Rule                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ if blockchain_status == "Delayed_Disaster":        │  │
│  │     trigger = False                                │  │
│  │ → Works even when Gemini API is down               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Layer 4: Backend Post-Processing Guard                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ if judgment["trigger_contract"]                     │  │
│  │     and row["status"] == "In_Transit":             │  │
│  │     update SQLite                                  │  │
│  │ → Only updates DB if still In_Transit              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Layer 5: Human-in-the-Loop Wallet Signing               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ User must manually sign via Pera Wallet            │  │
│  │ → No automated blockchain writes                   │  │
│  │ → Creator-only: Txn.sender == Global.creator       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Layer 6: Unregistered Shipment Detection                │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Auditor: box read fails → status = "Unregistered"  │  │
│  │ Chief Justice: REJECT all unregistered shipments   │  │
│  │ → Prevents claims on non-existent shipments        │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Access Control

| Action | Who Can Do It | Enforcement |
|---|---|---|
| Deploy contract | Deployer (mnemonic holder) | `v2_testnet_deploy.py` |
| Add shipment | Deployer | `seed_blockchain.py` (no on-chain assert, but convention) |
| Fund escrow | Anyone (buyer) | Contract validates payment receiver |
| Report disaster | Creator only | `assert Txn.sender == Global.creator_address` |
| Run jury | Stakeholder (UI role) | Frontend role check (UI-only) |
| Simulate events | Supplier (UI role) | Frontend role check (UI-only) |
| Sign transactions | Connected wallet | Pera Wallet signature required |

---

## 11. Deployment Pipeline

### 11.1 One-Time Setup

```
Step 1: Deploy Contract
─────────────────────────
$ python v2_testnet_deploy.py
  → Loads DEPLOYER_MNEMONIC from .env
  → Connects to Algorand Testnet via AlgoNode
  → Loads ARC-56 app spec from artifacts/
  → factory.deploy() → creates APP_ID
  → Writes APP_ID to .env

Step 2: Seed Blockchain
─────────────────────────
$ python seed_blockchain.py
  → Loads DEPLOYER_MNEMONIC + APP_ID from .env
  → Checks deployer balance + contract balance
  → Funds contract MBR if < 0.5 ALGO
  → Calls add_shipment("SHIP_001"), add_shipment("SHIP_002"), add_shipment("SHIP_003")
  → Verifies via get_shipment_status() for each

Step 3: Start Backend
─────────────────────────
$ python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
  → on_startup: init_db() creates/seeds SQLite
  → on_startup: load_logistics_events() from JSON

Step 4: Start Frontend
─────────────────────────
$ cd frontend && npm run dev
  → Vite dev server on port 5173
  → Connects to backend via window.location.hostname:8000
```

### 11.2 Deployment Dependency Graph

```
.env (DEPLOYER_MNEMONIC, GEMINI_API_KEY)
  │
  ├──► v2_testnet_deploy.py → APP_ID written to .env
  │         │
  │         ▼
  ├──► seed_blockchain.py → Boxes created on-chain
  │         │
  │         ▼
  ├──► app.py (uvicorn) → Backend running, SQLite seeded
  │         │
  │         ▼
  └──► frontend (npm dev) → UI served, connects to backend + Algorand
```

---

## 12. Network Topology

### 12.1 External Services

| Service | URL | Auth | Rate Limit | Usage |
|---|---|---|---|---|
| **AlgoNode (algod)** | `https://testnet-api.algonode.cloud` | None (public) | Liberal | Auditor box reads, frontend TX submit |
| **Open-Meteo** | `https://api.open-meteo.com/v1/forecast` | None (free) | 10,000/day | Weather for each shipment |
| **Google Gemini** | `generativelanguage.googleapis.com` | API key | 15 RPM (free) | Sentinel + Chief Justice inference |
| **Pera WalletConnect** | WalletConnect relay | None | N/A | Wallet connection + signing |

### 12.2 Port Mapping

| Service | Host | Port | Protocol |
|---|---|---|---|
| FastAPI Backend | `0.0.0.0` | `8000` | HTTP |
| Vite Dev Server | `0.0.0.0` | `5173` | HTTP |
| AlgoNode | `testnet-api.algonode.cloud` | `443` | HTTPS |
| Open-Meteo | `api.open-meteo.com` | `443` | HTTPS |
| Gemini API | Google Cloud | `443` | HTTPS |

---

## 13. Sequence Diagrams

### 13.1 Full Jury + Trigger Lifecycle

```
User          Frontend        Backend        Open-Meteo    Algorand     Gemini AI
 │               │               │               │            │            │
 │ Click Run Jury│               │               │            │            │
 │──────────────►│               │               │            │            │
 │               │ POST /run-jury│               │            │            │
 │               │──────────────►│               │            │            │
 │               │               │ SELECT SQLite │            │            │
 │               │               │──┐            │            │            │
 │               │               │◄─┘            │            │            │
 │               │               │ GET weather   │            │            │
 │               │               │──────────────►│            │            │
 │               │               │◄──────────────│            │            │
 │               │               │                            │            │
 │               │               │ Sentinel prompt            │            │
 │               │               │─────────────────────────────────────────►│
 │               │               │◄────────────────────────────────────────│
 │               │               │ {risk_score, reasoning}                  │
 │               │               │                            │            │
 │               │               │ Read box                   │            │
 │               │               │───────────────────────────►│            │
 │               │               │◄──────────────────────────│            │
 │               │               │ {blockchain_status}        │            │
 │               │               │                            │            │
 │               │               │ Chief Justice prompt        │            │
 │               │               │─────────────────────────────────────────►│
 │               │               │◄────────────────────────────────────────│
 │               │               │ {trigger_contract, judgment}            │
 │               │               │                            │            │
 │               │               │ UPDATE SQLite              │            │
 │               │               │──┐ (if APPROVED)           │            │
 │               │               │◄─┘                         │            │
 │               │ {agent_dialogue}  │                        │            │
 │               │◄──────────────│               │            │            │
 │ Modal opens   │               │               │            │            │
 │◄──────────────│               │               │            │            │
 │               │               │               │            │            │
 │ Click Trigger │               │               │            │            │
 │──────────────►│               │               │            │            │
 │               │ Build ABI call│               │            │            │
 │               │──┐            │               │            │            │
 │               │◄─┘            │               │            │            │
 │               │ Sign request  │               │            │            │
 │               │───────────────────────────────────────────►│            │
 │ Pera popup    │               │               │  Pera      │            │
 │◄──────────────│               │               │  Wallet    │            │
 │ Approve       │               │               │            │            │
 │──────────────►│               │               │            │            │
 │               │ Submit TX     │               │            │            │
 │               │───────────────────────────────────────────►│            │
 │               │               │               │   Execute  │            │
 │               │               │               │   contract │            │
 │               │               │               │   method   │            │
 │               │◄──────────────────────────────────────────│            │
 │               │ txId          │               │            │            │
 │ Success banner│               │               │            │            │
 │◄──────────────│               │               │            │            │
```

### 13.2 Fraud Prevention (Double-Claim Attempt)

```
User          Frontend        Backend        Algorand
 │               │               │               │
 │ Run Jury on   │               │               │
 │ SHIP_001      │               │               │
 │ (already      │ POST /run-jury│               │
 │  Delayed)     │──────────────►│               │
 │               │               │ Sentinel runs │
 │               │               │──┐            │
 │               │               │◄─┘            │
 │               │               │ risk=85       │
 │               │               │               │
 │               │               │ Read box      │
 │               │               │──────────────►│
 │               │               │◄──────────────│
 │               │               │ "Delayed_Disaster"
 │               │               │               │
 │               │               │ Chief Justice: │
 │               │               │ disaster_reported=true
 │               │               │ → REJECT (fraud)
 │               │               │               │
 │               │ trigger=false │               │
 │               │◄──────────────│               │
 │ "REJECTED"    │               │               │
 │ No Trigger btn│               │               │
 │◄──────────────│               │               │
```

---

## 14. Error Handling & Resilience

### 14.1 AI Agent Fallbacks

Both AI agents (Sentinel, Chief Justice) implement `try/except` blocks around Gemini API calls. When the API fails (429 rate limit, network timeout, invalid JSON response), deterministic fallback logic activates:

| Agent | Fallback Behavior | Indicator |
|---|---|---|
| Sentinel | Threshold-based risk scoring from weather + events | Response prefixed with `[Fallback]` |
| Chief Justice | Rule-based decision tree matching AI prompt rules | Response prefixed with `[Fallback]` |
| Auditor | Not AI-based; returns "Unregistered" if box read fails | Always deterministic |

### 14.2 Backend Error Codes

| Endpoint | Error | Status | Detail |
|---|---|---|---|
| `/run-jury` | Unknown shipment | 400 | `"Unknown shipment 'SHIP_XYZ'"` |
| `/run-jury` | Weather unavailable | 503 | `"Weather data unavailable"` |
| `/audit-trail/{id}` | Shipment not found | 404 | `"Shipment not found"` |
| `/simulate-event` | Unknown shipment | 400 | `"Unknown shipment"` |

### 14.3 Frontend Error Handling

- API failures: `alert()` with error detail from `e.response?.data?.detail`
- Wallet connect failures: caught and logged via `console.log`
- Wallet reconnect on mount: silent catch (`() => {}`)
- Transaction failures: `alert()` with `e.message`

### 14.4 Algorand Node Resilience

```python
try:
    algorand = AlgorandClient.testnet() if ALGO_NETWORK == "testnet"
               else AlgorandClient.default_localnet()
except Exception:
    algorand = AlgorandClient.testnet()  # Fallback to testnet
```

---

## 15. Caching Strategy

### 15.1 Weather Cache

```python
WEATHER_CACHE: dict[str, tuple] = {}  # key: "lat,lon" → (timestamp, WeatherData)
WEATHER_CACHE_TTL = 300  # 5 minutes

def fetch_weather(lat, lon):
    cache_key = f"{lat},{lon}"
    if cached and now - cached[0] < TTL:
        return cached[1]  # Cache hit
    # ... fetch from Open-Meteo
    WEATHER_CACHE[cache_key] = (now, weather_data)
```

- **Purpose:** Prevent Open-Meteo rate limiting (10,000 req/day free)
- **Granularity:** Per coordinate pair
- **Invalidation:** Time-based (300s TTL)
- **Scope:** In-process memory

### 15.2 Jury Result Cache

```python
JURY_CACHE: dict[str, dict] = {}  # key: shipment_id → full jury payload
```

- **Purpose:** Display last jury result on dashboard without re-running agents
- **Updated:** After each `/run-jury` call
- **Invalidation:** Overwritten on next jury run
- **Scope:** In-process memory (lost on server restart)

### 15.3 Polling Strategy

- Frontend polls `GET /shipments` every **60 seconds**
- `/shipments` does NOT trigger AI — only reads SQLite + cached weather + cached jury
- AI agents only run on explicit `POST /run-jury` (user-initiated)

---

## 16. Configuration Reference

### 16.1 Environment Variables (`.env`)

| Variable | Example | Required | Used By |
|---|---|---|---|
| `GEMINI_API_KEY` | `AIzaSy...` | Yes | `SentinelAgent`, `ChiefJusticeAgent` |
| `APP_ID` | `756424573` | Yes | `AuditorAgent`, frontend ABI calls, all endpoints |
| `ALGO_NETWORK` | `testnet` | Yes | `AlgorandClient` initialization |
| `DEPLOYER_MNEMONIC` | `major inhale ...` | Yes (scripts only) | `v2_testnet_deploy.py`, `seed_blockchain.py` |
| `ALGOD_ADDRESS` | `https://testnet-api.algonode.cloud` | No (default in SDK) | Reference |
| `ALGOD_TOKEN` | `""` | No | AlgoNode requires no token |
| `WEATHER_API_URL` | `https://api.open-meteo.com/v1/forecast` | No | Reference (hardcoded in app.py) |
| `TARGET_LATITUDE` | `9.93` | No | Legacy reference |
| `TARGET_LONGITUDE` | `76.26` | No | Legacy reference |

### 16.2 Frontend Constants

| Constant | Value | Purpose |
|---|---|---|
| `BACKEND_URL` | `http://{hostname}:8000` | Auto-detected backend URL |
| `EXPLORER_URL` | `https://testnet.explorer.perawallet.app/tx/` | Transaction explorer links |
| Poll interval | `60000` ms | Shipment data refresh |

### 16.3 Backend Constants

| Constant | Value | Purpose |
|---|---|---|
| `DB_PATH` | `./shipments.db` | SQLite file path |
| `WEATHER_CACHE_TTL` | `300` seconds | Weather cache expiry |
| Gemini model | `gemini-2.0-flash` | AI model for Sentinel + Chief Justice |
| Risk threshold | `80` | Chief Justice trigger threshold |

---

## Appendix A: Method Selectors

| Method | Selector (4 bytes) |
|---|---|
| `log_alert(string)void` | `0x7f41f336` |
| `add_shipment(string)void` | `0x6d399775` |
| `get_shipment_status(string)string` | `0x76ec76aa` |
| `fund_escrow(string,pay)void` | `0x5610f2d6` |
| `report_disaster_delay(string)void` | `0x86f7adea` |

## Appendix B: Box Key Prefixes (Base64)

| Prefix | Raw | Base64 |
|---|---|---|
| `shipment_` | `0x73 68 69 70 6D 65 6E 74 5F` | `c2hpcG1lbnRf` |
| `buyer_` | `0x62 75 79 65 72 5F` | `YnV5ZXJf` |
| `funds_` | `0x66 75 6E 64 73 5F` | `ZnVuZHNf` |

## Appendix C: ARC Standards Compliance

| Standard | Description | How Used |
|---|---|---|
| **ARC-4** | ABI for Algorand smart contracts | All 5 methods use ABI encoding. Frontend uses `algosdk.ABIMethod` |
| **ARC-22** | Conventions for application state | Box storage with defined key prefixes |
| **ARC-28** | Event emission | `log_alert` emits `Alert(string)` event |
| **ARC-56** | Extended app spec | `AgriSupplyChainEscrow.arc56.json` — includes ABI, state maps, source, error messages |

## Appendix D: Running in Production

```bash
# 1. Set environment
export GEMINI_API_KEY="..."
export APP_ID="756424573"
export ALGO_NETWORK="testnet"
export DEPLOYER_MNEMONIC="..."

# 2. Deploy (one-time)
python v2_testnet_deploy.py

# 3. Seed (one-time)
python seed_blockchain.py

# 4. Backend
pip install fastapi uvicorn python-dotenv google-genai algokit-utils requests pydantic
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# 5. Frontend
cd frontend
npm install --legacy-peer-deps
npm run dev   # → http://localhost:5173
```
