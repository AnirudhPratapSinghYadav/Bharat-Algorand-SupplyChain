import type { CSSProperties } from 'react';
import { LANDING_IMAGES } from './landingAssets';

type CTASectionProps = {
  onConnectWallet: () => void;
  onCreateShipment: () => void;
};

const ctaSectionStyle = {
  '--nt-cta-bg-url': `url("${LANDING_IMAGES.solution}")`,
} as CSSProperties;

export function CTASection({ onConnectWallet, onCreateShipment }: CTASectionProps) {
  return (
    <section className="nt-section nt-cta-section" id="nt-cta" aria-labelledby="nt-cta-title" style={ctaSectionStyle}>
      <div className="nt-cta-block">
        <h2 id="nt-cta-title">Lock escrow. Run the jury. Verify from your dashboard.</h2>
        <p className="nt-cta-lead">Connect a wallet to register shipments and fund escrow on testnet.</p>
        <div className="nt-cta-actions">
          <button type="button" className="nt-btn nt-btn--primary" onClick={onConnectWallet}>
            Connect wallet
          </button>
          <button type="button" className="nt-btn nt-btn--ghost" onClick={onCreateShipment}>
            Create shipment
          </button>
        </div>
      </div>
    </section>
  );
}
