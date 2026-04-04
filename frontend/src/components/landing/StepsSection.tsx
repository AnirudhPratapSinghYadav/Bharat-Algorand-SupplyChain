import { Card } from './Card';
import { LANDING_IMAGES } from './landingAssets';

const STEPS = [
  {
    n: '01',
    title: 'Register shipment',
    desc: 'Create an on-chain record tied to your lane and parties.',
    img: LANDING_IMAGES.steps.load,
    alt: 'Port crane loading shipping containers at a terminal',
  },
  {
    n: '02',
    title: 'Lock funds',
    desc: 'Escrow secures value until rules encoded in the contract pass.',
    img: LANDING_IMAGES.steps.contract,
    alt: 'Server room with network equipment representing smart contract infrastructure',
  },
  {
    n: '03',
    title: 'AI evaluates risk',
    desc: 'Agents assess telemetry and events against your policy.',
    img: LANDING_IMAGES.steps.ai,
    alt: 'Analytics dashboard with charts for operational risk monitoring',
  },
  {
    n: '04',
    title: 'Settlement + certificate',
    desc: 'Automatic release or hold—with an immutable audit trail.',
    img: LANDING_IMAGES.steps.delivery,
    alt: 'Freight truck at a logistics facility for final delivery and unloading',
  },
];

export function StepsSection() {
  return (
    <section className="nt-section" aria-labelledby="nt-steps-title">
      <h2 id="nt-steps-title" className="nt-section-title">
        How it works
      </h2>
      <p className="nt-section-lead">
        Four steps from registration to provable outcome.
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
