import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Lock, Shield, Zap, ExternalLink } from 'lucide-react';
import { BACKEND_URL } from '../constants/api';

export default function ProtocolPage() {
  const kpis = useQuery({
    queryKey: ['global-kpis'],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/global-kpis`, { timeout: 8000 });
      return res.data as Record<string, unknown>;
    },
    staleTime: 15_000,
  });

  const txns = useQuery({
    queryKey: ['app-transactions'],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 15 }, timeout: 8000 });
      return res.data as { transactions?: { tx_id?: string; type?: string; lora_url?: string }[] };
    },
    staleTime: 15_000,
  });

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24, maxWidth: 720 }}>
      <Link to="/" style={{ color: '#2563eb', fontWeight: 600, display: 'inline-block', marginBottom: 20 }}>
        ← Dashboard
      </Link>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Navi-Trust protocol</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Live testnet view: counts and recent transactions come from Algorand (boxes / indexer) via this API — not mocked.
      </p>

      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>On-chain stats</div>
        {kpis.isLoading && <span style={{ color: '#94a3b8' }}>Loading…</span>}
        {kpis.isError && <span style={{ color: '#b91c1c' }}>Could not load global-kpis.</span>}
        {kpis.data && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem', color: '#334155' }}>
            <li>App ID: {String(kpis.data.app_id ?? '—')}</li>
            <li>Total shipments (boxes): {String(kpis.data.total_shipments ?? kpis.data.total_settlements ?? '—')}</li>
            <li>Settled: {String(kpis.data.total_settled ?? '—')}</li>
            <li>Disputed: {String(kpis.data.total_disputed ?? '—')}</li>
          </ul>
        )}
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          background: '#fff',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Recent app transactions</div>
        {txns.isLoading && <span style={{ color: '#94a3b8' }}>Loading…</span>}
        {txns.isError && <span style={{ color: '#b91c1c' }}>Could not load indexer transactions.</span>}
        {txns.data?.transactions && txns.data.transactions.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {txns.data.transactions.map((t) => (
              <li key={t.tx_id || Math.random().toString()} style={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', color: '#475569' }}>{(t.tx_id || '').slice(0, 12)}…</span>
                <span style={{ color: '#64748b' }}>{t.type || '—'}</span>
                {t.lora_url ? (
                  <a href={t.lora_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Lora <ExternalLink size={12} />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!txns.isLoading && (!txns.data?.transactions || txns.data.transactions.length === 0) && !txns.isError ? (
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No transactions returned (check APP_ID / indexer).</span>
        ) : null}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <li style={{ display: 'flex', gap: 12, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <Shield size={22} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>On-chain</strong>
            <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.9rem' }}>
              NaviTrust registers shipments, locks escrow, records oracle verdicts, and settles with inner payments. Proofs use Lora.
            </p>
          </div>
        </li>
        <li style={{ display: 'flex', gap: 12, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <Zap size={22} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>AI + NaviBot</strong>
            <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.9rem' }}>
              Run-jury writes verdicts on-chain when thresholds pass. NaviBot answers from injected chain JSON only; voice uses browser STT and optional ElevenLabs TTS.
            </p>
          </div>
        </li>
        <li style={{ display: 'flex', gap: 12, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <Lock size={22} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Disclaimer</strong>
            <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.9rem' }}>
              Testnet demo. Minimize sensitive data on-chain; certificate ASA is a placeholder in the current contract.
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}
