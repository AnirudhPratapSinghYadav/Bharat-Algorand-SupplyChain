/**
 * Executive PDF — warm Pramanik branding, settlement pipeline, jury trend, shipment ledger.
 */

export type PdfShipmentRow = {
    shipment_id: string;
    origin?: string;
    destination?: string;
    stage?: string;
    funds_usd?: number | null;
};

export type PdfStats = {
    total_shipments?: number;
    escrow_total_algo?: number;
    total_disputed?: number;
    total_settled?: number;
    active_shipments?: number;
    verified_anomalies?: number;
    total_scans?: number;
};

export type PdfRiskPoint = {
    shipment_id: string;
    score: number;
    verdict: string;
    timestamp: string;
};

const BRAND = { r: 193, g: 116, b: 53 };
const INK = { r: 26, g: 26, b: 26 };
const MUTED = { r: 107, g: 101, b: 96 };

const JURY_PIPELINE = [
    'Escrow lock — buyer funds the NaviTrust smart contract; neither party can withdraw unilaterally.',
    'Signal ingest — weather (Stormglass), route, and customs-aligned evidence are attached to the corridor.',
    'Sentinel & auditor — risk agents score delay, fraud patterns, and document consistency.',
    'Verdict hash — Gemini jury output is SHA-256 hashed and written to the Algorand transaction note.',
    'Settlement — atomic release to exporter or hold; ARC-69 certificate minted for audit packs.',
];

