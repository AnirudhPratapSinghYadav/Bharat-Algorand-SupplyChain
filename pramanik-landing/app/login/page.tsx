'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@txnlab/use-wallet-react';
import { useEffect } from 'react';

const WALLET_UI_CONFIG: Record<string, any> = {
  pera: {
    desc: 'The most used Algorand wallet — mobile & browser',
    icon: '🔵',
    color: '#3D5AF1',
    bg: '#EEF1FF',
  },
  defly: {
    desc: 'Built for DeFi users — advanced features, fast',
    icon: '⚡',
    color: '#FF6B35',
    bg: '#FFF2EE',
  },
  lute: {
    desc: 'Web-based access — no install needed',
    icon: '🌐',
    color: '#22C55E',
    bg: '#EFFFEF',
  },
};

export default function LoginPage() {
  const { wallets, activeAddress } = useWallet();
  const router = useRouter();

  // Redirect to home or dashboard once connected
  useEffect(() => {
    if (activeAddress) {
      router.push('/');
    }
  }, [activeAddress, router]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAF8F4', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid #E8E0D5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: '20px', color: '#111', textDecoration: 'none' }}>
          pramanik
        </Link>
        <Link href="/" style={{ fontSize: '14px', color: '#888', textDecoration: 'none' }}>← Back to home</Link>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C17435', marginBottom: '12px' }}>
              Connect your wallet
            </p>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '36px', fontWeight: 800, color: '#111', marginBottom: '16px', lineHeight: 1.2 }}>
              Welcome back to<br />pramanik
            </h1>
            <p style={{ fontSize: '16px', color: '#666', lineHeight: 1.7 }}>
              Choose your Algorand wallet to access your escrow, track shipments, and manage disputes.
            </p>
          </div>

          {/* Wallet options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
            {wallets && wallets.length > 0 ? (
              wallets.map(wallet => {
                const ui = WALLET_UI_CONFIG[wallet.id] || {
                  desc: 'Connect securely',
                  icon: '🔑',
                  color: '#999',
                  bg: '#F5F5F5',
                };
                
                return (
                  <button
                    key={wallet.id}
                    onClick={() => wallet.connect()}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '20px',
                      backgroundColor: '#FFF', border: '1.5px solid #E8E0D5',
                      borderRadius: '12px', padding: '20px 24px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = ui.color;
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px rgba(0,0,0,0.08)`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E0D5';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '12px',
                      backgroundColor: ui.bg, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '24px', flexShrink: 0,
                    }}>
                      {ui.icon}
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>{wallet.metadata.name}</p>
                      <p style={{ fontSize: '13px', color: '#888' }}>{ui.desc}</p>
                    </div>

                    {/* Arrow */}
                    <div style={{ fontSize: '18px', color: '#CCC' }}>→</div>
                  </button>
                );
              })
            ) : (
              <p style={{ textAlign: 'center', color: '#888' }}>Loading wallets...</p>
            )}
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E8E0D5' }} />
            <span style={{ fontSize: '13px', color: '#E0E0E0' }}>Why a wallet?</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E8E0D5' }} />
          </div>

          {/* Explainer */}
          <div style={{ backgroundColor: '#F5F1EB', borderRadius: '12px', padding: '24px', marginBottom: '32px' }}>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.75 }}>
              pramanik uses your Algorand wallet as your identity. Your funds go into a smart contract — not our servers. We never hold your money, and we can never access your wallet. Your keys, your trade.
            </p>
          </div>

          {/* New to Algorand */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#888' }}>
              New to Algorand?{' '}
              <a href="https://perawallet.app" target="_blank" rel="noopener noreferrer" style={{ color: '#C17435', textDecoration: 'none', fontWeight: 500 }}>
                Get Pera Wallet — it takes 2 minutes
              </a>
            </p>
          </div>

        </div>
      </div>

      {/* Footer note */}
      <div style={{ padding: '20px 32px', borderTop: '1px solid #E8E0D5', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#999' }}>pramanik operates on Algorand Testnet</p>
      </div>

    </div>
  );
}
