# Hosting guide — Vercel (frontend) + Render (backend)

This project is split into two deployables:

| Part | Host | URL example |
|------|------|-------------|
| **React dashboard** | [Vercel](https://vercel.com) | `https://your-app.vercel.app` |
| **FastAPI oracle API** | [Render](https://render.com) | `https://pramanik-api.onrender.com` |

The frontend talks to the API over HTTPS. CORS and WebSockets are already configured for `*.vercel.app` origins.

---

## Before you deploy

1. **TestNet oracle funded** — ≥ 5 ALGO on the wallet from `ORACLE_MNEMONIC`  
   Faucet: https://bank.testnet.algorand.network/

2. **Contract deployed** — note your `APP_ID` (e.g. `759052600` from [Lora](https://lora.algokit.io/testnet/application/759052600))

3. **Secrets ready** (never commit these):
   - `ORACLE_MNEMONIC` (25 words)
   - `GEMINI_API_KEY`
   - Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`

4. **Local smoke test**

```powershell
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
# Another terminal:
curl http://127.0.0.1:8000/health
cd frontend
npm run build
```

---

## Part 1 — Deploy API on Render

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect the repository. Render reads [`render.yaml`](./render.yaml).
4. After the service is created, open **pramanik-api** → **Environment** and set:

| Key | Value |
|-----|--------|
| `ORACLE_MNEMONIC` | Your 25-word mnemonic |
| `GEMINI_API_KEY` | Google AI Studio key |
| `APP_ID` | Your deployed app ID |
| `CORS_EXTRA_ORIGINS` | `https://YOUR-APP.vercel.app` (set after Vercel deploy) |
| `VERIFY_PUBLIC_BASE_URL` | Same Vercel URL (for certificate links in notes) |

5. **Manual Deploy** → **Deploy latest commit** (or wait for auto-deploy on push).

6. Copy your service URL, e.g. `https://pramanik-api.onrender.com` (name varies).

7. Verify:

```powershell
curl https://YOUR-SERVICE.onrender.com/health
curl https://YOUR-SERVICE.onrender.com/config
```

Expected: `"status":"ok"`, `"oracle_ready_for_writes":true`, `"app_id":759052600`.

### Option B: Manual Web Service

1. **New** → **Web Service** → connect GitHub repo.
2. Settings:

| Field | Value |
|-------|--------|
| **Name** | `pramanik-api` |
| **Region** | Singapore (or closest to you) |
| **Branch** | `main` |
| **Root directory** | *(leave empty — repo root)* |
| **Runtime** | Python 3 |
| **Build command** | `pip install -r requirements.txt` |
| **Start command** | `uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1` |
| **Health check path** | `/health` |

3. Add the same environment variables as in Option A.

4. **Free tier note:** Render sleeps after ~15 minutes idle. First request after sleep may take 30–60s (cold start).

### Render environment variables (full list)

**Required**

```
ORACLE_MNEMONIC=word1 word2 ... word25
APP_ID=759052600
GEMINI_API_KEY=...
```

**Recommended for production UI**

```
CORS_EXTRA_ORIGINS=https://your-app.vercel.app
VERIFY_PUBLIC_BASE_URL=https://your-app.vercel.app
ALGO_NETWORK=testnet
ALGOD_ADDRESS=https://testnet-api.algonode.cloud
INDEXER_URL=https://testnet-idx.algonode.cloud
LORA_BASE_URL=https://lora.algokit.io/testnet
SKIP_ORACLE_VERIFY=0
```

**Optional**

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_IDS=...
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
AUTO_JURY_ENABLED=0
AUTO_SEED_DEMO=0
```

---

## Part 2 — Deploy frontend on Vercel

### Option A: Import from GitHub (repo root)

The repo includes [`vercel.json`](./vercel.json) at the **root** — Vercel builds `frontend/` automatically.

1. Go to [Vercel](https://vercel.com/) → **Add New** → **Project** → import your GitHub repo.
2. **Framework Preset:** Vite (auto-detected).
3. **Root Directory:** leave as **repository root** (not `frontend` — root `vercel.json` handles paths).
4. **Environment Variables** (Production + Preview):

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://YOUR-SERVICE.onrender.com` (no trailing slash) |
| `VITE_APP_ID` | Same as Render `APP_ID` |
| `VITE_ALGORAND_NETWORK` | `testnet` |
| `VITE_ALGORAND_NODE` | `https://testnet-api.algonode.cloud` |
| `VITE_INDEXER_URL` | `https://testnet-idx.algonode.cloud` |
| `VITE_LORA_BASE_URL` | `https://lora.algokit.io/testnet` |

5. Click **Deploy**.

6. After deploy, copy your URL (e.g. `https://pramanik.vercel.app`).

### Option B: Deploy only `frontend/` folder

If you prefer the frontend as project root:

1. Set **Root Directory** to `frontend`.
2. Use [`frontend/vercel.json`](./frontend/vercel.json).
3. Same `VITE_*` environment variables.

### Wire Render ↔ Vercel

1. In **Render** → your API service → **Environment**, set:

```
CORS_EXTRA_ORIGINS=https://your-actual.vercel.app
VERIFY_PUBLIC_BASE_URL=https://your-actual.vercel.app
```

2. **Redeploy** the Render service (or wait for env reload).

3. In **Vercel** → **Deployments** → **Redeploy** if you changed `VITE_API_URL` (build-time variable).

> `VITE_*` values are baked in at **build** time. If you change `VITE_API_URL`, trigger a new Vercel deployment.

---

## Part 3 — Post-deploy checklist

| Check | How |
|-------|-----|
| API healthy | Open `https://YOUR-API.onrender.com/health` |
| API docs | `https://YOUR-API.onrender.com/docs` |
| Frontend loads | Open Vercel URL |
| CORS works | Connect Pera on dashboard — no browser CORS error in DevTools |
| Shipments load | Wallet connected → dashboard shows corridors or empty state (not infinite spinner) |
| Register works | Pera connected → register corridor → check Telegram + Lora link |
| Verify page | `https://YOUR-APP.vercel.app/verify/PRM-EX-MUM-RDM-001` |
| WebSocket | Transaction history / live feed updates (may poll if WS blocked) |

Run automated API test against Render:

```powershell
$env:PRAMANIK_API="https://YOUR-SERVICE.onrender.com"
python scripts/e2e_test.py
```

---

## Troubleshooting

### CORS error in browser

- Set `CORS_EXTRA_ORIGINS` on Render to your **exact** Vercel URL (including `https://`, no trailing slash).
- Vercel preview URLs (`*.vercel.app`) are allowed by regex on the API — production domain should still be listed if you use a custom domain.

### Dashboard empty / “Cannot reach server”

- Confirm `VITE_API_URL` in Vercel matches your live Render URL.
- Redeploy Vercel after changing `VITE_*`.
- Wake Render with `curl https://YOUR-API.onrender.com/health` (cold start).

### `oracle_ready_for_writes: false`

- Set `ORACLE_MNEMONIC` on Render.
- Fund oracle wallet on TestNet.
- Check Render logs for startup errors.

### Build fails: `No matching distribution found for algosdk`

- PyPI package is **`py-algorand-sdk`**, not `algosdk`. Use the repo’s [`requirements.txt`](./requirements.txt) (already fixed).
- Push the fix and **Clear build cache & deploy** on Render.

### Render also installs Node.js

- If you only need the API, use **Python** runtime and build command `pip install -r requirements.txt` only.
- Root `.nvmrc` is for optional tooling; the API service does not need Node. In Render settings, do not set a Node build command for the Python service.

### Registration / jury fails

- Oracle needs ALGO for fees.
- `APP_ID` must match the deployed contract.
- `GEMINI_API_KEY` required for full jury quality (fallbacks exist but limited).

### SQLite / data “lost” on Render redeploy

- `shipments.db` lives on ephemeral disk. On-chain state remains on Algorand; SQLite is a cache. Re-run `python seed_blockchain.py` locally against the same `APP_ID` if you need demo rows again.

---

## Custom domains (optional)

**Vercel:** Project → Settings → Domains → add `app.yourdomain.com`.

**Render:** Service → Settings → Custom Domains → add `api.yourdomain.com`.

Then update:

- Vercel: `VITE_API_URL=https://api.yourdomain.com`
- Render: `CORS_EXTRA_ORIGINS=https://app.yourdomain.com`, `VERIFY_PUBLIC_BASE_URL=https://app.yourdomain.com`

---

## Quick reference

```text
GitHub repo
    ├── Render  →  https://pramanik-api.onrender.com  (app.py, ORACLE_MNEMONIC)
    └── Vercel  →  https://pramanik.vercel.app        (frontend, VITE_API_URL → Render)
```

For architecture and API list, see [README.md](./README.md).
