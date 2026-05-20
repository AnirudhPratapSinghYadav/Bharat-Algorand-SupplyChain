import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

type Props = { onConnectWallet: () => void };

export function LandingNavbar({ onConnectWallet }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const links = [
    { name: 'The Problem', href: '#problem' },
    { name: 'How It Works', href: '#how' },
    { name: 'Our Goals', href: '#sdg' },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: scrolled ? 'rgba(250,248,244,0.97)' : 'transparent',
        borderBottom: scrolled ? '1px solid #E8E0D5' : '1px solid transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        transition: 'all 0.35s ease',
      }}
    >
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '68px' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 800,
              fontSize: '22px',
              color: '#111',
              letterSpacing: '-0.02em',
            }}
          >
            pramanik
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }} className="hide-mobile">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.href}
              style={{ textDecoration: 'none', fontSize: '15px', fontWeight: 500, color: '#444' }}
            >
              {l.name}
            </a>
          ))}
          <button
            type="button"
            onClick={onConnectWallet}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#111',
              color: '#FAF8F4',
              fontSize: '14px',
              fontWeight: 500,
              padding: '10px 22px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Connect wallet
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#111' }}
          className="show-mobile"
          aria-label="Menu"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {open ? (
        <div style={{ backgroundColor: '#FAF8F4', borderTop: '1px solid #E8E0D5', padding: '20px 32px' }}>
          {[...links, { name: 'Connect wallet', href: '#connect' }].map((l) =>
            l.href === '#connect' ? (
              <button
                key={l.name}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onConnectWallet();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 0',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#444',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #EEE9E2',
                  cursor: 'pointer',
                }}
              >
                {l.name}
              </button>
            ) : (
              <a
                key={l.name}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '14px 0',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#444',
                  textDecoration: 'none',
                  borderBottom: '1px solid #EEE9E2',
                }}
              >
                {l.name}
              </a>
            ),
          )}
        </div>
      ) : null}
    </nav>
  );
}
