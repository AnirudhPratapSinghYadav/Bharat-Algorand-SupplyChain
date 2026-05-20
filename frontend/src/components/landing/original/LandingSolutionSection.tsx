type Props = { onConnectWallet: () => void };

const steps = [
  {
    num: '01',
    title: 'The contract locks payment',
    body: "When a trade contract is created on pramanik, the buyer deposits payment into a smart contract on Algorand. The money is real. It exists. It's just locked until the conditions are verified — no one can touch it, not even us.",
  },
  {
    num: '02',
    title: 'Shipment begins. Data flows.',
    body: "As the goods move, pramanik silently reads live data: India's ICEGATE customs system for shipping bills, Stormglass for weather, MarineTraffic for vessel AIS position. Not our data. Government data. Satellite data. Verified sources.",
  },
  {
    num: '03',
    title: 'A dispute arises. We read, not judge.',
    body: "If there's a delay or discrepancy, pramanik's system reads the same documents any customs inspector would — but in seconds, not months. It cross-checks the shipping bill, the route, the weather at sea on that exact date.",
  },
  {
    num: '04',
    title: 'The verdict is written in stone',
    body: 'A decision is reached: Settle (release to exporter) or Hold (return to buyer). The reasoning — every data point, every source — is hashed and written permanently to the Algorand blockchain. It cannot be changed. Anyone can verify it.',
  },
  {
    num: '05',
    title: 'Payment moves. Instantly.',
    body: 'The smart contract executes atomically. Payment transfers from escrow to the exporter\'s wallet. An NFT certificate is minted as permanent proof of settlement. No court. No phone calls. No waiting.',
  },
];

export function LandingSolutionSection({ onConnectWallet }: Props) {
  return (
    <section id="how" className="section" style={{ backgroundColor: '#FAF8F4', borderBottom: '1px solid #E8E0D5' }}>
      <div className="container">
        <div className="two-col" style={{ marginBottom: '80px', alignItems: 'end' }}>
          <div>
            <p className="tag">The approach</p>
            <div className="divider" />
            <h2 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 800, color: '#111', marginBottom: 0 }}>
              Not arbitration.
              <br />
              <em style={{ color: '#C17435' }}>Verification.</em>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: '17px', color: '#555', lineHeight: 1.8 }}>
              We don&apos;t decide who is right. We read what actually happened — from government databases, satellite
              records, weather archives — and we let the facts decide. pramanik is a truth machine, not a judge.
            </p>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="step-line" aria-hidden />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((step, i) => (
              <div key={step.num} style={{ paddingBottom: '60px' }}>
                <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      minWidth: '56px',
                      height: '56px',
                      backgroundColor: i === steps.length - 1 ? '#C17435' : '#111',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      zIndex: 1,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#FAF8F4',
                      }}
                    >
                      {step.num}
                    </span>
                  </div>
                  <div style={{ paddingTop: '12px' }}>
                    <h3
                      style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: 'clamp(20px, 2.5vw, 26px)',
                        fontWeight: 700,
                        color: '#111',
                        marginBottom: '14px',
                      }}
                    >
                      {step.title}
                    </h3>
                    <p style={{ fontSize: '16px', color: '#555', lineHeight: 1.8, maxWidth: '640px' }}>{step.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="two-col" style={{ marginTop: '20px', paddingTop: '80px', borderTop: '1px solid #E8E0D5' }}>
          <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 48px rgba(0,0,0,0.1)' }}>
            <img
              src="/images/trust.png"
              alt="Two Indian business owners reviewing trade documents together"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div>
            <p className="tag">The result</p>
            <div className="divider" />
            <h3
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(26px, 3vw, 38px)',
                fontWeight: 700,
                color: '#111',
                marginBottom: '20px',
              }}
            >
              Trade with confidence.
              <br />
              Get paid on time.
            </h3>
            <p style={{ fontSize: '16px', color: '#555', lineHeight: 1.8, marginBottom: '32px' }}>
              pramanik gives small exporters the same protection that large corporations have always had — but without
              the legal teams, the costs, or the waiting. Just ship, verify, get paid.
            </p>
            <button
              type="button"
              onClick={onConnectWallet}
              style={{
                display: 'inline-block',
                backgroundColor: '#111',
                color: '#FAF8F4',
                fontSize: '15px',
                fontWeight: 600,
                padding: '14px 32px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try the live demo →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
