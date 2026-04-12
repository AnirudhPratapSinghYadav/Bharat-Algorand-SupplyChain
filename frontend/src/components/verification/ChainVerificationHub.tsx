import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Download, RefreshCw, Shield } from 'lucide-react';
import { BACKEND_URL } from '../../constants/api';

const LORA_TX = (id: string) => `https://lora.algokit.io/testnet/transaction/${id}`;

function shortId(id: string) {
  if (!id || id.length < 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

type HubProps = {
  wallet: string;
  appId: number | null;
  lastTxId: string | null;
  proofAssetIds?: number[];
  focusShipmentId?: string | null;
};

/**
 * Protocol / dev wallet receipts only — no raw global JSON, no ARC-4 audit tables.
 */
export function ChainVerificationHub({ wallet, appId, lastTxId }: HubProps) {
  const [proofLimit, setProofLimit] = useState(30);

  const proofsQ = useQuery({
    queryKey: ['verification', 'wallet-proofs', wallet, proofLimit],
    queryFn: async () =>
      (
        await axios.get(`${BACKEND_URL}/verification/wallet-proofs`, {
          params: { wallet, limit: proofLimit },
          timeout: 15_000,
        })
      ).data as { items?: Record<string, unknown>[] },
    enabled: wallet.length >= 52,
  });

  const items = proofsQ.data?.items ?? [];

  return (
    <section
      className="card"
      style={{
        marginTop: 14,
        padding: 16,
        border: '1px solid rgba(56,189,248,0.25)',
        background: 'rgba(15,23,42,0.55)',
      }}
      aria-label="Wallet receipts"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>
          <Shield size={18} color="#38bdf8" /> Wallet app calls
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {wallet.length >= 52 ? (
            <a
              href={`${BACKEND_URL}/verification/export/bundle.json?wallet=${encodeURIComponent(wallet)}${lastTxId ? `&tx_id=${encodeURIComponent(lastTxId)}` : ''}`}
              download
              style={{ ...linkPill, textDecoration: 'none', borderColor: 'rgba(251,191,36,0.45)', color: '#fde68a' }}
            >
              <Download size={12} /> Export blockchain proof (JSON)
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void proofsQ.refetch()}
            style={{
              ...linkPill,
              border: '1px solid #475569',
              background: 'transparent',
              cursor: 'pointer',
              color: '#cbd5e1',
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {wallet.length < 52 ? (
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Enter a valid Algorand address above to load receipts.</p>
      ) : proofsQ.isLoading ? (
        <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No matching transactions for this wallet yet.</p>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', color: '#cbd5e1' }}>
            <thead>
              <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                <th style={th}>Round</th>
                <th style={th}>Action</th>
                <th style={th}>Tx</th>
                <th style={th}>Lora</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={String(p.tx_id)} style={{ borderTop: '1px solid rgba(148,163,184,0.12)' }}>
                  <td style={td}>{p.round != null ? String(p.round) : '—'}</td>
                  <td style={td}>{String(p.method_label || p.type || '—')}</td>
                  <td style={td}>{shortId(String(p.tx_id ?? ''))}</td>
                  <td style={td}>
                    {p.tx_id ? (
                      <a href={LORA_TX(String(p.tx_id))} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>
                        ↗
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proofLimit < 60 && items.length > 0 ? (
        <button
          type="button"
          onClick={() => setProofLimit((n) => Math.min(n + 25, 60))}
          style={{
            marginTop: 10,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(56,189,248,0.4)',
            background: 'rgba(56,189,248,0.1)',
            color: '#7dd3fc',
            fontSize: '0.72rem',
            cursor: 'pointer',
          }}
        >
          Load more
        </button>
      ) : null}

      {appId ? (
        <p style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 12, marginBottom: 0 }}>
          App #{appId} — use Lora from the Protocol page header for the full application view.
        </p>
      ) : null}
    </section>
  );
}

const linkPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid rgba(56,189,248,0.35)',
  fontSize: '0.72rem',
  color: '#7dd3fc',
  textDecoration: 'none',
};

const th: CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const td: CSSProperties = { padding: '8px', verticalAlign: 'top' };
