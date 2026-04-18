/**
 * NaviBot — text chat; POST /navibot. Instant role-aware greeting; last 10 messages.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, MessageSquare, X, Play, ExternalLink } from 'lucide-react';
import { askNavibot } from '../api';
import './navibot.css';

type Role = 'stakeholder' | 'supplier';

type ChatLine = { role: 'user' | 'assistant'; text: string; at: number };

const MAX_MESSAGES = 10;

type Props = {
  shipmentId?: string | null;
  walletAddress?: string | null;
  onClose?: () => void;
  defaultOpen?: boolean;
  variant?: 'fixed' | 'inline';
  role?: Role;
  onRequestRunJury?: (shipmentId: string) => void;
};

function readWallet(): string | undefined {
  try {
    return sessionStorage.getItem('navi_trust_wallet')?.trim() || undefined;
  } catch {
    return undefined;
  }
}

const GREETING_STAKEHOLDER =
  'Connect your wallet to see live escrow. Ask how the 4-agent jury works, open Verify for any shipment_id, or use the dashboard cards to run AI Jury.';

const GREETING_SUPPLIER =
  'Track payments and on-chain reputation from your shipments. Ask about hashes, USD pricing, the dispute feed, or a Supplier Passport NFT.';

const QUICK_PILLS = [
  'Why is Chennai frozen?',
  'How does the 4-agent jury work?',
  'What is a jury hash?',
  'How much ALGO is at stake?',
];

export function NaviBotPanel({
  shipmentId,
  walletAddress,
  onClose,
  defaultOpen = true,
  variant = 'fixed',
  role = 'stakeholder',
  onRequestRunJury,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [suggest, setSuggest] = useState<{ action: string; shipmentId: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const intro = useMemo(() => (role === 'supplier' ? GREETING_SUPPLIER : GREETING_STAKEHOLDER), [role]);

  useEffect(() => {
    const seed: ChatLine = { role: 'assistant', text: intro, at: Date.now() };
    setLines([seed]);
  }, [intro]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, isTyping]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isTyping) return;
      setInput('');
      setSuggest(null);
      setLines((prev) => [...prev, { role: 'user' as const, text, at: Date.now() }].slice(-MAX_MESSAGES));
      setIsTyping(true);
      try {
        const history = linesRef.current.slice(-6).map((m) => ({ role: m.role, content: m.text }));
        const res = await askNavibot({
          query: text,
          history,
          shipment_id: shipmentId ?? undefined,
          wallet_address: walletAddress?.trim() || readWallet(),
          role,
        });
        const reply =
          (res.text || res.reply || '').trim() ||
          'Here is what I can share: check the dashboard cards for live escrow and shipment status.';
        setLines((prev) => [...prev, { role: 'assistant' as const, text: reply, at: Date.now() }].slice(-MAX_MESSAGES));
        const act = res.action;
        const sid = (res.shipment_id || '').trim();
        if (act && sid && (act === 'run_jury' || act === 'verify')) {
          setSuggest({ action: act, shipmentId: sid });
        }
      } catch {
        setLines((prev) =>
          [
            ...prev,
            {
              role: 'assistant' as const,
              text: 'I could not reach the assistant just now. Please try again in a moment.',
              at: Date.now(),
            },
          ].slice(-MAX_MESSAGES),
        );
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, shipmentId, walletAddress, role],
  );

  const onJury = useCallback(() => {
    if (!suggest || suggest.action !== 'run_jury') return;
    if (onRequestRunJury) {
      onRequestRunJury(suggest.shipmentId);
      return;
    }
    try {
      sessionStorage.setItem('navi_pending_jury', suggest.shipmentId);
    } catch {
      /* ignore */
    }
    navigate('/');
  }, [suggest, onRequestRunJury, navigate]);

  const onVerify = useCallback(() => {
    if (!suggest || suggest.action !== 'verify') return;
    navigate(`/verify/${encodeURIComponent(suggest.shipmentId)}`);
  }, [suggest, navigate]);

  if (!open && variant === 'fixed') {
    return (
      <button type="button" aria-label="Open NaviBot" onClick={() => setOpen(true)} className="navibot-fab">
        <Bot size={26} />
      </button>
    );
  }

  const fixed = variant === 'fixed';
  const showQuickPills = !lines.some((l) => l.role === 'user');

  return (
    <aside
      className={fixed ? 'navibot-panel navibot-panel--fixed' : 'navibot-panel navibot-panel--inline'}
      aria-label="NaviBot chat"
    >
      <header className="navibot-panel__head">
        <div className="navibot-panel__title">
          <Bot size={20} className="navibot-panel__icon" />
          <div>
            <div className="navibot-panel__name">NaviBot</div>
            <div className="navibot-panel__sub">Help &amp; shipment Q&amp;A</div>
          </div>
        </div>
        <button
          type="button"
          className="navibot-panel__close"
          onClick={() => {
            setOpen(false);
            onClose?.();
          }}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div ref={listRef} className="navibot-panel__messages">
        {lines.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`navibot-bubble navibot-bubble--${m.role}`}>
            <div>{m.text}</div>
            <div className="navibot-bubble__time">
              {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        {isTyping ? (
          <div className="navibot-bubble navibot-bubble--assistant navibot-bubble--typing" aria-busy>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : null}
      </div>

      {suggest ? (
        <div className="navibot-panel__suggest">
          {suggest.action === 'run_jury' ? (
            <button type="button" className="navibot-btn navibot-btn--primary" onClick={onJury}>
              <Play size={14} /> Open Run jury — {suggest.shipmentId}
            </button>
          ) : null}
          {suggest.action === 'verify' ? (
            <button type="button" className="navibot-btn navibot-btn--secondary" onClick={onVerify}>
              <ExternalLink size={14} /> Verify {suggest.shipmentId}
            </button>
          ) : null}
        </div>
      ) : null}

      {showQuickPills ? (
        <div className="navibot-panel__pills">
          {QUICK_PILLS.map((p) => (
            <button key={p} type="button" className="navibot-pill" disabled={isTyping} onClick={() => void send(p)}>
              {p}
            </button>
          ))}
        </div>
      ) : null}

      <footer className="navibot-panel__inputrow">
        <MessageSquare size={16} className="navibot-panel__input-icon" aria-hidden />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isTyping && void send(input)}
          placeholder="Message…"
          className="navibot-panel__input"
        />
        <button type="button" className="navibot-btn navibot-btn--send" disabled={isTyping || !input.trim()} onClick={() => void send(input)}>
          Send
        </button>
      </footer>
    </aside>
  );
}
