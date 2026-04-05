/**
 * NaviBot — minimal chat assistant (rebuilt).
 * Uses POST /navibot via askNavibot(). Configure GEMINI_API_KEY on the server for LLM replies;
 * otherwise the API returns rule-based fallbacks (still useful for demos).
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
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<{ action: string; shipmentId: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const intro = useMemo(
    () =>
      role === 'supplier'
        ? 'Ask about your shipments, reputation, or frozen payments. I only explain — use dashboard buttons for transactions.'
        : 'Ask about escrow, a shipment ID, or the AI jury. Use Run AI Jury / Lock ALGO on the cards — I do not sign transactions.',
    [role],
  );

  useEffect(() => {
    const seed: ChatLine = { role: 'assistant', text: intro, at: Date.now() };
    setLines([seed]);
  }, [intro]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, busy]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput('');
      setSuggest(null);
      setLines((prev) => [...prev, { role: 'user' as const, text, at: Date.now() }].slice(-MAX_MESSAGES));
      setBusy(true);
      try {
        const history = linesRef.current.slice(-6).map((m) => ({ role: m.role, content: m.text }));
        const res = await askNavibot({
          query: text,
          history,
          shipment_id: shipmentId ?? undefined,
          wallet_address: walletAddress?.trim() || readWallet(),
          role,
        });
        const reply = (res.text || res.reply || '').trim() || 'Try asking about Mumbai, Chennai, or Delhi shipments.';
        setLines((prev) => [...prev, { role: 'assistant' as const, text: reply, at: Date.now() }].slice(-MAX_MESSAGES));
        const act = res.action;
        const sid = (res.shipment_id || '').trim();
        if (act && sid && (act === 'run_jury' || act === 'verify')) {
          setSuggest({ action: act, shipmentId: sid });
        }
      } catch {
        const errLine: ChatLine = {
          role: 'assistant',
          text: 'Could not reach the server. Is the API running on your BACKEND_URL?',
          at: Date.now(),
        };
        setLines((prev) => [...prev, errLine].slice(-MAX_MESSAGES));
      } finally {
        setBusy(false);
      }
    },
    [busy, shipmentId, walletAddress, role],
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
      <button
        type="button"
        aria-label="Open NaviBot"
        onClick={() => setOpen(true)}
        className="navibot-fab"
      >
        <Bot size={26} />
      </button>
    );
  }

  const fixed = variant === 'fixed';
  const pills = ['Hi', 'How does escrow work?', 'Status of Mumbai?', 'Why is Chennai frozen?'];
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
        <button type="button" className="navibot-panel__close" onClick={() => { setOpen(false); onClose?.(); }} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div ref={listRef} className="navibot-panel__messages">
        {lines.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`navibot-bubble navibot-bubble--${m.role}`}>
            <div>{m.text}</div>
            <div className="navibot-bubble__time">{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
        {busy ? (
          <div className="navibot-bubble navibot-bubble--assistant navibot-bubble--typing">
            <span className="navibot-typing" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Thinking…
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
          {pills.map((p) => (
            <button key={p} type="button" className="navibot-pill" disabled={busy} onClick={() => void send(p)}>
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
          onKeyDown={(e) => e.key === 'Enter' && !busy && void send(input)}
          placeholder="Message…"
          className="navibot-panel__input"
        />
        <button type="button" className="navibot-btn navibot-btn--send" disabled={busy || !input.trim()} onClick={() => void send(input)}>
          Send
        </button>
      </footer>
    </aside>
  );
}
