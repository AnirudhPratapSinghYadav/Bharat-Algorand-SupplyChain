export function LandingSDGSection() {
  const goals = [
    {
      num: '8',
      color: '#A21942',
      bg: '#FFF0F3',
      title: 'Decent Work & Economic Growth',
      desc: 'When exporters get paid fairly and on time, they keep workers employed. Late payments force MSMEs to cut staff, delay salaries, and sometimes shut down entirely. pramanik directly protects livelihoods — not just invoices.',
    },
    {
      num: '9',
      color: '#E57B27',
      bg: '#FFF6EE',
      title: 'Industry, Innovation & Infrastructure',
      desc: 'We replace outdated, paper-based dispute processes with transparent, automated verification. pramanik makes global trade infrastructure accessible to small businesses — not just multinationals with legal departments.',
    },
    {
      num: '10',
      color: '#C5192D',
      bg: '#FFF1F1',
      title: 'Reduced Inequalities',
      desc: 'Today, only large companies can afford commercial arbitration. Small exporters have no recourse. pramanik levels the playing field — giving a ₹20 lakh shipper the same protection as a ₹200 crore corporation.',
    },
  ];

  return (
    <section id="sdg" className="section" style={{ backgroundColor: '#F5F1EB', borderBottom: '1px solid #E0D9CF' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p className="tag">Beyond the product</p>
          <div className="divider" style={{ margin: '20px auto 28px' }} />
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 800,
              color: '#111',
              marginBottom: '20px',
              maxWidth: '640px',
              margin: '0 auto 20px',
            }}
          >
            Built for business. Designed for people.
          </h2>
          <p style={{ fontSize: '17px', color: '#666', lineHeight: 1.75, maxWidth: '580px', margin: '0 auto' }}>
            pramanik was built to solve a real problem felt by real people. The alignment with the UN Sustainable
            Development Goals is not a checkbox — it&apos;s the reason we exist.
          </p>
        </div>

        <div className="three-col">
          {goals.map((goal) => (
            <div
              key={goal.num}
              style={{
                backgroundColor: '#FFF',
                borderRadius: '12px',
                padding: '36px 32px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                borderTop: `3px solid ${goal.color}`,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: goal.bg,
                  borderRadius: '8px',
                  padding: '8px 14px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: goal.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontFamily: "'Playfair Display', serif", color: '#FFF', fontSize: '16px', fontWeight: 800 }}>
                    {goal.num}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: goal.color,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  SDG Goal {goal.num}
                </span>
              </div>
              <h3
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#111',
                  marginBottom: '14px',
                  lineHeight: 1.3,
                }}
              >
                {goal.title}
              </h3>
              <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.75 }}>{goal.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '64px', textAlign: 'center', maxWidth: '700px', marginLeft: 'auto', marginRight: 'auto' }}>
          <blockquote>
            <p
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(20px, 2.5vw, 28px)',
                fontStyle: 'italic',
                color: '#333',
                lineHeight: 1.6,
                marginBottom: '20px',
              }}
            >
              &ldquo;Leave no one behind — especially the 63 million small businesses that power India&apos;s exports.&rdquo;
            </p>
            <footer style={{ fontSize: '14px', color: '#888', fontStyle: 'normal' }}>pramanik&apos;s founding principle</footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