function countByStage(shipments: PdfShipmentRow[]): { label: string; count: number }[] {
    const m = new Map<string, number>();
    for (const s of shipments) {
        const k = (s.stage || 'Unknown').trim() || 'Unknown';
        m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
}

function drawBarChart(
    doc: import('jspdf').jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    items: { label: string; count: number }[],
) {
    if (items.length === 0) return y + h + 8;
    const max = Math.max(1, ...items.map((i) => i.count));
    const n = Math.min(items.length, 8);
    const slice = items.slice(0, n);
    const gap = 3;
    const barW = (w - gap * (n - 1)) / n;
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text('Shipment stages (count)', x, y - 2);
    slice.forEach((it, i) => {
        const bx = x + i * (barW + gap);
        const bh = (it.count / max) * (h - 10);
        doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
        doc.rect(bx, y + h - 10 - bh, barW - 1, bh, 'F');
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.setFontSize(6);
        const lab = it.label.length > 10 ? `${it.label.slice(0, 9)}…` : it.label;
        doc.text(lab, bx, y + h - 2, { maxWidth: barW });
        doc.setFontSize(7);
        doc.setTextColor(INK.r, INK.g, INK.b);
        doc.text(String(it.count), bx + barW / 2 - 2, y + h - 14 - bh);
    });
    return y + h + 12;
}

function drawRiskLineChart(
    doc: import('jspdf').jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    points: PdfRiskPoint[],
) {
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text('AI jury risk scores (chronological)', x, y - 2);
    if (points.length < 2) {
        doc.setFontSize(9);
        doc.text('Plot appears after two or more jury runs in the audit trail.', x, y + h / 2);
        return y + h + 12;
    }
    const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const pad = 4;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    doc.setDrawColor(232, 224, 213);
    doc.rect(x, y, w, h);
    const scores = sorted.map((p) => p.score);
    const minS = Math.min(...scores);
    const maxS = Math.max(...scores);
    const range = Math.max(1, maxS - minS);
    doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
    for (let i = 0; i < sorted.length - 1; i++) {
        const x1 = x + pad + (innerW * i) / (sorted.length - 1);
        const x2 = x + pad + (innerW * (i + 1)) / (sorted.length - 1);
        const y1 = y + h - pad - ((sorted[i].score - minS) / range) * innerH;
        const y2 = y + h - pad - ((sorted[i + 1].score - minS) / range) * innerH;
        doc.line(x1, y1, x2, y2);
    }
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    sorted.forEach((p, i) => {
        const px = x + pad + (innerW * i) / Math.max(1, sorted.length - 1);
        const py = y + h - pad - ((p.score - minS) / range) * innerH;
        doc.circle(px, py, 1.2, 'F');
    });
    doc.setFontSize(6);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(`min ${minS} — max ${maxS}`, x + w - 36, y + h + 4);
    return y + h + 12;
}

function drawPipeline(doc: import('jspdf').jsPDF, x: number, y: number, maxW: number): number {
    doc.setFontSize(12);
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.setFont('helvetica', 'bold');
    doc.text('Settlement pipeline (for compliance readers)', x, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(68, 64, 60);
    JURY_PIPELINE.forEach((line, i) => {
        const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, maxW - 8);
        doc.text(wrapped, x + 4, y);
        y += wrapped.length * 4.2 + 2;
    });
    return y + 6;
}

export async function downloadDashboardPdf(opts: {
    stats: PdfStats;
    shipments: PdfShipmentRow[];
    riskPoints: PdfRiskPoint[];
    appId: number | null;
    wallet: string;
    executiveSummary?: string;
    recentTransactions?: { action_plain?: string; tx_id?: string; time_ago?: string }[];
}): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 18;
    const maxW = pageW - margin * 2;
    let y = 22;

    doc.setFillColor(250, 248, 244);
    doc.rect(0, 0, pageW, 42, 'F');
    doc.setFontSize(22);
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.setFont('helvetica', 'bold');
    doc.text('pramanik', margin, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.text('Executive escrow & settlement report', margin, 26);
    y = 48;

    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(`Generated ${new Date().toLocaleString()} · Algorand Testnet`, margin, y);
    y += 5;
    doc.text(`Wallet ${opts.wallet.slice(0, 12)}…${opts.wallet.slice(-8)} · App ${opts.appId ?? '—'}`, margin, y);
    y += 10;

    doc.setFontSize(13);
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.setFont('helvetica', 'bold');
    doc.text('Portfolio summary', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(68, 64, 60);
    const lines = [
        `Registered corridors: ${opts.stats.total_shipments ?? opts.shipments.length}`,
        `ALGO locked in contract: ${opts.stats.escrow_total_algo != null ? Number(opts.stats.escrow_total_algo).toFixed(4) : '—'}`,
        `Settled globally: ${opts.stats.total_settled ?? '—'} · In dispute: ${opts.stats.total_disputed ?? '—'}`,
        `Active shipments (API): ${opts.stats.active_shipments ?? '—'}`,
        `Automated audit scans: ${opts.stats.total_scans ?? '—'} · Anomalies flagged: ${opts.stats.verified_anomalies ?? '—'}`,
    ];
    lines.forEach((line) => {
        doc.text(line, margin, y);
        y += 5;
    });
    y += 4;

    if (opts.executiveSummary) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(INK.r, INK.g, INK.b);
        doc.text('Executive summary', margin, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(68, 64, 60);
        const sumLines = doc.splitTextToSize(opts.executiveSummary, maxW);
        doc.text(sumLines, margin, y);
        y += sumLines.length * 4.5 + 8;
    }

    y = drawPipeline(doc, margin, y, maxW);

    const stageRows = countByStage(opts.shipments);
    y = drawBarChart(doc, margin, y, maxW, 36, stageRows);
    y = drawRiskLineChart(doc, margin, y, maxW, 40, opts.riskPoints);

    if (y > 230) {
        doc.addPage();
        y = 20;
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text('Shipment ledger', margin, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    const head = ['ID', 'Route', 'Stage', 'USD'];
    const col = [44, 62, 38, 26];
    let cx = margin;
    head.forEach((h, i) => {
        doc.setFont('helvetica', 'bold');
        doc.text(h, cx, y);
        cx += col[i] ?? 40;
    });
    y += 4;
    doc.setFont('helvetica', 'normal');
    const rows = opts.shipments.slice(0, 40);
    for (const s of rows) {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        cx = margin;
        const route = `${s.origin ?? '—'} → ${s.destination ?? '—'}`;
        const usd = s.funds_usd != null && Number.isFinite(s.funds_usd) ? `$${s.funds_usd.toFixed(0)}` : '—';
        doc.text(s.shipment_id.slice(0, 20), cx, y);
        cx += col[0];
        doc.text(route.slice(0, 24), cx, y);
        cx += col[1];
        doc.text((s.stage || '—').slice(0, 16), cx, y);
        cx += col[2];
        doc.text(usd, cx, y);
        y += 4.5;
    }
    if (opts.shipments.length > 40) {
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(`… ${opts.shipments.length - 40} additional corridors on the live dashboard.`, margin, y + 4);
        y += 8;
    }

    if (opts.recentTransactions && opts.recentTransactions.length > 0) {
        if (y > 220) {
            doc.addPage();
            y = 20;
        }
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Recent on-chain activity (newest first)', margin, y);
        y += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const t of opts.recentTransactions.slice(0, 15)) {
            const line = `• ${t.action_plain || 'Contract call'} — ${t.tx_id ? `${t.tx_id.slice(0, 10)}…` : '—'} — ${t.time_ago || ''}`;
            const wrapped = doc.splitTextToSize(line, maxW);
            doc.text(wrapped, margin, y);
            y += wrapped.length * 4 + 2;
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
        }
        y += 6;
    }

    if (y > 248) {
        doc.addPage();
        y = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text('Verification & wallet actions', margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(68, 64, 60);
    const foot = [
        '• Register corridor: signed by the oracle — no Pera popup.',
        '• Fund escrow / release payment: Pera Wallet must approve — funds move on-chain only after you sign.',
        '• Proof: Lora → Application → Note tab shows jury JSON; Settlement Certificate uses ARC-69 metadata.',
        `• Public verify URL: ${typeof window !== 'undefined' ? window.location.origin : ''}/verify`,
    ];
    foot.forEach((line) => {
        const wrapped = doc.splitTextToSize(line, maxW);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.5 + 2;
    });

    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text('© pramanik · Built for Indian export escrow · AlgoBharat 2025', margin, y);

    doc.save(`pramanik-executive-${new Date().toISOString().slice(0, 10)}.pdf`);
}
