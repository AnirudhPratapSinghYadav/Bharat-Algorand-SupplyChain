import { LoraLink } from './LoraLink';
import { LORA_APP, FALLBACK_APP_ID } from '../constants/api';
import { formatEscrowTriple } from '../lib/displayLabels';

type TimelineEvent = {
  tx_id?: string;
  lora_tx_url?: string;
  type?: string;
  round?: number;
  timestamp?: string;
};

const TIMELINE_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  ACTIVATED: 'Activated',
  FUNDED: 'Escrow funded',
  VERDICT: 'Verdict recorded',
  SETTLED: 'Settlement complete',
  VOIDED: 'Voided',
};

export function ShipmentVerifyDetail({ data }: { data: Record<string, unknown> }) {
  const appId = typeof data.app_id === 'number' ? data.app_id : FALLBACK_APP_ID;
  const timeline = (data.timeline || []) as TimelineEvent[];
  const chain = (data.chain || {}) as Record<string, unknown>;
  const micro = Number(chain.funds_microalgo ?? data.funds_locked_microalgo ?? 0);
  const algo = micro / 1e6;
  const inr = typeof data.funds_inr === 'number' ? data.funds_inr : null;
  const usd = typeof data.funds_usd === 'number' ? data.funds_usd : null;

  const orderedTypes = ['REGISTERED', 'ACTIVATED', 'FUNDED', 'VERDICT', 'SETTLED', 'VOIDED'];
  const byType = new Map<string, TimelineEvent>();
  for (const ev of timeline) {
    const t = String(ev.type || '').toUpperCase();
    if (t && !byType.has(t)) byType.set(t, ev);
  }

  return (
    <div className="verify-detail">
      <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>Audit timeline</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 12 }}>
        Status: <strong style={{ color: 'var(--text)' }}>{String(chain.status || data.on_chain_status || '—')}</strong>
        {micro > 0 ? (
          <>
            {' '}
            · Escrow: <strong>{formatEscrowTriple(algo, inr, usd)}</strong>
          </>
        ) : null}
      </p>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: '2px solid var(--border)' }}>
        {orderedTypes.map((step) => {
          const ev = byType.get(step);
          const done = !!ev?.tx_id;
          return (
            <li
              key={step}
              style={{
                marginLeft: 12,
                padding: '0 0 14px 16px',
                position: 'relative',
                opacity: done ? 1 : 0.45,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: -7,
                  top: 4,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: done ? 'var(--success)' : 'var(--border)',
                  border: '2px solid var(--bg-card)',
                }}
              />
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{TIMELINE_LABELS[step] || step}</div>
              {ev?.tx_id ? (
                <div style={{ marginTop: 4 }}>
                  <LoraLink txId={ev.tx_id} href={ev.lora_tx_url} />
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Pending</div>
              )}
            </li>
          );
        })}
      </ol>

      {timeline.length > 0 && (
        <details style={{ marginTop: 16, fontSize: '0.82rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>All indexed events ({timeline.length})</summary>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
            {timeline.map((ev) => (
              <li key={ev.tx_id} style={{ marginBottom: 8 }}>
                <strong>{ev.type || 'tx'}</strong>
                {ev.round != null ? ` · round ${ev.round}` : ''}
                <div>
                  <LoraLink txId={ev.tx_id} href={ev.lora_tx_url} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <a
        href={LORA_APP(appId)}
        target="_blank"
        rel="noopener noreferrer"
        className="lora-link"
        style={{ display: 'inline-block', marginTop: 16 }}
      >
        Open application on Lora
      </a>

      {data.certificate_asa_id != null && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: '0.95rem' }}>Certificate</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Permanent settlement proof · ASA {String(data.certificate_asa_id)}</p>
          {typeof data.lora_cert_url === 'string' && (
            <a href={data.lora_cert_url} target="_blank" rel="noopener noreferrer" className="lora-link">
              View on Lora
            </a>
          )}
        </div>
      )}
    </div>
  );
}
