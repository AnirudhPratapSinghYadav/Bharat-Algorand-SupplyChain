import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Download, ExternalLink, Shield } from 'lucide-react';
import { BACKEND_URL, FALLBACK_APP_ID } from '../constants/api';

export default function ProtocolPage() {
  const [exporting, setExporting] = useState(false);

  const healthQ = useQuery({
    queryKey: ['health-protocol'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/health`, { timeout: 8000 })).data as {
        algod_ok?: boolean;
        app_id?: number;
        network?: string;
      },
    staleTime: 15_000,
  });

  const cfgQ = useQuery({
    queryKey: ['config-protocol'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as { app_id?: number; oracle_address?: string },
    staleTime: 60_000,
  });

  const statsQ = useQuery({
    queryKey: ['protocol-stats'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/stats`, { timeout: 12_000 })).data as {
        total_shipments?: number;
        total_settled?: number;
        total_disputed?: number;
        escrow_total_algo?: number;
      },
    staleTime: 15_000,
  });

  const txns = useQuery({
    queryKey: ['app-transactions-protocol'],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 25 }, timeout: 8000 });
      return res.data as {
        transactions?: {
          tx_id?: string;
          round?: number;
          type?: string;
          action?: string;
          action_plain?: string;
          method_name?: string;
          sender?: string;
          amount?: number;
          lora_url?: string;
        }[];
        app_id?: number;
      };
    },
    staleTime: 15_000,
  });

  const stateQ = useQuery({
    queryKey: ['protocol-display-state-raw'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/protocol/display-global-state`, { timeout: 12_000 })).data as {
        fields?: Record<string, string | number>;
      },
    staleTime: 20_000,
  });

  const appId = cfgQ.data?.app_id ?? healthQ.data?.app_id ?? FALLBACK_APP_ID;
  const oracle = cfgQ.data?.oracle_address ?? '—';

  const exportProof = useCallback(async () => {
    setExporting(true);
    try {
      const [stats, state, tx, cfg] = await Promise.all([
        axios.get(`${BACKEND_URL}/stats`, { timeout: 12_000 }).then((r) => r.data),
        axios.get(`${BACKEND_URL}/protocol/display-global-state`, { timeout: 12_000 }).then((r) => r.data),
        axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 40 }, timeout: 12_000 }).then((r) => r.data),
        axios.get(`${BACKEND_URL}/config`, { timeout: 8000 }).then((r) => r.data),
      ]);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), stats, global_state: state, config: cfg, recent_transactions: tx }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `navi-trust-protocol-proof-${appId || 'app'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* silent */
    } finally {
      setExporting(false);
    }
  }, [appId]);

  const globalRows = [
    { k: 'total_shipments', v: statsQ.data?.total_shipments ?? '—' },
    { k: 'total_settled', v: statsQ.data?.total_settled ?? '—' },
    { k: 'total_disputed', v: statsQ.data?.total_disputed ?? '—' },
    { k: 'escrow_total_algo', v: statsQ.data?.escrow_total_algo ?? '—' },
  ];

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24, maxWidth: 900, color: 'var(--text)' }}>
      <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600, display: 'inline-block', marginBottom: 20 }}>
        ← Dashboard
      </Link>

      <h1 style={{ fontSize: '1.5rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Shield size={28} color="var(--accent)" /> Protocol
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 28 }}>Technical view — contract, global state, recent transactions.</p>

      <section style={{ marginBottom: 28 }} className="card">
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>1. Contract info</h2>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
          <div>
            <strong>App ID:</strong> {appId || '—'}{' '}
            {appId ? (
              <a href={`https://lora.algokit.io/testnet/application/${appId}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Open on Lora ↗ <ExternalLink size={14} style={{ verticalAlign: 'middle' }} />
              </a>
            ) : null}
          </div>
          <div>
            <strong>Creator (oracle):</strong> <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: '0.82rem' }}>{oracle}</span>
          </div>
          <div>
            <strong>Network:</strong> {healthQ.data?.network || 'Algorand Testnet'}
          </div>
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: '0.82rem' }}>
            ARC-56 methods: register_shipment, fund_shipment, record_verdict, settle_shipment, update_oracle, get_global_stats
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }} className="card">
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>2. Live global state</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '8px 0' }}>Field</th>
              <th style={{ padding: '8px 0' }}>Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {globalRows.map((row) => (
              <tr key={row.k} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 8px 10px 0', color: 'var(--muted)' }}>{row.k}</td>
                <td style={{ padding: '10px 0', fontWeight: 600, fontFamily: 'var(--mono, monospace)' }}>{String(row.v)}</td>
                <td style={{ padding: '10px 0', fontSize: '0.72rem' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(0,194,255,0.12)', color: 'var(--accent)' }}>Source: Algorand global state</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {stateQ.data?.fields && Object.keys(stateQ.data.fields).length > 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--dim)', marginTop: 12 }}>
            Raw keys from /protocol/display-global-state: {Object.keys(stateQ.data.fields).join(', ')}
          </p>
        ) : null}
      </section>

      <section style={{ marginBottom: 28 }} className="card">
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>3. Recent transactions</h2>
        <div style={{ overflowX: 'auto' }}>
          {txns.isLoading ? (
            <p style={{ color: 'var(--muted)' }}>Loading…</p>
          ) : !txns.data?.transactions?.length ? (
            <p style={{ color: 'var(--muted)' }}>No transactions returned.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px 10px' }}>Method</th>
                  <th style={{ padding: '8px 10px' }}>Round</th>
                  <th style={{ padding: '8px 10px' }}>Sender</th>
                  <th style={{ padding: '8px 10px' }}>Amount</th>
                  <th style={{ padding: '8px 10px' }}>Lora</th>
                </tr>
              </thead>
              <tbody>
                {txns.data.transactions.map((t) => (
                  <tr key={t.tx_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 10px' }}>{t.action_plain || t.action || t.method_name || t.type || '—'}</td>
                    <td style={{ padding: '10px 10px' }}>{t.round ?? '—'}</td>
                    <td style={{ padding: '10px 10px', fontFamily: 'var(--mono)', fontSize: '0.75rem', maxWidth: 160 }} title={t.sender}>
                      {t.sender ? `${t.sender.slice(0, 6)}…${t.sender.slice(-4)}` : '—'}
                    </td>
                    <td style={{ padding: '10px 10px' }}>{t.amount != null ? t.amount : '—'}</td>
                    <td style={{ padding: '10px 10px' }}>
                      {t.lora_url ? (
                        <a href={t.lora_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
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
          )}
        </div>
      </section>

      <section style={{ marginBottom: 40 }} className="card">
        <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>4. Export</h2>
        <button
          type="button"
          className="primary-btn"
          disabled={exporting}
          onClick={() => void exportProof()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={16} /> {exporting ? 'Preparing…' : 'Export blockchain proof (JSON)'}
        </button>
      </section>
    </div>
  );
}
