import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { MessageCircle } from 'lucide-react';
import { PRAMANIK_BOT_NAME } from '../constants/branding';
import { ElevenLabsConvaiWidget } from '../components/ElevenLabsConvaiWidget';
import { useWallet } from '../context/WalletContext';
import { BACKEND_URL } from '../constants/api';

const SUGGESTED = [
  'What is the status of my shipment?',
  'How does settlement review work?',
  'Explain escrow in plain language',
  'How do I verify a proof on Lora?',
];

export default function PramanikAssistantPage() {
  const { address } = useWallet();
  const [contextShipment, setContextShipment] = useState('');

  const configQ = useQuery({
    queryKey: ['assistant-config'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as {
        demo_labels?: Record<string, string>;
        demo_shipments?: string[];
      },
    staleTime: 60_000,
  });

  const contextLabel = useMemo(() => {
    const id = contextShipment.trim();
    if (!id) return null;
    return configQ.data?.demo_labels?.[id] || null;
  }, [contextShipment, configQ.data]);

  const demoIds = Array.isArray(configQ.data?.demo_shipments) ? configQ.data!.demo_shipments! : [];

  return (
    <div className="assistant-page">
      <Link to="/" className="assistant-page__back">
        ← Back to dashboard
      </Link>

      <header className="assistant-page__header">
        <h1 className="assistant-page__title">{PRAMANIK_BOT_NAME}</h1>
        <p className="assistant-page__sub">
          One assistant for <strong>voice and text</strong> — powered by ElevenLabs. Type a question or tap the
          microphone in the widget below; both use the same oracle context and shipment memory.
        </p>
      </header>

      <div className="assistant-card">
        <div className="assistant-context">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="shipment-ctx">Shipment context (optional)</label>
            <input
              id="shipment-ctx"
              value={contextShipment}
              onChange={(e) => setContextShipment(e.target.value)}
              placeholder="Paste reference or pick a lane below"
            />
          </div>
        </div>

        {demoIds.length > 0 ? (
          <div className="assistant-pills">
            {demoIds.map((id) => (
              <button
                key={id}
                type="button"
                className="assistant-pill"
                onClick={() => setContextShipment(id)}
                title={id}
              >
                {configQ.data?.demo_labels?.[id] || id}
              </button>
            ))}
          </div>
        ) : null}

        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={16} color="var(--accent)" />
          Try asking:
        </p>
        <div className="assistant-pills" style={{ marginBottom: 20 }}>
          {SUGGESTED.map((q) => (
            <span key={q} className="assistant-pill" style={{ cursor: 'default' }}>
              {q}
            </span>
          ))}
        </div>

        <ElevenLabsConvaiWidget
          shipmentContextLabel={contextLabel}
          shipmentId={contextShipment.trim() || null}
          walletAddress={address}
          className="el-convai--unified"
          title="Speak or type — same assistant"
        />
      </div>
    </div>
  );
}
