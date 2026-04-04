import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, Shield } from 'lucide-react';
import { BACKEND_URL, FALLBACK_APP_ID } from '../constants/api';
import { ChainVerificationHub } from '../components/verification/ChainVerificationHub';

export default function ProtocolPage() {
  const [wallet, setWallet] = useState('');

  const healthQ = useQuery({
    queryKey: ['health-protocol'],
    queryFn: async () => (await axios.get(`${BACKEND_URL}/health`, { timeout: 8000 })).data as {
      algod_ok?: boolean;
      app_id?: number;
      network?: string;
    },
    staleTime: 15_000,
  });

  const cfgQ = useQuery({
    queryKey: ['config-protocol'],
    queryFn: async () => (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as { app_id?: number; oracle_address?: string },
    staleTime: 60_000,
  });

  const stateQ = useQuery({
    queryKey: ['protocol-display-state'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/protocol/display-global-state`, { timeout: 12_000 })).data as {
        fields?: Record<string, string | number>;
        app_id?: number;
      },
    staleTime: 20_000,
  });

  const txns = useQuery({
    queryKey: ['app-transactions-protocol'],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 20 }, timeout: 8000 });
      return res.data as {
        transactions?: {
          tx_id?: string;
          round?: number;
          type?: string;
          action?: string;
          action_plain?: string;
          method_name?: string;
          lora_url?: string;
        }[];
        app_id?: number;
      };
    },
    staleTime: 15_000,
  });

  const appId = cfgQ.data?.app_id ?? healthQ.data?.app_id ?? FALLBACK_APP_ID;
  const fields = stateQ.data?.fields ?? {};
  const fieldRows = Object.entries(fields);

  function formatLabel(k: string) {
    return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24, maxWidth: 800 }}>
      <Link to="/" style={{ color: '#2563eb', fontWeight: 600, display: 'inline-block', marginBottom: 20 }}>
        ← Dashboard
      </Link>

      <h1 style={{ fontSize: '1.5rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Shield size={28} color="#2563eb" /> Protocol
      </h1>
      <p style={{ color: '#64748b', marginBottom: 28 }}>Technical view for judges and developers. Product flows stay on the dashboard.</p>

      {/* 1 — Contract */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 12 }}>Contract</h2>
        <div
          style={{
            padding: 18,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            fontSize: '0.9rem',
            color: '#334155',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <strong>App ID:</strong> {appId || '—'}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Network:</strong> {healthQ.data?.network || 'Algorand Testnet'}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Status:</strong>{' '}
            {healthQ.data?.algod_ok === false ? (
              <span style={{ color: '#b91c1c' }}>Node unreachable</span>
            ) : (
              <span style={{ color: '#15803d' }}>Active</span>
            )}
          </div>
          {cfgQ.data?.oracle_address ? (
            <div style={{ marginBottom: 8 }}>
              <strong>Oracle:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{cfgQ.data.oracle_address}</span>
            </div>
          ) : null}
          {appId ? (
            <a
              href={`https://lora.algokit.io/testnet/application/${appId}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#2563eb', marginTop: 8 }}
            >
              Open on Lora ↗ <ExternalLink size={16} />
            </a>
          ) : null}
        </div>
      </section>

      {/* 2 — Filtered global state */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 12 }}>Global state</h2>
        <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {stateQ.isLoading ? (
            <p style={{ padding: 16, color: '#94a3b8', margin: 0 }}>Loading…</p>
          ) : fieldRows.length === 0 ? (
            <p style={{ padding: 16, color: '#94a3b8', margin: 0 }}>
              No filtered fields returned (contract may use different key names, or app not deployed).
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <tbody>
                {fieldRows.map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 14px', color: '#64748b', width: '42%' }}>{formatLabel(k)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 3 — Recent transactions */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 12 }}>
          Recent transactions
        </h2>
        <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
          {txns.isLoading ? (
            <p style={{ padding: 16, color: '#94a3b8', margin: 0 }}>Loading…</p>
          ) : !txns.data?.transactions?.length ? (
            <p style={{ padding: 16, color: '#94a3b8', margin: 0 }}>No transactions returned.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px 12px' }}>Round</th>
                    <th style={{ padding: '10px 12px' }}>Method</th>
                    <th style={{ padding: '10px 12px' }}>Tx ID</th>
                    <th style={{ padding: '10px 12px' }}>Lora</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.data.transactions.map((t) => (
                    <tr key={t.tx_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px' }}>{t.round ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{t.action || t.action_plain || t.method_name || t.type || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {t.tx_id ? `${t.tx_id.slice(0, 8)}…` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {t.lora_url ? (
                          <a href={t.lora_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                            ↗
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 4 — Export + wallet receipts */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 12 }}>
          Wallet proofs
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 10 }}>
          Paste a TestNet address to list your app calls and download a proof bundle.
        </p>
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Algorand address"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            fontSize: '0.85rem',
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />
        <ChainVerificationHub wallet={wallet.trim()} appId={appId} lastTxId={null} />
      </section>
    </div>
  );
}
