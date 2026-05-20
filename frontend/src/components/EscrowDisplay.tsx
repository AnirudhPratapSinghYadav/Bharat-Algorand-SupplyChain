import type { CSSProperties } from 'react';
import { formatEscrowUserFacing } from '../lib/displayLabels';
import { AlgoEscrowHint } from './AlgoEscrowHint';

type Props = {
  algo: number;
  inr?: number | null;
  usd?: number | null;
  style?: CSSProperties;
};

export function EscrowDisplay({ algo, inr, usd, style }: Props) {
  const text = formatEscrowUserFacing(algo, inr, usd);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', ...style }}>
      <span>{text}</span>
      <AlgoEscrowHint />
    </span>
  );
}
