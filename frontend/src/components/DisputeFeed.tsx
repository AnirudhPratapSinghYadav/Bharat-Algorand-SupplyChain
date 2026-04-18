import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, Radio } from 'lucide-react';

import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type FeedItem = {
  kind: 'JURY_VERDICT' | 'ACTIVE_DISPUTE';
  shipment_id?: string;
  verdict?: string;
  score?: number;
  ts?: string;
  funds_algo?: number;
  funds_usd?: number | null;
  funds_inr?: number | null;
  algo_spot_usd?: number | null;
  on_chain_status?: string;
  lora_verdict_tx_url?: string | null;
  lora_app_url?: string | null;
  lora_contract_url?: string | null;
};

type FeedResponse = {
  items?: FeedItem[];
  generated_at?: string;
  counts?: { jury_verdict?: number; active_dispute?: number };
  error?: string;
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

export function DisputeFeed() {
  const q = useQuery({
    queryKey: ['dispute-feed'],
    queryFn: async () => {
      const res = await axios.get<FeedResponse>(`${BACKEND_URL}/dispute-feed`, { timeout: API_TIMEOUT });
      return res.data;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const items = Array.isArray(q.data?.items) ? q.data!.items! : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
          Auto-refresh every 30s · {q.data?.generated_at ? `Updated ${q.data.generated_at}` : '—'}
        </div>
        {q.data?.counts ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            Verdicts: <strong style={{ color: 'var(--text)' }}>{q.data.counts.jury_verdict ?? 0}</strong> · Active disputes:{' '}
            <strong style={{ color: 'var(--text)' }}>{q.data.counts.active_dispute ?? 0}</strong>
          </div>
        ) : null}
      </div>

      {q.isLoading ? <p style={{ color: 'var(--muted)' }}>Loading feed…</p> : null}
      {q.isError ? (
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Feed unavailable (check API / CORS).</p>
      ) : null}
      {q.data?.error ? <p style={{ color: 'var(--warning)', fontSize: '0.82rem' }}>{q.data.error}</p> : null}

      {!q.isLoading && !items.length ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No jury verdicts or active disputes to show yet.</p>
      ) : null}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <li
            key={`${it.kind}-${it.shipment_id}-${i}`}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '12px 14px',
              background: 'var(--bg-raised)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio size={16} color="var(--accent)" />
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: it.kind === 'ACTIVE_DISPUTE' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
                    color: it.kind === 'ACTIVE_DISPUTE' ? '#fecaca' : '#bfdbfe',
                  }}
                >
                  {it.kind === 'ACTIVE_DISPUTE' ? 'ACTIVE_DISPUTE' : 'JURY_VERDICT'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem', fontWeight: 700 }}>{it.shipment_id || '—'}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{it.ts || ''}</div>
            </div>

            <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.55 }}>
              {it.kind === 'ACTIVE_DISPUTE' ? (
                <>
                  Status <strong>{String(it.on_chain_status ?? 'Disputed')}</strong>
                  {' · '}
                  Escrow <strong>{it.funds_algo != null ? `${it.funds_algo} ALGO` : '—'}</strong>
                  {it.funds_usd != null ? (
                    <>
                      {' '}
                      · <strong>{fmtUsd(it.funds_usd)}</strong>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Verdict <strong>{String(it.verdict ?? '—')}</strong>
                  {it.score != null ? (
                    <>
                      {' '}
                      · score <strong>{it.score}</strong>
                    </>
                  ) : null}
                  {' · '}
                  Escrow <strong>{it.funds_algo != null ? `${it.funds_algo} ALGO` : '—'}</strong>
                  {it.funds_usd != null ? (
                    <>
                      {' '}
                      · <strong>{fmtUsd(it.funds_usd)}</strong>
                    </>
                  ) : null}
                </>
              )}
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.78rem' }}>
              {it.lora_verdict_tx_url ? (
                <a href={it.lora_verdict_tx_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  Verdict tx (Lora) <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                </a>
              ) : null}
              {it.lora_app_url ? (
                <a href={it.lora_app_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  App (Lora) <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                </a>
              ) : null}
              {it.lora_contract_url ? (
                <a href={it.lora_contract_url} target="_blank" rel="noreferrer" style={{ color: 'var(--muted)', fontWeight: 600 }}>
                  Contract escrow (Lora) <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
