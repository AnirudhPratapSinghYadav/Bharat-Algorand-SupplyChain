import { Link } from 'react-router-dom';
import { Cloud, FileCheck, Gavel, Lock, Sparkles } from 'lucide-react';

const STEPS = [
  {
    icon: Lock,
    title: 'Escrow lock',
    body: 'Buyer deposits ALGO into the NaviTrust contract. Funds stay locked until verified conditions are met.',
  },
  {
    icon: Cloud,
    title: 'Live signals',
    body: 'Weather, customs, and route data are read from trusted sources while the shipment is in transit.',
  },
  {
    icon: FileCheck,
    title: 'Evidence audit',
    body: 'Documents and telemetry are cross-checked against the contract corridor — no manual arbitration queue.',
  },
  {
    icon: Gavel,
    title: 'AI jury verdict',
    body: 'Four specialist agents score risk and produce a settlement recommendation with a public jury hash.',
  },
  {
    icon: Sparkles,
    title: 'On-chain release',
    body: 'Settle or hold executes atomically. Verdict JSON and ARC-69 certificate are provable on Lora forever.',
  },
];

export function EnterpriseSettlementFlow() {
  return (
    <section className="enterprise-flow" aria-labelledby="enterprise-flow-title">
      <div className="enterprise-flow__head">
        <p className="enterprise-flow__tag">Settlement pipeline</p>
        <h2 id="enterprise-flow-title" className="enterprise-flow__title">
          From locked escrow to auditable payout
        </h2>
        <p className="enterprise-flow__lead">
          One corridor, one contract, one verifiable trail — built for export finance teams who need proof, not promises.
        </p>
      </div>
      <ol className="enterprise-flow__track">
        {STEPS.map((step, i) => (
          <li key={step.title} className="enterprise-flow__step">
            <span className="enterprise-flow__num" aria-hidden>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="enterprise-flow__icon" aria-hidden>
              <step.icon size={18} strokeWidth={2} />
            </span>
            <div className="enterprise-flow__copy">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="enterprise-flow__foot">
        <Link to="/verify">Verify any shipment proof</Link>
        <span aria-hidden> · </span>
        <Link to="/activity">View live ledger activity</Link>
        <span aria-hidden> · </span>
        <Link to="/protocol">Protocol &amp; contract health</Link>
      </p>
    </section>
  );
}
