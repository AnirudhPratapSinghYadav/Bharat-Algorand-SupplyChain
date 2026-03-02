                # Agri-Jury UI Breakdown — Complete Technical Handoff Document

                ## 1. Project Identity

                | Field | Value |
                |---|---|
                | **Project Name** | Agri-Jury: Supply Chain Risk Monitor |
                | **Tagline** | AI-powered multi-agent risk assessment with Algorand blockchain verification |
                | **Domain** | Agricultural supply-chain insurance / escrow on Algorand |
                | **Blockchain** | Algorand Testnet (APP_ID: 756424573) |
                | **AI Model** | Google Gemini 2.0 Flash |
                | **Smart Contract** | `AgriSupplyChainEscrow` (ARC-4, Box Storage) |

                ---

                ## 2. Tech Stack

                ### Frontend
                | Layer | Technology | Version |
                |---|---|---|
                | Framework | React | 18.2.0 |
                | Language | TypeScript | 5.2.2 |
                | Bundler | Vite | 5.0.0 |
                | Icons | lucide-react | 0.294.0 |
                | HTTP Client | axios | 1.6.2 |
                | Wallet | @perawallet/connect | 1.3.4 |
                | Algorand SDK | algosdk | 2.7.0 |
                | Polyfills | buffer (for Node.js compat in browser) | 6.0.3 |

                ### Backend
                | Layer | Technology |
                |---|---|
                | Framework | FastAPI (Python) |
                | Server | Uvicorn with --reload |
                | Database | SQLite (shipments.db) |
                | AI | google-genai (Gemini 2.0 Flash) |
                | Blockchain | algokit_utils (AlgorandClient) |
                | Weather | Open-Meteo free API |
                | Config | python-dotenv (.env) |

                ### File Structure
                ```
                algo-hack/
                ├── app.py                          # FastAPI backend (all agents + endpoints)
                ├── shipments.db                    # SQLite database (auto-created on startup)
                ├── offchain_events.json            # Mock logistics events store
                ├── agri_escrow.py                  # Algorand smart contract source (Puya)
                ├── seed_blockchain.py              # Script to fund MBR + register shipments on-chain
                ├── v2_testnet_deploy.py            # Deploys the ARC-4 contract to Testnet
                ├── .env                            # DEPLOYER_MNEMONIC, APP_ID, GEMINI_API_KEY, etc.
                ├── artifacts/
                │   └── AgriSupplyChainEscrow.arc56.json
                ├── frontend/
                │   ├── package.json
                │   ├── vite.config.ts
                │   └── src/
                │       ├── main.tsx                # React entry point
                │       ├── App.tsx                 # Single-file app (all UI logic)
                │       └── index.css               # Global styles + glassmorphism theme
                ```

                ---

                ## 3. Design System & Theme

                ### 3.1 Color Palette

                | Token | Hex | Usage |
                |---|---|---|
                | **bg-primary** | `#0d1117` | Page background (GitHub-dark base) |
                | **bg-gradient** | `radial-gradient(circle at top right, #1a2a44, #0d1117)` | Body background gradient |
                | **glass-bg** | `rgba(255, 255, 255, 0.05)` | Card backgrounds (glassmorphism) |
                | **glass-border** | `rgba(255, 255, 255, 0.1)` | Card borders |
                | **glass-border-hover** | `rgba(255, 255, 255, 0.2)` | Card borders on hover |
                | **text-primary** | `rgba(255, 255, 255, 0.87)` | Main text |
                | **text-secondary** | `#8b949e` | Subtitles, labels, muted text |
                | **text-tertiary** | `#6b7280` | Placeholder text, empty states |
                | **text-code** | `#c9d1d9` | Code, monospace text |
                | **accent-indigo** | `#6366f1` | Primary brand color, Shield icon, links |
                | **accent-purple** | `#a855f7` | Gradient end for primary buttons |
                | **accent-indigo-light** | `#818cf8` | On-chain status text, feature tags |
                | **sentinel-amber** | `#f59e0b` | Sentinel agent, warnings, fallback indicators |
                | **auditor-blue** | `#3b82f6` | Auditor agent, In_Transit badges |
                | **justice-green** | `#10b981` | Chief Justice agent |
                | **success-green** | `#4ade80` | Low risk badges, REJECTED verdicts (good), TX success |
                | **warning-yellow** | `#facc15` | Medium risk badges |
                | **danger-red** | `#ef4444` / `#f87171` | High risk, Delayed_Disaster, APPROVED trigger |
                | **supplier-orange** | `#f97316` / `#fb923c` | Supplier role toggle, simulate buttons |
                | **terminal-bg** | `#010409` | Jury conversation log terminal background |
                | **btn-dark** | `#1a1a1a` | Default button background |
                | **btn-hover-border** | `#646cff` | Button hover border |

                ### 3.2 Gradients

                | Name | Value | Usage |
                |---|---|---|
                | **Primary CTA** | `linear-gradient(135deg, #6366f1 0%, #a855f7 100%)` | Primary buttons, stakeholder toggle |
                | **Supplier CTA** | `linear-gradient(135deg, #f59e0b, #f97316)` | Supplier role toggle |
                | **Title Gradient** | `linear-gradient(135deg, #6366f1, #a855f7)` | Landing page "Agri-Jury" title (text clip) |
                | **Danger** | Solid `#dc2626` | Trigger Disaster button |
                | **Decorative Glow** | `radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)` | Landing page background glow |

                ### 3.3 Typography

                | Element | Font | Size | Weight | Notes |
                |---|---|---|---|---|
                | **Body** | Inter, system-ui, Avenir, Helvetica, Arial, sans-serif | Base 1rem | 400 | line-height: 1.5 |
                | **h1 (global)** | Inter | 3.2em | — | margin-bottom: 0.2em |
                | **h1 (dashboard header)** | Inter | 2rem | — | margin: 0 |
                | **h1 (landing)** | Inter | 2.4rem | 700 | Gradient text fill |
                | **Code / IDs** | JetBrains Mono, Fira Code, Cascadia Code, monospace | 0.8rem | — | Shipment IDs, inline code |
                | **Log entries** | Courier New, Courier, monospace | 0.85rem | — | Agent reasoning |
                | **Terminal modal** | JetBrains Mono, monospace | 0.85rem | — | line-height: 1.7 |
                | **Badges** | Inter | 0.75rem–0.85rem | 600 | Status pills, risk scores |
                | **Labels** | Inter | 0.75rem | — | "Weather", "Events", "Risk" labels |
                | **Small text** | Inter | 0.7rem | — | APP_ID display, footer text |

                ### 3.4 Glassmorphism System

                The entire UI is built on a glassmorphism card system:

                ```css
                .glass-card {
                  background: rgba(255, 255, 255, 0.05);
                  backdrop-filter: blur(10px);
                  -webkit-backdrop-filter: blur(10px);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  border-radius: 16px;
                  padding: 24px;
                  transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                .glass-card:hover {
                  transform: translateY(-5px);
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                  border: 1px solid rgba(255, 255, 255, 0.2);
                }
                ```

                - **Cards** float upward on hover with a subtle shadow
                - **Modal cards** disable the hover transform via `.modal-backdrop .glass-card:hover { transform: none; }`
                - **Border radius** is consistently 16px for cards, 8px for buttons, 20px for pill badges

                ### 3.5 Grid Layout

                ```css
                .grid {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                  gap: 24px;
                  margin-top: 40px;
                }
                ```

                - Responsive auto-fit grid, min column width 320px
                - Max page width: 1280px (set on `#root`)
                - Page padding: 2rem

                ### 3.6 Icons (lucide-react)

                All icons come from `lucide-react`. Exact icon mapping:

                | Icon | Where Used |
                |---|---|
                | `Shield` | App logo (landing + dashboard header) |
                | `Package` | Shipment ID prefix on cards |
                | `ArrowRight` | Route flow: "Kochi, India → Rotterdam, Netherlands" |
                | `Cloud` | Weather stat on cards |
                | `Zap` | Logistics events count + Simulate Delay button |
                | `Activity` | Risk score badge |
                | `Play` | "Run Jury" button |
                | `AlertTriangle` | "Trigger Disaster" button |
                | `History` | "Audit Trail" button |
                | `Terminal` | Jury Conversation Log modal header + landing feature tag |
                | `Globe` | Landing page feature tag (Algorand Testnet) |
                | `Lock` | Landing page feature tag (Fraud Prevention) + Connect button |
                | `Eye` | Stakeholder role toggle |
                | `Truck` | Supplier role toggle |
                | `CheckCircle` | Transaction success banner |
                | `ExternalLink` | Pera Explorer link |
                | `X` | Modal close buttons |

                ---

                ## 4. Screens & Layouts

                ### 4.1 Screen 1: Wallet-Gated Landing Page

                **Condition:** Renders when `accountAddress === null` (no wallet connected).

                **Layout:**
                - Full viewport height, vertically + horizontally centered
                - Decorative radial glow (400x400px circle, indigo at 15% opacity) positioned at top-center
                - Single centered `glass-card` container, max-width 520px, padding 52px 44px

                **Content (top to bottom):**
                1. **Shield icon** — `lucide Shield`, size 56, color `#6366f1`
                2. **Title** — "Agri-Jury", 2.4rem, weight 700, gradient text fill (indigo→purple)
                3. **Subtitle** — "Supply Chain Risk Monitor", 1.05rem, weight 400, color `#8b949e`
                4. **Description** — "AI-powered multi-agent risk assessment with immutable Algorand blockchain verification. Monitor shipments, detect fraud, and authorize smart-contract triggers in real time.", color `#6b7280`, line-height 1.7
                5. **Feature tags** — 3 inline pills: `[Terminal] Multi-Agent AI`, `[Globe] Algorand Testnet`, `[Lock] Fraud Prevention`, color `#818cf8`, 0.8rem
                6. **CTA button** — "Connect Pera Wallet", full width, primary gradient, `Lock` icon, 1.05rem, padding 14px
                7. **Footer** — "Built on Algorand · Powered by Google Gemini 2.0 Flash", 0.75rem, color `#4b5563`

                **Behavior:** Clicking the CTA opens the Pera Wallet connect flow. On success, `accountAddress` is set and the dashboard renders.

                ---

                ### 4.2 Screen 2: Authenticated Dashboard

                **Condition:** Renders when `accountAddress !== null`.

                **Layout sections (top to bottom):**

                #### A. Header Bar
                - **Left:** Shield icon (40px, indigo) + "Agri-Jury" h1 (2rem) + APP_ID subtitle (`APP_ID: 756424573 · Algorand Testnet`, 0.7rem, `#8b949e`)
                - **Right:** Role toggle pills + Wallet address display + Disconnect button
                - Flexbox with `space-between`, wraps on mobile

                #### B. Role Toggle
                A pill-shaped toggle with two options:
                - **[Eye] Stakeholder** — active: indigo→purple gradient bg, white text
                - **[Truck] Supplier** — active: amber→orange gradient bg, white text
                - Inactive: transparent bg, `#8b949e` text
                - Container: `rgba(255,255,255,0.05)` bg, 1px border, border-radius 8px, padding 3px

                #### C. Role Subtitle
                - Left-aligned paragraph, 0.95rem
                - Stakeholder: "Stakeholder View — Monitor shipments, run AI jury, authorize smart-contract triggers"
                - Supplier: "Supplier View — Track your shipments, report logistics events"

                #### D. Transaction Success Banner (conditional)
                - Only shows when `txId` is set (after successful Pera Wallet signing)
                - `glass-card` with green border (`#4ade80`)
                - Content: `[CheckCircle]` "Transaction confirmed on Testnet!" + `[ExternalLink]` link to Pera Explorer

                #### E. Shipment Cards Grid
                - CSS Grid, auto-fit, min 320px columns, 24px gap
                - One `glass-card` per shipment from `GET /shipments`

                ---

                ### 4.3 Shipment Card Anatomy

                Each card is a `glass-card` with left-aligned text. Structure:

                ```
                ┌──────────────────────────────────────────────┐
                │  [Package] SHIP_001              [In Transit] │  ← header row
                │  Kochi, India → Rotterdam, Netherlands        │  ← route flow
                │                                               │
                │  Weather         Events        Risk           │  ← stats row
                │  [Cloud] 28°C    [Zap] 2       [Badge] 80%   │
                │  / 0.2mm         logged                      │
                │                                               │
                │  Latest Jury Verdict                          │  ← only if jury ran
                │  ┃ Sentinel: [reasoning text]                 │
                │  ┃ Auditor: [audit report text]               │
                │                                               │
                │  [Run Jury] [Trigger] [Audit Trail] [Full Log]│  ← action buttons
                └──────────────────────────────────────────────┘
                ```

                **Header Row:**
                - Left: `[Package icon]` + shipment ID in `<code>` (0.8rem, `#c9d1d9`)
                - Below ID: origin `[ArrowRight]` destination (0.9rem)
                - Right: Stage pill badge — "In Transit" (blue) or "Delayed Disaster" (red)

                **Stage Badge Colors:**
                | Stage | Background | Text | Border |
                |---|---|---|---|
                | `In_Transit` | `rgba(59,130,246,0.15)` | `#60a5fa` | `#3b82f6` |
                | `Delayed_Disaster` | `rgba(239,68,68,0.15)` | `#f87171` | `#ef4444` |
                | Other | `rgba(107,114,128,0.15)` | `#9ca3af` | `#6b7280` |

                **Stats Row:** Three inline stat blocks:
                1. **Weather** — `[Cloud]` temperature °C / precipitation mm
                2. **Events** — `[Zap]` count "logged" — amber if >0, green if 0
                3. **Risk** — status-badge with `[Activity]` percent — only shown after jury runs

                **Risk Badge Colors:**
                | Range | CSS Class | Appearance |
                |---|---|---|
                | >80 | `status-red` | Red bg/border, `#f87171` text |
                | 51–80 | `status-yellow` | Yellow bg/border, `#facc15` text |
                | <=50 | `status-green` | Green bg/border, `#4ade80` text |

                **Jury Verdict Preview (conditional):**
                - Only renders if `ship.last_jury` exists
                - "Latest Jury Verdict" label (0.75rem, `#8b949e`)
                - Two `.log-entry` blocks: Sentinel reasoning + Auditor audit_report
                - Sentinel text turns amber (`#f59e0b`) if it contains `[Fallback]`

                **Action Buttons (role-dependent):**

                | Button | Role | Style | Icon | Action |
                |---|---|---|---|---|
                | **Run Jury** | Stakeholder | `primary-btn`, flex 1 | `Play` | Calls `POST /run-jury` → opens Jury modal |
                | **Trigger** | Stakeholder (only if `trigger_contract === true`) | `primary-btn` bg `#dc2626`, flex 1 | `AlertTriangle` | Signs ARC-4 `report_disaster_delay` via Pera Wallet |
                | **Simulate Delay** | Supplier | Orange ghost btn (`rgba(249,115,22,0.15)` bg, `#fb923c` text, orange border), flex 1 | `Zap` | Opens Simulate Event modal |
                | **Audit Trail** | Both | Default button style | `History` | Calls `GET /audit-trail/{id}` → opens Audit modal |
                | **Full Log** | Both (only if jury ran) | Default button style | (none) | Opens Full Log detail modal |

                ---

                ## 5. Modals (4 total)

                All modals use the `.modal-backdrop` overlay: `position: fixed`, full viewport, `rgba(0,0,0,0.85)` background, centered flex, `z-index: 1001`. Cards inside modals don't hover-transform.

                ### 5.1 Jury Conversation Log Modal

                **Trigger:** Opens after `POST /run-jury` succeeds.

                **Layout:**
                - Max-width 700px, 95% width, no padding (custom sections)
                - Header: `[Terminal icon]` "Jury Log — SHIP_001" + `[X]` close button, bottom border
                - Body: `#010409` background (near-black), monospace font, max-height 400px, scrollable

                **Body Content:**
                1. **System line** (conditional): `[SYSTEM] N logistics event(s) ingested by Sentinel` — amber text, bottom separator
                2. **Agent entries** (3 entries, sequential):
                  - `> [SENTINEL]` — amber (`#f59e0b`), bold
                  - Message text below, indented 16px, `#c9d1d9`, pre-wrap
                  - `> [AUDITOR]` — blue (`#3b82f6`)
                  - `> [CHIEF JUSTICE]` — green (`#10b981`)
                3. **Verdict line** — top border separator, bold:
                  - APPROVED: `#ef4444` text, "TRIGGER APPROVED — Smart contract action authorized"
                  - REJECTED: `#4ade80` text, "TRIGGER REJECTED — No action required"

                **Footer:** Full-width "Close" primary button.

                ### 5.2 Audit Trail Modal

                **Trigger:** "Audit Trail" button on any card.

                **Layout:**
                - Max-width 650px, 95% width, max-height 80vh, flex column, scrollable
                - Header: "Audit Trail — SHIP_001" + APP_ID subtitle + `[X]` close

                **Content:**
                1. **On-Chain Status box** — indigo tinted bg (`rgba(99,102,241,0.1)`), border (`rgba(99,102,241,0.3)`)
                  - Label: "On-Chain Status (Algorand Box Storage)" — `#8b949e`, 0.8rem
                  - Value: e.g. "In_Transit" — `#818cf8`, 1.1rem, bold
                2. **Verdicts count** — "Jury Verdicts (N scans)" — `#8b949e`, 0.85rem
                3. **Verdicts list** (scrollable):
                  - Empty state: "No jury scans yet. Run the Agentic Jury from Stakeholder view." centered, `#6b7280`
                  - Each verdict card: left border (red if APPROVED, green if REJECTED)
                    - Row 1: verdict badge (APPROVED/REJECTED) + timestamp
                    - Row 2: "Sentinel: N/100 · Auditor: status"
                    - Row 3: summary text

                ### 5.3 Simulate Event Modal

                **Trigger:** "Simulate Delay" button (Supplier role only).

                **Layout:**
                - Max-width 480px, 95% width
                - Header: `[Zap icon orange]` "Simulate Logistics Event" + `[X]` close
                - Subtitle: "Inject an event for `SHIP_001`:" — shipment ID in `<code>`

                **Content:** 3 selectable event buttons, stacked vertically (8px gap):

                | # | Severity | Event Text |
                |---|---|---|
                | 1 | **HIGH** (red `#f87171`) | GPS signal lost — carrier unreachable for 4+ hours |
                | 2 | **HIGH** (red `#f87171`) | Cold chain breach — temperature spike above threshold |
                | 3 | **MEDIUM** (yellow `#facc15`) | Port congestion — estimated 12h+ delay at customs |

                Each is a button with: left-aligned text, 12px padding, border-radius 8px, `rgba(255,255,255,0.03)` bg, subtle border. Clicking calls `POST /simulate-event` and closes the modal.

                ### 5.4 Full Log Detail Modal

                **Trigger:** "Full Log" button (only after jury has run).

                **Layout:**
                - Max-width 600px, 90% width, z-index 1000
                - Header: shipment ID (h2) + route subtitle + `[X]` close

                **Content (3 sections, or empty state):**
                1. **Sentinel Analysis** — h4 in amber (`#f59e0b`), reasoning paragraph
                2. **Auditor Report** — h4 in blue (`#3b82f6`), audit_report paragraph
                3. **Chief Justice Judgment** — h4 in green (`#10b981`), judgment paragraph

                Empty state: "No jury data yet. Run the Agentic Jury first." in `#6b7280`.

                ---

                ## 6. State Management

                All state lives in React `useState` hooks inside the single `App` component. No external state library.

                | State Variable | Type | Purpose |
                |---|---|---|
                | `accountAddress` | `string \| null` | Connected Pera Wallet address. `null` = show landing page |
                | `role` | `'stakeholder' \| 'supplier'` | Active UI role. Controls which buttons appear |
                | `shipments` | `Shipment[]` | Array from `GET /shipments`. Drives the card grid |
                | `appId` | `number \| null` | Algorand APP_ID from `GET /config`. Used for ABI calls |
                | `juryRunning` | `string \| null` | Shipment ID currently running jury (disables button) |
                | `juryResult` | `JuryResult \| null` | Non-null = Jury modal is open |
                | `auditTrail` | `AuditTrailData \| null` | Non-null = Audit Trail modal is open |
                | `selectedShipment` | `Shipment \| null` | Non-null = Full Log modal is open |
                | `simulateModal` | `string \| null` | Shipment ID = Simulate modal open for that shipment |
                | `txId` | `string \| null` | Algorand transaction ID = success banner shown |
                | `isTriggering` | `boolean` | True while Pera Wallet signing is in progress |

                ---

                ## 7. Data Flow & API Integration

                ### 7.1 Backend Endpoints

                | Method | Path | Purpose | Frontend Caller |
                |---|---|---|---|
                | `GET` | `/config` | Returns `{app_id, network, shipments[]}` | `useEffect` on wallet connect |
                | `GET` | `/shipments` | All shipments from SQLite + weather + cached jury | Polled every 60s when connected |
                | `POST` | `/run-jury` | Runs Sentinel→Auditor→ChiefJustice for one shipment | "Run Jury" button |
                | `GET` | `/audit-trail/{id}` | On-chain status + verdict history | "Audit Trail" button |
                | `POST` | `/simulate-event` | Injects a logistics event | Simulate Event modal buttons |
                | `POST` | `/trigger-disaster` | Backend confirmation after Pera TX | (not directly called from frontend — the ABI call is made directly to Algorand from the frontend) |

                ### 7.2 Shipment Data Shape (from GET /shipments)

                ```json
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
                    { "shipment_id": "SHIP_001", "event": "GPS signal lost...", "severity": "high", "timestamp": "..." }
                  ],
                  "last_jury": null
                }
                ```

                `last_jury` is `null` until `POST /run-jury` is called for that shipment, then it caches the full result including `sentinel`, `auditor`, `chief_justice`, `agent_dialogue`, `trigger_contract`.

                ### 7.3 Polling Strategy

                - **When:** Only after wallet connects (second `useEffect` depends on `accountAddress`)
                - **Interval:** 60 seconds
                - **Endpoint:** `GET /shipments`
                - **No AI calls on poll:** The `/shipments` endpoint only fetches weather (cached 5 min) + reads SQLite. Agents only run on-demand via `/run-jury`.

                ---

                ## 8. User Workflows

                ### Flow 1: First-Time User
                ```
                Landing Page → Click "Connect Pera Wallet" → Pera QR/mobile popup
                → Approve → Dashboard loads → 3 shipment cards appear with weather data
                ```

                ### Flow 2: Stakeholder Runs Jury
                ```
                Dashboard (Stakeholder role) → Click "Run Jury" on SHIP_001
                → Button shows "Running…" (disabled) → POST /run-jury
                → Backend: Sentinel analyzes weather + events → Auditor reads Algorand box
                → Chief Justice deliberates (with fraud check)
                → Response returns → Jury Conversation Log modal opens
                → Shows 3-agent dialogue + VERDICT
                → Card updates with risk score badge + reasoning preview
                ```

                ### Flow 3: Stakeholder Triggers Disaster (after Jury APPROVES)
                ```
                Jury APPROVED → Red "Trigger" button appears on card
                → Click → Pera Wallet popup → Sign ARC-4 `report_disaster_delay` transaction
                → TX confirmed → Green success banner with Explorer link
                → On-chain box status changes to "Delayed_Disaster"
                → Next jury run will REJECT (double-claim fraud prevention)
                ```

                ### Flow 4: Supplier Simulates Delay
                ```
                Switch to Supplier role → Click "Simulate Delay" on SHIP_002
                → Simulate Event modal opens → Pick "GPS signal lost" (HIGH)
                → POST /simulate-event → Event saved to offchain_events.json
                → Modal closes → Card "Events" count increments
                → Next jury run for SHIP_002 will include this event in Sentinel analysis
                ```

                ### Flow 5: View Audit Trail
                ```
                Click "Audit Trail" on any card → GET /audit-trail/SHIP_001
                → Modal shows on-chain status (read from Algorand Box Storage)
                → Lists all past jury verdicts with timestamps, scores, summaries
                ```

                ### Flow 6: Disconnect
                ```
                Click "Disconnect" → Pera session ends → accountAddress = null
                → Dashboard unmounts → Landing page renders
                ```

                ---

                ## 9. Multi-Agent System (MAS) Architecture

                ```
                        ┌─────────────┐
                        │  /run-jury   │  (POST with shipment_id)
                        └──────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │   1. SENTINEL AGENT   │  Fetches Open-Meteo weather + off-chain logistics
                    │   (Gemini 2.0 Flash)  │  Returns: risk_score (1-100) + reasoning
                    │   Fallback: threshold │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   2. AUDITOR AGENT    │  Reads Algorand Box Storage for shipment status
                    │   (No AI — direct     │  Returns: blockchain_status + audit_report
                    │    algod box read)    │  + disaster_reported flag
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  3. CHIEF JUSTICE     │  Compares risk vs on-chain state
                    │  (Gemini 2.0 Flash)   │  FRAUD CHECK: Rejects if disaster already claimed
                    │  Fallback: rule-based │  Returns: trigger_contract (bool) + judgment
                    └───────────┬───────────┘
                                │
                        ┌──────▼───────┐
                        │   Response    │  Full agent_dialogue + verdict
                        └──────────────┘
                ```

                **Fraud Prevention Rules (Chief Justice):**
                1. If `disaster_reported = true` (status is "Delayed_Disaster") → REJECT (double-claim fraud)
                2. If status is "Unregistered" → REJECT (no on-chain record, potential fraud)
                3. If risk > 80 AND status is "In_Transit" → APPROVE trigger
                4. If risk <= 80 → REJECT (insufficient evidence)

                **Fallback Behavior:** When Gemini API is unavailable (429 rate limit, network error), both Sentinel and Chief Justice fall back to deterministic rule-based logic. Fallback responses are prefixed with `[Fallback]` and displayed in amber text on the frontend.

                ---

                ## 10. Blockchain Integration

                ### Smart Contract: AgriSupplyChainEscrow
                - **Language:** Algorand Python (Puya / algopy)
                - **Standard:** ARC-4
                - **Storage:** BoxMap with prefix `shipment_` → stores status string per shipment

                ### Key Methods
                | Method | Access | Description |
                |---|---|---|
                | `add_shipment(shipment_id)` | Anyone (creator in practice) | Creates box with status "In_Transit" |
                | `get_shipment_status(shipment_id)` | Readonly | Returns current status string |
                | `report_disaster_delay(shipment_id)` | Creator only | Changes status to "Delayed_Disaster", refunds 10% |
                | `fund_escrow(shipment_id, payment)` | Anyone | Accepts ALGO payment for shipment escrow |

                ### Frontend → Blockchain Flow
                The frontend uses `algosdk.AtomicTransactionComposer` + `algosdk.ABIMethod` to build an ARC-4 app call for `report_disaster_delay`. The transaction is signed via Pera Wallet (`peraWallet.signTransaction`), then submitted to `https://testnet-api.algonode.cloud`.

                ---

                ## 11. Database Schema

                ```sql
                CREATE TABLE shipments (
                    id          TEXT PRIMARY KEY,     -- e.g. "SHIP_001"
                    origin      TEXT NOT NULL,        -- e.g. "Kochi, India"
                    destination TEXT NOT NULL,        -- e.g. "Rotterdam, Netherlands"
                    current_lat REAL NOT NULL,        -- e.g. 9.93
                    current_lon REAL NOT NULL,        -- e.g. 76.26
                    status      TEXT NOT NULL DEFAULT 'In_Transit'  -- "In_Transit" or "Delayed_Disaster"
                );
                ```

                Auto-seeded with 3 rows on first startup:

                | id | origin | destination | lat | lon |
                |---|---|---|---|---|
                | SHIP_001 | Kochi, India | Rotterdam, Netherlands | 9.93 | 76.26 |
                | SHIP_002 | Wayanad, India | Dubai, UAE | 11.68 | 76.13 |
                | SHIP_003 | São Paulo, Brazil | Tokyo, Japan | -23.55 | -46.63 |

                ---

                ## 12. Key CSS Classes Reference

                | Class | Purpose |
                |---|---|
                | `.glass-card` | Glassmorphism container (blur, border, hover lift) |
                | `.grid` | Auto-fit responsive grid for shipment cards |
                | `.status-badge` | Inline pill badge (risk scores) |
                | `.status-green` / `.status-yellow` / `.status-red` | Risk-level coloring |
                | `.primary-btn` | Gradient CTA button (indigo→purple) |
                | `.log-entry` | Monospace log line with left border |
                | `.modal-backdrop` | Fixed fullscreen dark overlay for modals |

                ---

                ## 13. Environment Variables (.env)

                | Key | Example | Used By |
                |---|---|---|
                | `GEMINI_API_KEY` | `AIzaSy...` | Sentinel + Chief Justice AI prompts |
                | `APP_ID` | `756424573` | Auditor box reads, frontend ABI calls |
                | `ALGO_NETWORK` | `testnet` | AlgorandClient initialization |
                | `DEPLOYER_MNEMONIC` | `major inhale...` | seed_blockchain.py, v2_testnet_deploy.py |
                | `ALGOD_ADDRESS` | `https://testnet-api.algonode.cloud` | Algorand node URL |

                ---

                ## 14. Running the Project

                ```bash
                # Backend
                pip install fastapi uvicorn python-dotenv google-genai algokit-utils requests pydantic
                python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload

                # Frontend
                cd frontend
                npm install --legacy-peer-deps
                npm run dev

                # Seed blockchain (one-time)
                python seed_blockchain.py
                ```

                - Backend: `http://localhost:8000`
                - Frontend: `http://localhost:5173`
                - Frontend auto-detects backend via `window.location.hostname + ":8000"`
