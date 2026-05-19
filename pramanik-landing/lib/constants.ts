export const APP_ID = 758734899; // Replace with actual backend app ID if dynamic
export const LORA_APP_URL = `https://lora.algokit.io/testnet/application/${APP_ID}`;
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// These are the actual values from the testnet run (can be overridden dynamically)
export const LAST_KNOWN_VERDICT = 'SETTLE';
export const LAST_KNOWN_CONFIDENCE = 97;
export const LAST_KNOWN_ESCROW = 4.75;
