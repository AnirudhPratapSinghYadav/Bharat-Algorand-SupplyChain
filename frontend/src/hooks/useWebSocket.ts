import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL, wsLiveUrl } from '../constants/api';

export type LiveWsPayload = {
  type?: string;
  app_id?: number;
  transactions?: {
    tx_id?: string;
    lora_url?: string;
    lora_tx_url?: string;
    action?: string;
    timestamp?: string;
    round?: number;
  }[];
  poll_interval_seconds?: number;
};

export function useLiveTransactions(enabled = true) {
  const [payload, setPayload] = useState<LiveWsPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const pollFallback = useCallback(async () => {
    try {
      const r = await axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 15 }, timeout: 8000 });
      const d = r.data as unknown;
      const arr = Array.isArray(d)
        ? d
        : Array.isArray((d as { transactions?: unknown })?.transactions)
          ? (d as { transactions: LiveWsPayload['transactions'] }).transactions
          : [];
      setPayload({ type: 'poll', transactions: arr ?? [] });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const url = wsLiveUrl();
    if (!enabled || !url.startsWith('ws')) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onmessage = (ev) => {
      try {
        setPayload(JSON.parse(ev.data) as LiveWsPayload);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || connected) return;
    void pollFallback();
    const id = window.setInterval(() => void pollFallback(), 30_000);
    return () => window.clearInterval(id);
  }, [enabled, connected, pollFallback]);

  return { payload, connected };
}
