import type { CSSProperties } from 'react';
import { formatEscrowUserFacing } from '../lib/displayLabels';

type Props = {
  algo: number;
  inr?: number | null;
  usd?: number | null;
  style?: CSSProperties;
};

export function EscrowDisplay({ algo, inr, usd, style }: Props) {
  const text = formatEscrowUserFacing(algo, inr, usd);
  return (
    <span style={style} title="Digital currency held in escrow until the oracle releases payment. Rates from live market data.">
      {text}
    </span>
  );
}
