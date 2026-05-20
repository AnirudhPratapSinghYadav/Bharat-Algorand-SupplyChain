import { Info } from 'lucide-react';

const TOOLTIP =
  'Digital currency for escrow on Algorand. Amounts also show in ₹ using live market rates (≈ ₹15 per ALGO varies).';

export function AlgoEscrowHint({ size = 14 }: { size?: number }) {
  return (
    <span
      title={TOOLTIP}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', color: 'var(--muted)', marginLeft: 4 }}
      aria-label="About ALGO escrow"
    >
      <Info size={size} />
    </span>
  );
}
