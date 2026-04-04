import { ExternalLink, ShieldAlert } from 'lucide-react';

type Signal = { signal?: string; score?: number; message?: string };

export type FraudReport = {
  fraud_probability?: number;
  blocked?: boolean;
  verdict?: string;
  triggered_signals?: Signal[];
  message?: string;
};

type Props = {
  report: FraudReport | null;
  blockTxUrl?: string | null;
};

export function FraudAlert({ report, blockTxUrl }: Props) {
  if (!report || (report.fraud_probability ?? 0) < 30) return null;
  const blocked = Boolean(report.blocked);
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: blocked ? 'rgba(220,38,38,0.12)' : 'rgba(234,179,8,0.12)',
        border: `1px solid ${blocked ? 'rgba(220,38,38,0.45)' : 'rgba(202,138,4,0.45)'}`,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: blocked ? '#991b1b' : '#854d0e' }}>
        <ShieldAlert size={20} />
        {blocked ? 'PHANTOM SHIPMENT DETECTED' : 'Fraud signals (warning)'}
      </div>
      <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#451a03' }}>
        Probability: <strong>{report.fraud_probability}%</strong> — {report.message}
      </div>
      {blocked ? <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 600 }}>This shipment has been blocked.</div> : null}
      {report.triggered_signals && report.triggered_signals.length > 0 ? (
        <ul style={{ marginTop: 10, fontSize: '0.75rem', color: '#422006', paddingLeft: 18 }}>
          {report.triggered_signals.map((s, i) => (
            <li key={i}>
              <strong>{s.signal}</strong> (+{s.score}) — {s.message}
            </li>
          ))}
        </ul>
      ) : null}
      {blockTxUrl ? (
        <a href={blockTxUrl} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
          <ExternalLink size={12} /> Lora · fraud block record
        </a>
      ) : null}
    </div>
  );
}
