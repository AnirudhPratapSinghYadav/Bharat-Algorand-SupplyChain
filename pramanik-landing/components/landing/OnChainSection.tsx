import { APP_ID, LORA_APP_URL, LAST_KNOWN_VERDICT, LAST_KNOWN_CONFIDENCE, LAST_KNOWN_ESCROW } from '@/lib/constants';
import Link from 'next/link';

export default function OnChainSection() {
  return (
    <section id="proof" className="section" style={{ backgroundColor: '#111', color: '#FAF8F4' }}>
      <div className="container">

        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p className="tag" style={{ color: '#C17435' }}>Fully verifiable</p>
          <div className="divider" style={{ margin: '20px auto 28px' }} />
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: '#FAF8F4', marginBottom: '20px' }}>
            Don't trust us. Verify us.
          </h2>
          <p style={{ fontSize: '17px', color: '#E0E0E0', lineHeight: 1.75, maxWidth: '580px', margin: '0 auto' }}>
            Every decision pramanik makes is anchored to the Algorand blockchain. The contract is public. The verdict is public. The data sources are public. Anyone can audit every settlement, every time.
          </p>
        </div>

        {/* Live proof panel */}
        <div style={{
          backgroundColor: '#1A1A1A', borderRadius: '16px',
          padding: '48px', border: '1px solid #2A2A2A',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0',
        }}>
          {[
            {
              label: 'Last Verdict',
              value: LAST_KNOWN_VERDICT,
              sub: `${LAST_KNOWN_CONFIDENCE}% confidence score`,
              highlight: true,
            },
            {
              label: 'Escrow Released',
              value: `${LAST_KNOWN_ESCROW} ALGO`,
              sub: 'Settlement NFT minted',
              highlight: false,
            },
          ].map((item, i) => (
            <div key={item.label} style={{
              padding: '36px 32px',
              borderRight: i < 2 ? '1px solid #2A2A2A' : 'none',
              borderBottom: '0',
            }}>
              <p style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666', marginBottom: '16px' }}>
                {item.label}
              </p>
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '40px', fontWeight: 800, lineHeight: 1,
                color: item.highlight ? '#C17435' : '#FAF8F4',
                marginBottom: '12px',
              }}>
                {item.value}
              </p>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: item.link ? '16px' : '0' }}>{item.sub}</p>
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '13px', color: '#C17435', textDecoration: 'none', borderBottom: '1px solid rgba(193,116,53,0.4)', paddingBottom: '2px' }}>
                  {item.linkText}
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Explainer */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', marginTop: '48px' }}>
          {[
            {
              icon: '📄',
              title: 'The reasoning is hashed',
              body: 'Every factor the system considered — weather data, customs documents, GPS records — is compressed into a SHA-256 hash and written to the transaction note on Algorand.',
            },
            {
              icon: '🔒',
              title: 'The contract is immutable',
              body: 'Once payment enters the escrow smart contract, neither party can withdraw it. Only the verdict can release it. We cannot access it. No one can.',
            },
            {
              icon: '📜',
              title: 'Settlement is provable forever',
              body: 'Every resolved dispute generates an ARC-69 NFT — a permanent, on-chain certificate that the payment was made, when, and on what grounds.',
            },
          ].map(item => (
            <div key={item.title} style={{ backgroundColor: '#1A1A1A', borderRadius: '12px', padding: '32px', border: '1px solid #2A2A2A' }}>
              <div style={{ fontSize: '28px', marginBottom: '16px' }}>{item.icon}</div>
              <h4 style={{ fontFamily: "'Inter', sans-serif", fontSize: '20px', fontWeight: 700, color: '#FAF8F4', marginBottom: '12px' }}>
                {item.title}
              </h4>
              <p style={{ fontSize: '14px', color: '#CCCCCC', lineHeight: 1.75 }}>{item.body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '64px', paddingTop: '48px', borderTop: '1px solid #2A2A2A' }}>
          <Link href="/dashboard" style={{
            display: 'inline-block', backgroundColor: '#C17435', color: '#FFF',
            fontSize: '16px', fontWeight: 600, padding: '16px 40px',
            borderRadius: '8px', textDecoration: 'none',
          }}>
            Try a live dispute →
          </Link>
          <p style={{ fontSize: '14px', color: '#666', marginTop: '16px' }}>No wallet required to view. Connect to transact.</p>
        </div>

      </div>
    </section>
  );
}
