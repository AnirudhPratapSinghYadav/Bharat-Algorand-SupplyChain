import { useState } from 'react';
import axios from 'axios';
import { FileText, Loader2 } from 'lucide-react';
import { BACKEND_URL } from '../constants/api';
import { downloadDashboardPdf, type PdfRiskPoint, type PdfShipmentRow, type PdfStats } from '../utils/buildDashboardPdf';

type Shipment = PdfShipmentRow;

type Stats = PdfStats;

type Props = {
    stats: Stats;
    shipments: Shipment[];
    appId: number | null;
    wallet: string;
    disabled?: boolean;
};

export function DashboardPdfReport({ stats, shipments, appId, wallet, disabled }: Props) {
    const [busy, setBusy] = useState(false);

    const handleDownload = async () => {
        setBusy(true);
        try {
            const [riskRes, summaryRes, txRes] = await Promise.allSettled([
                axios.get<{ points?: PdfRiskPoint[] }>(`${BACKEND_URL}/risk-history`, { timeout: 12_000 }),
                axios.get<{ summary?: string }>(`${BACKEND_URL}/report/executive-summary`, { timeout: 20_000 }),
                axios.get(`${BACKEND_URL}/transactions`, { params: { limit: 20 }, timeout: 12_000 }),
            ]);
            const raw =
                riskRes.status === 'fulfilled' && Array.isArray(riskRes.value.data?.points)
                    ? riskRes.value.data.points
                    : [];
            const riskPoints: PdfRiskPoint[] = raw.map((p) => ({
                shipment_id: String(p.shipment_id ?? ''),
                score: typeof p.score === 'number' ? p.score : 0,
                verdict: String(p.verdict ?? ''),
                timestamp: String(p.timestamp ?? ''),
            }));
            const executiveSummary =
                summaryRes.status === 'fulfilled' ? String(summaryRes.value.data?.summary || '') : '';
            const txData = txRes.status === 'fulfilled' ? txRes.value.data : [];
            const txRows = Array.isArray(txData) ? txData : [];
            await downloadDashboardPdf({
                stats,
                shipments,
                riskPoints,
                appId,
                wallet,
                executiveSummary,
                recentTransactions: txRows.map((t: { action_plain?: string; tx_id?: string; time_ago?: string }) => ({
                    action_plain: t.action_plain,
                    tx_id: t.tx_id,
                    time_ago: t.time_ago,
                })),
            });
        } catch {
            await downloadDashboardPdf({
                stats,
                shipments,
                riskPoints: [],
                appId,
                wallet,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="card dash-pdf-card" style={{ marginTop: 14, padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent)', marginBottom: 6 }}>
                    EXECUTIVE REPORT
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111', marginBottom: 4 }}>
                    Download PDF for stakeholders
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Portfolio summary, settlement pipeline, jury risk trend, shipment ledger, and Pera wallet signing notes.
                </p>
            </div>
            <button
                type="button"
                className="primary-btn"
                disabled={disabled || busy || !wallet}
                onClick={() => void handleDownload()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', fontWeight: 700, flexShrink: 0 }}
            >
                {busy ? <Loader2 size={18} className="dash-pdf-spin" /> : <FileText size={18} />}
                {busy ? 'Building PDF…' : 'Download PDF report'}
            </button>
            <style>{`
                .dash-pdf-spin { animation: dash-pdf-spin 0.85s linear infinite; }
                @keyframes dash-pdf-spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
