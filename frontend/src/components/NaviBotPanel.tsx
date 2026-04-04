import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, MessageSquare, X, Play, Search } from 'lucide-react';
import { askNavibot, type NavibotHistoryItem } from '../api';
import './navibot.css';

type Msg = { role: 'user' | 'assistant'; content: string };

type Role = 'stakeholder' | 'supplier';

const SOFT_CATCH =
  'Ask me about Mumbai (in transit), Chennai (disputed), or Delhi (settled) — or how the AI jury works.';

function sanitizeAssistantText(s: string): string {
  const t = (s || '').trim();
  const lower = t.toLowerCase();
  const banned = [
    'ai unavailable',
    'showing system data',
    'navibot is temporarily unavailable',
    'temporarily unavailable',
    'error:',
    'stack trace',
  ];
  if (banned.some((b) => lower.includes(b))) return SOFT_CATCH;
  return t || SOFT_CATCH;
}

function readStoredWalletAddress(): string | undefined {
  try {
    const s = sessionStorage.getItem('navi_trust_wallet')?.trim();
    return s || undefined;
  } catch {
    return undefined;
  }
}

function RobotAvatar({ processing }: { processing: boolean }) {
  return (
    <svg
      width="72"
      height="88"
      viewBox="0 0 72 88"
      aria-hidden
      style={{ display: 'block', margin: '0 auto' }}
    >
      <defs>
        <linearGradient id="navibot-head" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="12" y="18" width="48" height="44" rx="10" fill="url(#navibot-head)" opacity="0.95" />
      <rect
        x="34"
        y="6"
        width="4"
        height="14"
        rx="2"
        fill="#38bdf8"
        className={processing ? 'navibot-antenna' : undefined}
      />
      <circle cx="28" cy="36" r="5" fill="#e0f2fe" />
      <circle cx="44" cy="36" r="5" fill="#e0f2fe" />
      <rect x="30" y="48" width="12" height="4" rx="2" fill="#0f172a" />
      <rect x="18" y="66" width="36" height="14" rx="6" fill="#0f172a" opacity="0.85" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="navibot-typing" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

function trimMessages(prev: Msg[]): Msg[] {
  return prev.slice(-10);
}

export function NaviBotPanel({
  shipmentId,
  walletAddress,
  onClose,
  defaultOpen = true,
  variant = 'fixed',
  role = 'stakeholder',
  onRequestRunJury,
}: {
  shipmentId?: string | null;
  walletAddress?: string | null;
  onClose?: () => void;
  defaultOpen?: boolean;
  variant?: 'fixed' | 'inline';
  role?: Role;
  onRequestRunJury?: (shipmentId: string) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionSuggestion, setActionSuggestion] = useState<{ action: string; shipmentId: string } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  const greeting = useMemo(() => {
    if (role === 'supplier') {
      return (
        "I'm NaviBot. Your reputation score appears in Supplier view (on-chain, often around 55/100 after the Delhi demo). " +
        'SHIP_DELHI_003 settled — about 2 ALGO was released to the supplier. SHIP_CHEN_002 is disputed with payment frozen.'
      );
    }
    return (
      "I'm NaviBot. The demo often shows about 5 ALGO across active escrows; SHIP_CHEN_002 is disputed with about 3 ALGO frozen. " +
      'Want a verdict on SHIP_MUMBAI_001? Click [Run AI Jury] on its card.'
    );
  }, [role]);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: greeting }]);
  }, [greeting]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || pending) return;
      setInput('');
      setActionSuggestion(null);
      setMessages((prev) => trimMessages([...prev, { role: 'user', content: t }]));
      setIsTyping(true);
      setPending(true);
      const historyForApi: NavibotHistoryItem[] = messagesRef.current.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await askNavibot({
          query: t,
          history: historyForApi,
          shipment_id: shipmentId ?? undefined,
          wallet_address: walletAddress?.trim() || readStoredWalletAddress(),
          role,
        });
        const raw = (res.text || res.reply || '').trim();
        const assistant = sanitizeAssistantText(raw);
        setIsTyping(false);
        setMessages((prev) => trimMessages([...prev, { role: 'assistant', content: assistant }]));
        const act = res.action ?? null;
        const sid = (res.shipment_id || '').trim();
        if (act && sid && (act === 'run_jury' || act === 'verify')) {
          setActionSuggestion({ action: act, shipmentId: sid });
        }
      } catch {
        setIsTyping(false);
        setMessages((prev) =>
          trimMessages([...prev, { role: 'assistant', content: SOFT_CATCH }]),
        );
      } finally {
        setPending(false);
      }
    },
    [pending, shipmentId, walletAddress, role],
  );

  const onRunJuryClick = useCallback(() => {
    if (!actionSuggestion || actionSuggestion.action !== 'run_jury') return;
    const sid = actionSuggestion.shipmentId;
    if (onRequestRunJury) {
      onRequestRunJury(sid);
      return;
    }
    try {
      sessionStorage.setItem('navi_pending_jury', sid);
    } catch {
      /* ignore */
    }
    navigate('/');
  }, [actionSuggestion, onRequestRunJury, navigate]);

  const onVerifyClick = useCallback(() => {
    if (!actionSuggestion || actionSuggestion.action !== 'verify') return;
    navigate(`/verify/${encodeURIComponent(actionSuggestion.shipmentId)}`);
  }, [actionSuggestion, navigate]);

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
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(6,182,212,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bot size={26} />
      </button>
    );
  }

  const fixed = variant === 'fixed';

  const quickPills = [
    'Why is Chennai frozen?',
    'Run jury on Mumbai',
    'How does the AI jury work?',
    'Show me the settled shipment',
  ];

  return (
    <aside
      ref={(el) => {
        panelRef.current = el;
      }}
      style={{
        position: fixed ? 'fixed' : 'relative',
        right: fixed ? 20 : 'auto',
        bottom: fixed ? 24 : 'auto',
        width: fixed ? 360 : '100%',
        maxWidth: fixed ? 'min(360px, calc(100vw - 40px))' : 440,
        maxHeight: fixed ? 'min(520px, calc(100vh - 120px))' : 'min(560px, 72vh)',
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
          <div style={{ width: 44, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <RobotAvatar processing={pending} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>NaviBot</div>
            <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>Navi-Trust assistant</div>
          </div>
        </div>
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

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 140 }}
      >
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
              lineHeight: 1.45,
            }}
          >
            {m.content}
          </div>
        ))}
        {isTyping ? (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: 10,
              background: '#f1f5f9',
              fontSize: '0.78rem',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <TypingDots />
            <span>NaviBot is thinking…</span>
          </div>
        ) : null}
      </div>

      {actionSuggestion ? (
        <div style={{ padding: '0 12px 8px' }}>
          {actionSuggestion.action === 'run_jury' ? (
            <button
              type="button"
              className="primary-btn"
              onClick={onRunJuryClick}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: '0.78rem',
                padding: '10px 12px',
              }}
            >
              <Play size={14} /> Run jury on {actionSuggestion.shipmentId} →
            </button>
          ) : null}
          {actionSuggestion.action === 'verify' ? (
            <button
              type="button"
              onClick={onVerifyClick}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: '0.78rem',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2563eb',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Search size={14} /> View {actionSuggestion.shipmentId} on Verify →
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 8px' }}>
        {quickPills.map((p) => (
          <button
            key={p}
            type="button"
            disabled={pending}
            onClick={() => void sendMessage(p)}
            style={{
              fontSize: '0.68rem',
              padding: '5px 8px',
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #e2e8f0', alignItems: 'center' }}>
        <MessageSquare size={16} color="#94a3b8" aria-hidden />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !pending && void sendMessage(input)}
          placeholder="Ask NaviBot…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
        />
        <button type="button" className="primary-btn" disabled={pending || !input.trim()} onClick={() => void sendMessage(input)}>
          {pending ? '…' : 'Send'}
        </button>
      </div>
    </aside>
  );
}
