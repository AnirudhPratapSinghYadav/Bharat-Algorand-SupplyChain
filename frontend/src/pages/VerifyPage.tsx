import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, Search, Shield } from 'lucide-react';
import { BACKEND_URL, FALLBACK_APP_ID, LORA_APP } from '../constants/api';

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

function statusBadgeStyle(st: string): { bg: string; color: string; border: string } {
  if (isFlagged(st)) return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
  if (st === 'Settled') return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
  return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
}

export default function VerifyPage() {
  const { shipmentId: routeShipmentId } = useParams<{ shipmentId?: string }>();
  const [id, setId] = useState(routeShipmentId || 'SHIP_MUMBAI_001');
  const [submitted, setSubmitted] = useState(routeShipmentId || 'SHIP_MUMBAI_001');

  useEffect(() => {
    if (routeShipmentId && routeShipmentId.trim()) {
      setId(routeShipmentId);
      setSubmitted(routeShipmentId.trim());
    }
  }, [routeShipmentId]);

  const q = useQuery({
    queryKey: ['verify', submitted],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/verify/${encodeURIComponent(submitted)}`, { timeout: 8000 });
      return res.data as Record<string, unknown>;
    },
    enabled: submitted.length > 0,
    staleTime: 15_000,
  });

  const st = chainStatusLabel(q.data ?? null);
  const badge = statusBadgeStyle(st);
  const fundsMicro = typeof q.data?.funds_locked_microalgo === 'number' ? (q.data.funds_locked_microalgo as number) : null;
  const riskFromChain = typeof q.data?.on_chain_risk_score === 'number' ? (q.data.on_chain_risk_score as number) : null;
  const riskFromAudit =
    q.data?.latest_verdict && typeof q.data.latest_verdict === 'object'
      ? (q.data.latest_verdict as { sentinel_score?: number }).sentinel_score
      : null;
  const risk = riskFromAudit != null ? riskFromAudit : riskFromChain;
  const verdictText =
    (typeof q.data?.chain_verdict_reasoning === 'string' && (q.data.chain_verdict_reasoning as string).trim())
      ? (q.data.chain_verdict_reasoning as string)
      : q.data?.latest_verdict && typeof q.data.latest_verdict === 'object'
        ? (q.data.latest_verdict as { reasoning_narrative?: string; summary?: string }).reasoning_narrative ||
          (q.data.latest_verdict as { summary?: string }).summary ||
          ''
        : '';
  const loraVerdict = typeof q.data?.lora_verdict_tx_url === 'string' ? (q.data.lora_verdict_tx_url as string) : '';
  const verdictTxId =
    q.data?.latest_verdict && typeof q.data.latest_verdict === 'object'
      ? String((q.data.latest_verdict as { tx_id?: string }).tx_id || '').trim()
      : '';
  const certId = typeof q.data?.certificate_asa_id === 'number' ? q.data.certificate_asa_id : null;

  const panel = q.data?.ai_verdict_panel as
    | {
        risk_score?: number;
        decision?: string;
        reasoning?: string;
        weather_line?: string | null;
        recorded_at?: string | null;
        source?: string;
        lora_verdict_tx_url?: string | null;
      }
    | undefined;

  const loraTxUrl =
    (typeof panel?.lora_verdict_tx_url === 'string' && panel.lora_verdict_tx_url) ||
    loraVerdict ||
    (verdictTxId.length > 20 ? `https://lora.algokit.io/testnet/transaction/${verdictTxId}` : '');

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={28} color="#2563eb" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Verify shipment</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Public proof — no login required</p>
          </div>
        </div>
        <Link to="/" style={{ color: '#2563eb', fontWeight: 600 }}>
          ← Dashboard
        </Link>
      </header>

      <div style={{ display: 'flex', gap: 8, maxWidth: 520, marginBottom: 20 }}>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(id.trim())}
          placeholder="Enter shipment ID"
          style={{ flex: 1, padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
        />
        <button
          type="button"
          className="primary-btn"
          onClick={() => setSubmitted(id.trim())}
          disabled={!id.trim() || q.isFetching}
        >
          {q.isFetching ? '…' : (
            <>
              <Search size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Verify
            </>
          )}
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 10 }}>Try a demo shipment:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {['SHIP_MUMBAI_001', 'SHIP_CHEN_002', 'SHIP_DELHI_003'].map((demoId) => (
          <button
            key={demoId}
            type="button"
            onClick={() => {
              setId(demoId);
              setSubmitted(demoId);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #bfdbfe',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {demoId}
          </button>
        ))}
      </div>

      {q.isError && (
        <div style={{ padding: 16, background: '#fef2f2', borderRadius: 10, color: '#b91c1c', maxWidth: 560 }}>
          Could not load this shipment. Check the ID and that the API is running.
        </div>
      )}

      {q.data && (
        <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              background: badge.bg,
              border: `1px solid ${badge.border}`,
            }}
          >
            <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
              {String(q.data.shipment_id)}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Status</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: '#fff',
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                }}
              >
                {st || '—'}
              </span>
            </div>
            {q.data.origin != null && (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem', color: '#334155' }}>
                <strong>Route:</strong> {String(q.data.origin)} → {String(q.data.destination)}
              </p>
            )}
            {risk != null && (
              <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#334155' }}>
                <strong>Risk:</strong> {risk} / 100
              </p>
            )}
            {fundsMicro != null && fundsMicro > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#334155' }}>
                <strong>Funds locked:</strong> {(fundsMicro / 1e6).toFixed(2)} ALGO in escrow
              </p>
            )}
            {panel && (panel.reasoning || panel.decision != null || panel.risk_score != null) ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${badge.border}` }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                  AI verdict
                </div>
                {panel.risk_score != null ? (
                  <p style={{ margin: '0 0 6px', fontSize: '0.88rem', color: '#334155' }}>
                    <strong>Risk score:</strong> {panel.risk_score} / 100
                  </p>
                ) : null}
                {panel.decision ? (
                  <p style={{ margin: '0 0 6px', fontSize: '0.88rem', color: '#334155' }}>
                    <strong>Decision:</strong> {panel.decision}
                  </p>
                ) : null}
                {(panel.reasoning || verdictText) ? (
                  <p style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.55 }}>
                    <strong>Reasoning:</strong> {panel.reasoning || verdictText}
                  </p>
                ) : null}
                {panel.weather_line ? (
                  <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#475569' }}>
                    <strong>Weather:</strong> {panel.weather_line}
                  </p>
                ) : null}
                {panel.recorded_at ? (
                  <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#64748b' }}>
                    <strong>Recorded:</strong> {panel.recorded_at}
                  </p>
                ) : null}
                <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#64748b' }}>
                  Source:{' '}
                  {panel.source === 'algorand_transaction_note'
                    ? 'Algorand transaction note (immutable)'
                    : 'On-chain verdict box + audit trail'}
                </p>
              </div>
            ) : verdictText ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${badge.border}` }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                  Verdict
                </div>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.5 }}>{verdictText}</p>
              </div>
            ) : null}
            <p style={{ margin: '16px 0 0', fontSize: '0.8rem', color: '#475569' }}>
              ✓ Verified on Algorand Testnet · App #{Number(q.data.app_id) || FALLBACK_APP_ID}
            </p>
            {loraTxUrl ? (
              <a
                href={loraTxUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 14,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#2563eb',
                  textDecoration: 'none',
                }}
              >
                {panel?.source === 'algorand_transaction_note' ? 'Read verdict on Lora ↗' : 'View on Lora ↗'}{' '}
                <ExternalLink size={16} />
              </a>
            ) : (
              <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                No verdict transaction link yet for this shipment.
              </p>
            )}
            <div style={{ marginTop: 12 }}>
              <a
                href={LORA_APP(Number(q.data.app_id) || FALLBACK_APP_ID)}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.78rem', color: '#64748b' }}
              >
                Application on Lora
              </a>
            </div>
          </div>

          {st === 'Settled' && certId != null && certId > 0 ? (
            <div style={{ padding: 18, borderRadius: 12, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#14532d' }}>ARC-69 Settlement Certificate</div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#166534' }}>ASA #{certId}</p>
              <a
                href={`https://lora.algokit.io/testnet/asset/${certId}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', marginTop: 10, fontSize: '0.85rem', fontWeight: 600, color: '#15803d', gap: 6 }}
              >
                View certificate on Lora ↗ <ExternalLink size={16} />
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
