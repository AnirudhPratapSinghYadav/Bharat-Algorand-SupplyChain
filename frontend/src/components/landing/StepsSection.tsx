import { Card } from './Card';
import { LANDING_IMAGES } from './landingAssets';

const STEPS = [
  {
    n: '01',
    title: 'Lock escrow',
    desc: 'Buyer sends ALGO to the smart contract — not to us. Funds stay locked until the rules pass.',
    img: LANDING_IMAGES.steps.contract,
    alt: 'Smart contract securing funds',
  },
  {
    n: '02',
    title: 'AI jury decides',
    desc: 'Agents read weather, telemetry, and on-chain state. The outcome is prepared for the oracle call.',
    img: LANDING_IMAGES.steps.ai,
    alt: 'Analytics and AI risk assessment',
  },
  {
    n: '03',
    title: 'Auto settlement',
    desc: 'Verdict on-chain, escrow released or held, and a unique certificate ASA when you settle.',
    img: LANDING_IMAGES.steps.delivery,
    alt: 'Delivery and settlement',
  },
];

export function StepsSection() {
  return (
    <section className="nt-section" aria-labelledby="nt-steps-title">
      <h2 id="nt-steps-title" className="nt-section-title">
        How it works
      </h2>
      <p className="nt-section-lead">
        Three steps: escrow, jury, settlement — all verifiable on Algorand.
      </p>
      <div className="scroll-wrapper scroll-wrapper--steps">
        <div className="scroll-wrapper__strip nt-steps-scroll">
          {STEPS.map((s) => (
            <article key={s.n} className="nt-step-card">
              <Card padding="none" className="nt-step-card-inner">
                <div className="nt-step-media">
                  <img src={s.img} alt={s.alt} width={1200} height={675} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                </div>
                <div className="nt-step-body">
                  <div className="nt-step-num">STEP {s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </Card>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
