/** Set NEXT_PUBLIC_APP_ID in Vercel to match backend APP_ID (0 until deployed). */
export const APP_ID = Number(process.env.NEXT_PUBLIC_APP_ID || 0);
const _loraBase = (process.env.NEXT_PUBLIC_LORA_BASE_URL || 'https://lora.algokit.io/testnet').replace(/\/+$/, '');
export const LORA_APP_URL = `${_loraBase}/application/${APP_ID || 'YOUR_APP_ID'}`;
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export function loraTransactionUrl(txId: string): string {
  return txId ? `${_loraBase}/transaction/${txId}` : '';
}

// These are the actual values from the testnet run (can be overridden dynamically)
export const LAST_KNOWN_VERDICT = 'SETTLE';
export const LAST_KNOWN_CONFIDENCE = 97;
export const LAST_KNOWN_ESCROW = 4.75;
