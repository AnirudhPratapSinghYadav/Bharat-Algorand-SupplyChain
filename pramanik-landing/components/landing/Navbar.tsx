'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Navbar() {
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
    { name: 'Dashboard', href: '/dashboard' },
  ];

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      backgroundColor: scrolled ? 'rgba(250,248,244,0.97)' : 'transparent',
      borderBottom: scrolled ? '1px solid #E8E0D5' : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      transition: 'all 0.35s ease',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '68px' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: '22px', color: '#111', letterSpacing: '-0.02em' }}>
            pramanik
          </span>
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }} className="hide-mobile">
          {links.map(l => (
            <Link key={l.name} href={l.href} style={{ textDecoration: 'none', fontSize: '15px', fontWeight: 500, color: '#444', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#111')}
              onMouseLeave={e => (e.currentTarget.style.color = '#444')}>
              {l.name}
            </Link>
          ))}
          <Link href="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            backgroundColor: '#111', color: '#FAF8F4',
            fontSize: '14px', fontWeight: 500,
            padding: '10px 22px', borderRadius: '6px', textDecoration: 'none',
            transition: 'background 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#333')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#111')}>
            Sign in
          </Link>
        </div>

        {/* Mobile burger */}
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#111' }} className="show-mobile">
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div style={{ backgroundColor: '#FAF8F4', borderTop: '1px solid #E8E0D5', padding: '20px 32px' }}>
          {[...links, { name: 'Sign in', href: '/login' }].map(l => (
            <Link key={l.name} href={l.href} onClick={() => setOpen(false)} style={{
              display: 'block', padding: '14px 0', fontSize: '16px', fontWeight: 500,
              color: '#444', textDecoration: 'none', borderBottom: '1px solid #EEE9E2',
            }}>{l.name}</Link>
          ))}
        </div>
      )}

      <style>{`
        .hide-mobile { display: flex; }
        .show-mobile { display: none; }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .show-mobile { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
