import { LANDING_IMAGES } from './landingAssets';

const BULLETS = [
  'Blockchain-backed shipment tracking',
  'AI-powered dispute resolution',
  'Automatic escrow settlement',
  'Immutable verification records',
  'Per-shipment audit trail you can point to in coverage and arbitration',
  'Weather, telemetry, and on-chain state in one jury-ready record',
];

export function SolutionSection() {
  return (
    <section className="nt-section" aria-labelledby="nt-solution-title">
      <h2 id="nt-solution-title" className="nt-section-title">
        Navi-Trust fixes this
      </h2>
      <p className="nt-section-lead">
        One protocol for evidence, verdicts, and settlement, anchored on Algorand.
      </p>
      <div className="nt-split">
        <div>
          <ul className="nt-bullet-list">
            {BULLETS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="nt-solution-hero-img">
          <img
            src={LANDING_IMAGES.solution}
            alt="Large-scale container terminal with organized port operations"
            width={1200}
            height={900}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </section>
  );
}
