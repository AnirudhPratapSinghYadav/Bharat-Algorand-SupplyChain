import { ExternalLink } from 'lucide-react';
import { LORA_TX } from '../constants/api';

type Props = {
  txId?: string | null;
  href?: string | null;
  label?: string;
  className?: string;
};

export function LoraLink({ txId, href, label, className }: Props) {
  const url = (href || '').trim() || (txId ? `${LORA_TX}/${txId}` : '');
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className || 'lora-link'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}
    >
      {label || 'View on Lora'}
      <ExternalLink size={14} />
    </a>
  );
}
