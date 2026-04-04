import { useState } from 'react';
import axios from 'axios';
import { Play, Skull, ExternalLink } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';
import { FraudAlert, type FraudReport } from './FraudAlert';

type JourneyRow = {
  timestamp?: string;
  temperature_c?: number;
  lora_url?: string;
  tx_id?: string;
};

export function DemoStory() {
  const [insulinBusy, setInsulinBusy] = useState(false);
  const [insulin, setInsulin] = useState<{ journey?: JourneyRow[]; anomaly_check?: { anomaly?: boolean; value?: number } } | null>(null);
  const [ghostBusy, setGhostBusy] = useState(false);
  const [ghost, setGhost] = useState<{ fraud_report?: Record<string, unknown>; block_chain?: { lora_url?: string }; headline?: string } | null>(null);

  const runInsulin = async () => {
    setInsulinBusy(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/demo/insulin-journey`, { timeout: 120000 });
      setInsulin(r.data);
    } catch {
      setInsulin(null);
    } finally {
      setInsulinBusy(false);
    }
  };

  const runGhost = async () => {
    setGhostBusy(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/demo/ghost-shipment-attempt`, { timeout: API_TIMEOUT });
      setGhost(r.data);
    } catch {
      setGhost(null);
    } finally {
      setGhostBusy(false);
    }
  };

  const journey = insulin?.journey ?? [];
  const breachIdx = journey.findIndex((j) => Number(j.temperature_c) >= 10);

  return (
    <section className="nt-section" style={{ marginTop: 24 }} aria-labelledby="nt-demo-title">
      <h2 id="nt-demo-title" className="nt-section-title">
        See it in action
      </h2>
      <p className="nt-section-lead" style={{ maxWidth: 640, marginBottom: 20 }}>
        Live Testnet demos: insulin cold-chain witness with anomaly, and a ghost shipment blocked by fraud rules.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="nt-card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>The Insulin Journey</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
            Simulated 72h route with readings anchored on Algorand. Checkpoint 7 injects a temperature breach.
          </p>
          <button type="button" className="nt-btn nt-btn--primary" disabled={insulinBusy} onClick={() => void runInsulin()}>
            <Play size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {insulinBusy ? 'Running on-chain…' : 'Start journey'}
          </button>
          {insulin?.anomaly_check?.anomaly ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 10,
                background: 'rgba(220,38,38,0.12)',
                border: '1px solid rgba(220,38,38,0.35)',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#991b1b',
              }}
            >
              Temperature breach detected at {insulin.anomaly_check.value}°C — buyer protected; proof on-chain.
            </div>
          ) : null}
          {journey.length > 0 ? (
            <ol style={{ marginTop: 14, paddingLeft: 18, fontSize: '0.78rem', color: '#334155' }}>
              {journey.map((j, i) => (
                <li key={i} style={{ marginBottom: 8, color: breachIdx === i ? '#b91c1c' : undefined }}>
                  #{i + 1} · {j.temperature_c}°C
                  {j.lora_url ? (
                    <a href={j.lora_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>
                      <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 10 }}>Final: settlement can be reversed when policy + contract rules apply — evidence lives on Lora.</p>
        </div>
        <div className="nt-card" style={{ padding: 18 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Ghost Shipment</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
            Synthetic Mumbai→Dubai fraud profile: new wallet, huge escrow, impossible transit — blocked before funds move.
          </p>
          <button type="button" className="nt-btn" disabled={ghostBusy} onClick={() => void runGhost()} style={{ border: '1px solid #fecaca', color: '#b91c1c' }}>
            <Skull size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {ghostBusy ? 'Scanning…' : 'Run ghost demo'}
          </button>
          {ghost?.headline ? <p style={{ marginTop: 12, fontSize: '0.85rem', fontWeight: 700, color: '#991b1b' }}>{ghost.headline}</p> : null}
          <FraudAlert report={(ghost?.fraud_report as FraudReport) ?? null} blockTxUrl={ghost?.block_chain?.lora_url ?? null} />
        </div>
      </div>
    </section>
  );
}
