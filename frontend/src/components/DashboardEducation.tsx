import { Link } from 'react-router-dom';
import { Cloud, ShieldCheck, ScanSearch, Gavel, Lock, Cpu, FileCheck } from 'lucide-react';

import { AGENT_DISPLAY, JURY_BUTTON_LABEL } from '../lib/displayLabels';
import { PRAMANIK_BOT_NAME } from '../constants/branding';

const AGENTS = [
  { key: 'sentinel', title: AGENT_DISPLAY.sentinel.label, icon: Cloud, hint: 'Live weather on the route' },
  { key: 'auditor', title: AGENT_DISPLAY.auditor.label, icon: ShieldCheck, hint: 'Reads escrow on-chain' },
  { key: 'fraud', title: AGENT_DISPLAY.fraud.label, icon: ScanSearch, hint: 'Supplier history check' },
  { key: 'arbiter', title: AGENT_DISPLAY.arbiter.label, icon: Gavel, hint: 'Final settlement outcome' },
] as const;

const FLOW = [
  { step: 1, title: 'Register shipment', detail: 'Oracle registers your corridor on-chain.', icon: FileCheck },
  { step: 2, title: 'Lock escrow', detail: 'Buyer funds ALGO from Pera — held until review completes.', icon: Lock },
  { step: 3, title: JURY_BUTTON_LABEL, detail: 'Four checks run in sequence; verdict is recorded with a proof link.', icon: Cpu },
  { step: 4, title: 'Verify & settle', detail: 'Public verify page + release payment when approved.', icon: ShieldCheck },
] as const;

export function JuryPipelineSection() {
  return (
    <section className="jury-pipeline-warm" aria-labelledby="jury-pipeline-heading">
      <h2 id="jury-pipeline-heading" className="jury-pipeline-warm__title">
        How settlement review works
      </h2>
      <p className="jury-pipeline-warm__lead">
        When you request a review, four specialists run in order — then the outcome is written to Algorand with a
        link you can show to your buyer or bank.
      </p>

      <div className="jury-steps-row">
        {AGENTS.map((a, i) => {
          const Icon = a.icon;
          return (
            <div key={a.key} style={{ display: 'contents' }}>
              <div className="jury-step-warm">
                <div className="jury-step-warm__icon">
                  <Icon size={22} strokeWidth={2} />
                </div>
                <p className="jury-step-warm__label">{a.title}</p>
                <p className="jury-step-warm__hint">{a.hint}</p>
              </div>
              {i < AGENTS.length - 1 ? <div className="jury-connector" aria-hidden /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TrustFlowSection() {
  return (
    <section className="trust-flow-warm" aria-labelledby="trust-flow-heading">
      <h2 id="trust-flow-heading" className="jury-pipeline-warm__title" style={{ fontSize: '1rem' }}>
        Your escrow journey
      </h2>
      <p className="jury-pipeline-warm__lead" style={{ marginBottom: 12 }}>
        Pramanik ties logistics, escrow, and proofs together — start to finish.
      </p>
      <ol>
        {FLOW.map((f) => {
          const Icon = f.icon;
          return (
            <li key={f.step}>
              <span className="trust-flow-warm__num">{f.step}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Icon size={16} color="var(--accent)" />
                  <strong style={{ fontSize: '0.9rem', color: '#111' }}>{f.title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5 }}>{f.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '0.82rem', fontWeight: 600 }}>
        <Link to="/verify" style={{ color: 'var(--accent)' }}>
          Public verify →
        </Link>
        <Link to="/protocol" style={{ color: 'var(--accent)' }}>
          Protocol →
        </Link>
        <Link to="/pramanik-bot" style={{ color: 'var(--accent)' }}>
          {PRAMANIK_BOT_NAME} →
        </Link>
      </div>
    </section>
  );
}
