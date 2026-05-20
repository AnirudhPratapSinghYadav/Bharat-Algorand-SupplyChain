import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Lock, X } from 'lucide-react';

type ShipmentStage = {
  stage?: string;
  funds_locked_microalgo?: number;
  last_jury?: { verdict?: string } | null;
};

type Props = {
  shipmentId: string;
  plannedAlgo: number;
  loraUrl?: string | null;
  shipment?: ShipmentStage | null;
  onDismiss: () => void;
  onScrollToShipment: () => void;
};

type StepState = 'done' | 'current' | 'pending';

function deriveSteps(ship: ShipmentStage | null | undefined): { id: string; label: string; hint: string; state: StepState }[] {
  const stage = (ship?.stage || 'Not_Registered').toString();
  const funded = (ship?.funds_locked_microalgo ?? 0) > 0;
  const hasJury = !!ship?.last_jury;
  const settled = stage === 'Settled';

  const activeIdx = settled ? 4 : hasJury ? 3 : funded ? 1 : stage === 'In_Transit' || stage === 'Not_Registered' ? 0 : 2;

  const defs = [
    { id: 'reg', label: 'Registered', hint: 'Corridor recorded on Algorand' },
    { id: 'fund', label: 'Activate / fund escrow', hint: 'Deposit ALGO in Pera Wallet on the corridor card' },
    { id: 'jury', label: 'AI jury run', hint: 'Weather, compliance, and fraud agents review evidence' },
    { id: 'verdict', label: 'Verdict', hint: 'SETTLE, HOLD, or DISPUTE with on-chain proof hash' },
    { id: 'settle', label: 'Settled', hint: 'Escrow released + settlement certificate NFT' },
  ];

  return defs.map((d, i) => {
    let state: StepState = 'pending';
    if (i < activeIdx) state = 'done';
    else if (i === activeIdx) state = 'current';
    return { ...d, state };
  });
}

export function PostRegisterGuide({
  shipmentId,
  plannedAlgo,
  loraUrl,
  shipment,
  onDismiss,
  onScrollToShipment,
}: Props) {
  const steps = deriveSteps(shipment);

  return (
    <div className="post-register card" role="status">
      <button type="button" className="post-register__close" onClick={onDismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
      <p className="post-register__tag">✓ Shipment registered on Algorand</p>
      <h3 className="post-register__title">{shipmentId}</h3>
      {loraUrl ? (
        <a href={loraUrl} target="_blank" rel="noopener noreferrer" className="post-register__tx-link">
          View registration on Lora ↗
        </a>
      ) : null}

      <div className="post-register__flow">
        <p className="post-register__flow-title">What happens next</p>
        <ol className="post-register__steps">
          {steps.map((s) => (
            <li key={s.id} className={`post-register__step post-register__step--${s.state}`}>
              <span className="post-register__step-icon" aria-hidden>
                {s.state === 'done' ? <CheckCircle2 size={16} /> : s.state === 'current' ? '●' : <Circle size={14} />}
              </span>
              <div>
                <strong>{s.label}</strong>
                <p>{s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="post-register__copy">
        Planned escrow: <strong>{plannedAlgo.toFixed(2)} ALGO</strong> — approve deposit in Pera on the corridor card.
      </p>
      <div className="post-register__actions">
        <button type="button" className="primary-btn" onClick={onScrollToShipment}>
          <Lock size={14} /> Go to corridor &amp; deposit <ArrowRight size={14} />
        </button>
        <Link to="/activity" className="post-register__history">
          View transaction history
        </Link>
        <a href="#trade-rules" className="post-register__history">
          Weather &amp; dispute rules
        </a>
      </div>
    </div>
  );
}
