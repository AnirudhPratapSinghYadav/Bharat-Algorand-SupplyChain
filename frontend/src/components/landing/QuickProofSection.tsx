import { Link } from 'react-router-dom';

const DEMO_IDS = ['SHIP_MUMBAI_001', 'SHIP_CHEN_002', 'SHIP_DELHI_003'] as const;

export function QuickProofSection() {
  return (
    <section className="nt-section nt-quick-proof" aria-label="Try without wallet">
      <p className="nt-quick-proof-label">Try it without logging in</p>
      <div className="nt-quick-proof-pills">
        {DEMO_IDS.map((id) => (
          <Link key={id} to={`/verify/${id}`} className="nt-quick-proof-pill">
            {id}
          </Link>
        ))}
      </div>
      <p className="nt-quick-proof-hint">Each link opens the public verify page. No wallet required.</p>
    </section>
  );
}
