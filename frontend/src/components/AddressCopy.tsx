import { useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { shortAddress } from '../lib/displayLabels';

export function AddressCopy({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const display = shortAddress(address);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>
      {label ? <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>{label}</span> : null}
      <span title={address}>{display}</span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy address"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: copied ? 'var(--success)' : 'var(--accent)',
        }}
      >
        <ClipboardCopy size={14} />
      </button>
      {copied ? <span style={{ fontSize: '0.68rem', color: 'var(--success)' }}>Copied</span> : null}
    </span>
  );
}
