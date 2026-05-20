import { Link } from 'react-router-dom';
import { Lock, Cloud, FileSearch, Gavel, CheckCircle, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ShipmentLike = {
  stage?: string;
  funds_locked_microalgo?: number;
  last_jury?: { verdict?: string } | null;
};

type StatsLike = {
  escrow_total_algo?: number;
  total_settled?: number;
};

type StepStatus = 'done' | 'active' | 'pending';

const STEPS: { id: string; title: string; hint: string; icon: LucideIcon }[] = [
  {
    id: 'lock',
    title: 'Escrow locked',
    hint: 'Buyer funds are held in the smart contract until rules are met.',
    icon: Lock,
  },
  {
    id: 'signals',
    title: 'Shipment in transit',
    hint: 'Weather and route signals are collected for the corridor.',
    icon: Cloud,
  },
  {
    id: 'audit',
    title: 'Evidence checked',
    hint: 'Documents and telemetry are matched against the trade agreement.',
    icon: FileSearch,
  },
  {
    id: 'jury',
    title: 'AI jury verdict',
    hint: 'Four agents recommend release or hold with a proof hash on chain.',
    icon: Gavel,
  },
  {
    id: 'release',
    title: 'Payment released',
    hint: 'Settlement completes on Algorand with a certificate you can verify.',
    icon: CheckCircle,
  },
];

function deriveFlowIndex(shipments: ShipmentLike[], stats: StatsLike): { doneThrough: number; active: number } {
  if (!shipments.length) return { doneThrough: -1, active: 0 };

  const funded =
    shipments.some((s) => (s.funds_locked_microalgo ?? 0) > 0) || Number(stats.escrow_total_algo ?? 0) > 0;
  const inTransit = shipments.some((s) => s.stage === 'In_Transit');
  const hasJury = shipments.some((s) => !!s.last_jury);
  const settled = shipments.some((s) => s.stage === 'Settled');
  const disputed = shipments.some((s) => s.stage === 'Disputed' || s.stage === 'Delayed_Disaster');

  if (settled) return { doneThrough: 4, active: 4 };
  if (hasJury && disputed) return { doneThrough: 3, active: 3 };
  if (hasJury) return { doneThrough: 3, active: 4 };
  if (inTransit) return { doneThrough: 1, active: 2 };
  if (funded) return { doneThrough: 0, active: 1 };
  return { doneThrough: -1, active: 0 };
}

function statusFor(index: number, doneThrough: number, active: number): StepStatus {
  if (index <= doneThrough) return 'done';
  if (index === active) return 'active';
  return 'pending';
}

function liveCaption(
  stepId: string,
  shipments: ShipmentLike[],
  stats: StatsLike,
): string | null {
  const inTransit = shipments.filter((s) => s.stage === 'In_Transit').length;
  const disputed = shipments.filter((s) => s.stage === 'Disputed' || s.stage === 'Delayed_Disaster').length;
  const settled = shipments.filter((s) => s.stage === 'Settled').length;
  const escrow = Number(stats.escrow_total_algo ?? 0);

  switch (stepId) {
    case 'lock':
      if (escrow > 0) return `${escrow.toFixed(4)} ALGO locked across your corridors`;
      return shipments.some((s) => (s.funds_locked_microalgo ?? 0) > 0)
        ? 'Escrow funded on at least one corridor'
        : null;
    case 'signals':
      if (inTransit > 0) return `${inTransit} corridor${inTransit === 1 ? '' : 's'} in transit — weather signals monitored`;
      if (disputed > 0) return `${disputed} delayed by weather or dispute — see trade rules`;
      return null;
    case 'jury':
      if (disputed > 0) return `${disputed} hold${disputed === 1 ? '' : 's'} — escrow frozen until resolved`;
      return shipments.some((s) => !!s.last_jury) ? 'Jury verdict recorded on chain' : null;
    case 'release':
      if (settled > 0) return `${settled} delivery${settled === 1 ? '' : 'ies'} settled`;
      return null;
    default:
      return null;
  }
}

type Props = {
  shipments: ShipmentLike[];
  stats: StatsLike;
  loading?: boolean;
  refreshing?: boolean;
};

export function SettlementFlowProgress({ shipments, stats, loading, refreshing }: Props) {
  const { doneThrough, active } = deriveFlowIndex(shipments, stats);
  const progressPct = Math.round(((doneThrough + 1) / STEPS.length) * 100);
  const hasPrior = shipments.length > 0 || Number(stats.escrow_total_algo ?? 0) > 0;

  if (loading && !hasPrior) {
    return (
      <section className="flow-progress flow-progress--skeleton" aria-label="Settlement progress loading">
        <div className="skeleton skeleton-text" style={{ width: '35%', height: 12 }} />
        <div className="skeleton skeleton-text-lg" style={{ width: '55%', marginTop: 12 }} />
        <div className="skeleton" style={{ height: 4, marginTop: 16, borderRadius: 999 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 48, marginTop: 12, borderRadius: 10 }} />
        ))}
      </section>
    );
  }

  return (
    <section
      className={`flow-progress${refreshing ? ' flow-progress--refreshing' : ''}`}
      aria-label="Settlement progress"
      aria-busy={refreshing}
    >
      <div className="flow-progress__head">
        <p className="flow-progress__tag">Your supply chain journey</p>
        <div className="flow-progress__title-row">
          <h3 className="flow-progress__title">Where your export stands</h3>
          {refreshing ? (
            <span className="flow-progress__badge">
              <Loader2 size={12} className="flow-progress__spin" aria-hidden /> Updating
            </span>
          ) : null}
        </div>
        {shipments.length > 0 ? (
          <p className="flow-progress__meta">
            {shipments.length} corridor{shipments.length === 1 ? '' : 's'} tracked
            {Number(stats.total_settled ?? 0) > 0 ? ` · ${stats.total_settled} settled` : ''}
          </p>
        ) : null}
      </div>

      <div className="flow-progress__bar" aria-hidden>
        <div
          className="flow-progress__bar-fill"
          style={{ width: `${Math.min(100, Math.max(8, progressPct))}%` }}
        />
      </div>

      <ol className={`flow-progress__steps${refreshing ? ' flow-progress__steps--dim' : ''}`}>
        {STEPS.map((step, i) => {
          const st = statusFor(i, doneThrough, active);
          const Icon = step.icon;
          const live = liveCaption(step.id, shipments, stats);
          const rulesLink = step.id === 'signals' && shipments.some((s) => s.stage === 'Delayed_Disaster');
          return (
            <li key={step.id} className={`flow-progress__step flow-progress__step--${st}`}>
              <div className="flow-progress__step-marker">
                <Icon size={16} strokeWidth={2} aria-hidden />
              </div>
              <div className="flow-progress__step-body">
                <span className="flow-progress__step-label">{step.title}</span>
                <p className="flow-progress__step-hint">{live ?? step.hint}</p>
                {rulesLink ? (
                  <a href="#trade-rules" className="flow-progress__rules-link">
                    Weather & dispute rules ↓
                  </a>
                ) : null}
                {st === 'active' ? <span className="flow-progress__step-pill">In progress</span> : null}
                {st === 'done' ? (
                  <span className="flow-progress__step-pill flow-progress__step-pill--done">Complete</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="flow-progress__footer">
        <Link to="/protocol">Full protocol</Link>
        <span aria-hidden> · </span>
        <a href="#trade-rules">Who pays when weather hits</a>
      </p>
    </section>
  );
}
