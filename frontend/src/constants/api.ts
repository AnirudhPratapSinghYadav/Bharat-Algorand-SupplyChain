const _rawBase =
  (import.meta.env.VITE_API_URL as string) || `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8000`;

/** No trailing slash — avoids `//navibot` and failed POSTs. */
export const BACKEND_URL = _rawBase.replace(/\/+$/, '');

export const API_TIMEOUT = 5000;

export const FALLBACK_APP_ID = Number(import.meta.env.VITE_APP_ID) || 756424573;

/** Optional: pin landing “live proof” card to this shipment; otherwise first ID from /bootstrap is used. */
export const LANDING_DEMO_SHIPMENT_ID = String(import.meta.env.VITE_LANDING_DEMO_SHIPMENT_ID || '').trim();

export const EXPLORER_URL = 'https://testnet.explorer.perawallet.app/tx/';

export const LORA_APP = (id: number) => `https://lora.algokit.io/testnet/application/${id}`;
