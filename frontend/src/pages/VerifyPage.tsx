import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, Search, Shield } from 'lucide-react';
import { BACKEND_URL, FALLBACK_APP_ID, LORA_APP } from '../constants/api';
import { ChainVerificationHub } from '../components/verification/ChainVerificationHub';

function chainStatusLabel(data: Record<string, unknown> | null): string {
  if (!data) return '';
  const oc = data.on_chain as Record<string, unknown> | undefined;
  if (oc && typeof oc.status === 'string') return oc.status;
  if (typeof data.on_chain_status === 'string') return data.on_chain_status;
  return '';
}

function isFlagged(st: string) {
  return st === 'Delayed_Disaster' || st === 'Disputed';
}

export default function VerifyPage() {
  const { shipmentId: routeShipmentId, wallet: routeWallet } = useParams<{
    shipmentId?: string;
    wallet?: string;
  }>();
  const [id, setId] = useState(routeShipmentId || 'SHIP_001');
  const [submitted, setSubmitted] = useState(routeShipmentId || 'SHIP_001');
  const [hubWallet, setHubWallet] = useState('');
  const [hubWalletSubmitted, setHubWalletSubmitted] = useState('');

  useEffect(() => {
    if (routeShipmentId && routeShipmentId.trim()) {
      setId(routeShipmentId);
      setSubmitted(routeShipmentId.trim());
    }
  }, [routeShipmentId]);

  useEffect(() => {
    const w = (routeWallet || '').trim();
    if (!routeWallet) return;
    if (w.length >= 52 && w.length <= 64) {
      setHubWallet(w);
      setHubWalletSubmitted(w);
    }
  }, [routeWallet]);

  const q = useQuery({
    queryKey: ['verify', submitted],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/verify/${encodeURIComponent(submitted)}`, { timeout: 8000 });
      return res.data as Record<string, unknown>;
    },
    enabled: submitted.length > 0,
    staleTime: 15_000,
  });

  const healthQ = useQuery({
    queryKey: ['verification-health-public'],
    queryFn: async () => (await axios.get(`${BACKEND_URL}/verification/health`, { timeout: 8000 })).data as Record<string, unknown>,
    staleTime: 30_000,
  });

  const cfgQ = useQuery({
    queryKey: ['config-public'],
    queryFn: async () => (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as { app_id?: number },
  });

  const st = chainStatusLabel(q.data ?? null);
  const fundsMicro = typeof q.data?.funds_locked_microalgo === 'number' ? (q.data.funds_locked_microalgo as number) : null;
  const loraVerdict = typeof q.data?.lora_verdict_tx_url === 'string' ? (q.data.lora_verdict_tx_url as string) : '';
  const verdictTxId =
    q.data?.latest_verdict && typeof q.data.latest_verdict === 'object'
      ? String((q.data.latest_verdict as { tx_id?: string }).tx_id || '').trim()
      : '';
  const hubLastTxId = verdictTxId.length > 20 ? verdictTxId : null;

  const proofAssetIds = useMemo(() => {
    const cid = q.data?.certificate_asa_id;
    if (typeof cid === 'number' && cid > 0) return [cid];
    return [];
  }, [q.data?.certificate_asa_id]);

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={28} color="#2563eb" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Verify shipment</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Public proof — no login (reads live indexer / algod via API)</p>
          </div>
        </div>
        <Link to="/" style={{ color: '#2563eb', fontWeight: 600 }}>← Dashboard</Link>
      </header>

      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          fontSize: '0.82rem',
          color: '#475569',
        }}
      >
        <strong style={{ color: '#0f172a' }}>Ledger nodes (read-only)</strong>
        {healthQ.data ? (
          <span style={{ marginLeft: 8 }}>
            Algod {healthQ.data.algod_ok ? 'ok' : 'down'} · last round {String(healthQ.data.algod_last_round ?? '—')} · Indexer{' '}
            {healthQ.data.indexer_ok ? 'ok' : 'down'}
          </span>
        ) : (
          <span style={{ marginLeft: 8, color: '#64748b' }}>Loading…</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, maxWidth: 520, marginBottom: 20 }}>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(id.trim())}
          placeholder="e.g. SHIP_001"
          style={{ flex: 1, padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
        />
        <button
          type="button"
          className="primary-btn"
          onClick={() => setSubmitted(id.trim())}
          disabled={!id.trim() || q.isFetching}
        >
          {q.isFetching ? '…' : <><Search size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Verify</>}
        </button>
      </div>

      {q.isError && (
        <div style={{ padding: 16, background: '#fef2f2', borderRadius: 10, color: '#b91c1c', maxWidth: 560 }}>
          Request failed. Is the API running at {BACKEND_URL}?
        </div>
      )}

      {q.data && (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: isFlagged(st) ? '#fef2f2' : st === 'Settled' ? '#f0fdf4' : '#eff6ff',
              border: `1px solid ${isFlagged(st) ? '#fecaca' : st === 'Settled' ? '#bbf7d0' : '#bfdbfe'}`,
            }}
          >
            <code style={{ fontWeight: 700 }}>{String(q.data.shipment_id)}</code>
            <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
              <strong>On-chain status:</strong> {st || '—'}
            </div>
            {fundsMicro != null && (
              <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#475569' }}>
                <strong>Escrow (microAlgo):</strong> {fundsMicro.toLocaleString()} ({(fundsMicro / 1e6).toFixed(3)} ALGO)
              </div>
            )}
            {q.data.origin != null && (
              <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 6 }}>
                {String(q.data.origin)} → {String(q.data.destination)}
              </div>
            )}
          </div>

          {q.data.latest_verdict && typeof q.data.latest_verdict === 'object' && (
            <div style={{ padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>AI verdict (off-chain log)</div>
              <div style={{ fontSize: '0.88rem', color: '#334155' }}>
                Risk: {(q.data.latest_verdict as { sentinel_score?: number }).sentinel_score ?? '—'} —{' '}
                {(q.data.latest_verdict as { reasoning_narrative?: string }).reasoning_narrative ||
                  (q.data.latest_verdict as { summary?: string }).summary ||
                  '—'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a
              href={LORA_APP(Number(q.data.app_id) || FALLBACK_APP_ID)}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#2563eb' }}
            >
              Application on Lora <ExternalLink size={16} />
            </a>
            {loraVerdict ? (
              <a href={loraVerdict} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#2563eb' }}>
                Verdict transaction <ExternalLink size={16} />
              </a>
            ) : null}
          </div>

          <details style={{ fontSize: '0.8rem', color: '#64748b' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Raw JSON</summary>
            <pre
              style={{
                fontSize: '0.72rem',
                background: '#0f172a',
                color: '#e2e8f0',
                padding: 14,
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: 280,
                marginTop: 8,
              }}
            >
              {JSON.stringify(q.data, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <section style={{ marginTop: 40, maxWidth: 640, paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>Optional: wallet ledger receipts</h2>
        <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b' }}>
          Paste a TestNet address to load NaviTrust app calls from the indexer (same hub as the dashboard).
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={hubWallet}
            onChange={(e) => setHubWallet(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setHubWalletSubmitted(hubWallet.trim())}
            placeholder="Algorand address"
            style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
          />
          <button
            type="button"
            className="primary-btn"
            onClick={() => setHubWalletSubmitted(hubWallet.trim())}
            disabled={hubWallet.trim().length < 52}
          >
            Load receipts
          </button>
        </div>
      </section>

      {hubWalletSubmitted.trim().length >= 52 ? (
        <div style={{ marginTop: 28, maxWidth: 900 }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 12px' }}>Ledger verification hub</h2>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b' }}>
            Atomic groups, algod state, indexer receipts, ARC-4 decode, proof bundle — reproducible without trusting this UI.
          </p>
          <ChainVerificationHub
            wallet={hubWalletSubmitted.trim()}
            appId={cfgQ.data?.app_id ?? FALLBACK_APP_ID}
            lastTxId={hubLastTxId}
            proofAssetIds={proofAssetIds}
            focusShipmentId={submitted.trim() || null}
          />
        </div>
      ) : null}
    </div>
  );
}
