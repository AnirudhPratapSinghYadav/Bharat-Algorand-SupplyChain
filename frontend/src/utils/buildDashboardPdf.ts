/**
 * Client-side executive PDF: stats, stage distribution chart, jury risk plot, shipment table.
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
    doc.setTextColor(100, 116, 139);
    doc.text('Shipment stages (count)', x, y - 2);
    slice.forEach((it, i) => {
        const bx = x + i * (barW + gap);
        const bh = (it.count / max) * (h - 10);
        doc.setFillColor(0, 194, 255);
        doc.rect(bx, y + h - 10 - bh, barW - 1, bh, 'F');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(6);
        const lab = it.label.length > 10 ? `${it.label.slice(0, 9)}…` : it.label;
        doc.text(lab, bx, y + h - 2, { maxWidth: barW });
        doc.setFontSize(7);
        doc.setTextColor(30, 41, 59);
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
    doc.setTextColor(100, 116, 139);
    doc.text('AI jury risk scores (chronological)', x, y - 2);
    if (points.length < 2) {
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text('Need at least two verdicts in audit trail to plot a trend.', x, y + h / 2);
        return y + h + 12;
    }
    const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const pad = 4;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    doc.setDrawColor(51, 65, 85);
    doc.rect(x, y, w, h);
    const scores = sorted.map((p) => p.score);
    const minS = Math.min(...scores);
    const maxS = Math.max(...scores);
    const range = Math.max(1, maxS - minS);
    doc.setDrawColor(0, 194, 255);
    for (let i = 0; i < sorted.length - 1; i++) {
        const x1 = x + pad + (innerW * i) / (sorted.length - 1);
        const x2 = x + pad + (innerW * (i + 1)) / (sorted.length - 1);
        const y1 = y + h - pad - ((sorted[i].score - minS) / range) * innerH;
        const y2 = y + h - pad - ((sorted[i + 1].score - minS) / range) * innerH;
        doc.line(x1, y1, x2, y2);
    }
    doc.setFillColor(0, 194, 255);
    sorted.forEach((p, i) => {
        const px = x + pad + (innerW * i) / Math.max(1, sorted.length - 1);
        const py = y + h - pad - ((p.score - minS) / range) * innerH;
        doc.circle(px, py, 1.2, 'F');
    });
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(`min ${minS} — max ${maxS}`, x + w - 36, y + h + 4);
    return y + h + 12;
}

export async function downloadDashboardPdf(opts: {
    stats: PdfStats;
    shipments: PdfShipmentRow[];
    riskPoints: PdfRiskPoint[];
    appId: number | null;
    wallet: string;
}): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 18;
    let y = 22;

    doc.setFontSize(20);
    doc.setTextColor(0, 194, 255);
    doc.text('Pramanik — Executive report', margin, y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()} · Algorand TestNet`, margin, y);
    y += 6;
    doc.text(`Wallet: ${opts.wallet.slice(0, 10)}…${opts.wallet.slice(-8)}`, margin, y);
    y += 6;
    doc.text(`App ID: ${opts.appId != null ? String(opts.appId) : '—'}`, margin, y);
    y += 12;

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text('Summary', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    const lines = [
        `Total shipments (counter / ledger): ${opts.stats.total_shipments ?? opts.shipments.length}`,
        `Escrow in app (ALGO): ${opts.stats.escrow_total_algo != null ? Number(opts.stats.escrow_total_algo).toFixed(4) : '—'}`,
        `Settled / disputed (globals): ${opts.stats.total_settled ?? '—'} / ${opts.stats.total_disputed ?? '—'}`,
        `Active (API): ${opts.stats.active_shipments ?? '—'}`,
        `Audit scans (stats): ${opts.stats.total_scans ?? '—'}`,
    ];
    lines.forEach((line) => {
        doc.text(line, margin, y);
        y += 5;
    });
    y += 6;

    const stageRows = countByStage(opts.shipments);
    y = drawBarChart(doc, margin, y, pageW - margin * 2, 36, stageRows);
    y = drawRiskLineChart(doc, margin, y, pageW - margin * 2, 40, opts.riskPoints);

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text('Shipments snapshot', margin, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const head = ['ID', 'Route', 'Stage', 'Escrow USD'];
    const col = [42, 58, 36, 28];
    let cx = margin;
    head.forEach((h, i) => {
        doc.setFont('helvetica', 'bold');
        doc.text(h, cx, y);
        cx += col[i] ?? 40;
    });
    y += 4;
    doc.setFont('helvetica', 'normal');
    const rows = opts.shipments.slice(0, 35);
    for (const s of rows) {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        cx = margin;
        const route = `${s.origin ?? '—'} → ${s.destination ?? '—'}`;
        const usd = s.funds_usd != null && Number.isFinite(s.funds_usd) ? `$${s.funds_usd.toFixed(0)}` : '—';
        doc.text(s.shipment_id.slice(0, 18), cx, y);
        cx += col[0];
        doc.text(route.slice(0, 22), cx, y);
        cx += col[1];
        doc.text((s.stage || '—').slice(0, 14), cx, y);
        cx += col[2];
        doc.text(usd, cx, y);
        y += 4.5;
    }
    if (opts.shipments.length > 35) {
        doc.setTextColor(148, 163, 184);
        doc.text(`… and ${opts.shipments.length - 35} more (see dashboard).`, margin, y + 4);
    }

    y = Math.max(y, 250) + 10;
    if (y > 270) {
        doc.addPage();
        y = 20;
    }
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(
        'Proof: open any verdict on Lora → Note tab contains NAVI_VERDICT JSON. Passport/certs → ARC-69 metadata.',
        margin,
        y,
        { maxWidth: pageW - margin * 2 },
    );
    y += 10;
    doc.text(`Verify page: ${typeof window !== 'undefined' ? window.location.origin : ''}/verify`, margin, y);

    doc.save(`pramanik-executive-${new Date().toISOString().slice(0, 10)}.pdf`);
}
