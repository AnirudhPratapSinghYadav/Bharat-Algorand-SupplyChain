import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../constants/api';
import './elevenlabs-convai.css';

type ConvaiConfig = {
  agent_id?: string | null;
  signed_url?: string | null;
  enabled?: boolean;
};

type Props = {
  /** Override agent id (else from API / Vite env). */
  agentId?: string | null;
  shipmentId?: string | null;
  walletAddress?: string | null;
  className?: string;
  title?: string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'agent-id'?: string;
          'signed-url'?: string;
          'dynamic-variables'?: string;
        },
        HTMLElement
      >;
    }
  }
}

const WIDGET_SCRIPT = 'https://elevenlabs.io/convai-widget/index.js';

let scriptPromise: Promise<void> | null = null;

function loadConvaiScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${WIDGET_SCRIPT}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = WIDGET_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ElevenLabs ConvAI widget'));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export function ElevenLabsConvaiWidget({
  agentId: agentIdProp,
  shipmentId,
  walletAddress,
  className,
  title = 'Voice oracle assistant',
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<ConvaiConfig | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envAgent = (import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined)?.trim() || '';

  useEffect(() => {
    axios
      .get(`${BACKEND_URL}/elevenlabs/config`, { timeout: 8000 })
      .then((r) => setCfg(r.data as ConvaiConfig))
      .catch(() => setCfg({ enabled: !!envAgent, agent_id: envAgent || null }));
  }, [envAgent]);

  const resolvedAgentId = (agentIdProp || cfg?.agent_id || envAgent || '').trim();
  const signedUrl = (cfg?.signed_url || '').trim();
  const enabled = cfg?.enabled !== false && !!(resolvedAgentId || signedUrl);

  useEffect(() => {
    if (!enabled) return;
    loadConvaiScript()
      .then(() => setScriptReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : 'Widget load failed'));
  }, [enabled]);

  useEffect(() => {
    if (!scriptReady || !enabled || !hostRef.current) return;
    hostRef.current.innerHTML = '';
    const el = document.createElement('elevenlabs-convai');
    if (signedUrl) {
      el.setAttribute('signed-url', signedUrl);
    } else if (resolvedAgentId) {
      el.setAttribute('agent-id', resolvedAgentId);
    }
    const vars: Record<string, string> = {};
    if (shipmentId) vars.shipment_id = shipmentId;
    if (walletAddress) vars.wallet_address = walletAddress.slice(0, 12);
    vars.product = 'Pramanik Oracle';
    if (Object.keys(vars).length > 0) {
      el.setAttribute('dynamic-variables', JSON.stringify(vars));
    }
    hostRef.current.appendChild(el);
  }, [scriptReady, enabled, resolvedAgentId, signedUrl, shipmentId, walletAddress]);

  if (!enabled) {
    return (
      <div className={`el-convai el-convai--disabled ${className || ''}`}>
        <p className="el-convai__hint">
          Voice agent not configured. Set <code>ELEVENLABS_AGENT_ID</code> or <code>VITE_ELEVENLABS_AGENT_ID</code> in
          .env.
        </p>
      </div>
    );
  }

  return (
    <div className={`el-convai ${className || ''}`}>
      <div className="el-convai__head">
        <span className="el-convai__title">{title}</span>
        <span className="el-convai__badge">ElevenLabs</span>
      </div>
      {shipmentId ? (
        <p className="el-convai__ctx">
          Context: shipment <code>{shipmentId}</code>
        </p>
      ) : null}
      {error ? <p className="el-convai__error">{error}</p> : null}
      <div ref={hostRef} className="el-convai__host" aria-label="ElevenLabs voice assistant" />
      {!scriptReady && !error ? <p className="el-convai__loading">Loading voice assistant…</p> : null}
    </div>
  );
}
