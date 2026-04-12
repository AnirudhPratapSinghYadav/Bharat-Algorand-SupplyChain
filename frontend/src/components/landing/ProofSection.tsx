import { useEffect, useState } from 'react';
import axios from 'axios';
import { LANDING_IMAGES } from './landingAssets';
import { BACKEND_URL, API_TIMEOUT, FALLBACK_APP_ID, LANDING_DEMO_SHIPMENT_ID } from '../../constants/api';

type VerifyPayload = {
  shipment_id: string;
  app_id: number | null;
  network?: string;
  on_chain?: { status?: string } | Record<string, unknown>;
  on_chain_status?: string;
  latest_verdict?: {
    sentinel_score?: number;
    verdict?: string;
    tx_id?: string;
  } | null;
  total_scans?: number;
  explorer_url?: string;
};

/** Static sample when /verify is unreachable — not live ledger data. */
const DEMO_SNAPSHOT: VerifyPayload = {
  shipment_id: 'SHIP_001',
  app_id: FALLBACK_APP_ID,
  on_chain: { status: 'IN_TRANSIT' },
  on_chain_status: 'IN_TRANSIT',
  latest_verdict: { sentinel_score: 23, verdict: 'CLEAR' },
  total_scans: 4,
};

export function ProofSection() {
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<VerifyPayload | null>(null);
  /** `network` = request failed; `empty` = API ok but no shipment id to verify */
  const [loadIssue, setLoadIssue] = useState<'network' | 'empty' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let shipmentId = LANDING_DEMO_SHIPMENT_ID;
        if (!shipmentId) {
          const cfg = await axios.get(`${BACKEND_URL}/config`, { timeout: API_TIMEOUT });
          const ids = cfg.data?.shipments as string[] | undefined;
          if (ids?.length) shipmentId = ids[0];
          if (!shipmentId) {
            const rowsRes = await axios.get(`${BACKEND_URL}/shipments`, { timeout: API_TIMEOUT });
            const rows = rowsRes.data as { shipment_id?: string }[] | undefined;
            if (rows?.length && rows[0]?.shipment_id) shipmentId = rows[0].shipment_id;
          }
        }
        if (!shipmentId) {
          if (!cancelled) {
            setLiveData(null);
            setLoadIssue('empty');
          }
          return;
        }
        const res = await axios.get<VerifyPayload>(`${BACKEND_URL}/verify/${encodeURIComponent(shipmentId)}`, {
          timeout: API_TIMEOUT,
        });
        if (!cancelled) {
          setLiveData(res.data);
          setLoadIssue(null);
        }
      } catch {
        if (!cancelled) {
          setLiveData(null);
          setLoadIssue('network');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = liveData ?? DEMO_SNAPSHOT;
  const isLive = Boolean(liveData);
  const appId = view.app_id ?? FALLBACK_APP_ID;
  const loraApp = view.explorer_url || `https://lora.algokit.io/testnet/application/${appId}`;
  const oc = view.on_chain as { status?: string } | undefined;
  const chainLabel =
    (oc && typeof oc.status === 'string' ? oc.status : view.on_chain_status) || 'IN_TRANSIT';
  const score = view.latest_verdict?.sentinel_score;
  const verdict = view.latest_verdict?.verdict || '—';
  const riskDisplay = score != null ? `${score} / 100` : '—';

  return (
    <section className="nt-section" id="nt-proof" aria-labelledby="nt-proof-title">
      <h2 id="nt-proof-title" className="nt-section-title">
        See it on-chain
      </h2>
      <p className="nt-section-lead nt-proof-section-lead">
        Same shape as <code className="nt-proof-inline-code">GET /verify/&lt;shipment&gt;</code>. Numbers below are{' '}
        <strong>live from your API</strong> when the request succeeds; otherwise a fixed sample so the layout never looks empty.
      </p>
      <div className="nt-proof-mock">
        <div className="nt-proof-stage">
          <img
            className="nt-proof-stage-bg"
            src={LANDING_IMAGES.proofBg}
            alt=""
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <div className="nt-proof-stage-scrim" aria-hidden />
          <div className="nt-proof-stage-content">
            <div className="nt-proof-hud" aria-live="polite">
              <div className="nt-proof-hud-item">
                <span className="nt-proof-hud-label">Shipment ID</span>
                <span className="nt-proof-hud-value">{view.shipment_id}</span>
              </div>
              <div className="nt-proof-hud-item">
                <span className="nt-proof-hud-label">Status</span>
                <span className="nt-proof-hud-value nt-proof-hud-value--accent">{chainLabel}</span>
              </div>
              <div className="nt-proof-hud-item">
                <span className="nt-proof-hud-label">Risk score</span>
                <span className="nt-proof-hud-value">{riskDisplay}</span>
              </div>
            </div>

            <div className="nt-proof-panel">
              {loading && (
                <p className="nt-proof-sync-hint" aria-hidden>
                  Syncing live testnet data…
                </p>
              )}
              {!loading && loadIssue && !isLive ? (
                <p className="nt-proof-offline-hint" role="status">
                  {loadIssue === 'network'
                    ? 'Could not reach the API — showing a static sample. Start the backend and refresh.'
                    : 'No shipment id from /config or /shipments — set VITE_LANDING_DEMO_SHIPMENT_ID or seed the ledger.'}
                </p>
              ) : null}
              <div className="nt-proof-header">
                <div className={isLive ? 'nt-badge' : 'nt-badge nt-badge--muted'}>
                  {isLive ? 'Live · testnet' : 'Sample (offline)'}
                </div>
                <div className="nt-proof-console-label">Verification snapshot</div>
              </div>
              <div className="nt-proof-row">
                <span className="nt-proof-label">Last verdict</span>
                <span className="nt-proof-value">{verdict}</span>
              </div>
              <div className="nt-proof-row">
                <span className="nt-proof-label">Application</span>
                <span className="nt-proof-value">#{appId}</span>
              </div>
              {view.total_scans != null && (
                <div className="nt-proof-row">
                  <span className="nt-proof-label">Recorded scans</span>
                  <span className="nt-proof-value">{view.total_scans}</span>
                </div>
              )}
              <a
                href={loraApp}
                target="_blank"
                rel="noreferrer"
                className="nt-btn nt-btn--primary nt-proof-cta nt-proof-cta--link"
              >
                View on Lora →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
