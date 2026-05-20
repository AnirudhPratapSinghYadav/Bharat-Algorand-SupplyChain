export function LandingProblemSection() {
  return (
    <section id="problem" className="section" style={{ backgroundColor: '#111', color: '#FAF8F4' }}>
      <div className="container">
        <div style={{ maxWidth: '760px', margin: '0 auto 80px', textAlign: 'center' }}>
          <p className="tag" style={{ color: '#C17435' }}>
            The story you know too well
          </p>
          <div className="divider" style={{ margin: '20px auto 32px' }} />
          <h2 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 800, color: '#FAF8F4', marginBottom: '24px' }}>
            A shipment leaves India.
            <br />
            <em style={{ color: '#C17435' }}>The money never comes back.</em>
          </h2>
          <p style={{ fontSize: '18px', color: '#E0E0E0', lineHeight: 1.8 }}>
            Every year, Indian exporters ship billions of rupees worth of goods to buyers abroad. And every year,
            thousands of those exporters wait — 60, 90, 180 days — for payments that arrive late, get disputed, or
            simply disappear behind a wall of legal excuses.
          </p>
        </div>

        <div className="two-col" style={{ marginBottom: '100px' }}>
          <div style={{ position: 'relative', aspectRatio: '3/2', borderRadius: '12px', overflow: 'hidden' }}>
            <img
              src="/images/port_golden.png"
              alt="Container ship leaving Indian port at golden hour"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div>
            <span
              style={{
                display: 'inline-block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#C17435',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '20px',
                borderBottom: '1px solid #C17435',
                paddingBottom: '4px',
              }}
            >
              Act 1 — The Contract
            </span>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: '#FAF8F4',
                marginBottom: '20px',
              }}
            >
              Everything is agreed. On paper.
            </h3>
            <p style={{ fontSize: '16px', color: '#E0E0E0', lineHeight: 1.8, marginBottom: '20px' }}>
              A garment factory in Tiruppur wins an order from a buyer in Rotterdam. The Proforma Invoice is signed.
              The LC is issued. The container is packed. The vessel sails.
            </p>
            <p style={{ fontSize: '16px', color: '#E0E0E0', lineHeight: 1.8 }}>
              The paperwork says: &ldquo;Payment due 30 days after delivery.&rdquo; It seems simple. It never is.
            </p>
          </div>
        </div>

        <div className="two-col reverse" style={{ marginBottom: '80px' }}>
          <div>
            <span
              style={{
                display: 'inline-block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#C17435',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '20px',
                borderBottom: '1px solid #C17435',
                paddingBottom: '4px',
              }}
            >
              Act 2 — The Dispute
            </span>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: '#FAF8F4',
                marginBottom: '20px',
              }}
            >
              A storm. A delay. A phone call
              <br />
              that changes everything.
            </h3>
            <p style={{ fontSize: '16px', color: '#E0E0E0', lineHeight: 1.8, marginBottom: '20px' }}>
              A cyclone in the Bay of Bengal delays the vessel by 11 days. The buyer&apos;s warehouse slot is gone. They
              reject the shipment on a technicality — &ldquo;late delivery.&rdquo; They refuse to pay.
            </p>
            <p style={{ fontSize: '16px', color: '#E0E0E0', lineHeight: 1.8, marginBottom: '28px' }}>
              The exporter has proof: weather bulletins, shipping records, customs entries. But who will look at them? A
              court? In which country? With what budget?
            </p>
            <blockquote style={{ borderLeft: '3px solid #C17435', paddingLeft: '20px', marginLeft: 0 }}>
              <p style={{ fontSize: '17px', fontStyle: 'italic', color: '#DDD', lineHeight: 1.7 }}>
                &ldquo;My lawyer said it would take two years and cost more than the shipment itself. I had 18 workers to
                pay.&rdquo;
              </p>
              <footer style={{ fontSize: '13px', color: '#888', marginTop: '12px' }}>
                — Suresh K., knitwear exporter, Ludhiana
              </footer>
            </blockquote>
          </div>
          <div style={{ position: 'relative', aspectRatio: '3/4', borderRadius: '12px', overflow: 'hidden' }}>
            <img
              src="/images/dispute_documents.png"
              alt="Stack of frustrating shipping and customs documents with red stamps"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>

        <div style={{ backgroundColor: '#1A1A1A', borderRadius: '16px', padding: '56px 48px' }}>
          <p className="tag" style={{ color: '#C17435', marginBottom: '20px' }}>
            The scale
          </p>
          <h3
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(22px, 3vw, 32px)',
              fontWeight: 700,
              color: '#FAF8F4',
              marginBottom: '40px',
              maxWidth: '600px',
            }}
          >
            This is not one man&apos;s story. This is a ₹7.34 lakh crore problem.
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '40px' }}>
            {[
              { stat: '₹7.34L Cr', label: 'in MSME payments delayed or disputed annually in India' },
              { stat: '45 days', label: 'average time an exporter waits past due date to receive payment' },
              { stat: '12%', label: 'of MSMEs shut down due to cash flow crises caused by late payments' },
              { stat: '0', label: 'affordable, fast alternatives to arbitration for small exporters' },
            ].map((item) => (
              <div key={item.stat} style={{ borderTop: '1px solid #333', paddingTop: '24px' }}>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '36px',
                    fontWeight: 800,
                    color: '#C17435',
                    marginBottom: '10px',
                    lineHeight: 1,
                  }}
                >
                  {item.stat}
                </p>
                <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.6 }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
