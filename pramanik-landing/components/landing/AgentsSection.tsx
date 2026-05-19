import Image from 'next/image';

export default function AgentsSection() {
  const agents = [
    {
      num: '01',
      name: 'WEATHER SENTINEL',
      desc: 'Reads historical maritime data via Stormglass. Cross-references wave height against force majeure definitions.',
      active: false,
    },
    {
      num: '02',
      name: 'COMPLIANCE AUDITOR',
      desc: 'Connects to ICEGATE (India Customs EDI) to verify Shipping Bills and MarineTraffic for AIS GPS deviations.',
      active: false,
    },
    {
      num: '03',
      name: 'FRAUD DETECTOR',
      desc: 'Cross-checks GSTIN, MCA21 registry, and DGFT IEC status to immediately flag shell companies.',
      active: false,
    },
    {
      num: '04',
      name: 'CHIEF ARBITER',
      desc: 'Incoterm-aware LLM. Reads the outputs of agents 1–3. Generates the final SETTLE / HOLD verdict and hashes the logic to the Algorand blockchain.',
      active: true,
    },
  ];

  return (
    <section id="how-it-works" style={{ padding: '120px 0', backgroundColor: '#0A0C0F', borderBottom: '1px solid #2A2F36' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '64px' }} className="lg:!grid-cols-[5fr_7fr]">

          {/* Left: Agent Timeline */}
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#3A6FF7', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>
              THE AI JURY
            </p>
            <h2 style={{ fontFamily: "'Satoshi', sans-serif", fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)', color: '#F5F5F2', lineHeight: 1.2, marginBottom: '48px' }}>
              Four agents.<br />One unalterable verdict.
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {agents.map((agent) => (
                <div
                  key={agent.num}
                  style={{
                    borderLeft: agent.active ? '2px solid #3A6FF7' : '1px solid #2A2F36',
                    paddingLeft: '24px',
                    paddingBottom: '32px',
                    paddingTop: '4px',
                  }}
                >
                  <p style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '13px',
                    color: agent.active ? '#3A6FF7' : '#F5F5F2',
                    fontWeight: agent.active ? 700 : 500,
                    marginBottom: '8px',
                  }}>
                    {agent.num} / {agent.name}
                  </p>
                  <p style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: '14px',
                    color: agent.active ? '#F5F5F2' : '#9AA5B4',
                    lineHeight: 1.7,
                  }}>
                    {agent.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Image */}
          <div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', borderRadius: '8px', overflow: 'hidden', border: '1px solid #2A2F36' }}>
              <Image
                src="/images/command_center.png"
                alt="Logistics Command Center"
                fill
                sizes="(max-width: 1024px) 100vw, 58vw"
                style={{ objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                backgroundColor: 'rgba(15, 17, 21, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #2A2F36',
                padding: '14px 16px',
                borderRadius: '6px',
                maxWidth: '280px',
              }}>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#7DD3FC', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  ARBITER OUTPUT HASH
                </p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#F5F5F2', wordBreak: 'break-all', lineHeight: 1.5 }}>
                  e3b0c44298fc1c149afb f4c8996fb92427ae41e 4649b934ca495991b785
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
