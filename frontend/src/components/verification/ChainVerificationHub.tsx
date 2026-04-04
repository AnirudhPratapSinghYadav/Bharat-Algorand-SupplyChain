import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Anchor,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Database,
  Download,
  ExternalLink,
  Layers,
  ListTree,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react';
import { BACKEND_URL } from '../../constants/api';

const LORA_ACCT = (a: string) => `https://lora.algokit.io/testnet/account/${a}`;
const LORA_APP = (id: number) => `https://lora.algokit.io/testnet/application/${id}`;
const LORA_TX = (id: string) => `https://lora.algokit.io/testnet/transaction/${id}`;
const LORA_ASSET = (id: number) => `https://lora.algokit.io/testnet/asset/${id}`;

function shortId(id: string) {
  if (!id || id.length < 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

type HubProps = {
  wallet: string;
  appId: number | null;
  lastTxId: string | null;
  /** Optional ASA ids to show indexer proof rows for (e.g. settlement certificate). */
  proofAssetIds?: number[];
  /** NaviTrust shipment id for box snapshot (dashboard context). */
  focusShipmentId?: string | null;
};

export function ChainVerificationHub({
  wallet,
  appId,
  lastTxId,
  proofAssetIds = [],
  focusShipmentId,
}: HubProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [proofLimit, setProofLimit] = useState(30);

  const healthQ = useQuery({
    queryKey: ['verification', 'health'],
    queryFn: async () => (await axios.get(`${BACKEND_URL}/verification/health`, { timeout: 8000 })).data as Record<
      string,
      unknown
    >,
    refetchInterval: 45_000,
  });

  const stateQ = useQuery({
    queryKey: ['verification', 'on-chain-state', wallet],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/verification/on-chain-state`, { params: { wallet }, timeout: 12_000 })).data as Record<
        string,
        unknown
      >,
    enabled: wallet.length >= 52,
  });

  const proofsQ = useQuery({
    queryKey: ['verification', 'wallet-proofs', wallet, proofLimit],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/verification/wallet-proofs`, { params: { wallet, limit: proofLimit }, timeout: 15_000 }))
        .data as { items?: Record<string, unknown>[]; next_tokens?: Record<string, unknown> },
    enabled: wallet.length >= 52,
  });

  const auditQ = useQuery({
    queryKey: ['verification', 'audit-trail', wallet, proofLimit],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/verification/audit-trail`, { params: { wallet, limit: proofLimit + 20 }, timeout: 15_000 }))
        .data as { entries?: Record<string, unknown>[]; next_tokens?: Record<string, unknown> },
    enabled: wallet.length >= 52,
  });

  const txQ = useQuery({
    queryKey: ['verification', 'tx', lastTxId],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/verification/tx/${encodeURIComponent(lastTxId!)}`, { timeout: 12_000 })).data as Record<
        string,
        unknown
      >,
    enabled: !!lastTxId && lastTxId.length > 20,
    refetchInterval: (q) => {
      const d = q.state.data as Record<string, unknown> | undefined;
      if (!lastTxId || !d || d.found) return false;
      return 2800;
    },
  });

  const shipmentQ = useQuery({
    queryKey: ['verification', 'shipment-box', focusShipmentId],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/verification/shipment-box`, { params: { shipment_id: focusShipmentId }, timeout: 12_000 }))
        .data as Record<string, unknown>,
    enabled: !!focusShipmentId && String(focusShipmentId).length > 2,
  });

  const asaQueries = useQuery({
    queryKey: ['verification', 'asa-batch', proofAssetIds.join(',')],
    queryFn: async () => {
      const rows = await Promise.all(
        proofAssetIds.slice(0, 8).map(async (aid) => {
          try {
            const r = await axios.get(`${BACKEND_URL}/verification/asa/${aid}`, { timeout: 8000 });
            return r.data as Record<string, unknown>;
          } catch {
            return { asset_id: aid, found: false };
          }
        }),
      );
      return rows;
    },
    enabled: proofAssetIds.length > 0,
  });

  const filteredProofs = useMemo(() => proofsQ.data?.items ?? [], [proofsQ.data?.items]);

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  };

  const health = healthQ.data;
  const algodRound = health?.algod_last_round;
  const indexerOk = health?.indexer_ok === true;
  const algodOk = health?.algod_ok === true;

  return (
    <section
      className="card"
      style={{
        marginTop: 14,
        padding: 0,
        overflow: 'hidden',
        border: '1px solid rgba(56,189,248,0.25)',
        background: 'rgba(15,23,42,0.55)',
      }}
      aria-label="Algorand ledger verification"
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          border: 'none',
          background: 'rgba(30,41,59,0.5)',
          cursor: 'pointer',
          color: '#e2e8f0',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: '0.9rem' }}>
          <Shield size={18} color="#38bdf8" /> Ledger verification hub
        </span>
        {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </button>

      {!collapsed && (
        <div style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 1–3: proofs strip + live Lora links */}
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            On-chain · Algorand TestNet
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginRight: 4 }}>Live Lora:</span>
            {wallet.length >= 52 ? (
              <a href={LORA_ACCT(wallet)} target="_blank" rel="noreferrer" style={linkPill}>
                <Anchor size={12} /> Account
              </a>
            ) : null}
            {appId ? (
              <a href={LORA_APP(appId)} target="_blank" rel="noreferrer" style={linkPill}>
                <ExternalLink size={12} /> NaviTrust app
              </a>
            ) : null}
            <a
              href={`${BACKEND_URL}/verification/arc4-dictionary`}
              target="_blank"
              rel="noreferrer"
              style={{ ...linkPill, textDecoration: 'none' }}
            >
              <ListTree size={12} /> ARC-4 map (JSON)
            </a>
            {wallet.length >= 52 ? (
              <a
                href={`${BACKEND_URL}/verification/export/bundle.json?wallet=${encodeURIComponent(wallet)}${lastTxId ? `&tx_id=${encodeURIComponent(lastTxId)}` : ''}`}
                download
                style={{ ...linkPill, textDecoration: 'none', borderColor: 'rgba(251,191,36,0.45)', color: '#fde68a' }}
              >
                <Download size={12} /> Proof bundle (JSON)
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void healthQ.refetch();
                void stateQ.refetch();
                void proofsQ.refetch();
                void auditQ.refetch();
                void txQ.refetch();
                void asaQueries.refetch();
                void shipmentQ.refetch();
              }}
              style={{
                ...linkPill,
                border: '1px solid #475569',
                background: 'transparent',
                cursor: 'pointer',
                color: '#cbd5e1',
              }}
            >
              <RefreshCw size={12} /> Retry chain reads
            </button>
          </div>

          {/* 9: health / stale honesty */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              padding: 12,
              borderRadius: 10,
              background: 'rgba(30,41,59,0.65)',
              border: '1px solid rgba(148,163,184,0.2)',
            }}
          >
            <Server size={16} color="#94a3b8" />
            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              <strong style={{ color: '#f1f5f9' }}>Nodes</strong> — Algod {algodOk ? 'ok' : 'unreachable'}
              {algodRound != null ? ` · last round ${String(algodRound)}` : ''} · Indexer {indexerOk ? 'ok' : 'slow/unreachable'}
            </span>
            {healthQ.isFetching ? <span style={{ fontSize: '0.72rem', color: '#fde68a' }}>Refreshing…</span> : null}
            {proofsQ.isError || stateQ.isError ? (
              <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>Some reads failed — use Retry.</span>
            ) : null}
          </div>

          {/* NaviTrust box snapshot (dashboard / verify context) */}
          {focusShipmentId ? (
            <div>
              <div style={secTitle}>
                <Database size={14} /> Shipment box snapshot (algod)
              </div>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '6px 0 0' }}>
                <code style={{ color: '#94a3b8' }}>{String(focusShipmentId)}</code> — same box read as <code>/verification/shipment-box</code>
              </p>
              {shipmentQ.isLoading ? (
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 10 }}>Loading box…</p>
              ) : shipmentQ.isError ? (
                <p style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: 10 }}>Could not load shipment box.</p>
              ) : (
                <pre
                  style={{
                    ...pre,
                    marginTop: 10,
                    maxHeight: 220,
                    border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  {JSON.stringify(shipmentQ.data ?? {}, null, 2)}
                </pre>
              )}
            </div>
          ) : null}

          {/* 2 + 4: last tx + atomic group */}
          {lastTxId ? (
            <div>
              <div style={secTitle}>
                <Layers size={14} /> Last signed transaction · atomic group
              </div>
              {!txQ.data?.found ? (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '8px 0 0' }}>
                  {txQ.isLoading ? 'Loading indexer…' : 'Indexer has not indexed this tx yet — retry in a few seconds.'}
                </p>
              ) : (
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const ids = ((txQ.data.group_transactions as Record<string, unknown>[]) || [])
                          .map((g) => String(g.tx_id || '').trim())
                          .filter(Boolean);
                        void copy(ids.join('\n'));
                      }}
                      style={{
                        ...linkPill,
                        border: '1px solid #475569',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#cbd5e1',
                      }}
                    >
                      <ClipboardCopy size={12} /> Copy all group tx ids
                    </button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', color: '#cbd5e1' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#94a3b8' }}>
                        <th style={th}>#</th>
                        <th style={th}>Tx (short)</th>
                        <th style={th}>Type</th>
                        <th style={th}>Round</th>
                        <th style={th}>Method / note</th>
                        <th style={th}>Lora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((txQ.data.group_transactions as Record<string, unknown>[]) || []).map((g, i) => (
                        <tr key={String(g.tx_id)} style={{ borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                          <td style={td}>{i + 1}</td>
                          <td style={td}>
                            <code>{shortId(String(g.tx_id || ''))}</code>
                            <button
                              type="button"
                              aria-label="Copy tx id"
                              onClick={() => void copy(String(g.tx_id))}
                              style={iconBtn}
                            >
                              <ClipboardCopy size={12} />
                            </button>
                          </td>
                          <td style={td}>{String(g.type ?? '—')}</td>
                          <td style={td}>{g.round != null ? String(g.round) : '—'}</td>
                          <td style={td}>
                            {String(g.method_label ?? '—')}
                            {g.amount_microalgo != null ? ` · ${(Number(g.amount_microalgo) / 1e6).toFixed(4)} A` : ''}
                          </td>
                          <td style={td}>
                            {g.tx_id ? (
                              <a href={LORA_TX(String(g.tx_id))} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>
                                Open
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {txQ.data.group_id ? (
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 8 }}>Group id (base64): {String(txQ.data.group_id).slice(0, 24)}…</div>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>Sign a transaction to see atomic group members and per-tx Lora links here.</p>
          )}

          {/* 4: on-chain state panel */}
          <div>
            <div style={secTitle}>
              <Database size={14} /> On-chain state (algod)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 10 }}>
              <div style={stateBox}>
                <div style={stateBoxTitle}>NaviTrust app</div>
                <pre style={pre}>{JSON.stringify(stateQ.data?.navitrust ?? {}, null, 2)}</pre>
              </div>
            </div>
          </div>

          {/* 5: ASA proof */}
          {proofAssetIds.length ? (
            <div>
              <div style={secTitle}>
                <Shield size={14} /> ASA proof (certificates / assets)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {(asaQueries.data ?? []).map((row) => (
                  <div key={String(row.asset_id)} style={{ ...stateBox, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                        {String(row.name ?? 'ASA')} · #{String(row.asset_id)}
                      </span>
                      {row.found ? (
                        <a href={LORA_ASSET(Number(row.asset_id))} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', fontSize: '0.75rem' }}>
                          Lora asset
                        </a>
                      ) : null}
                    </div>
                    {row.found ? (
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
                        Creator: <code>{String(row.creator ?? '').slice(0, 10)}…</code> · total {String(row.total)} · decimals {String(row.decimals)}
                        <br />
                        Freeze: {String(row.freeze ?? '—')} · Clawback: {String(row.clawback ?? '—')} · Manager: {String(row.manager ?? '—').slice(0, 8)}…
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Not found on indexer yet.</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 11 + 10: wallet proofs + export */}
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={secTitle}>
                <ListTree size={14} /> My on-chain receipts (this wallet)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <a
                  href={`${BACKEND_URL}/verification/export/wallet-proofs.json?wallet=${encodeURIComponent(wallet)}`}
                  download
                  style={{ ...linkPill, textDecoration: 'none' }}
                >
                  <Download size={12} /> JSON
                </a>
                <a
                  href={`${BACKEND_URL}/verification/export/wallet-proofs.csv?wallet=${encodeURIComponent(wallet)}`}
                  download
                  style={{ ...linkPill, textDecoration: 'none' }}
                >
                  <Download size={12} /> CSV
                </a>
              </div>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 10 }}>
              {filteredProofs.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                      <th style={th}>App</th>
                      <th style={th}>Round</th>
                      <th style={th}>Tx</th>
                      <th style={th}>Type / method</th>
                      <th style={th}>ARC-4</th>
                      <th style={th}>µA</th>
                      <th style={th}>Lora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProofs.map((p) => (
                      <tr key={String(p.tx_id)} style={{ borderTop: '1px solid rgba(148,163,184,0.12)' }}>
                        <td style={td}>{String(p.domain_app ?? '—')}</td>
                        <td style={td}>{p.round != null ? String(p.round) : '—'}</td>
                        <td style={td}>
                          <code>{shortId(String(p.tx_id ?? ''))}</code>
                        </td>
                        <td style={td}>
                          {String(p.type ?? '')} {p.method_label ? `· ${String(p.method_label)}` : ''}
                        </td>
                        <td style={td}>
                          <code style={{ fontSize: '0.65rem' }}>{p.arc4_method != null ? String(p.arc4_method) : '—'}</code>
                        </td>
                        <td style={td}>{p.amount_microalgo != null ? String(p.amount_microalgo) : '—'}</td>
                        <td style={td}>
                          {p.tx_id ? (
                            <a href={LORA_TX(String(p.tx_id))} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>
                              Tx
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>No matching indexer rows yet.</p>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
              {proofLimit < 60 ? (
                <button
                  type="button"
                  onClick={() => setProofLimit((n) => Math.min(n + 25, 60))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(56,189,248,0.4)',
                    background: 'rgba(56,189,248,0.1)',
                    color: '#7dd3fc',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  Load more receipts (limit {proofLimit} → {Math.min(proofLimit + 25, 60)})
                </button>
              ) : null}
              {proofsQ.data?.next_tokens && Object.values(proofsQ.data.next_tokens).some((v) => v != null && String(v).length > 0) ? (
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                  Indexer cursors:{' '}
                  <code style={{ color: '#94a3b8' }}>{JSON.stringify(proofsQ.data.next_tokens)}</code>
                </span>
              ) : null}
            </div>
          </div>

          {/* 6: method audit */}
          <div>
            <div style={secTitle}>
              <ListTree size={14} /> Method-level audit (ARC-4 selector hints)
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
              {(auditQ.data?.entries ?? []).length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', color: '#cbd5e1' }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                      <th style={th}>Round</th>
                      <th style={th}>App</th>
                      <th style={th}>Method</th>
                      <th style={th}>ARC-4</th>
                      <th style={th}>Selector</th>
                      <th style={th}>On-complete</th>
                      <th style={th}>Lora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditQ.data?.entries ?? []).map((e) => (
                      <tr key={`${String(e.tx_id)}-${String(e.round)}`} style={{ borderTop: '1px solid rgba(148,163,184,0.1)' }}>
                        <td style={td}>{e.round != null ? String(e.round) : '—'}</td>
                        <td style={td}>{String(e.domain_app ?? '')}</td>
                        <td style={td}>{String(e.method_label ?? '')}</td>
                        <td style={td}>
                          <code style={{ fontSize: '0.62rem' }}>{e.arc4_method != null ? String(e.arc4_method) : '—'}</code>
                        </td>
                        <td style={td}>
                          <code>{String(e.method_selector_hex ?? '—')}</code>
                        </td>
                        <td style={td}>{String(e.on_completion ?? '—')}</td>
                        <td style={td}>
                          {e.tx_id ? (
                            <a href={LORA_TX(String(e.tx_id))} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>
                              Tx
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: '0.76rem', color: '#64748b', margin: 0 }}>No application calls indexed for this wallet yet.</p>
              )}
            </div>
            {auditQ.data?.next_tokens && Object.values(auditQ.data.next_tokens).some((v) => v != null && String(v).length > 0) ? (
              <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 8 }}>
                Audit cursors: <code style={{ color: '#94a3b8' }}>{JSON.stringify(auditQ.data.next_tokens)}</code>
              </div>
            ) : null}
          </div>

          <p style={{ fontSize: '0.68rem', color: '#64748b', margin: 0, lineHeight: 1.45 }}>
            <strong style={{ color: '#94a3b8' }}>Off-chain</strong> UI (AI jury, DB shipment rows, simulated sensor ticks) is labeled elsewhere on the dashboard.
            This hub is <strong style={{ color: '#94a3b8' }}>ledger-only</strong> via your API’s algod/indexer reads.
          </p>
        </div>
      )}
    </section>
  );
}

const linkPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid rgba(56,189,248,0.35)',
  fontSize: '0.72rem',
  color: '#7dd3fc',
  textDecoration: 'none',
};

const secTitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const stateBox: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: 'rgba(15,23,42,0.75)',
  border: '1px solid rgba(148,163,184,0.2)',
};

const stateBoxTitle: CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#7dd3fc',
  marginBottom: 8,
};

const pre: CSSProperties = {
  margin: 0,
  fontSize: '0.65rem',
  color: '#cbd5e1',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 200,
  overflow: 'auto',
};

const th: CSSProperties = { padding: '6px 8px 6px 0', fontWeight: 600 };
const td: CSSProperties = { padding: '6px 8px 6px 0', verticalAlign: 'top' };
const iconBtn: CSSProperties = {
  marginLeft: 6,
  padding: 2,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: '#94a3b8',
  verticalAlign: 'middle',
};
