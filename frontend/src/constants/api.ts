/**
 * Legacy demo API host — often cold/offline on free tiers. For production, set `VITE_API_URL` to your deployed `app.py`.
 */
export const PUBLIC_DEFAULT_API_URL = 'https://navi-trust-api.onrender.com';

/**
 * API base for axios/fetch.
 * - **Dev:** `/api` → Vite proxy → local FastAPI (`vite.config.ts`).
 * - **Prod:** `VITE_API_URL` if set, else `PUBLIC_DEFAULT_API_URL` (full HTTPS URL; CORS must allow your frontend origin).
 */
function resolveBackendUrl(): string {
  const trim = (s: string | undefined) => (s || '').trim().replace(/\/+$/, '');
  const fromEnv = trim(import.meta.env.VITE_API_URL);
  if (import.meta.env.DEV) {
    return '/api';
  }
  if (fromEnv) {
    return fromEnv;
  }
  if (import.meta.env.PROD) {
    return PUBLIC_DEFAULT_API_URL;
  }
  return `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8000`;
}

/** No trailing slash — avoids `//navibot` and failed POSTs. */
export const BACKEND_URL = resolveBackendUrl().replace(/\/+$/, '');

/** Bootstrap / heavy ledger reads — avoid false empty dashboard on slow chain or SQLite */
export const API_TIMEOUT = 15000;

export const FALLBACK_APP_ID = Number(import.meta.env.VITE_APP_ID) || 0;

/** Optional: pin landing “live proof” card to this shipment; otherwise first ID from /config or /shipments is used. */
export const LANDING_DEMO_SHIPMENT_ID = String(import.meta.env.VITE_LANDING_DEMO_SHIPMENT_ID || '').trim();

export const EXPLORER_URL = 'https://testnet.explorer.perawallet.app/tx/';

export const LORA_APP = (id: number) => `https://lora.algokit.io/testnet/application/${id}`;

/** Algod base URL (must match wallet / indexer network). */
export const ALGOD_URL =
  (import.meta.env.VITE_ALGORAND_NODE as string) || 'https://testnet-api.algonode.cloud';
