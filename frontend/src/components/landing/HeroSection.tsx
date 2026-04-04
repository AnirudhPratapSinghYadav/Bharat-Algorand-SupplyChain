import { LANDING_IMAGES } from './landingAssets';

export function HeroSection() {
  return (
    <section className="nt-hero" aria-labelledby="nt-hero-title">
      <div className="nt-hero-copy">
        <span className="nt-hero-eyebrow">Algorand · supply chain integrity</span>
        <h1 id="nt-hero-title">
          <span className="nt-hero-highlight">Trust Every Shipment</span>
          <span className="nt-hero-title-rest">. Prove Every Transaction.</span>
        </h1>
        <p className="nt-hero-sub">
          AI + blockchain powered supply chain verification on Algorand.
        </p>
      </div>
      <div className="nt-hero-visual">
        <img
          src={LANDING_IMAGES.hero}
          alt="Container port and cargo operations at night with harbor lighting"
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
