import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { ExternalLink, Search, Shield, Download } from 'lucide-react';
import { BACKEND_URL, FALLBACK_APP_ID, LORA_APP, loraAssetUrl, loraTransactionUrl } from '../constants/api';
import { WitnessButton } from '../components/WitnessButton';
import { ShipmentVerifyDetail } from '../components/ShipmentVerifyDetail';
import { CertificateQr } from '../components/CertificateQr';
import {
  shipmentCardTitle,
  stageBadgeColors,
  stageUserLabel,
  verdictUserLabel,
  settlementConfidenceLabel,
  formatEscrowTriple,
} from '../lib/displayLabels';

function isVerifyNotFound(d: Record<string, unknown> | undefined): boolean {
  if (!d) return false;
  if (d.status === 'Not_Found') return true;
  if (d.found === false) return true;
  return false;
}

function chainStatusLabel(data: Record<string, unknown> | null): string {
  if (!data) return '';
  const oc = data.on_chain as Record<string, unknown> | undefined;
  if (oc && typeof oc.status === 'string') return oc.status;
  if (typeof data.on_chain_status === 'string') return data.on_chain_status;
  return '';
}

export default function VerifyPage() {
  const { shipmentId: routeShipmentId } = useParams<{ shipmentId?: string }>();
  const demoBootstrap = useRef(false);

  const configQ = useQuery({
    queryKey: ['verify-page-config'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as {
        demo_shipments?: string[];
        demo_labels?: Record<string, string>;
      },
    staleTime: 60_000,
  });

  const demoIds = Array.isArray(configQ.data?.demo_shipments) ? configQ.data!.demo_shipments! : [];
  const demoLabels = configQ.data?.demo_labels ?? {};
  const demoListKey = demoIds.join('|');

  const [id, setId] = useState(routeShipmentId || '');
  const [submitted, setSubmitted] = useState(routeShipmentId || '');

  useEffect(() => {
    if (routeShipmentId?.trim()) {
      setId(routeShipmentId);
      setSubmitted(routeShipmentId.trim());
      demoBootstrap.current = true;
      return;
    }
    if (!demoBootstrap.current && demoListKey.length > 0) {
      demoBootstrap.current = true;
      const first = demoListKey.split('|')[0] || '';
      setId(first);
      setSubmitted(first);
    }
  }, [routeShipmentId, demoListKey]);

  const q = useQuery({
    queryKey: ['verify', submitted],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/verify/${encodeURIComponent(submitted)}`, { timeout: 12000 });
      return res.data as Record<string, unknown>;
    },
    enabled: submitted.length > 0,
    staleTime: 15_000,
  });

  const hashMut = useMutation({
    mutationFn: async () => {
      const res = await axios.post(
        `${BACKEND_URL}/verify-hash`,
        { shipment_id: submitted },
        { timeout: 15000 },
      );
      return res.data as { match?: boolean; verified?: boolean; computed_hash?: string; on_chain_hash?: string };
    },
  });

  const witnessesQ = useQuery({
    queryKey: ['witnesses', submitted],
    queryFn: async () => {
      const res = await axios.get(`${BACKEND_URL}/witnesses/${encodeURIComponent(submitted)}`, { timeout: 12000 });
      return res.data as { witness_count?: number; witnesses?: { address?: string; tx_id?: string; lora_url?: string }[] };
    },
    enabled: submitted.length > 0 && !isVerifyNotFound(q.data),
    staleTime: 20_000,
  });

  const st = chainStatusLabel(q.data ?? null);
  const badge = stageBadgeColors(st);
  const fundsMicro = typeof q.data?.funds_locked_microalgo === 'number' ? (q.data.funds_locked_microalgo as number) : null;
  const fundsAlgo = fundsMicro != null ? fundsMicro / 1e6 : 0;
  const fundsInr = typeof q.data?.funds_inr === 'number' ? (q.data.funds_inr as number) : null;
  const fundsUsd = typeof q.data?.funds_usd === 'number' ? (q.data.funds_usd as number) : null;

  const panel = q.data?.ai_verdict_panel as
    | {
        risk_score?: number;
        decision?: string;
        reasoning?: string;
        lora_verdict_tx_url?: string | null;
      }
    | undefined;

  const latest = q.data?.latest_verdict as
    | {
        sentinel_score?: number;
        score?: number;
        verdict?: string;
        tx_id?: string;
      }
    | undefined;

  const confidence =
    panel?.risk_score ??
    latest?.score ??
    (typeof q.data?.on_chain_risk_score === 'number' ? (q.data.on_chain_risk_score as number) : null);

  const verdictRaw =
    panel?.decision ||
    latest?.verdict ||
    (typeof q.data?.chain_verdict_reasoning === 'string' ? '' : '') ||
    '';

  const verdictTxId = String(latest?.tx_id || '').trim();
  const loraTxUrl =
    (typeof panel?.lora_verdict_tx_url === 'string' && panel.lora_verdict_tx_url) ||
    (verdictTxId.length > 20 ? loraTransactionUrl(verdictTxId) : '');

  const certId = typeof q.data?.certificate_asa_id === 'number' ? q.data.certificate_asa_id : null;
  const certUrl = certId != null && certId > 0 ? loraAssetUrl(certId) : '';

  const resolvedAppId = q.data?.app_id;
  const showAppId = typeof resolvedAppId === 'number' && resolvedAppId > 0;

  const cardTitle =
    q.data?.origin && q.data?.destination
      ? shipmentCardTitle(String(q.data.origin), String(q.data.destination), String(q.data.created_at || ''))
      : submitted;

  const hasVerdict = !!(panel?.reasoning || panel?.decision || latest?.score != null);

  const downloadPdf = () => {
    window.print();
  };

  return (
    <div className="verify-page" style={{ minHeight: '100vh', padding: 24, background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={28} color="var(--accent)" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontFamily: 'var(--mono)' }}>Public shipment audit</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>Independent verification — no login required.</p>
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
          placeholder="Shipment reference ID"
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
        <button type="button" className="primary-btn" onClick={() => setSubmitted(id.trim())} disabled={!id.trim() || q.isFetching}>
          {q.isFetching ? '…' : (
            <>
              <Search size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Verify
            </>
          )}
        </button>
      </div>

      {demoIds.length > 0 ? (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 10 }}>Sample corridors:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {demoIds.map((demoId) => (
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
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--accent)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {demoLabels[demoId] || demoId}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {q.isError && (
        <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--danger)', color: '#fecaca', maxWidth: 560 }}>
          Could not load this shipment. Check the reference ID and that the API is running.
        </div>
      )}

      {q.data && isVerifyNotFound(q.data) && (
        <div className="card" style={{ maxWidth: 520, border: '1px solid var(--border)', padding: '20px 22px' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>Shipment not found</div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.55 }}>
            No on-chain record for this reference on the configured oracle application.
          </p>
          {showAppId ? (
            <a
              href={LORA_APP(Number(resolvedAppId))}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 14, fontWeight: 600, color: 'var(--accent)', fontSize: '0.88rem' }}
            >
              Open contract on Lora ↗
            </a>
          ) : null}
        </div>
      )}

      {q.data && !isVerifyNotFound(q.data) && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ border: `1px solid ${badge.border}`, background: 'var(--bg-card)' }}>
            <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{cardTitle}</div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 4 }}>{String(q.data.shipment_id)}</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                {stageUserLabel(st)}
              </span>
            </div>
            {q.data.origin != null && (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Route:</strong> {String(q.data.origin)} → {String(q.data.destination)}
              </p>
            )}
            {confidence != null && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 4 }}>Settlement Confidence</div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-raised)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, confidence)}%`,
                      height: '100%',
                      borderRadius: 4,
                      background: confidence > 65 ? 'var(--success)' : confidence > 40 ? 'var(--warning)' : 'var(--danger)',
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{settlementConfidenceLabel(confidence)}</div>
              </div>
            )}
            {fundsMicro != null && fundsMicro > 0 ? (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem' }}>
                <strong>Escrow locked:</strong> {formatEscrowTriple(fundsAlgo, fundsInr, fundsUsd)}
              </p>
            ) : st === 'Settled' ? (
              <p style={{ margin: '12px 0 0', fontSize: '0.9rem', color: 'var(--success)' }}>Funds released on settlement</p>
            ) : null}

            {(panel?.reasoning || verdictRaw) && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Settlement review
                </div>
                {verdictRaw ? (
                  <p style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 700 }}>
                    {verdictUserLabel(String(verdictRaw))}
                  </p>
                ) : null}
                {panel?.reasoning ? (
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.55 }}>{panel.reasoning}</p>
                ) : null}
                {loraTxUrl ? (
                  <a
                    href={loraTxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent)', marginTop: 10 }}
                  >
                    Verify on Lora ↗ <ExternalLink size={16} />
                  </a>
                ) : null}
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="primary-btn"
                style={{ fontSize: '0.8rem' }}
                disabled={hashMut.isPending}
                onClick={() => hashMut.mutate()}
              >
                {hashMut.isPending ? 'Checking…' : 'Recompute Hash'}
              </button>
              <button type="button" onClick={downloadPdf} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>
                <Download size={14} /> Download Audit Report (PDF)
              </button>
            </div>
            {hashMut.data && (
              <p style={{ marginTop: 10, fontSize: '0.85rem', color: hashMut.data.match || hashMut.data.verified ? 'var(--success)' : 'var(--danger)' }}>
                {hashMut.data.match || hashMut.data.verified
                  ? '✅ Hash matches on-chain proof'
                  : '❌ Hash mismatch — contact oracle operator'}
              </p>
            )}

            {showAppId ? (
              <a
                href={LORA_APP(Number(resolvedAppId))}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 12, fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}
              >
                Open contract on Lora ↗
              </a>
            ) : null}

            <WitnessButton
              shipmentId={submitted}
              shipmentStatus={st}
              appId={typeof resolvedAppId === 'number' && resolvedAppId > 0 ? resolvedAppId : FALLBACK_APP_ID || null}
              hasVerdict={hasVerdict}
              walletAddress={null}
              onConnectRequest={() => {}}
            />
          </div>

          {st === 'Settled' && certId != null && certId > 0 ? (
            <div className="card" style={{ border: '1px solid var(--success)', background: 'rgba(34,197,94,0.08)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--success)' }}>Settlement certificate</div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>This is your permanent settlement proof</p>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                {certUrl ? <CertificateQr url={certUrl} /> : null}
                <div>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Certificate #{certId}</p>
                  <a href={certUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', marginTop: 8, fontWeight: 600, color: 'var(--success)', gap: 6 }}>
                    View certificate on Lora ↗ <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <section className="card" style={{ border: '1px solid var(--border)' }}>
            <ShipmentVerifyDetail data={q.data} />
          </section>

          <section className="card" style={{ border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Community witnesses</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10 }}>
              {witnessesQ.data?.witness_count ?? 0} witness transaction(s) recorded for this shipment.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(witnessesQ.data?.witnesses || []).slice(0, 12).map((w, i) => (
                <li key={w.tx_id || i} style={{ fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>
                  {w.address ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}` : '—'}{' '}
                  {w.lora_url ? (
                    <a href={w.lora_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', marginLeft: 8 }}>
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
