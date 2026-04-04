import { Card } from './Card';
import { LANDING_IMAGES } from './landingAssets';

const ITEMS = [
  {
    title: 'Damaged cargo',
    text: 'Handling and transit claims fail when condition is not documented at each handoff.',
    img: LANDING_IMAGES.problem.damaged,
    alt: 'Cardboard shipping boxes in a logistics facility',
  },
  {
    title: 'Port congestion & delay',
    text: 'Stacks and berth queues stretch timelines—stakeholders need a single clock everyone trusts.',
    img: LANDING_IMAGES.problem.congestion,
    alt: 'Dense stacks of shipping containers at a container terminal',
  },
  {
    title: 'Inspection & customs',
    text: 'Releases depend on checks and paperwork that rarely meet one immutable audit trail.',
    img: LANDING_IMAGES.problem.customs,
    alt: 'Refrigerated truck at a loading dock for inspection and handoff',
  },
  {
    title: 'Lost goods & warehouse confusion',
    text: 'Mis-picks and slot errors multiply when inventory events are not tied to on-chain milestones.',
    img: LANDING_IMAGES.problem.warehouse,
    alt: 'Warehouse aisles with high racks and pallet storage',
  },
];

export function ProblemSection() {
  return (
    <section className="nt-section" aria-labelledby="nt-problem-title">
      <h2 id="nt-problem-title" className="nt-section-title">
        Global trade runs on trust — but trust is broken
      </h2>
      <p className="nt-section-lead">
        Navi-Trust exists so milestones, risk, and release conditions meet an auditable record—not a thread of emails.
      </p>
      <div className="scroll-wrapper scroll-wrapper--problem">
        <div className="scroll-wrapper__strip nt-problem-scroll nt-problem-scroll--four">
          {ITEMS.map((item) => (
            <article key={item.title} className="nt-problem-card">
              <Card padding="lg" style={{ height: '100%' }}>
                <div className="nt-problem-media">
                  <img
                    src={item.img}
                    alt={item.alt}
                    width={1200}
                    height={800}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="nt-problem-body">
                  <h3 className="nt-problem-title">{item.title}</h3>
                  <p className="nt-problem-text">{item.text}</p>
                </div>
              </Card>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
