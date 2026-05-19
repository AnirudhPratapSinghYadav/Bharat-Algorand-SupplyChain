'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  total_shipments: number;
  active_shipments: number;
  total_settled: number;
  total_disputed: number;
  contract_algo: number | null;
  escrow_total_algo: number | null;
  contract_app_address: string | null;
  lora_contract_url: string | null;
  is_paused: boolean;
  oracle_status: string;
  source: string;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:8000/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0A0B', color: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Navbar */}
      <div style={{ borderBottom: '1px solid #1F2023', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: 800, color: '#F59E0B', textDecoration: 'none' }}>
            pramanik
          </Link>
          <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#1E1B4B', color: '#818CF8', fontWeight: 600, textTransform: 'uppercase' }}>
            Oracle Admin
          </span>
        </div>
        <Link href="/" style={{ color: '#9CA3AF', textDecoration: 'none', fontSize: '14px' }}>
          ← Back to App
        </Link>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px' }}>
            Oracle Protocol Overview
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: '16px' }}>
            Real-time Algorand on-chain global state & multi-agent validator status.
          </p>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', fontSize: '18px', color: '#9CA3AF' }}>
            Fetching Algorand Ledger State...
          </div>
        )}

        {error && (
          <div style={{ padding: '24px', backgroundColor: '#7F1D1D', borderRadius: '12px', border: '1px solid #B91C1C', color: '#FCA5A5', marginBottom: '32px' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Error Loading Stats</h3>
            <p>{error}. Is the Pramanik backend server running on localhost:8000?</p>
          </div>
        )}

        {stats && (
          <>
            {/* Status Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px' }}>
                <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#9CA3AF', letterSpacing: '0.05em', marginBottom: '8px' }}>Oracle Status</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: stats.is_paused ? '#EF4444' : '#10B981' }} />
                  <span style={{ fontSize: '20px', fontWeight: 600, textTransform: 'capitalize' }}>
                    {stats.oracle_status}
                  </span>
                </div>
              </div>

              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px' }}>
                <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#9CA3AF', letterSpacing: '0.05em', marginBottom: '8px' }}>Contract App Address</p>
                <p style={{ fontSize: '14px', fontFamily: 'monospace', wordBreak: 'break-all', color: '#F3F4F6' }}>
                  {stats.contract_app_address || 'Not Configured'}
                </p>
              </div>

              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px' }}>
                <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#9CA3AF', letterSpacing: '0.05em', marginBottom: '8px' }}>Verifiability (Lora Explorer)</p>
                {stats.lora_contract_url ? (
                  <a href={stats.lora_contract_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', color: '#F59E0B', textDecoration: 'none', fontWeight: 500, fontSize: '14px' }}>
                    Inspect App Ledger →
                  </a>
                ) : (
                  <span style={{ color: '#4B5563', fontSize: '14px' }}>Unavailable</span>
                )}
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '48px' }}>
              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px', borderLeft: '4px solid #F59E0B' }}>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '8px' }}>Total Escrow Locked</p>
                <p style={{ fontSize: '36px', fontWeight: 800, color: '#F3F4F6' }}>
                  {stats.contract_algo !== null ? `${stats.contract_algo} ALGO` : '0 ALGO'}
                </p>
              </div>

              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px' }}>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '8px' }}>Total Shipments</p>
                <p style={{ fontSize: '36px', fontWeight: 800 }}>{stats.total_shipments}</p>
              </div>

              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px' }}>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '8px' }}>Active Escrows</p>
                <p style={{ fontSize: '36px', fontWeight: 800 }}>{stats.active_shipments}</p>
              </div>

              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px', borderLeft: '4px solid #10B981' }}>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '8px' }}>Disputes Settled</p>
                <p style={{ fontSize: '36px', fontWeight: 800, color: '#10B981' }}>{stats.total_settled}</p>
              </div>

              <div style={{ backgroundColor: '#121214', border: '1px solid #1F2023', borderRadius: '12px', padding: '24px', borderLeft: '4px solid #EF4444' }}>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '8px' }}>Disputes Raised</p>
                <p style={{ fontSize: '36px', fontWeight: 800, color: '#EF4444' }}>{stats.total_disputed}</p>
              </div>
            </div>

            {/* Explainer / Technical notes */}
            <div style={{ backgroundColor: '#161618', border: '1px solid #1F2023', borderRadius: '12px', padding: '32px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Technical Audit Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F59E0B', marginBottom: '4px' }}>Data Provenance</h4>
                  <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6 }}>
                    This dashboard computes stats from the <strong>{stats.source}</strong> source. All global metrics represent verified on-chain state, direct from application box mapping indices.
                  </p>
                </div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F59E0B', marginBottom: '4px' }}>Smart Contract Version</h4>
                  <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6 }}>
                    Running <strong>NaviTrust ARC-56</strong> build specification. Smart contract enforces oracle verification signatures and holds the escrow funds until settlement/dispute resolution criteria are reached.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
