export default function FailuresSection() {
  const comparisons = [
    {
      name: 'IBM TRADELENS',
      period: '2018–2022',
      color: '#4A5568',
      rows: [
        { label: 'Visibility', value: 'Yes', vColor: '#F5F5F2' },
        { label: 'Consortium Required', value: 'Yes', vColor: '#EF4444' },
        { label: 'Escrow Locked', value: 'No', vColor: '#4A5568' },
        { label: 'Auto Settlement', value: 'No', vColor: '#4A5568' },
      ],
      footer: 'Failed due to governance monopolies.',
      footerColor: '#4A5568',
    },
    {
      name: 'VECHAIN / IOT',
      period: 'Current',
      color: '#4A5568',
      rows: [
        { label: 'Visibility', value: 'Yes', vColor: '#F5F5F2' },
        { label: 'Consortium Required', value: 'No', vColor: '#F5F5F2' },
        { label: 'Escrow Locked', value: 'Rarely', vColor: '#4A5568' },
        { label: 'Auto Settlement', value: 'No', vColor: '#4A5568' },
      ],
      footer: 'Physical tracking, but human dispute resolution.',
      footerColor: '#4A5568',
    },
    {
      name: 'PRAMANIK',
      period: 'Algorand',
      color: '#3A6FF7',
      rows: [
        { label: 'Visibility', value: 'Yes (ICEGATE)', vColor: '#22C55E' },
        { label: 'Consortium Required', value: 'No', vColor: '#22C55E' },
        { label: 'Escrow Locked', value: 'Yes (ALGO)', vColor: '#22C55E' },
        { label: 'Auto Settlement', value: 'Yes', vColor: '#22C55E' },
      ],
      footer: 'Oracle integration drives smart contract execution.',
      footerColor: '#7DD3FC',
    },
  ];

  return (
    <section id="why-this" style={{ padding: '120px 0', backgroundColor: '#0F1115', borderBottom: '1px solid #2A2F36' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>

        <div style={{ marginBottom: '64px' }}>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#4A5568', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>
            THE ORACLE GAP
          </p>
          <h2 style={{ fontFamily: "'Satoshi', sans-serif", fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)', color: '#F5F5F2', lineHeight: 1.2 }}>
            Tracking was solved.<br />Settlement wasn&apos;t.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {comparisons.map((card) => (
            <div
              key={card.name}
              style={{
                backgroundColor: card.name === 'PRAMANIK' ? '#1A1F29' : '#161A20',
                borderTop: `2px solid ${card.color}`,
                borderRadius: '8px',
                padding: '32px',
              }}
            >
              <h3 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px', color: card.name === 'PRAMANIK' ? '#3A6FF7' : '#F5F5F2', fontWeight: card.name === 'PRAMANIK' ? 700 : 500, marginBottom: '32px' }}>
                {card.name} <span style={{ color: '#4A5568', fontWeight: 400 }}>({card.period})</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {card.rows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #2A2F36' }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: '14px', color: '#9AA5B4' }}>{row.label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', color: row.vColor, fontWeight: 500 }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: card.footerColor, marginTop: '24px' }}>
                {card.footer}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
