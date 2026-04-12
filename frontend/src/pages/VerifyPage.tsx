import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, Search, Shield } from 'lucide-react';
import { BACKEND_URL, LORA_APP } from '../constants/api';
import { WitnessButton } from '../components/WitnessButton';
import { useWallet } from '../context/WalletContext';

function chainStatusLabel(data: Record<string, unknown> | null): string {
  if (!data) return '';
  const oc = data.on_chain as Record<string, unknown> | undefined;
  if (oc && typeof oc.status === 'string') return oc.status;
  if (typeof data.on_chain_status === 'string') return data.on_chain_status;
  return '';
}

function statusBadgeStyle(st: string): { bg: string; color: string; border: string } {
  if (st === 'Delayed_Disaster' || st === 'Disputed') return { bg: 'rgba(239,68,68,0.12)', color: '#fecaca', border: 'var(--danger)' };
  if (st === 'Settled') return { bg: 'rgba(34,197,94,0.12)', color: '#bbf7d0', border: 'var(--success)' };
  return { bg: 'rgba(0,194,255,0.08)', color: '#bae6fd', border: 'var(--accent)' };
}

export default function VerifyPage() {
  const { shipmentId: routeShipmentId } = useParams<{ shipmentId?: string }>();
  const [id, setId] = useState(routeShipmentId || 'SHIP_MUMBAI_001');
  const [submitted, setSubmitted] = useState(routeShipmentId || 'SHIP_MUMBAI_001');
  const { address, connect } = useWallet();

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

  const witnessesQ = useQuery({
    queryKey: ['witnesses', submitted],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/witnesses/${encodeURIComponent(submitted)}`, { timeout: 12_000 });
      return res.data as { witness_count?: number; witnesses?: { address?: string; tx_id?: string; lora_url?: string }[] };
    },
    enabled: submitted.length > 0,
    staleTime: 20_000,
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

  const resolvedAppId = q.data?.app_id;
  const showAppIdOnVerify = typeof resolvedAppId === 'number' && Number.isFinite(resolvedAppId) && resolvedAppId > 0;

  const latest = q.data?.latest_verdict as
    | {
        sentinel_score?: number;
        auditor_score?: number;
        fraud_score?: number;
        score?: number;
      }
    | undefined;

  const hasVerdict =
    !!(verdictText || panel?.reasoning || panel?.decision) ||
    !!(latest && (latest.sentinel_score != null || latest.score != null));

  const onAutoSubmit = (demoId: string) => {
    setId(demoId);
    setSubmitted(demoId);
  };

  return (
    <div style={{ minHeight: '100vh', padding: 24, background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={28} color="var(--accent)" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontFamily: 'var(--mono)' }}>Verify shipment</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>Public proof. No login required.</p>
          </div>
        </div>
        <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          ← Dashboard
        </Link>
      </header>

      <div style={{ display: 'flex', gap: 8, maxWidth: 560, marginBottom: 20 }}>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(id.trim())}
          placeholder="Enter shipment ID"
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-raised)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            fontFamily: 'var(--mono)',
          }}
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

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 10 }}>Try a demo shipment:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {['SHIP_MUMBAI_001', 'SHIP_CHEN_002', 'SHIP_DELHI_003'].map((demoId) => (
          <button
            key={demoId}
            type="button"
            onClick={() => onAutoSubmit(demoId)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--accent)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
            }}
          >
            {demoId}
          </button>
        ))}
      </div>

      {q.isError && (
        <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--danger)', color: '#fecaca', maxWidth: 560 }}>
          Could not load this shipment. Check the ID and that the API is running.
        </div>
      )}

      {q.data && (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="card"
            style={{
              border: `1px solid ${badge.border}`,
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--text)' }}>{String(q.data.shipment_id)}</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Status</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                }}
              >
                {st || '—'}
              </span>
            </div>
            {q.data.origin != null && (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Route:</strong> {String(q.data.origin)} → {String(q.data.destination)}
              </p>
            )}
            {risk != null && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 4 }}>Risk score</div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-raised)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, risk)}%`,
                      height: '100%',
                      borderRadius: 4,
                      background: risk > 65 ? 'var(--danger)' : risk > 40 ? 'var(--warning)' : 'var(--success)',
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{risk} / 100</div>
              </div>
            )}
            {fundsMicro != null && fundsMicro > 0 ? (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--warning)' }}>Funds:</strong> {(fundsMicro / 1e6).toFixed(4)} ALGO locked in smart contract
              </p>
            ) : st === 'Settled' ? (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem', color: 'var(--success)' }}>Released on settlement</p>
            ) : null}

            {panel && (panel.reasoning || panel.decision != null || panel.risk_score != null) ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>AI Jury Verdict</div>
                {panel.risk_score != null ? (
                  <p style={{ margin: '0 0 6px', fontSize: '0.88rem' }}>
                    <strong>Risk:</strong> {panel.risk_score} / 100
                  </p>
                ) : null}
                {panel.decision ? (
                  <p style={{ margin: '0 0 6px', fontSize: '0.88rem' }}>
                    <strong>Decision:</strong> {panel.decision}
                  </p>
                ) : null}
                {(panel.reasoning || verdictText) ? (
                  <p style={{ margin: '0 0 8px', fontSize: '0.88rem', lineHeight: 1.55, color: 'var(--text)' }}>
                    <strong>Reasoning:</strong> {panel.reasoning || verdictText}
                  </p>
                ) : null}
                {latest && (latest.sentinel_score != null || latest.fraud_score != null || latest.auditor_score != null) ? (
                  <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Agent scores: Sentinel {latest.sentinel_score ?? '—'} · Auditor {latest.auditor_score ?? '—'} · Fraud {latest.fraud_score ?? '—'} · Arbiter{' '}
                    {latest.score ?? '—'}
                  </p>
                ) : null}
                {loraTxUrl ? (
                  <a href={loraTxUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent)' }}>
                    Read verdict on Lora ↗ <ExternalLink size={16} />
                  </a>
                ) : null}
              </div>
            ) : verdictText ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Verdict</div>
                <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>{verdictText}</p>
              </div>
            ) : null}

            <p style={{ margin: '16px 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              ✓ Verified on Algorand Testnet
              {showAppIdOnVerify ? ` · App #${resolvedAppId}` : ''}
            </p>
            {showAppIdOnVerify ? (
              <a href={LORA_APP(Number(resolvedAppId))} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>
                Open contract on Lora ↗
              </a>
            ) : null}

            <WitnessButton shipmentId={submitted} hasVerdict={hasVerdict} walletAddress={address} onConnectRequest={connect} />
          </div>

          {st === 'Settled' && certId != null && certId > 0 ? (
            <div className="card" style={{ border: '1px solid var(--success)', background: 'rgba(34,197,94,0.08)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--success)' }}>ARC-69 Settlement Certificate</div>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>NAVI-CERT #{certId}</p>
              <a
                href={`https://lora.algokit.io/testnet/asset/${certId}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', marginTop: 10, fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)', gap: 6 }}
              >
                View certificate on Lora ↗ <ExternalLink size={16} />
              </a>
            </div>
          ) : null}

          <section className="card" style={{ border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.95rem' }}>👁 Blockchain Witnesses</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10 }}>
              {witnessesQ.data?.witness_count ?? 0} witness transaction(s) on-chain for this shipment.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(witnessesQ.data?.witnesses || []).slice(0, 12).map((w, i) => (
                <li key={w.tx_id || i} style={{ fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>
                  {w.address ? `${w.address.slice(0, 8)}…${w.address.slice(-6)}` : '—'}{' '}
                  {w.lora_url ? (
                    <a href={w.lora_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', marginLeft: 8 }}>
                      Lora ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
