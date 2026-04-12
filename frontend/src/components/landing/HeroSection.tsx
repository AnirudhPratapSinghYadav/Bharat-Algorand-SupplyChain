import { LANDING_IMAGES } from './landingAssets';

export function HeroSection() {
  return (
    <section className="nt-hero" aria-labelledby="nt-hero-title">
      <div className="nt-hero-copy">
        <span className="nt-hero-eyebrow">Algorand · escrow · immutable verdicts</span>
        <h1 id="nt-hero-title">
          <span className="nt-hero-highlight">The AI Court for Supply Chain Disputes</span>
        </h1>
        <p className="nt-hero-sub">
          Buyer locks ALGO. The AI jury examines the evidence. The verdict is written to Algorand — forever.
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
