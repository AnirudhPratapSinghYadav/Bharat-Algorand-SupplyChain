import { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageCircle, MessageSquare, Mic, X } from 'lucide-react';
import { BACKEND_URL } from '../constants/api';
import { ElevenLabsConvaiWidget } from './ElevenLabsConvaiWidget';
import { NaviBotPanel } from './NaviBotPanel';
import './floating-assistant.css';

type Props = {
  walletAddress?: string | null;
  shipmentId?: string | null;
  role?: 'stakeholder' | 'supplier';
  onRequestRunJury?: (shipmentId: string) => void;
};

type Tab = 'chat' | 'voice';

export function FloatingAssistantWidget({ walletAddress, shipmentId, role = 'stakeholder', onRequestRunJury }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  useEffect(() => {
    if (!open) return;
    axios
      .get(`${BACKEND_URL}/elevenlabs/config`, { timeout: 8000 })
      .then((r) => {
        const d = r.data as { enabled?: boolean; agent_id?: string; signed_url?: string };
        setVoiceAvailable(!!(d.enabled && (d.agent_id || d.signed_url)));
      })
      .catch(() => setVoiceAvailable(false));
  }, [open]);

  return (
    <div className="floating-assistant" aria-label="Trade assistant">
      {open ? (
        <div className="floating-assistant__panel" role="dialog" aria-modal="false" aria-label="Pramanik assistant">
          <div className="floating-assistant__panel-head">
            <div>
              <span className="floating-assistant__panel-title">Trade assistant</span>
              <span className="floating-assistant__panel-sub">
                Chat always works · Voice needs ElevenLabs on the server
              </span>
            </div>
            <button
              type="button"
              className="floating-assistant__close"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </div>

          <div className="floating-assistant__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chat'}
              className={`floating-assistant__tab${tab === 'chat' ? ' floating-assistant__tab--active' : ''}`}
              onClick={() => setTab('chat')}
            >
              <MessageSquare size={14} aria-hidden /> Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'voice'}
              className={`floating-assistant__tab${tab === 'voice' ? ' floating-assistant__tab--active' : ''}`}
              onClick={() => setTab('voice')}
            >
              <Mic size={14} aria-hidden /> Voice
              {!voiceAvailable ? <span className="floating-assistant__tab-note">optional</span> : null}
            </button>
          </div>

          <div className="floating-assistant__body">
            {tab === 'chat' ? (
              <NaviBotPanel
                variant="inline"
                embedded
                defaultOpen
                shipmentId={shipmentId}
                walletAddress={walletAddress}
                role={role}
                onRequestRunJury={onRequestRunJury}
              />
            ) : voiceAvailable ? (
              <ElevenLabsConvaiWidget
                className="el-convai--floating"
                walletAddress={walletAddress}
                shipmentId={shipmentId}
                title="Speak about escrow or payment release"
              />
            ) : (
              <div className="floating-assistant__voice-fallback">
                <p>
                  Voice is not configured on this server. Add <code>ELEVENLABS_AGENT_ID</code> (and{' '}
                  <code>ELEVENLABS_API_KEY</code> for private agents) to <code>.env</code>, then restart the API.
                </p>
                <p>
                  <strong>Use the Chat tab</strong> — same guidance on corridors, escrow, GST checks, and jury steps.
                </p>
                <button type="button" className="primary-btn" onClick={() => setTab('chat')}>
                  Open chat
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`floating-assistant__fab${open ? ' floating-assistant__fab--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close assistant' : 'Open trade assistant'}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        <span className="floating-assistant__fab-label">{open ? 'Close' : 'Ask Pramanik'}</span>
      </button>
    </div>
  );
}
