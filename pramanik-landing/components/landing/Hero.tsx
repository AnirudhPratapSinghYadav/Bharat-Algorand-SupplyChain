import Link from 'next/link';
import Image from 'next/image';

export default function Hero() {
  return (
    <section style={{ backgroundColor: '#FAF8F4', paddingTop: '140px', paddingBottom: '100px', borderBottom: '1px solid #E8E0D5' }}>
      <div className="container">
        <div className="two-col">

          {/* Left: Headline + CTA */}
          <div>
            <p className="tag">Automated Trade Escrow · Built for India</p>
            <div className="divider" />
            <h1 style={{ fontSize: 'clamp(40px, 5.5vw, 68px)', fontWeight: 800, color: '#111', marginBottom: '28px', letterSpacing: '-0.03em' }}>
              Payments that keep<br />
              <em style={{ fontStyle: 'italic', color: '#C17435' }}>their promise.</em>
            </h1>
            <p style={{ fontSize: '18px', color: '#555', lineHeight: 1.75, maxWidth: '480px', marginBottom: '44px' }}>
              pramanik holds payment in escrow, reads government shipping records and weather data, and automatically releases funds — without lawyers, without waiting, without middlemen.
            </p>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Link href="/dashboard" style={{
                backgroundColor: '#111', color: '#FAF8F4',
                fontSize: '15px', fontWeight: 600, padding: '15px 32px',
                borderRadius: '8px', textDecoration: 'none', display: 'inline-block',
                transition: 'background 0.2s',
              }}>
                See it live →
              </Link>
              <a href="#problem" style={{
                fontSize: '15px', fontWeight: 500, color: '#555',
                padding: '15px 0', textDecoration: 'none', borderBottom: '1px solid #C0B8AE',
                display: 'inline-block',
              }}>
                The problem we solve
              </a>
            </div>

            {/* Trust indicators */}
            <div style={{ display: 'flex', gap: '40px', marginTop: '56px', paddingTop: '32px', borderTop: '1px solid #E8E0D5', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#111', fontFamily: "'Inter', sans-serif", lineHeight: 1 }}>₹7.34L Cr</p>
                <p style={{ fontSize: '13px', color: '#888', marginTop: '6px' }}>delayed payments annually</p>
              </div>
              <div>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#111', fontFamily: "'Inter', sans-serif", lineHeight: 1 }}>63M+</p>
                <p style={{ fontSize: '13px', color: '#888', marginTop: '6px' }}>MSMEs affected in India</p>
              </div>
              <div>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#C17435', fontFamily: "'Inter', sans-serif", lineHeight: 1 }}>97%</p>
                <p style={{ fontSize: '13px', color: '#888', marginTop: '6px' }}>verdict accuracy, on-chain</p>
              </div>
            </div>
          </div>

          {/* Right: Image */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative', aspectRatio: '4/5', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.12)' }}>
              <Image
                src="/images/msme_owner.png"
                alt="A small business owner in Surat reviewing overdue invoices"
                fill
                sizes="(max-width: 900px) 100vw, 50vw"
                style={{ objectFit: 'cover' }}
                priority
              />
              {/* Caption card */}
              <div style={{
                position: 'absolute', bottom: '24px', left: '24px', right: '24px',
                backgroundColor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
                borderRadius: '8px', padding: '16px 20px',
                borderLeft: '3px solid #C17435',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>Ramesh, textile exporter · Surat</p>
                <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.5 }}>"The buyer claimed force majeure. I had no proof. I had no money."</p>
              </div>
            </div>

            {/* Removed floating stat card to clean up UI */}
          </div>

        </div>
      </div>
    </section>
  );
}
