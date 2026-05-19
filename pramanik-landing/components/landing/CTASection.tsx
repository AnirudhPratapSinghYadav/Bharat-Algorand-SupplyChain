import Link from 'next/link';
import { LORA_APP_URL, APP_ID } from '@/lib/constants';

export default function CTASection() {
  return (
    <section className="section" style={{ backgroundColor: '#FAF8F4' }}>
      <div className="container">

        {/* Main CTA */}
        <div style={{
          backgroundColor: '#111', borderRadius: '20px',
          padding: 'clamp(48px, 6vw, 80px)', marginBottom: '80px',
          display: 'grid', gridTemplateColumns: '1fr', gap: '40px',
          alignItems: 'center',
        }} className="two-col">
          <div>
            <p className="tag" style={{ color: '#C17435' }}>Get started today</p>
            <div className="divider" />
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#FAF8F4', marginBottom: '20px' }}>
              Ship with certainty.<br />
              <em style={{ color: '#C17435' }}>Get paid on time.</em>
            </h2>
            <p style={{ fontSize: '16px', color: '#999', lineHeight: 1.75, maxWidth: '420px' }}>
              Connect your Algorand wallet, register a trade, and experience what it feels like when the system actually works for the small exporter.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Link href="/dashboard" style={{
              display: 'block', textAlign: 'center',
              backgroundColor: '#C17435', color: '#FFF',
              fontSize: '16px', fontWeight: 600, padding: '18px 32px',
              borderRadius: '10px', textDecoration: 'none',
            }}>
              Open live dashboard →
            </Link>
            <Link href="/login" style={{
              display: 'block', textAlign: 'center',
              border: '1px solid #333', color: '#FAF8F4',
              fontSize: '15px', fontWeight: 500, padding: '16px 32px',
              borderRadius: '10px', textDecoration: 'none',
            }}>
              Sign in with wallet
            </Link>
            <a href={LORA_APP_URL} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-block', backgroundColor: 'transparent', color: '#FAF8F4',
            fontSize: '16px', fontWeight: 600, padding: '16px 32px',
            borderRadius: '8px', textDecoration: 'none', border: '1px solid #333',
            transition: 'background 0.2s',
          }}>
            Verify contract on Lora ↗
          </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '48px', paddingTop: '48px', borderTop: '1px solid #E8E0D5' }}>
          <div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: '22px', color: '#111', marginBottom: '12px' }}>pramanik</p>
            <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.7 }}>Automated trade escrow and dispute resolution for Indian exporters.</p>
          </div>
          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>Product</p>
            {['Dashboard', 'How It Works', 'Our Goals', 'Sign In'].map(l => (
              <p key={l} style={{ marginBottom: '10px' }}>
                <a href="#" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>{l}</a>
              </p>
            ))}
          </div>
          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>Built with</p>
            {['Algorand Blockchain', 'ICEGATE (Customs API)', 'Stormglass Weather API', 'MarineTraffic AIS'].map(l => (
              <p key={l} style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>{l}</p>
            ))}
          </div>
          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>Builder</p>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.7 }}>
              Anirudh Pratap Singh Yadav<br />
              AI/ML · Symbiosis Institute of Technology<br /><br />
              AlgoBharat Grand Finale · 2025
            </p>
          </div>
        </div>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #E8E0D5', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: '#888' }}>© 2025 pramanik. Built for AlgoBharat.</p>
          <p style={{ fontSize: '13px', color: '#888' }}>
            Smart contract deployed on Algorand Testnet
          </p>
        </div>

      </div>
    </section>
  );
}
