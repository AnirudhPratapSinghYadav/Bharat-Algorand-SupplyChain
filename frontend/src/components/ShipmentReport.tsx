import { useState } from 'react';

type ShipmentLike = {
    shipment_id: string;
    origin: string;
    destination: string;
    stage: string;
    last_jury?: { chief_justice?: { reasoning_narrative?: string; judgment?: string; trigger_contract?: boolean }; sentinel?: { risk_score?: number } };
    on_chain?: { funds_microalgo?: number };
};

type Props = {
    shipment: ShipmentLike;
    appId: number | null;
    verifyBaseUrl?: string;
};

const DEFAULT_VERIFY = 'https://navitrustapp.vercel.app/verify';

export function ShipmentReportActions({ shipment, appId, verifyBaseUrl = DEFAULT_VERIFY }: Props) {
    const [copied, setCopied] = useState(false);

    const risk =
        typeof shipment.last_jury?.sentinel?.risk_score === 'number' ? shipment.last_jury!.sentinel!.risk_score! : null;
    const fundsAlgo =
        typeof shipment.on_chain?.funds_microalgo === 'number' ? shipment.on_chain!.funds_microalgo! / 1e6 : null;
    const verdictJson =
        shipment.last_jury != null
            ? JSON.stringify({
                  verdict: shipment.last_jury.chief_justice?.trigger_contract ? 'APPROVED' : 'REJECTED',
                  reasoning: shipment.last_jury.chief_justice?.reasoning_narrative || shipment.last_jury.chief_justice?.judgment,
              })
            : '';

    async function downloadPDF() {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.setTextColor(0, 194, 255);
        doc.text('NAVI-TRUST', 20, 20);
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text('Supply Chain Verification Report', 20, 30);
        doc.setDrawColor(0, 194, 255);
        doc.line(20, 35, 190, 35);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.text('Shipment Details', 20, 50);
        doc.setFontSize(11);
        doc.text(`ID: ${shipment.shipment_id}`, 20, 62);
        doc.text(`Route: ${shipment.origin} → ${shipment.destination}`, 20, 72);
        doc.text(`Status: ${shipment.stage}`, 20, 82);
        doc.text(`Risk Score: ${risk != null ? `${risk}/100` : 'N/A'}`, 20, 92);
        doc.text(`Funds Locked: ${fundsAlgo != null ? `${fundsAlgo.toFixed(4)} ALGO` : 'N/A'}`, 20, 102);
        doc.setFontSize(14);
        doc.text('Blockchain Proof', 20, 120);
        doc.setFontSize(11);
        doc.text(`App ID: ${appId ?? 'N/A'}`, 20, 132);
        doc.text('Network: Algorand Testnet', 20, 142);
        doc.text('Source: Algorand box storage', 20, 152);
        if (verdictJson) {
            doc.setFontSize(14);
            doc.text('AI Verdict', 20, 170);
            doc.setFontSize(11);
            try {
                const v = JSON.parse(verdictJson) as { verdict?: string; reasoning?: string };
                doc.text(`Decision: ${v.verdict ?? '—'}`, 20, 182);
                const r = (v.reasoning ?? '').slice(0, 120);
                doc.text(`Reasoning: ${r}${(v.reasoning ?? '').length > 120 ? '…' : ''}`, 20, 192);
            } catch {
                doc.text('Reasoning: (see dashboard)', 20, 182);
            }
        }
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(
            `Generated: ${new Date().toISOString()} | ${verifyBaseUrl}/${shipment.shipment_id}`,
            20,
            280,
        );
        doc.save(`navi-trust-${shipment.shipment_id}.pdf`);
    }

    const shareWhatsApp = () => {
        const verifyUrl = `${verifyBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(shipment.shipment_id)}`;
        const text = `Navi-Trust Shipment Proof\n\nShipment: ${shipment.shipment_id}\nRoute: ${shipment.origin} → ${shipment.destination}\nStatus: ${shipment.stage}\nRisk: ${risk != null ? `${risk}/100` : 'N/A'}\n\nVerify:\n${verifyUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    };

    const copyLink = async () => {
        const url = `${verifyBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(shipment.shipment_id)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button type="button" className="primary-btn" style={{ fontSize: '0.72rem', padding: '6px 10px' }} onClick={() => void downloadPDF()}>
                Download report (PDF)
            </button>
            <button
                type="button"
                style={{
                    fontSize: '0.72rem',
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #22c55e',
                    background: 'rgba(34,197,94,0.12)',
                    color: '#166534',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
                onClick={shareWhatsApp}
            >
                Share on WhatsApp
            </button>
            <button
                type="button"
                style={{
                    fontSize: '0.72rem',
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #94a3b8',
                    background: '#fff',
                    color: '#334155',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
                onClick={() => void copyLink()}
            >
                {copied ? 'Copied' : 'Copy verify link'}
            </button>
        </div>
    );
}
