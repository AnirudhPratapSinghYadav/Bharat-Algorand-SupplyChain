/**
 * Legacy demo API host — often cold/offline on free tiers. For production, set `VITE_API_URL` to your deployed `app.py`.
 */
/**
 * Fallback when `VITE_API_URL` is unset at Vercel build time.
 * Set `VITE_API_URL` in Vercel env to your Render service URL instead of relying on this.
 */
export const PUBLIC_DEFAULT_API_URL = 'https://pramanik-api.onrender.com';

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

function trimUrl(s: string | undefined): string {
  return (s || '').trim().replace(/\/+$/, '');
}

const DEFAULT_LORA_FOR_NETWORK: Record<string, string> = {
  testnet: 'https://lora.algokit.io/testnet',
  mainnet: 'https://lora.algokit.io/mainnet',
};

/**
 * Lora explorer base (`…/testnet` or `…/mainnet`). Uses `VITE_LORA_BASE_URL`, else infers from `VITE_ALGORAND_NETWORK`.
 */
function resolveLoraBaseUrl(): string {
  const fromEnv = trimUrl(import.meta.env.VITE_LORA_BASE_URL as string | undefined);
  if (fromEnv) return fromEnv;
  const net = (import.meta.env.VITE_ALGORAND_NETWORK as string | undefined)?.toLowerCase() || 'testnet';
  return DEFAULT_LORA_FOR_NETWORK[net] || DEFAULT_LORA_FOR_NETWORK.testnet;
}

/** Warn only when explicitly forcing empty via env (unusual). */
function warnIfLoraDisabled(): void {
  const raw = import.meta.env.VITE_LORA_BASE_URL as string | undefined;
  if (raw !== undefined && !trimUrl(raw) && import.meta.env.PROD) {
    console.warn('[Pramanik] VITE_LORA_BASE_URL is empty — using network default for Lora links.');
  }
}

warnIfLoraDisabled();

export const LORA_BASE_URL = resolveLoraBaseUrl();

/** Bootstrap / heavy ledger reads — avoid false empty dashboard on slow chain or SQLite */
export const API_TIMEOUT = 15000;

export const FALLBACK_APP_ID = Number(import.meta.env.VITE_APP_ID) || 0;

/** Optional: pin landing “live proof” card to this shipment; otherwise first ID from /config or /shipments is used. */
export const LANDING_DEMO_SHIPMENT_ID = String(import.meta.env.VITE_LANDING_DEMO_SHIPMENT_ID || '').trim();

export const EXPLORER_URL = 'https://testnet.explorer.perawallet.app/tx/';

function requireEnv(name: string, value: string | undefined): string {
  const v = (value || '').trim().replace(/\/+$/, '');
  if (!v && import.meta.env.PROD) {
    console.warn(`[Pramanik] Missing ${name} — set in Vercel/build env.`);
  }
  return v;
}

export const LORA_TX = LORA_BASE_URL ? `${LORA_BASE_URL}/transaction` : '';

export const LORA_APP = (id: number) => (LORA_BASE_URL && id ? `${LORA_BASE_URL}/application/${id}` : '');

export const loraTransactionUrl = (txId: string) => (txId && LORA_TX ? `${LORA_TX}/${txId}` : '');

export const loraAssetUrl = (assetId: number | string) =>
  LORA_BASE_URL && assetId ? `${LORA_BASE_URL}/asset/${assetId}` : '';

export const loraAccountUrl = (addr: string) => (LORA_BASE_URL && addr ? `${LORA_BASE_URL}/account/${addr}` : '');

export function wsLiveUrl(): string {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/ws/live`;
  }
  const base = BACKEND_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${base}/ws/live`;
}

/** Algod base URL (must match wallet / indexer network). */
export const ALGOD_URL = requireEnv('VITE_ALGORAND_NODE', import.meta.env.VITE_ALGORAND_NODE as string | undefined);
