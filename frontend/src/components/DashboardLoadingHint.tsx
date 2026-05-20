import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const MESSAGES = [
  'Reading your corridors from Algorand…',
  'Syncing escrow balances and shipment stages…',
  'Almost ready — settlement flow updates live after each action.',
];

type Props = {
  className?: string;
};

export function DashboardLoadingHint({ className = '' }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 2800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={`dash-loading-hint card ${className}`.trim()} role="status" aria-live="polite">
      <Loader2 size={22} className="dash-loading-hint__spin" aria-hidden />
      <div>
        <p className="dash-loading-hint__title">Syncing your portfolio</p>
        <p className="dash-loading-hint__msg">{MESSAGES[idx]}</p>
      </div>
    </div>
  );
}
