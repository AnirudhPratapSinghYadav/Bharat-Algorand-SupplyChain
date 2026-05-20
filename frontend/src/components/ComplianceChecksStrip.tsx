import { FileCheck, Shield, CloudRain } from 'lucide-react';

type AuditorSlice = {
  compliance_passed?: boolean;
  gst_eway_bill?: string;
  gst_status?: string;
  gst_valid?: boolean;
  chain_status?: string;
  issues?: string[];
};

type SentinelSlice = {
  weather_flag?: boolean;
  conditions_summary?: string;
};

type Props = {
  shipmentId: string;
  auditor?: AuditorSlice | null;
  sentinel?: SentinelSlice | null;
};

export function ComplianceChecksStrip({ shipmentId, auditor, sentinel }: Props) {
  if (!auditor && !sentinel) {
    return (
      <div className="compliance-strip compliance-strip--pending">
        <Shield size={14} aria-hidden />
        <span>
          <strong>Compliance &amp; GST e-way</strong> — run <em>Settlement review</em> on this corridor to see
          weather, chain, and e-way bill checks.
        </span>
      </div>
    );
  }

  const ewb = auditor?.gst_eway_bill;
  const gstOk = auditor?.gst_valid === true;
  const chainOk = auditor?.compliance_passed === true;
  const weatherRisk = sentinel?.weather_flag === true;

  return (
    <div className="compliance-strip">
      <div className="compliance-strip__title">
        <FileCheck size={14} aria-hidden />
        Checks for this corridor
      </div>
      <ul className="compliance-strip__list">
        <li className={weatherRisk ? 'compliance-strip__item--warn' : 'compliance-strip__item--ok'}>
          <CloudRain size={13} aria-hidden />
          Weather: {weatherRisk ? 'Risk flagged' : 'Within range'}
          {sentinel?.conditions_summary ? ` — ${sentinel.conditions_summary}` : ''}
        </li>
        <li className={chainOk ? 'compliance-strip__item--ok' : 'compliance-strip__item--warn'}>
          <Shield size={13} aria-hidden />
          On-chain status: {auditor?.chain_status || '—'}
          {chainOk ? ' · aligned' : ' · review issues'}
        </li>
        {ewb ? (
          <li className={gstOk ? 'compliance-strip__item--ok' : 'compliance-strip__item--warn'}>
            <FileCheck size={13} aria-hidden />
            GST E-Way Bill <code className="compliance-strip__code">{ewb}</code> — {auditor?.gst_status || (gstOk ? 'VALID' : 'CHECK')}
          </li>
        ) : (
          <li className="compliance-strip__item--muted">
            GST e-way: recorded when jury runs (ref {shipmentId.slice(0, 12)}…)
          </li>
        )}
      </ul>
      {Array.isArray(auditor?.issues) && auditor!.issues!.length > 0 ? (
        <p className="compliance-strip__issues">
          Notes: {auditor!.issues!.slice(0, 3).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
