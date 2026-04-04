import axios from 'axios';
import { BACKEND_URL } from '../constants/api';

export type NavibotHistoryItem = { role: string; content?: string; text?: string };

export type NavibotApiResponse = {
  text?: string;
  reply?: string;
  action?: string | null;
  shipment_id?: string | null;
  audio_url?: string | null;
  fallback?: boolean;
};

/**
 * NaviBot chat — always expects 200 JSON; callers should handle errors with a soft message.
 */
export async function askNavibot(params: {
  query: string;
  history?: NavibotHistoryItem[];
  shipment_id?: string | null;
  wallet_address?: string | null;
  role?: 'stakeholder' | 'supplier';
}): Promise<NavibotApiResponse> {
  const { query, history = [], shipment_id, wallet_address, role } = params;
  const res = await axios.post<NavibotApiResponse>(
    `${BACKEND_URL}/navibot`,
    {
      query,
      message: query,
      history: history.slice(-6),
      shipment_id: shipment_id ?? undefined,
      wallet_address: wallet_address ?? undefined,
      role: role ?? undefined,
    },
    {
      timeout: 12_000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (s) => s === 200,
    },
  );
  return res.data ?? {};
}
