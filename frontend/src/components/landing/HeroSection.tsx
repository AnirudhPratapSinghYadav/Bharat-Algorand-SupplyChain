import { LANDING_IMAGES } from './landingAssets';

export function HeroSection() {
  return (
    <section className="nt-hero" aria-labelledby="nt-hero-title">
      <div className="nt-hero-copy">
        <span className="nt-hero-eyebrow">Automated trade escrow · Built for India</span>
        <h1 id="nt-hero-title">
          Payments that keep
          <br />
          <em style={{ fontStyle: 'italic', color: 'var(--nt-accent)' }}>their promise.</em>
        </h1>
        <p className="nt-hero-sub">
          Pramanik holds payment in escrow, reads shipping and weather signals, and releases funds with an
          on-chain verdict — without months of email dispute.
        </p>
        <p className="nt-hero-subline">
          Connect your wallet to register a corridor, lock ALGO, and request settlement review with a proof link
          on Lora.
        </p>
        <div className="nt-hero-actions">
          <a href="#agents" className="nt-btn nt-btn--primary">
            See how it works
          </a>
          <a href="#how-it-works" className="nt-btn nt-btn--ghost">
            Escrow flow
          </a>
        </div>
      </div>
      <div className="nt-hero-visual">
        <img
          src={LANDING_IMAGES.hero}
          alt="Export logistics and port operations"
          width={1200}
          height={900}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
    </section>
  );
}
