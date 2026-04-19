import { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type PricePayload = {
    algo_usd?: number | null;
    usd_24h_change?: number | null;
    cached?: boolean;
    error?: string;
};

type PriceTickerProps = {
  /** When false, show a neutral placeholder instead of “offline” copy (parent already showed API error). */
  apiReachable?: boolean;
};

export function PriceTicker({ apiReachable = true }: PriceTickerProps) {
    const [data, setData] = useState<PricePayload | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const r = await axios.get<PricePayload>(`${BACKEND_URL}/price`, { timeout: API_TIMEOUT });
                if (!cancelled) setData(r.data);
            } catch {
                if (!cancelled) setData(null);
            }
        };

        void load();
        const id = window.setInterval(() => void load(), 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    const usd = data?.algo_usd;
    const chg = data?.usd_24h_change;
    const up = typeof chg === 'number' && chg > 0.01;
    const down = typeof chg === 'number' && chg < -0.01;

    return (
        <div
            className="price-ticker"
            style={{
                marginTop: 12,
                marginBottom: 4,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(15,23,42,0.85) 55%)',
                border: '1px solid rgba(56,189,248,0.35)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
            }}
            aria-live="polite"
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', color: '#7dd3fc' }}>
                    ALGO / USD
                </span>
                {typeof usd === 'number' && Number.isFinite(usd) ? (
                    <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                        ${usd.toFixed(4)}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        {apiReachable ? 'Price unavailable (offline or rate limit)' : '—'}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {typeof chg === 'number' && Number.isFinite(chg) ? (
                    <>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                color: up ? '#4ade80' : down ? '#f87171' : '#94a3b8',
                            }}
                        >
                            {up ? <TrendingUp size={18} /> : down ? <TrendingDown size={18} /> : <Minus size={18} />}
                            24h {chg >= 0 ? '+' : ''}
                            {chg.toFixed(2)}%
                        </span>
                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>CoinGecko · refresh 60s</span>
                    </>
                ) : (
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>24h change —</span>
                )}
            </div>
        </div>
    );
}
