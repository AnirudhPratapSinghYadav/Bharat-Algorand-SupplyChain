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
            const res = await axios.get<{ points?: PdfRiskPoint[] }>(`${BACKEND_URL}/risk-history`, { timeout: 12_000 });
            const raw = Array.isArray(res.data?.points) ? res.data.points : [];
            const riskPoints: PdfRiskPoint[] = raw.map((p) => ({
                shipment_id: String(p.shipment_id ?? ''),
                score: typeof p.score === 'number' ? p.score : 0,
                verdict: String(p.verdict ?? ''),
                timestamp: String(p.timestamp ?? ''),
            }));
            await downloadDashboardPdf({
                stats,
                shipments,
                riskPoints,
                appId,
                wallet,
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
        <div
            className="card"
            style={{
                marginTop: 14,
                padding: '16px 18px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.5) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
            }}
        >
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', color: '#38bdf8', marginBottom: 6 }}>
                    EXECUTIVE REPORT
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc', marginBottom: 4 }}>
                    Download PDF — stats, stage chart, jury trend, shipment table
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    Built from live dashboard data + <code style={{ fontSize: '0.7rem', color: '#a5b4fc' }}>/risk-history</code>. Share with
                    stakeholders or attach to compliance packs.
                </p>
            </div>
            <button
                type="button"
                className="primary-btn"
                disabled={disabled || busy || !wallet}
                onClick={() => void handleDownload()}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 18px',
                    fontWeight: 700,
                    flexShrink: 0,
                }}
            >
                {busy ? <Loader2 size={18} className="dash-pdf-spin" /> : <FileText size={18} />}
                {busy ? 'Building PDF…' : 'Download PDF report'}
            </button>
            <style>{`
                .dash-pdf-spin {
                    animation: dash-pdf-spin 0.85s linear infinite;
                }
                @keyframes dash-pdf-spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
