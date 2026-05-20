import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../constants/api';
import './elevenlabs-convai.css';

type ConvaiConfig = {
  agent_id?: string | null;
  signed_url?: string | null;
  enabled?: boolean;
  tts_configured?: boolean;
};

type Props = {
  shipmentContextLabel?: string | null;
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
  shipmentContextLabel,
  shipmentId,
  walletAddress,
  className,
  title = 'Speak or type your question',
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<ConvaiConfig | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${BACKEND_URL}/elevenlabs/config`, { timeout: 12000 })
      .then((r) => {
        setCfg(r.data as ConvaiConfig);
        setError(null);
      })
      .catch(() => {
        setCfg({ enabled: false });
        setError(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const resolvedAgentId = (cfg?.agent_id || '').trim();
  const signedUrl = (cfg?.signed_url || '').trim();
  const enabled = cfg?.enabled === true && !!(resolvedAgentId || signedUrl);

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
    const vars: Record<string, string> = { product: 'Pramanik Oracle' };
    if (shipmentContextLabel) vars.shipment = shipmentContextLabel;
    else if (shipmentId) vars.shipment_id = shipmentId;
    if (walletAddress) vars.wallet_address = walletAddress.slice(0, 12);
    el.setAttribute('dynamic-variables', JSON.stringify(vars));
    hostRef.current.appendChild(el);
  }, [scriptReady, enabled, resolvedAgentId, signedUrl, shipmentContextLabel, shipmentId, walletAddress]);

  if (loading) {
    return (
      <div className={`el-convai ${className || ''}`}>
        <p className="el-convai__loading">Opening trade assistant…</p>
      </div>
    );
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className={`el-convai ${className || ''}`}>
      <div className="el-convai__head">
        <span className="el-convai__title">{title}</span>
        <span className="el-convai__badge">Voice and chat</span>
      </div>
      {shipmentContextLabel ? (
        <p className="el-convai__ctx">
          Shipment: <strong>{shipmentContextLabel}</strong>
        </p>
      ) : null}
      <p className="el-convai__mic-hint">
        Ask about escrow, payment release, or how to verify a shipment. Type a question or use the microphone.
      </p>
      <div ref={hostRef} className="el-convai__host" aria-label="Trade assistant" />
      {!scriptReady && !error ? <p className="el-convai__loading">Connecting…</p> : null}
    </div>
  );
}
