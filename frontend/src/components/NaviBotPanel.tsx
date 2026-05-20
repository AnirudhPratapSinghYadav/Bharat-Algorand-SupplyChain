/**
 * Pramanik Bot — text chat; POST /navibot. Instant role-aware greeting; last 10 messages.
 */
import { PRAMANIK_BOT_NAME } from '../constants/branding';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Bot, MessageSquare, X, Play, ExternalLink } from 'lucide-react';
import { askNavibot } from '../api';
import { BACKEND_URL } from '../constants/api';
import { ASSISTANT_STARTER_QUESTIONS, matchAssistantFaq } from '../lib/assistantFaq';
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
  /** Inside floating widget — compact chrome, no duplicate voice promo */
  embedded?: boolean;
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

function buildGreeting(
  role: Role,
  labels: Record<string, string>,
  demoIds: string[],
): string {
  const samples = demoIds.slice(0, 3).map((id) => labels[id] || id);
  const corridor = samples.length ? samples.join(' · ') : 'your registered corridors';
  if (role === 'supplier') {
    return `Your on-chain reputation drives settlement release.\nActive lanes: ${corridor}.\nAsk about escrow status or open Verify for a public proof link.`;
  }
  return `Live corridors: ${corridor}.\nOpen an in-transit shipment and tap Request Settlement Review for a recorded verdict with a Lora proof link.\nUse the Voice tab in the assistant if your server has ElevenLabs configured.`;
}

export function NaviBotPanel({
  shipmentId,
  walletAddress,
  onClose,
  defaultOpen = true,
  variant = 'fixed',
  embedded = false,
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

  const configQ = useQuery({
    queryKey: ['navibot-config'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as {
        demo_shipments?: string[];
        demo_labels?: Record<string, string>;
      },
    staleTime: 60_000,
  });

  const intro = useMemo(
    () =>
      buildGreeting(
        role,
        configQ.data?.demo_labels ?? {},
        Array.isArray(configQ.data?.demo_shipments) ? configQ.data!.demo_shipments! : [],
      ),
    [role, configQ.data],
  );

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
        let reply =
          (res.text || res.reply || '').trim() ||
          'Here is what I can share: check the dashboard cards for live escrow and shipment status.';
        const genericFallback =
          reply.startsWith('Try:') ||
          reply.includes('how does escrow work · supplier vs shipment') ||
          res.fallback === true;
        if (genericFallback) {
          const local = matchAssistantFaq(text);
          if (local) reply = local;
        }
        setLines((prev) => [...prev, { role: 'assistant' as const, text: reply, at: Date.now() }].slice(-MAX_MESSAGES));
        const act = res.action;
        const sid = (res.shipment_id || '').trim();
        if (act && sid && (act === 'run_jury' || act === 'verify')) {
          setSuggest({ action: act, shipmentId: sid });
        }
      } catch {
        const local = matchAssistantFaq(text);
        setLines((prev) =>
          [
            ...prev,
            {
              role: 'assistant' as const,
              text:
                local ||
                'The server is not reachable right now. Start the API on port 8000, or try one of the suggested questions below.',
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
      <button type="button" aria-label={`Open ${PRAMANIK_BOT_NAME}`} onClick={() => setOpen(true)} className="navibot-fab">
        <Bot size={26} />
      </button>
    );
  }

  const fixed = variant === 'fixed';
  const showQuickPills = !lines.some((l) => l.role === 'user');

  const panelClass = [
    'navibot-panel',
    fixed ? 'navibot-panel--fixed' : 'navibot-panel--inline',
    embedded ? 'navibot-panel--embedded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={panelClass} aria-label={`${PRAMANIK_BOT_NAME} chat`}>
      {!embedded ? (
        <header className="navibot-panel__head">
          <div className="navibot-panel__title">
            <Bot size={20} className="navibot-panel__icon" />
            <div>
              <div className="navibot-panel__name">{PRAMANIK_BOT_NAME}</div>
              <div className="navibot-panel__sub">Text Q&amp;A · escrow, jury, GST checks</div>
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
      ) : null}

      <div ref={listRef} className="navibot-panel__messages">
        {lines.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`navibot-bubble navibot-bubble--${m.role}`}>
            <div style={{ whiteSpace: 'pre-line' }}>{m.text}</div>
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
              <Play size={14} /> Request Settlement Review —{' '}
              {configQ.data?.demo_labels?.[suggest.shipmentId] || suggest.shipmentId}
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
          {ASSISTANT_STARTER_QUESTIONS.map((p) => (
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
