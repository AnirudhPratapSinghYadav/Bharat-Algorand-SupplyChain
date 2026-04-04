import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Bot, MessageSquare, X } from 'lucide-react';
import { BACKEND_URL } from '../constants/api';
import './navibot.css';

type Msg = { role: 'user' | 'assistant'; text: string };

type NavibotResponse = {
  text?: string;
  reply?: string;
  action?: string | null;
  audio_url?: string | null;
  fallback?: boolean;
};

const SOFT_FALLBACK = 'System temporarily unavailable. Showing last known data.';

function readStoredWalletAddress(): string | undefined {
  try {
    const s = sessionStorage.getItem('navi_trust_wallet')?.trim();
    return s || undefined;
  } catch {
    return undefined;
  }
}

export function NaviBotPanel({
  shipmentId,
  walletAddress,
  onClose,
  defaultOpen = true,
  variant = 'fixed',
}: {
  shipmentId?: string | null;
  walletAddress?: string | null;
  onClose?: () => void;
  defaultOpen?: boolean;
  variant?: 'fixed' | 'inline';
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [caption, setCaption] = useState('');
  const [displayCaption, setDisplayCaption] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const mut = useMutation({
    mutationFn: async (query: string): Promise<NavibotResponse> => {
      const payload = {
        message: query,
        query,
        shipment_id: shipmentId || undefined,
        wallet_address: walletAddress?.trim() || readStoredWalletAddress(),
        history: messagesRef.current.slice(-8).map((m) => ({ role: m.role, text: m.text })),
      };
      try {
        const res = await axios.post<NavibotResponse>(`${BACKEND_URL}/navibot`, payload, {
          timeout: 45000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (s) => s === 200,
        });
        const data = res.data || {};
        const text = (data.text || data.reply || '').trim();
        if (res.status === 200 && text) return { ...data, text, reply: text };
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.data && typeof (e.response.data as NavibotResponse).text === 'string') {
          return e.response.data as NavibotResponse;
        }
      }
      return { text: SOFT_FALLBACK, reply: SOFT_FALLBACK, action: null, fallback: true };
    },
    onSuccess: (data, query) => {
      const text = (data.text || data.reply || '').trim() || SOFT_FALLBACK;
      setCaption(text);
      setLastAction(data.action ?? null);
      setMessages((prev) => [...prev, { role: 'user', text: query }, { role: 'assistant', text }]);
    },
  });

  useEffect(() => {
    if (mut.isPending) return;
    if (!caption) {
      setDisplayCaption('');
      return;
    }
    let i = 0;
    setDisplayCaption('');
    const id = window.setInterval(() => {
      i += 2;
      setDisplayCaption(caption.slice(0, i));
      if (i >= caption.length) clearInterval(id);
    }, 11);
    return () => clearInterval(id);
  }, [caption, mut.isPending]);

  const sendText = (q: string) => {
    const t = q.trim();
    if (!t || mut.isPending) return;
    setCaption('');
    setDisplayCaption('');
    mut.mutate(t);
    setInput('');
  };

  const onAction = (a: string | null | undefined) => {
    if (a === 'view') {
      if (shipmentId) navigate(`/verify/${encodeURIComponent(shipmentId)}`);
      else navigate('/verify');
      return;
    }
    if (a === 'settle') navigate('/');
    if (a === 'case') {
      if (shipmentId) navigate(`/verify/${encodeURIComponent(shipmentId)}`);
      else navigate('/verify');
    }
  };

  if (!open && variant === 'fixed') {
    return (
      <button
        type="button"
        aria-label="Open NaviBot"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 28,
          zIndex: 50,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bot size={22} />
      </button>
    );
  }

  const fixed = variant === 'fixed';

  return (
    <aside
      style={{
        position: fixed ? 'fixed' : 'relative',
        right: fixed ? 20 : 'auto',
        bottom: fixed ? 24 : 'auto',
        width: fixed ? 336 : '100%',
        maxWidth: fixed ? 'min(336px, calc(100vw - 40px))' : 440,
        maxHeight: fixed ? 'min(480px, calc(100vh - 120px))' : 'min(520px, 70vh)',
        zIndex: fixed ? 60 : 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bot size={20} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>NaviBot</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Text chat · chain-grounded</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClose?.();
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '0.72rem',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <MessageSquare size={14} /> Chat only
      </div>

      <div
        className="navibot-caption-block"
        style={{
          padding: '12px 14px',
          background: '#0f172a',
        }}
      >
        {mut.isPending ? (
          <div className="navibot-processing" aria-live="polite">
            <span className="navibot-spinner" />
            Updating…
          </div>
        ) : (
          <div className="navibot-main-caption" aria-live="polite">
            {displayCaption || caption || 'Ask about a shipment on Algorand.'}
          </div>
        )}
        {lastAction ? (
          <div className="navibot-action-row">
            {lastAction === 'settle' && (
              <button type="button" className="primary-btn" onClick={() => onAction('settle')}>
                Run settlement
              </button>
            )}
            {lastAction === 'view' && (
              <button type="button" className="primary-btn" onClick={() => onAction('view')}>
                View shipment
              </button>
            )}
            {lastAction === 'case' && (
              <button type="button" className="primary-btn" onClick={() => onAction('case')}>
                Open case
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 140 }}>
        {messages.length === 0 && (
          <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
            Try: &ldquo;Why is this shipment risky?&rdquo;
          </span>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              padding: '8px 12px',
              borderRadius: 10,
              background: m.role === 'user' ? '#2563eb' : '#f1f5f9',
              color: m.role === 'user' ? '#fff' : '#0f172a',
              fontSize: '0.82rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #e2e8f0' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !mut.isPending && sendText(input)}
          placeholder="Ask NaviBot…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
        />
        <button type="button" className="primary-btn" disabled={mut.isPending || !input.trim()} onClick={() => sendText(input)}>
          {mut.isPending ? '…' : 'Send'}
        </button>
      </div>
    </aside>
  );
}
