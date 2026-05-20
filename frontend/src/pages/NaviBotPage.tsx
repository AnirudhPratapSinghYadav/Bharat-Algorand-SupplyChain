import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Mic, MessageSquare } from 'lucide-react';
import { NaviBotPanel } from '../components/NaviBotPanel';
import { ElevenLabsConvaiWidget } from '../components/ElevenLabsConvaiWidget';
import { useRole } from '../context/RoleContext';
import { useWallet } from '../context/WalletContext';

export default function NaviBotPage() {
  const { role } = useRole();
  const { address } = useWallet();
  const [tab, setTab] = useState<'text' | 'voice'>('voice');
  const [contextShipment, setContextShipment] = useState('');

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24, paddingBottom: 48 }}>
      <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600, display: 'inline-block', marginBottom: 16 }}>
        ← Dashboard
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Bot size={26} color="var(--accent)" />
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Oracle assistant</h1>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 16, maxWidth: 640, lineHeight: 1.5 }}>
        Text chat uses live chain stats and jury context. Voice uses your ElevenLabs agent with optional shipment
        context — paste a shipment reference below before speaking.
      </p>

      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
        Shipment context (optional)
      </label>
      <input
        value={contextShipment}
        onChange={(e) => setContextShipment(e.target.value)}
        placeholder="e.g. PRM-EX-MUM-RDM-001"
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-raised)',
          color: 'var(--text)',
          fontFamily: 'var(--mono)',
          fontSize: '0.85rem',
          marginBottom: 16,
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={tab === 'voice' ? 'primary-btn' : ''}
          onClick={() => setTab('voice')}
          style={
            tab !== 'voice'
              ? {
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }
              : { display: 'inline-flex', alignItems: 'center', gap: 6 }
          }
        >
          <Mic size={14} /> Voice (ElevenLabs)
        </button>
        <button
          type="button"
          className={tab === 'text' ? 'primary-btn' : ''}
          onClick={() => setTab('text')}
          style={
            tab !== 'text'
              ? {
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }
              : { display: 'inline-flex', alignItems: 'center', gap: 6 }
          }
        >
          <MessageSquare size={14} /> Text (NaviBot)
        </button>
      </div>

      {tab === 'voice' ? (
        <ElevenLabsConvaiWidget
          shipmentId={contextShipment.trim() || null}
          walletAddress={address}
          className="el-convai--page"
          title="Pramanik voice oracle"
        />
      ) : (
        <NaviBotPanel
          defaultOpen
          shipmentId={contextShipment.trim() || null}
          variant="inline"
          role={role}
          walletAddress={address}
        />
      )}
    </div>
  );
}
