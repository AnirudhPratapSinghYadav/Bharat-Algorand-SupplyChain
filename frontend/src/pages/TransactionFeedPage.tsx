import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Activity, ArrowLeft, CheckCircle, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT, loraTransactionUrl } from '../constants/api';
import { useWallet } from '../context/WalletContext';
import { useLiveTransactions } from '../hooks/useWebSocket';
import { shortAddress } from '../lib/displayLabels';
import { downloadDashboardPdf } from '../utils/buildDashboardPdf';

type DashboardTxn = {
  tx_id?: string;
  action?: string;
  action_plain?: string;
  method_name?: string;
  round?: number;
  lora_url?: string;
  timestamp?: string;
  time_ago?: string;
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function sortTxns(rows: DashboardTxn[]): DashboardTxn[] {
  return [...rows].sort((a, b) => {
    const ra = Number(a.round ?? 0);
    const rb = Number(b.round ?? 0);
    if (rb !== ra) return rb - ra;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
}

export default function TransactionFeedPage() {
  const { address: accountAddress } = useWallet();
  const [recentTxns, setRecentTxns] = useState<DashboardTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveEnterIds, setLiveEnterIds] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [stats, setStats] = useState<{ total_shipments?: number; escrow_total_algo?: number; total_settled?: number }>({});
  const [appId, setAppId] = useState<number | null>(null);
  const { payload: liveWsPayload, connected: liveWsConnected } = useLiveTransactions(!!accountAddress);

  const sortedTxns = useMemo(() => sortTxns(recentTxns), [recentTxns]);

  const refreshRecentTxns = useCallback(async (silent = false) => {
    const hasPrior = recentTxns.length > 0;
    if (!silent && !hasPrior) setLoading(true);
    else setRefreshing(true);
    try {
      const [txRes, statsRes, cfgRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 80 }, timeout: API_TIMEOUT }),
        axios.get(`${BACKEND_URL}/stats`, { timeout: API_TIMEOUT }),
        axios.get(`${BACKEND_URL}/config`, { timeout: API_TIMEOUT }),
      ]);
      if (txRes.status === 'fulfilled') {
        const d = txRes.value.data as unknown;
        const rows = Array.isArray(d)
          ? (d as DashboardTxn[])
          : Array.isArray((d as { transactions?: DashboardTxn[] })?.transactions)
            ? (d as { transactions: DashboardTxn[] }).transactions
            : [];
        setRecentTxns(sortTxns(rows.slice(0, 80)));
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data ?? {});
      if (cfgRes.status === 'fulfilled') setAppId(cfgRes.value.data?.app_id ?? null);
    } catch {
      if (!hasPrior) setRecentTxns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [recentTxns.length]);

  useEffect(() => {
    if (!accountAddress) return;
    void refreshRecentTxns();
    const id = window.setInterval(() => void refreshRecentTxns(true), 30_000);
    return () => window.clearInterval(id);
  }, [accountAddress, refreshRecentTxns]);

  useEffect(() => {
    const rows = liveWsPayload?.transactions;
    if (!Array.isArray(rows) || rows.length === 0) return;
    setRecentTxns((prev) => {
      const prevIds = new Set(prev.map((t) => t.tx_id ?? `${t.round}-${t.action}`));
      const newIds: string[] = [];
      const seen = new Set<string>();
      const merged = sortTxns([...rows, ...prev].filter((t) => {
        const id = t.tx_id ?? `${t.round}-${t.action}`;
        if (seen.has(id)) return false;
        seen.add(id);
        if (!prevIds.has(id)) newIds.push(id);
        return true;
      }));
      if (newIds.length) {
        setLiveEnterIds(new Set(newIds));
        window.setTimeout(() => setLiveEnterIds(new Set()), 600);
      }
      return merged.slice(0, 80);
    });
  }, [liveWsPayload]);

  const handlePdf = async () => {
    if (!accountAddress) return;
    setPdfBusy(true);
    try {
      const [shipRes, summaryRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/shipments`, { timeout: API_TIMEOUT }),
        axios.get<{ summary?: string }>(`${BACKEND_URL}/report/executive-summary`, { timeout: 22_000 }),
      ]);
      const shipments = shipRes.status === 'fulfilled' && Array.isArray(shipRes.value.data) ? shipRes.value.data : [];
      const executiveSummary =
        summaryRes.status === 'fulfilled' ? String(summaryRes.value.data?.summary || '') : '';
      await downloadDashboardPdf({
        stats,
        shipments,
        riskPoints: [],
        appId,
        wallet: accountAddress,
        executiveSummary,
        recentTransactions: sortedTxns.map((t) => ({
          action_plain: t.action_plain || t.action,
          tx_id: t.tx_id,
          time_ago: t.timestamp ? timeAgo(t.timestamp) : t.time_ago,
        })),
      });
    } finally {
      setPdfBusy(false);
    }
  };

  if (!accountAddress) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-container activity-page">
          <p>Connect your wallet to view transaction history.</p>
          <Link to="/">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container activity-page">
        <Link to="/" className="activity-page__back">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <header className="activity-page__header">
          <div>
            <p className="activity-page__tag">On-chain ledger</p>
            <h1 className="activity-page__title">Transaction history</h1>
            <p className="activity-page__sub">
              Newest first — every contract call for <strong>{shortAddress(accountAddress)}</strong>. Open any row on{' '}
              <strong>Lora</strong> to verify.
            </p>
          </div>
          <div className="activity-page__actions">
            <button type="button" className="primary-btn" disabled={pdfBusy} onClick={() => void handlePdf()}>
              {pdfBusy ? <Loader2 size={16} className="dash-loading-hint__spin" /> : <FileText size={16} />}
              {pdfBusy ? 'Building PDF…' : 'Download PDF report'}
            </button>
            {liveWsConnected ? (
              <span className="activity-page__live">
                <span className="activity-page__live-dot" /> Live
              </span>
            ) : (
              <span className="activity-page__poll">Updates every 30s</span>
            )}
          </div>
        </header>

        <div className="card activity-page__summary">
          <div>
            <span className="activity-page__summary-label">Corridors tracked</span>
            <strong>{stats.total_shipments ?? 0}</strong>
          </div>
          <div>
            <span className="activity-page__summary-label">Settled</span>
            <strong>{stats.total_settled ?? 0}</strong>
          </div>
          <div>
            <span className="activity-page__summary-label">Escrow held</span>
            <strong>{stats.escrow_total_algo != null ? `${Number(stats.escrow_total_algo).toFixed(4)} ALGO` : '—'}</strong>
          </div>
        </div>

        <section
          className={`card activity-feed-card${refreshing ? ' activity-feed-card--refreshing' : ''}`}
          style={{ opacity: refreshing && sortedTxns.length > 0 ? 0.92 : 1 }}
        >
          {refreshing && sortedTxns.length > 0 ? (
            <span className="async-panel__badge activity-feed-card__badge">Updating</span>
          ) : null}
          {loading && sortedTxns.length === 0 ? (
            <div className="dash-loading-hint" style={{ marginTop: 0, boxShadow: 'none', border: 'none' }}>
              <Loader2 size={22} className="dash-loading-hint__spin" aria-hidden />
              <div>
                <p className="dash-loading-hint__title">Loading ledger</p>
                <p className="dash-loading-hint__msg">Fetching the latest on-chain transactions from Algorand…</p>
              </div>
            </div>
          ) : sortedTxns.length === 0 ? (
            <p className="activity-feed-empty">
              No contract transactions yet. Register a corridor, then deposit escrow from the dashboard.
            </p>
          ) : (
            <ul className="activity-feed-list">
              {sortedTxns.map((t) => {
                const rowKey = t.tx_id ?? `tx-${t.round}-${t.action}`;
                const enter = t.tx_id && liveEnterIds.has(t.tx_id);
                return (
                <li
                  key={rowKey}
                  className={`activity-feed-row${enter ? ' live-tx-enter' : ''}`}
                >
                  <div className="activity-feed-row__main">
                    <Activity size={16} className="activity-feed-row__icon" aria-hidden />
                    <div className="activity-feed-row__text">
                      <span className="activity-feed-row__action">
                        {t.action_plain || t.action || t.method_name || 'Contract call'}
                      </span>
                      {t.tx_id ? (
                        <span className="activity-feed-row__tx" title={t.tx_id}>
                          {t.tx_id.slice(0, 10)}…{t.tx_id.slice(-8)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="activity-feed-row__meta">
                    {t.tx_id ? (
                      <a
                        href={t.lora_url || loraTransactionUrl(t.tx_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="activity-feed-row__lora"
                      >
                        Verify on Lora <ExternalLink size={12} />
                      </a>
                    ) : null}
                    <span className="activity-feed-row__time">
                      {t.timestamp ? timeAgo(t.timestamp) : t.time_ago || (t.round != null ? `Round ${t.round}` : '—')}
                    </span>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </section>

        <p className="activity-page__hint">
          <CheckCircle size={14} aria-hidden /> Deposits and releases that need your signature open in <strong>Pera Wallet</strong>.
        </p>
      </div>
    </div>
  );
}
