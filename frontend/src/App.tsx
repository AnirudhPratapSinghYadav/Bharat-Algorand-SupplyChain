import { useState, useEffect, useRef } from 'react'
import { PeraWalletConnect } from "@perawallet/connect";
import algosdk from "algosdk";
import axios from 'axios';
import {
    Shield, Activity, Cloud, AlertTriangle, ExternalLink,
    CheckCircle, Play, Terminal, X, Truck, Eye, Package,
    History, Zap, ArrowRight, Globe, Lock, BarChart3, Users, Coins, Wifi,
    User, LogOut, Search, CreditCard, Download
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import { generateShipmentReportPDF } from './ShipmentReportPDF';

const peraWallet = new PeraWalletConnect();
const BACKEND_URL = (import.meta.env.VITE_API_URL as string) || ("http://" + window.location.hostname + ":8000");
const EXPLORER_URL = "https://testnet.explorer.perawallet.app/tx/";

interface Shipment {
    shipment_id: string;
    origin: string;
    destination: string;
    lat: number;
    lon: number;
    stage: string;
    weather: any;
    logistics_events: any[];
    last_jury: any;
}

interface DialogueEntry { agent: string; message: string; }

interface JuryResult {
    shipment_id: string;
    agent_dialogue: DialogueEntry[];
    trigger_contract: boolean;
    logistics_events_used: number;
}

interface AuditTrailData {
    shipment_id: string;
    app_id: number;
    network: string;
    on_chain_status: string;
    verdicts: any[];
    total_scans: number;
}

type Role = 'stakeholder' | 'supplier';

const SIMULATE_OPTIONS = [
    { event: "GPS signal lost — carrier unreachable for 4+ hours", severity: "high" },
    { event: "Cold chain breach — temperature spike above threshold", severity: "high" },
    { event: "Port congestion — estimated 12h+ delay at customs", severity: "medium" },
];

function App() {
    const [accountAddress, setAccountAddress] = useState<string | null>(null);
    const [role, setRole] = useState<Role>('stakeholder');
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [appId, setAppId] = useState<number | null>(null);
    const [juryRunning, setJuryRunning] = useState<string | null>(null);
    const [juryResult, setJuryResult] = useState<JuryResult | null>(null);
    const [auditTrail, setAuditTrail] = useState<AuditTrailData | null>(null);
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [simulateModal, setSimulateModal] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const [isTriggering, setIsTriggering] = useState(false);
    const [stats, setStats] = useState<{ total_scans: number; verified_anomalies: number; contract_algo?: number }>({ total_scans: 0, verified_anomalies: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [verifyId, setVerifyId] = useState('');
    const [verifyResult, setVerifyResult] = useState<any>(null);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
    const [isPaying, setIsPaying] = useState<string | null>(null);
    const [landingTab, setLandingTab] = useState<'connect' | 'tracker'>('connect');
    const [riskHistory, setRiskHistory] = useState<{ time: string; score: number; shipment: string }[]>([]);
    const [boxStatuses, setBoxStatuses] = useState<Record<string, string>>({});
    const [liveFeed, setLiveFeed] = useState<{ event: string; tier: string; ts: string }[]>([]);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const chartCaptureRef = useRef<HTMLDivElement | null>(null);
    const [supplierTrustScore, setSupplierTrustScore] = useState<number | null>(null);
    const [mitigateModal, setMitigateModal] = useState<{ shipmentId: string } | null>(null);
    const [mitigateText, setMitigateText] = useState('');
    const [mitigateSubmitting, setMitigateSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [liveTelemetry, setLiveTelemetry] = useState<Record<string, { temp: number; humidity: number; vibration: number }>>({});

    /* ── Wallet reconnect on mount ─────────────────────────── */
    useEffect(() => {
        peraWallet.reconnectSession().then((accounts) => {
            if (accounts.length) setAccountAddress(accounts[0]);
        }).catch(() => {});
    }, []);

    /* ── Public Tracker: load config without wallet so verify tab works ─ */
    useEffect(() => {
        axios.get(`${BACKEND_URL}/config`).then((r) => setAppId(r.data?.app_id ?? null)).catch(() => {});
    }, []);

    /* ── Supplier: fetch On-Chain Trust Score ─ */
    useEffect(() => {
        if (!accountAddress || role !== 'supplier') return;
        axios.get(`${BACKEND_URL}/supplier-trust-score`, { params: { wallet: accountAddress } })
            .then((r) => setSupplierTrustScore(r.data?.score ?? 100))
            .catch(() => setSupplierTrustScore(100));
    }, [accountAddress, role]);

    /* ── Supplier: live telemetry fluctuation every 3s (generative monitoring) ─ */
    useEffect(() => {
        if (role !== 'supplier' || shipments.length === 0) return;
        const tick = () => {
            setLiveTelemetry(prev => {
                const next: Record<string, { temp: number; humidity: number; vibration: number }> = {};
                shipments.forEach(ship => {
                    const baseTemp = ship.weather?.temperature ?? 22;
                    const base = prev[ship.shipment_id] ?? {
                        temp: baseTemp,
                        humidity: 50 + (ship.shipment_id.length % 25),
                        vibration: 2 + (ship.shipment_id.length % 4),
                    };
                    next[ship.shipment_id] = {
                        temp: Math.round((base.temp + (Math.random() - 0.5) * 1.2) * 10) / 10,
                        humidity: Math.max(20, Math.min(95, Math.round(base.humidity + (Math.random() - 0.5) * 4))),
                        vibration: Math.max(0.5, Math.round((base.vibration + (Math.random() - 0.5) * 0.8) * 10) / 10),
                    };
                });
                return next;
            });
        };
        tick();
        const iv = setInterval(tick, 3000);
        return () => clearInterval(iv);
    }, [role, shipments]);

    /* ── Toast auto-dismiss ─ */
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    /* ── Data polling — only when wallet is connected ──────── */
    useEffect(() => {
        if (!accountAddress) { setIsLoading(false); return; }

        setIsLoading(true);

        const bootstrap = async () => {
            try {
                const [configRes, statsRes, shipmentsRes, riskRes] = await Promise.allSettled([
                    axios.get(`${BACKEND_URL}/config`),
                    axios.get(`${BACKEND_URL}/stats`),
                    axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`)),
                    axios.get(`${BACKEND_URL}/risk-history`),
                ]);
                if (configRes.status === 'fulfilled') setAppId(configRes.value.data.app_id);
                if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
                if (shipmentsRes.status === 'fulfilled') {
                    const data = shipmentsRes.value.data;
                    setShipments(data);
                    if (Array.isArray(data)) {
                        const st: Record<string, string> = {};
                        data.forEach((s: any) => { st[s.shipment_id] = s.stage || ''; });
                        setBoxStatuses(st);
                    }
                }
                if (riskRes.status === 'fulfilled' && riskRes.value.data.points?.length > 0) {
                    const pts = riskRes.value.data.points.map((p: any) => ({
                        time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        score: p.score,
                        shipment: p.shipment,
                    }));
                    setRiskHistory(pts);
                } else if (shipmentsRes.status === 'fulfilled') {
                    const initial = (shipmentsRes.value.data as Shipment[])
                        .filter((s: Shipment) => s.last_jury?.sentinel?.risk_score != null)
                        .map((s: Shipment) => ({
                            time: s.shipment_id.replace('SHIP_', '#'),
                            score: s.last_jury.sentinel.risk_score,
                            shipment: s.shipment_id,
                        }));
                    if (initial.length) setRiskHistory(initial);
                }
            } catch { /* bootstrap failed */ } finally {
                setIsLoading(false);
            }
        };
        bootstrap();

        const interval = setInterval(async () => {
            try {
                const res = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
                setShipments(res.data);
                if (res.data?.length) {
                    const st: Record<string, string> = {};
                    res.data.forEach((s: any) => { st[s.shipment_id] = s.stage || ''; });
                    setBoxStatuses(st);
                }
            } catch { /* backend offline */ }
        }, 5000);
        return () => clearInterval(interval);
    }, [accountAddress]);

    /* ── Ledger sync (5s) provides box status via /sync-ledger — single source of truth ── */

    /* ── Live Logistics Feed ticker (3s) — sync risk graph so ticker and graph stay in sync ─ */
    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await axios.get(`${BACKEND_URL}/live-feed`);
                if (!cancelled) setLiveFeed(res.data.events || []);
                const riskRes = await axios.get(`${BACKEND_URL}/risk-history`).catch(() => ({ data: { points: [] } }));
                if (!cancelled && riskRes.data?.points?.length) setRiskHistory(riskRes.data.points.map((p: any) => ({
                    time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    score: p.score,
                    shipment: p.shipment,
                })));
            } catch { /* silent */ }
        };
        poll();
        const iv = setInterval(poll, 3000);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    /* ── Wallet ─────────────────────────────────────────────── */
    const handleConnectWallet = () => {
        peraWallet.connect().then((accounts) => setAccountAddress(accounts[0])).catch(() => {});
    };
    const disconnectWallet = () => { peraWallet.disconnect(); setAccountAddress(null); };

    /* ── Run Jury ───────────────────────────────────────────── */
    const handleRunJury = async (shipmentId: string) => {
        setJuryRunning(shipmentId);
        try {
            const res = await axios.post(`${BACKEND_URL}/run-jury`, { shipment_id: shipmentId });
            setJuryResult(res.data);

            const score = res.data?.sentinel?.risk_score;
            if (typeof score === 'number') {
                const riskRes = await axios.get(`${BACKEND_URL}/risk-history`).catch(() => ({ data: { points: [] } }));
                if (riskRes.data?.points?.length > 0) {
                    setRiskHistory(riskRes.data.points.map((p: any) => ({
                        time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        score: p.score,
                        shipment: p.shipment,
                    })));
                } else {
                    setRiskHistory(prev => [
                        ...prev.slice(-19),
                        { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), score, shipment: shipmentId },
                    ]);
                }
            }

            const fresh = await axios.get(`${BACKEND_URL}/shipments`);
            setShipments(fresh.data);
            axios.get(`${BACKEND_URL}/stats`).then(r => setStats(r.data)).catch(() => {});
        } catch (e: any) {
            const detail = e.response?.data?.detail ?? e.message ?? 'Unknown error';
            const msg = typeof detail === 'string' && detail.includes('already flagged')
                ? 'This shipment is already settled on Algorand. No further action needed. Open Audit Trail to view the on-chain record.'
                : 'Jury failed: ' + detail;
            alert(msg);
        } finally {
            setJuryRunning(null);
        }
    };

    /* ── Submit Mitigation (Supplier) ───────────────────────── */
    const handleSubmitMitigation = async () => {
        if (!mitigateModal || !mitigateText.trim() || !accountAddress) return;
        setMitigateSubmitting(true);
        try {
            await axios.post(`${BACKEND_URL}/submit-mitigation`, {
                shipment_id: mitigateModal.shipmentId,
                wallet: accountAddress,
                resolution_text: mitigateText.trim(),
            });
            setMitigateText('');
            setMitigateModal(null);
            setToast('Mitigation Logged On-Chain');
            const fresh = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
            setShipments(fresh.data);
            const trustRes = await axios.get(`${BACKEND_URL}/supplier-trust-score`, { params: { wallet: accountAddress } });
            setSupplierTrustScore(trustRes.data?.score ?? null);
        } catch {
            setToast('Failed to submit mitigation');
        } finally {
            setMitigateSubmitting(false);
        }
    };

    /* ── Audit Trail ────────────────────────────────────────── */
    const handleViewAudit = async (shipmentId: string) => {
        try {
            const res = await axios.get(`${BACKEND_URL}/audit-trail/${shipmentId}`);
            setAuditTrail(res.data);
        } catch {
            alert("Audit trail fetch failed");
        }
    };

    /* ── Simulate Event ─────────────────────────────────────── */
    const handleSimulateEvent = async (shipmentId: string, event: string, severity: string) => {
        try {
            await axios.post(`${BACKEND_URL}/simulate-event`, {
                shipment_id: shipmentId,
                event,
                severity,
                wallet: accountAddress || undefined,
            });
            setSimulateModal(null);
            const fresh = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
            setShipments(fresh.data);
            if (accountAddress) {
                const trustRes = await axios.get(`${BACKEND_URL}/supplier-trust-score`, { params: { wallet: accountAddress } });
                setSupplierTrustScore(trustRes.data?.score ?? null);
            }
        } catch {
            alert("Simulate failed");
        }
    };

    /* ── Trigger Disaster (Pera Wallet) ─────────────────────── */
    const handleTriggerDisaster = async (ship: Shipment) => {
        if (!accountAddress) { alert("Connect Pera Wallet first!"); return; }
        if (!appId) { alert("APP_ID not loaded."); return; }
        setIsTriggering(true);
        try {
            const algodClient = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
            const params = await algodClient.getTransactionParams().do();
            const method = new algosdk.ABIMethod({
                name: "report_disaster_delay", args: [{ type: "string" }], returns: { type: "void" },
            });
            const atc = new algosdk.AtomicTransactionComposer();
            atc.addMethodCall({
                appID: appId, method, methodArgs: [ship.shipment_id], sender: accountAddress,
                suggestedParams: { ...params, fee: 2000, flatFee: true },
                signer: async (txGroups) => {
                    const mapped = txGroups.map((tx) => ({ txn: tx, signers: [accountAddress] }));
                    return await peraWallet.signTransaction([mapped]);
                },
            });
            const result = await atc.execute(algodClient, 3);
            setTxId(result.txIDs[0]);
            const fresh = await axios.get(`${BACKEND_URL}/shipments`);
            setShipments(fresh.data);
            axios.get(`${BACKEND_URL}/stats`).then(r => setStats(r.data)).catch(() => {});
        } catch (e: any) {
            alert("Transaction failed: " + (e.message || "Unknown error"));
        } finally {
            setIsTriggering(false);
        }
    };

    /* ── Public Verification ───────────────────────────────── */
    const handleVerify = async () => {
        if (!verifyId.trim()) return;
        setVerifyLoading(true);
        setVerifyResult(null);
        try {
            const res = await axios.get(`${BACKEND_URL}/verify/${verifyId.trim()}`);
            setVerifyResult(res.data);
        } catch {
            setVerifyResult({ error: true, shipment_id: verifyId.trim() });
        } finally {
            setVerifyLoading(false);
        }
    };

    /* ── x402 Agent Payment ────────────────────────────────── */
    const handlePayAgent = async (shipmentId: string) => {
        if (!accountAddress) return;
        setIsPaying(shipmentId);
        try {
            const res = await axios.post(`${BACKEND_URL}/pay-agent`, {
                shipment_id: shipmentId,
                payer_address: accountAddress,
            });
            setPaymentReceipt(res.data);
        } catch (e: any) {
            alert("Payment failed: " + (e.response?.data?.detail || e.message));
        } finally {
            setIsPaying(null);
        }
    };

    /* ── Download Audit Report (PDF) ──────────────────────────── */
    const handleDownloadAuditReport = async () => {
        if (!selectedShipment || !selectedShipment.last_jury) return;
        setIsGeneratingReport(true);
        let graphDataUrl: string | null = null;

        try {
            await new Promise(r => setTimeout(r, 600));
            if (chartCaptureRef.current && riskHistory.length > 0) {
                const canvas = await html2canvas(chartCaptureRef.current, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                });
                graphDataUrl = canvas.toDataURL('image/png');
            }

            const jury = selectedShipment.last_jury;
            const blob = await generateShipmentReportPDF({
                shipmentId: selectedShipment.shipment_id,
                origin: selectedShipment.origin,
                destination: selectedShipment.destination,
                txId: jury.on_chain_tx_id || null,
                confirmedRound: jury.confirmed_round ?? null,
                reasoningNarrative: jury.chief_justice?.reasoning_narrative || jury.chief_justice?.judgment || 'No verdict narrative available.',
                graphDataUrl,
                appId: appId || 0,
                timestamp: new Date().toISOString(),
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Navi-Trust-Audit-${selectedShipment.shipment_id}-${new Date().toISOString().slice(0, 10)}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('Failed to generate PDF: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setIsGeneratingReport(false);
        }
    };

    /* ── Helpers ─────────────────────────────────────────────── */
    const agentColor = (agent: string) =>
        agent === 'Logistics Sentry' ? '#d97706' : agent === 'Compliance Auditor' ? '#2563eb' : '#16a34a';

    const stageStyle = (stage: string) => {
        if (stage === 'In_Transit') return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
        if (stage === 'Delayed_Disaster') return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
        return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
    };

    /* ═══════════════════════════════════════════════════════════
       WALLET-GATED LANDING PAGE  (Split-Screen)
    ═══════════════════════════════════════════════════════════ */
    if (!accountAddress) {
        return (
            <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>

                {/* ── LEFT: Hero Image ─────────────────────────── */}
                <div style={{
                    width: '50%', position: 'relative', overflow: 'hidden',
                    backgroundColor: '#0f172a',
                }}>
                    <img
                        src="https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=1400&h=1000&fit=crop&q=80"
                        alt=""
                        onError={(e) => {
                            const t = e.currentTarget;
                            t.style.display = 'none';
                            t.parentElement!.style.background = 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 40%, #2563eb 100%)';
                        }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Dark overlay for text readability */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.15) 70%, transparent 100%)' }} />

                    {/* Top badge */}
                    <div style={{ position: 'absolute', top: 36, left: 36, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield size={20} color="#60a5fa" />
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', fontWeight: 500 }}>Algorand Testnet</span>
                    </div>

                    {/* Bottom text */}
                    <div style={{ position: 'absolute', bottom: 40, left: 36, right: 36, zIndex: 2 }}>
                        <h2 style={{ color: '#fff', fontSize: '1.65rem', fontWeight: 700, lineHeight: 1.3, margin: '0 0 10px' }}>
                            Protecting global supply chains with AI &amp; blockchain
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 20px', lineHeight: 1.6 }}>
                            Multi-agent risk assessment powered by Google Gemini, with immutable on-chain verification on Algorand.
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {['Multi-Agent AI', 'Box Storage', 'Fraud Prevention', 'Escrow Refunds'].map((tag) => (
                                <div key={tag} style={{
                                    padding: '5px 12px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 500,
                                    background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)',
                                }}>
                                    {tag}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Tabbed Panel ──────────────────────── */}
                <div style={{
                    width: '50%', background: '#ffffff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                    padding: '24px 40px 48px', overflowY: 'auto',
                }}>
                    {/* Live Feed Ticker — visible even in private window (no wallet) */}
                    {liveFeed.length > 0 && (
                        <div className="ticker-wrap" style={{ width: '100%', maxWidth: 400, marginBottom: 16 }}>
                            <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Live Logistics Feed
                            </div>
                            <div className="ticker-content" style={{ width: 'max-content' }}>
                                {[...liveFeed, ...liveFeed].map((item: any, i: number) => (
                                    <span key={i} className={`ticker-item ${item.tier || 'medium'}`}>
                                        {item.event}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ maxWidth: 400, width: '100%' }}>

                        {/* Brand */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 10, background: '#eff6ff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <Shield size={22} color="#2563eb" />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#111827' }}>Navi-Trust</h1>
                            </div>
                        </div>
                        <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 24px' }}>
                            AI-Powered Supply Chain Risk Monitor
                        </p>

                        {/* ── Tab Toggle ── */}
                        <div style={{
                            display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3,
                            marginBottom: 24, border: '1px solid #e5e7eb',
                        }}>
                            <button onClick={() => setLandingTab('connect')} style={{
                                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                background: landingTab === 'connect' ? '#fff' : 'transparent',
                                color: landingTab === 'connect' ? '#111827' : '#9ca3af',
                                boxShadow: landingTab === 'connect' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            }}>
                                <Lock size={13} /> Connect Wallet
                            </button>
                            <button onClick={() => setLandingTab('tracker')} style={{
                                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                background: landingTab === 'tracker' ? '#fff' : 'transparent',
                                color: landingTab === 'tracker' ? '#111827' : '#9ca3af',
                                boxShadow: landingTab === 'tracker' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            }}>
                                <Search size={13} /> Public Tracker
                            </button>
                        </div>

                        {/* ══════ TAB: Connect Wallet ══════ */}
                        {landingTab === 'connect' && (
                            <>
                                <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>Connect wallet</h2>
                                <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0 0 20px' }}>
                                    Connect through your wallet provider or{' '}
                                    <a href="https://perawallet.app" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Create Wallet</a>
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <button onClick={handleConnectWallet} style={{
                                        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                                        padding: '14px 16px', borderRadius: 10,
                                        background: '#fff', border: '1px solid #e5e7eb',
                                        cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#111827',
                                        transition: 'border-color 0.15s, box-shadow 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ fontSize: '1.15rem' }}>🟡</span>
                                        </div>
                                        <span>Pera Wallet</span>
                                        <ArrowRight size={16} color="#9ca3af" style={{ marginLeft: 'auto' }} />
                                    </button>

                                    <button onClick={() => {}} style={{
                                        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                                        padding: '14px 16px', borderRadius: 10,
                                        background: '#fff', border: '1px solid #e5e7eb',
                                        cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#111827',
                                        transition: 'border-color 0.15s, box-shadow 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #818cf8, #f472b6, #fb923c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.8rem' }}>D</span>
                                        </div>
                                        <span>Defly Wallet</span>
                                        <ArrowRight size={16} color="#9ca3af" style={{ marginLeft: 'auto' }} />
                                    </button>

                                    <button onClick={() => {}} style={{
                                        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                                        padding: '14px 16px', borderRadius: 10,
                                        background: '#fff', border: '1px solid #e5e7eb',
                                        cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#111827',
                                        transition: 'border-color 0.15s, box-shadow 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Globe size={18} color="#2563eb" />
                                        </div>
                                        <span>WalletConnect</span>
                                        <ArrowRight size={16} color="#9ca3af" style={{ marginLeft: 'auto' }} />
                                    </button>
                                </div>

                                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 4px' }}>
                                        New to Algorand?{' '}
                                        <a href="https://perawallet.app" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Create a wallet</a>
                                    </p>
                                    <p style={{ fontSize: '0.68rem', color: '#d1d5db', margin: 0 }}>Built on Algorand &middot; Powered by Gemini + GPT-4o</p>
                                </div>
                            </>
                        )}

                        {/* ══════ TAB: Public Tracker ══════ */}
                        {landingTab === 'tracker' && (
                            <>
                                <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>
                                    Public Verification Interface
                                </h2>
                                <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0 0 20px' }}>
                                    Verify any shipment's immutable audit trail — no wallet required.
                                </p>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="text"
                                        placeholder="Enter Shipment ID (e.g. SHIP_001)"
                                        value={verifyId}
                                        onChange={(e) => setVerifyId(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                        style={{
                                            flex: 1, padding: '10px 14px', borderRadius: 8,
                                            border: '1px solid #e5e7eb', fontSize: '0.85rem',
                                            outline: 'none', color: '#111827',
                                        }}
                                    />
                                    <button
                                        onClick={handleVerify}
                                        disabled={verifyLoading || !verifyId.trim()}
                                        style={{
                                            padding: '10px 18px', borderRadius: 8, border: 'none',
                                            background: '#2563eb', color: '#fff', fontSize: '0.85rem',
                                            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {verifyLoading ? 'Checking…' : 'Search'}
                                    </button>
                                </div>

                                {/* Results */}
                                {verifyResult && !verifyResult.error && (
                                    <div style={{ marginTop: 20 }}>
                                        {/* Status Card */}
                                        <div style={{
                                            padding: 16, borderRadius: 10, marginBottom: 12,
                                            background: verifyResult.on_chain_status === 'Delayed_Disaster' ? '#fef2f2' : '#eff6ff',
                                            border: `1px solid ${verifyResult.on_chain_status === 'Delayed_Disaster' ? '#fecaca' : '#bfdbfe'}`,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                <code style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{verifyResult.shipment_id}</code>
                                                <span style={{
                                                    fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                                                    background: verifyResult.on_chain_status === 'Delayed_Disaster' ? '#dc2626' : '#2563eb',
                                                    color: '#fff',
                                                }}>
                                                    {verifyResult.on_chain_status}
                                                </span>
                                            </div>
                                            {verifyResult.origin && (
                                                <div style={{ fontSize: '0.82rem', color: '#374151', marginBottom: 8 }}>
                                                    {verifyResult.origin} → {verifyResult.destination}
                                                </div>
                                            )}
                                            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                                                On-Chain Status (Algorand Box Storage)
                                            </div>
                                        </div>

                                        {/* Risk Score */}
                                        {verifyResult.latest_verdict && (
                                            <div style={{
                                                padding: 14, borderRadius: 10, marginBottom: 12,
                                                background: '#f9fafb', border: '1px solid #e5e7eb',
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                                    Last AI Risk Score
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                    <div style={{
                                                        fontSize: '1.5rem', fontWeight: 700,
                                                        color: verifyResult.latest_verdict.sentinel_score > 80 ? '#dc2626' : verifyResult.latest_verdict.sentinel_score > 50 ? '#d97706' : '#16a34a',
                                                    }}>
                                                        {verifyResult.latest_verdict.sentinel_score}/100
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                                                        background: verifyResult.latest_verdict.verdict === 'APPROVED' ? '#fef2f2' : '#f0fdf4',
                                                        color: verifyResult.latest_verdict.verdict === 'APPROVED' ? '#dc2626' : '#16a34a',
                                                    }}>
                                                        {verifyResult.latest_verdict.verdict}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.5, fontWeight: 500 }}>
                                                    {verifyResult.latest_verdict.reasoning_narrative || verifyResult.latest_verdict.summary}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 6 }}>
                                                    {new Date(verifyResult.latest_verdict.timestamp).toLocaleString()} · {verifyResult.total_scans} total scan(s)
                                                </div>
                                            </div>
                                        )}

                                        {!verifyResult.latest_verdict && (
                                            <div style={{ padding: 14, borderRadius: 10, marginBottom: 12, background: '#f9fafb', border: '1px solid #e5e7eb', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>
                                                No AI risk assessments recorded yet.
                                            </div>
                                        )}

                                        {/* Blockchain Proof */}
                                        <div style={{
                                            padding: 14, borderRadius: 10,
                                            background: '#f9fafb', border: '1px solid #e5e7eb',
                                        }}>
                                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                                Blockchain Proof
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.8 }}>
                                                <div>APP_ID:{' '}
                                                    <a
                                                        href={`https://lora.algokit.io/testnet/application/${verifyResult.app_id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 700 }}
                                                    >
                                                        {verifyResult.app_id} <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                                                    </a>
                                                </div>
                                                <div>Network: <strong>{verifyResult.network}</strong></div>
                                                <div>Off-Chain Status: <strong style={{
                                                    color: verifyResult.off_chain_status === 'Delayed_Disaster' ? '#dc2626' : '#374151',
                                                }}>{verifyResult.off_chain_status || 'N/A'}</strong></div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                                <a
                                                    href={`https://lora.algokit.io/testnet/application/${verifyResult.app_id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                                        padding: '8px 14px', borderRadius: 8,
                                                        background: '#2563eb', color: '#fff', fontSize: '0.78rem',
                                                        fontWeight: 600, textDecoration: 'none',
                                                    }}
                                                >
                                                    <ExternalLink size={12} /> App on Lora Explorer
                                                </a>
                                                {verifyResult.latest_verdict?.tx_id && (
                                                    <a
                                                        href={`https://lora.algokit.io/testnet/transaction/${verifyResult.latest_verdict.tx_id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                                            padding: '8px 14px', borderRadius: 8,
                                                            background: '#16a34a', color: '#fff', fontSize: '0.78rem',
                                                            fontWeight: 600, textDecoration: 'none',
                                                        }}
                                                    >
                                                        <ExternalLink size={12} /> Last TX on Lora
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {verifyResult?.error && (
                                    <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.82rem', color: '#dc2626' }}>
                                        Shipment &ldquo;{verifyResult.shipment_id}&rdquo; not found. Check the ID and try again.
                                    </div>
                                )}

                                {!verifyResult && (
                                    <div style={{ marginTop: 24, textAlign: 'center' }}>
                                        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                            <Search size={22} color="#9ca3af" />
                                        </div>
                                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                                            Enter a Shipment ID above to view its<br />immutable on-chain audit trail.
                                        </p>
                                    </div>
                                )}

                                <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.68rem', color: '#d1d5db', margin: 0 }}>
                                        Verified via Algorand ARC-4 Box Storage (Stateless &amp; Immutable)
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ═══════════════════════════════════════════════════════════
       A U T H E N T I C A T E D   D A S H B O A R D
    ═══════════════════════════════════════════════════════════ */
    return (
        <div className="dashboard-container">
            {/* ── HEADER ────────────────────────────────────── */}
            <header style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                paddingBottom: 16, borderBottom: '1px solid #e5e7eb',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 8, background: '#eff6ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Shield size={20} color="#2563eb" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Navi-Trust</h1>
                        {appId && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>APP_ID: {appId} &middot; Algorand Testnet</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Role Toggle */}
                    <div style={{
                        display: 'flex', background: '#f3f4f6', borderRadius: 6,
                        padding: 2, border: '1px solid #e5e7eb',
                    }}>
                        <button onClick={() => setRole('stakeholder')} style={{
                            padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600,
                            background: role === 'stakeholder' ? '#2563eb' : 'transparent',
                            color: role === 'stakeholder' ? '#fff' : '#6b7280',
                        }}>
                            <Eye size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />Stakeholder
                        </button>
                        <button onClick={() => setRole('supplier')} style={{
                            padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600,
                            background: role === 'supplier' ? '#d97706' : 'transparent',
                            color: role === 'supplier' ? '#fff' : '#6b7280',
                        }}>
                            <Truck size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />Supplier
                        </button>
                    </div>

                    {/* Wallet Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 4px',
                            background: '#fff', borderRadius: 9999, border: '1px solid #e5e7eb',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #dbeafe, #ede9fe)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <User size={14} color="#4f46e5" />
                            </div>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: '#374151', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                                {accountAddress.substring(0, 5)}...{accountAddress.substring(accountAddress.length - 5)}
                            </span>
                        </div>
                        <button onClick={disconnectWallet} style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                            fontSize: '0.75rem', fontWeight: 500, borderRadius: 9999,
                            background: '#fff', border: '1px solid #e5e7eb', color: '#6b7280',
                            cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                        >
                            <LogOut size={13} /> Disconnect
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Role Subtitle ──────────────────────────────── */}
            <p style={{ textAlign: 'left', marginTop: 12, marginBottom: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                {role === 'stakeholder'
                    ? 'Stakeholder View — Monitor shipments, authorize agentic settlements, verify on-chain status'
                    : 'Supplier View — Track your shipments, report logistics events'}
            </p>

            {/* ── Live Logistics Feed Ticker ─────────────────── */}
            {liveFeed.length > 0 && (
                <div className="ticker-wrap" style={{ marginTop: 12 }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Live Logistics Feed
                    </div>
                    <div className="ticker-content" style={{ width: 'max-content' }}>
                        {[...liveFeed, ...liveFeed].map((item: any, i: number) => (
                            <span key={i} className={`ticker-item ${item.tier || 'medium'}`}>
                                {item.event}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TX SUCCESS BANNER ─────────────────────────── */}
            {txId && (
                <div className="card" style={{ marginTop: 16, marginBottom: 4, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#16a34a', flexWrap: 'wrap' }}>
                        <CheckCircle size={18} />
                        <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>Verified by Algorand — Transaction confirmed on Testnet</span>
                        <a href={`https://lora.algokit.io/testnet/transaction/${txId}`} target="_blank" rel="noreferrer"
                           style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', marginLeft: 'auto' }}>
                            <ExternalLink size={13} /> View on Lora Explorer
                        </a>
                    </div>
                </div>
            )}

            {/* ── NETWORK INTELLIGENCE RIBBON ──────────────── */}
            {isLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton skeleton-text" style={{ width: '55%' }} />
                            <div className="skeleton skeleton-text-lg" style={{ marginTop: 10 }} />
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Package size={15} color="#2563eb" />
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Shipments</span>
                        </div>
                        <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#111827' }}>
                            {String(shipments.filter(s => s.stage === 'In_Transit').length).padStart(2, '0')}
                            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>/ {shipments.length}</span>
                        </div>
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Wifi size={15} color="#16a34a" />
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blockchain Status</span>
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="blink-dot" /> Testnet (Online)
                        </div>
                    </div>
                    {role === 'stakeholder' ? (
                        <div className="card" style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <AlertTriangle size={15} color="#dc2626" />
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Claims</span>
                            </div>
                            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#dc2626' }}>
                                {String(stats.verified_anomalies).padStart(2, '0')}
                                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>approved / {stats.total_scans} scans</span>
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Shield size={15} color="#16a34a" />
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>On-Chain Trust Score</span>
                            </div>
                            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#16a34a' }}>
                                {supplierTrustScore != null ? String(supplierTrustScore).padStart(2, '0') : '—'}
                                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>%</span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 4 }}>Verified via Algorand Box Storage</div>
                        </div>
                    )}
                    {role === 'stakeholder' ? (
                        <div className="card" style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Coins size={15} color="#6b7280" />
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tokens Locked</span>
                            </div>
                            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#111827' }}>
                                {stats.contract_algo != null ? stats.contract_algo.toLocaleString() : '—'} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af' }}>ALGO</span>
                                {stats.contract_algo != null && <span style={{ fontSize: '0.65rem', color: '#16a34a', marginLeft: 4 }}>live</span>}
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <BarChart3 size={15} color="#6b7280" />
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Scans</span>
                            </div>
                            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#111827' }}>
                                {String(stats.total_scans).padStart(2, '0')}
                                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>total</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Hidden chart for PDF capture (rendered off-screen when generating report) ── */}
            {isGeneratingReport && (
                <div
                    ref={chartCaptureRef}
                    style={{
                        position: 'fixed', left: -9999, top: 0, width: 580, height: 220,
                        background: '#ffffff', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8,
                    }}
                >
                    {riskHistory.length > 0 ? (
                        <ResponsiveContainer width={556} height={196}>
                            <AreaChart data={riskHistory} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="riskGradPdf" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <Area type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2.5} fill="url(#riskGradPdf)" dot={{ r: 4, fill: '#2563eb' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 196, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>No risk data</div>
                    )}
                </div>
            )}

            {/* ── RISK PROBABILITY GRAPH (Stakeholder only) ── */}
            {role === 'stakeholder' && !isLoading && (
                <div id="risk-analytics-graph" className="card" style={{ marginTop: 16, padding: '18px 22px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Activity size={16} color="#2563eb" />
                                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>Risk Probability Graph</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Predictive analytics from Logistics Sentry — real-time risk scores</span>
                        </div>
                        <div style={{
                            fontSize: '0.68rem', fontWeight: 600, padding: '3px 10px', borderRadius: 12,
                            background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                        }}>
                            LIVE
                        </div>
                    </div>
                    {riskHistory.length === 0 ? (
                        <div style={{
                            height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: '#f9fafb', borderRadius: 8, border: '1px dashed #e5e7eb',
                        }}>
                            <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                                Run a settlement analysis to see risk data points
                            </span>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={riskHistory} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
                                    formatter={(value: number) => [`${value}/100`, 'Risk Score']}
                                    labelFormatter={(label: string) => `Scan: ${label}`}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="score"
                                    stroke="#2563eb"
                                    strokeWidth={2.5}
                                    fill="url(#riskGrad)"
                                    dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 6, fill: '#dc2626', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            )}

            {/* ── SHIPMENT CARDS (or Skeleton) ─────────────── */}
            {isLoading ? (
                <div className="grid">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="skeleton-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div>
                                    <div className="skeleton skeleton-text" style={{ width: 120 }} />
                                    <div className="skeleton skeleton-text" style={{ width: 200, marginTop: 6 }} />
                                </div>
                                <div className="skeleton" style={{ width: 80, height: 24, borderRadius: 20 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                                <div className="skeleton skeleton-text" style={{ width: 100 }} />
                                <div className="skeleton skeleton-text" style={{ width: 70 }} />
                                <div className="skeleton skeleton-text" style={{ width: 50 }} />
                            </div>
                            <div className="skeleton skeleton-text" style={{ width: '90%' }} />
                            <div className="skeleton skeleton-text" style={{ width: '75%' }} />
                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, marginTop: 14, display: 'flex', gap: 8 }}>
                                <div className="skeleton" style={{ height: 34, flex: 1, borderRadius: 6 }} />
                                <div className="skeleton" style={{ height: 34, width: 90, borderRadius: 6 }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
            <div className="grid">
                {shipments.map((ship) => {
                    const jury = ship.last_jury;
                    const risk = jury?.sentinel?.risk_score ?? null;
                    const riskClass = risk !== null ? (risk > 80 ? 'status-red' : risk > 50 ? 'status-yellow' : 'status-green') : '';
                    const sc = stageStyle(ship.stage);
                    const isRunning = juryRunning === ship.shipment_id;

                    const isFlagged = ship.stage === 'Delayed_Disaster';

                    return (
                        <div key={ship.shipment_id} className={`card${isFlagged ? ' card-flagged' : ''}`} style={{ textAlign: 'left' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Package size={15} color="#2563eb" />
                                        <code style={{ fontSize: '0.8rem' }}>{ship.shipment_id}</code>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '0.875rem', color: '#374151' }}>
                                        <span>{ship.origin}</span>
                                        <ArrowRight size={13} color="#9ca3af" />
                                        <span>{ship.destination}</span>
                                    </div>
                                </div>
                                <div style={{
                                    padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                                    background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap',
                                }}>
                                    {ship.stage.replace('_', ' ')}
                                </div>
                            </div>

                            {/* Stats: Live Sensor Feed (Supplier) or Weather (Stakeholder) */}
                            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                                {role === 'supplier' ? (
                                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ color: '#9ca3af', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Sensor Feed</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: '#374151', marginTop: 2 }}>
                                                <span style={{ fontFamily: 'monospace' }}>Temp {(liveTelemetry[ship.shipment_id]?.temp ?? ship.weather?.temperature ?? 22).toFixed(1)}°C</span>
                                                <span style={{ color: '#e5e7eb' }}>|</span>
                                                <span style={{ fontFamily: 'monospace' }}>Hum {(liveTelemetry[ship.shipment_id]?.humidity ?? 55)}%</span>
                                                <span style={{ color: '#e5e7eb' }}>|</span>
                                                <span style={{ fontFamily: 'monospace' }}>Vib {(liveTelemetry[ship.shipment_id]?.vibration ?? 2).toFixed(1)}g</span>
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#16a34a', marginTop: 2 }}>• Pulsing every 3s</div>
                                        </div>
                                    </div>
                                ) : ship.weather && (
                                    <div>
                                        <div style={{ color: '#9ca3af', fontSize: '0.7rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weather</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.875rem', color: '#374151' }}>
                                            <Cloud size={13} color="#6b7280" /> {ship.weather.temperature}°C / {ship.weather.precipitation}mm
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div style={{ color: '#9ca3af', fontSize: '0.7rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Events</div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.875rem',
                                        color: ship.logistics_events.length > 0 ? '#d97706' : '#16a34a',
                                    }}>
                                        <Zap size={13} /> {ship.logistics_events.length} logged
                                    </div>
                                </div>
                                {risk !== null && (
                                    <div>
                                        <div style={{ color: '#9ca3af', fontSize: '0.7rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk</div>
                                        <div className={`status-badge ${riskClass}`} style={{ fontSize: '0.8rem', padding: '2px 8px' }}>
                                            <Activity size={12} /> {risk}%
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Jury reasoning preview — Stakeholder only */}
                            {role === 'stakeholder' && jury && (
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ color: '#9ca3af', fontSize: '0.7rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Latest Settlement Verdict</div>
                                    <div className="log-entry" style={{ fontSize: '0.8rem' }}>
                                        <strong style={{ color: '#d97706' }}>Logistics Sentry:</strong> {jury.sentinel?.reasoning}
                                    </div>
                                    <div className="log-entry" style={{ fontSize: '0.8rem' }}>
                                        <strong style={{ color: '#2563eb' }}>Compliance Auditor:</strong> {jury.auditor?.audit_report}
                                    </div>
                                </div>
                            )}

                            {/* Supplier: simple event summary instead of verdict */}
                            {role === 'supplier' && ship.logistics_events.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ color: '#9ca3af', fontSize: '0.7rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Recent Events</div>
                                    {ship.logistics_events.slice(-2).map((ev: any, ei: number) => (
                                        <div key={ei} className="log-entry" style={{ fontSize: '0.78rem' }}>
                                            <span style={{ color: ev.severity === 'high' ? '#dc2626' : '#d97706', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>{ev.severity}</span>{' '}
                                            {ev.event}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                                {role === 'stakeholder' && (
                                    <>
                                        {isFlagged ? (
                                            <button className="primary-btn" disabled
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 110, fontSize: '0.8rem', background: '#9ca3af', cursor: 'not-allowed' }}
                                                title="Settlement already recorded on Algorand. See Audit Trail.">
                                                <CheckCircle size={13} /> Claim already filed
                                            </button>
                                        ) : (
                                            <button className="primary-btn" disabled={isRunning}
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 110, fontSize: '0.8rem' }}
                                                onClick={() => handleRunJury(ship.shipment_id)}>
                                                <Play size={13} /> {isRunning ? 'Analyzing…' : 'Authorize Settlement'}
                                            </button>
                                        )}
                                        {jury?.trigger_contract && (
                                            <button className="primary-btn" disabled={isTriggering}
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#dc2626', minWidth: 110, fontSize: '0.8rem' }}
                                                onClick={() => handleTriggerDisaster(ship)}>
                                                <AlertTriangle size={13} /> {isTriggering ? 'Signing…' : 'Trigger'}
                                            </button>
                                        )}
                                        {jury && (
                                            <button
                                                disabled={isPaying === ship.shipment_id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                    fontSize: '0.75rem', padding: '6px 10px', borderRadius: 6,
                                                    background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                                                    cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                                                }}
                                                onClick={() => handlePayAgent(ship.shipment_id)}>
                                                <CreditCard size={12} /> {isPaying === ship.shipment_id ? 'Paying…' : 'x402 Pay'}
                                            </button>
                                        )}
                                    </>
                                )}
                                {role === 'supplier' && (
                                    <>
                                        <button style={{
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            minWidth: 110, fontSize: '0.8rem',
                                            background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a',
                                        }} onClick={() => setSimulateModal(ship.shipment_id)}>
                                            <Zap size={13} /> Simulate Delay
                                        </button>
                                        {ship.logistics_events.length > 0 && (
                                            <button style={{
                                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                minWidth: 110, fontSize: '0.8rem',
                                                background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                                            }} onClick={() => { setMitigateModal({ shipmentId: ship.shipment_id }); setMitigateText(''); }}>
                                                <CheckCircle size={13} /> Submit Fix / Mitigation
                                            </button>
                                        )}
                                    </>
                                )}
                                {role === 'stakeholder' && (
                                    <>
                                        <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.8rem' }}
                                            onClick={() => handleViewAudit(ship.shipment_id)}>
                                            <History size={13} /> Audit Trail
                                        </button>
                                        {jury && (
                                            <button style={{ fontSize: '0.8rem' }} onClick={async () => {
                                                try {
                                                    const res = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
                                                    const list = Array.isArray(res?.data) ? res.data : [];
                                                    setShipments(list);
                                                    const fresh = list.find((s: any) => s.shipment_id === ship.shipment_id);
                                                    setSelectedShipment(fresh ?? ship);
                                                } catch {
                                                    setSelectedShipment(ship);
                                                }
                                            }}>
                                                Full Report
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            )}

            {/* ═══════════════════════════════════════════════════
               M O D A L S
            ═══════════════════════════════════════════════════ */}

            {/* ── Jury Conversation Log ─────────────────────── */}
            {juryResult && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 700, width: '95%', textAlign: 'left', padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Terminal size={18} color="#2563eb" />
                                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Settlement Log &mdash; {juryResult.shipment_id}</h3>
                            </div>
                            <button onClick={() => setJuryResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>
                        {/* Terminal area stays dark for readability */}
                        <div style={{
                            background: '#0f172a', padding: 20, maxHeight: 400, overflowY: 'auto',
                            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', lineHeight: 1.7,
                        }}>
                            {juryResult.logistics_events_used > 0 && (
                                <div style={{ color: '#fbbf24', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    [SYSTEM] {juryResult.logistics_events_used} logistics event(s) ingested by Logistics Sentry
                                </div>
                            )}
                            {juryResult.agent_dialogue.map((entry, i) => (
                                <div key={i} style={{ marginBottom: 16 }}>
                                    <div style={{ color: agentColor(entry.agent), fontWeight: 600 }}>{'>'} [{entry.agent.toUpperCase()}]</div>
                                    <div style={{ color: '#cbd5e1', paddingLeft: 16, whiteSpace: 'pre-wrap' }}>{entry.message}</div>
                                </div>
                            ))}
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, marginTop: 8 }}>
                                <span style={{ color: juryResult.trigger_contract ? '#ef4444' : '#4ade80', fontWeight: 700 }}>
                                    VERDICT: {juryResult.trigger_contract ? 'SETTLEMENT AUTHORIZED — Smart contract trigger approved' : 'SETTLEMENT REJECTED — No action required'}
                                </span>
                                {(juryResult as any).chief_justice?.reasoning_narrative && (
                                    <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                                        <strong style={{ color: '#93c5fd' }}>Reasoning:</strong> {(juryResult as any).chief_justice.reasoning_narrative}
                                    </div>
                                )}
                                {(juryResult as any).chief_justice?.mitigation_strategy && (
                                    <div style={{ marginTop: 8, padding: 10, background: 'rgba(251,191,36,0.12)', borderRadius: 6, fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.5 }}>
                                        <strong>Mitigation:</strong> {(juryResult as any).chief_justice.mitigation_strategy}
                                    </div>
                                )}
                                {((juryResult as any).explorer_url || (juryResult as any).on_chain_tx_id) && (
                                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span style={{ color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
                                            <CheckCircle size={12} /> Verified by Algorand
                                            {(juryResult as any).confirmed_round && (
                                                <span style={{ color: '#93c5fd' }}> — Round {(juryResult as any).confirmed_round}</span>
                                            )}
                                        </span>
                                        <a
                                            href={(juryResult as any).explorer_url || `https://lora.algokit.io/testnet/transaction/${(juryResult as any).on_chain_tx_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'block', color: '#93c5fd', fontSize: '0.75rem', textDecoration: 'none', marginTop: 4 }}
                                        >
                                            View on Lora Explorer <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb' }}>
                            <button className="primary-btn" style={{ width: '100%' }} onClick={() => setJuryResult(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Audit Trail Modal ─────────────────────────── */}
            {auditTrail && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 650, width: '95%', textAlign: 'left', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Audit Trail &mdash; {auditTrail.shipment_id}</h3>
                                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                    APP_ID:{' '}
                                    <a
                                        href={`https://lora.algokit.io/testnet/application/${auditTrail.app_id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                                    >
                                        {auditTrail.app_id} <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                                    </a>
                                    {' '}&middot; {auditTrail.network}
                                </span>
                            </div>
                            <button onClick={() => setAuditTrail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>

                        <div style={{ padding: 12, background: '#eff6ff', borderRadius: 8, marginBottom: 16, border: '1px solid #bfdbfe' }}>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>On-Chain Status (Algorand Box Storage)</div>
                            <div style={{
                                fontSize: '1.05rem', fontWeight: 600, marginTop: 2,
                                color: auditTrail.on_chain_status === 'Delayed_Disaster' ? '#dc2626' : '#2563eb',
                            }}>
                                {auditTrail.on_chain_status}
                                {auditTrail.on_chain_status === 'Delayed_Disaster' && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 500, marginLeft: 8, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 4 }}>
                                        disaster_reported = true
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#93c5fd', marginTop: 6 }}>
                                Verified via Algorand ARC-4 Box Storage (Stateless &amp; Immutable)
                            </div>
                            <a
                                href={`https://lora.algokit.io/testnet/application/${auditTrail.app_id}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
                                    fontSize: '0.72rem', color: '#2563eb', textDecoration: 'none', fontWeight: 500,
                                }}
                            >
                                <ExternalLink size={11} /> Verify on Lora Explorer
                            </a>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 8 }}>
                            Jury Verdicts ({auditTrail.total_scans} scan{auditTrail.total_scans !== 1 ? 's' : ''})
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {auditTrail.verdicts.length === 0 ? (
                                <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center', fontSize: '0.875rem' }}>
                                    No settlement scans yet. Authorize an Agentic Settlement from Stakeholder view.
                                </div>
                            ) : (
                                auditTrail.verdicts.map((v: any, i: number) => (
                                    <div key={i} style={{
                                        padding: 10, marginBottom: 8, background: '#f9fafb', borderRadius: 6,
                                        borderLeft: `3px solid ${v.verdict === 'APPROVED' ? '#dc2626' : '#16a34a'}`,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                            <span style={{ color: v.verdict === 'APPROVED' ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{v.verdict}</span>
                                            <span style={{ color: '#9ca3af' }}>{new Date(v.timestamp).toLocaleString()}</span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
                                            <span style={{ color: '#d97706' }}>Sentry:</span> {v.sentinel_score}/100 &middot; <span style={{ color: '#2563eb' }}>Auditor:</span> {v.auditor_status}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#111827', marginTop: 8, lineHeight: 1.55, fontWeight: 500 }}>
                                            {v.reasoning_narrative || v.summary}
                                        </div>
                                        {v.mitigation_strategy && (
                                            <div style={{ fontSize: '0.78rem', color: '#d97706', marginTop: 6, padding: 8, background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a' }}>
                                                <strong>Mitigation:</strong> {v.mitigation_strategy}
                                            </div>
                                        )}
                                        {v.tx_id && (
                                            <a
                                                href={`https://lora.algokit.io/testnet/transaction/${v.tx_id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                                            >
                                                <ExternalLink size={10} /> TX: {v.tx_id.substring(0, 12)}...
                                            </a>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <button className="primary-btn" style={{ width: '100%' }} onClick={() => setAuditTrail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Simulate Event Modal ──────────────────────── */}
            {simulateModal && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 480, width: '95%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Zap size={18} color="#d97706" /> Simulate Logistics Event
                            </h3>
                            <button onClick={() => setSimulateModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 12 }}>
                            Inject an event for <code>{simulateModal}</code>:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {SIMULATE_OPTIONS.map((opt, i) => (
                                <button key={i} onClick={() => handleSimulateEvent(simulateModal, opt.event, opt.severity)} style={{
                                    textAlign: 'left', padding: 12, borderRadius: 6,
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                    cursor: 'pointer', color: '#374151', fontSize: '0.85rem',
                                }}>
                                    <span style={{ color: opt.severity === 'high' ? '#dc2626' : '#d97706', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' as const }}>
                                        {opt.severity}
                                    </span>
                                    <div style={{ marginTop: 4, color: '#111827' }}>{opt.event}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Submit Mitigation Modal (Supplier) ─────────── */}
            {mitigateModal && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 480, width: '95%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={18} color="#16a34a" /> Submit Fix / Mitigation
                            </h3>
                            <button onClick={() => { setMitigateModal(null); setMitigateText(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 8 }}>
                            Shipment <code>{mitigateModal.shipmentId}</code> — describe the resolution (e.g. &ldquo;Rebooted backup generator, temperature stabilizing&rdquo;):
                        </div>
                        <textarea
                            value={mitigateText}
                            onChange={(e) => setMitigateText(e.target.value)}
                            placeholder="e.g. Cold chain restored; backup generator online."
                            rows={3}
                            style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.85rem', resize: 'vertical', marginBottom: 12 }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => { setMitigateModal(null); setMitigateText(''); }} style={{ padding: '8px 16px' }}>Cancel</button>
                            <button className="primary-btn" disabled={mitigateSubmitting || !mitigateText.trim()} onClick={handleSubmitMitigation} style={{ padding: '8px 16px' }}>
                                {mitigateSubmitting ? 'Submitting…' : 'Log On-Chain'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast: Mitigation Logged ───────────────────── */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    padding: '12px 24px', borderRadius: 8, background: toast.includes('Failed') ? '#fef2f2' : '#f0fdf4',
                    color: toast.includes('Failed') ? '#dc2626' : '#16a34a', fontWeight: 600, fontSize: '0.875rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 2000,
                }}>
                    {toast}
                </div>
            )}

            {/* ── x402 Payment Receipt Modal ────────────────── */}
            {paymentReceipt && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 500, width: '95%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CreditCard size={18} color="#16a34a" />
                                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>x402 Payment Receipt</h3>
                            </div>
                            <button onClick={() => setPaymentReceipt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>

                        <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>STATUS: {paymentReceipt.status}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#d97706' }}>Simulated — no on-chain transfer</span>
                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{new Date(paymentReceipt.timestamp).toLocaleString()}</span>
                            </div>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 2 }}>
                            <div><strong>Protocol:</strong> {paymentReceipt.protocol}</div>
                            <div><strong>Service:</strong> {paymentReceipt.service}</div>
                            <div><strong>Shipment:</strong> {paymentReceipt.shipment_id}</div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}>
                                <strong>Payer:</strong> {paymentReceipt.payer?.substring(0, 8)}...{paymentReceipt.payer?.substring(paymentReceipt.payer.length - 6)}
                            </div>
                        </div>

                        <div style={{ marginTop: 14, borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                Agents Paid
                            </div>
                            {paymentReceipt.agents_paid?.map((a: any, i: number) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.8rem', borderBottom: '1px solid #f9fafb' }}>
                                    <span style={{ color: '#374151' }}>{a.name} <span style={{ color: '#9ca3af' }}>({a.role})</span></span>
                                    <span style={{ fontWeight: 600, color: '#111827' }}>${a.fee_usdc.toFixed(2)}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: '0.9rem', fontWeight: 700 }}>
                                <span>Total</span>
                                <span style={{ color: '#16a34a' }}>${paymentReceipt.total_usdc?.toFixed(2)} USDC</span>
                            </div>
                        </div>

                        <div style={{ marginTop: 14, padding: 10, background: '#eff6ff', borderRadius: 6, fontSize: '0.72rem', color: '#2563eb' }}>
                            {paymentReceipt.memo}
                        </div>

                        <button className="primary-btn" style={{ width: '100%', marginTop: 14 }} onClick={() => setPaymentReceipt(null)}>Close</button>
                    </div>
                </div>
            )}

            {/* ── Full Log Detail Modal ─────────────────────── */}
            {selectedShipment && (
                <div className="modal-backdrop" style={{ zIndex: 1000 }}>
                    <div className="card" style={{ maxWidth: 600, width: '90%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedShipment.shipment_id}</h2>
                                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{selectedShipment.origin} &rarr; {selectedShipment.destination}</span>
                            </div>
                            <button onClick={() => setSelectedShipment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>
                        {selectedShipment.last_jury ? (
                            <>
                                <div style={{ marginBottom: 16 }}>
                                    <h4 style={{ color: '#d97706', margin: '0 0 6px' }}>Logistics Sentry — Risk Analysis</h4>
                                    <p style={{ margin: 0, color: '#374151', fontSize: '0.875rem', lineHeight: 1.6 }}>{selectedShipment.last_jury.sentinel?.reasoning}</p>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <h4 style={{ color: '#2563eb', margin: '0 0 6px' }}>Compliance Auditor — On-Chain Verification</h4>
                                    <p style={{ margin: 0, color: '#374151', fontSize: '0.875rem', lineHeight: 1.6 }}>{selectedShipment.last_jury.auditor?.audit_report}</p>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <h4 style={{ color: '#16a34a', margin: '0 0 6px' }}>Settlement Arbiter — Final Verdict</h4>
                                    <p style={{ margin: 0, color: '#374151', fontSize: '0.875rem', lineHeight: 1.6 }}>{selectedShipment.last_jury.chief_justice?.reasoning_narrative || selectedShipment.last_jury.chief_justice?.judgment}</p>
                                    {selectedShipment.last_jury.chief_justice?.mitigation_strategy && (
                                        <div style={{ marginTop: 8, padding: 10, background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: '0.82rem', color: '#92400e' }}>
                                            <strong>Mitigation:</strong> {selectedShipment.last_jury.chief_justice.mitigation_strategy}
                                        </div>
                                    )}
                                    {selectedShipment.last_jury.on_chain_tx_id && (
                                        <a
                                            href={`https://lora.algokit.io/testnet/transaction/${selectedShipment.last_jury.on_chain_tx_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
                                                padding: '10px 16px', borderRadius: 8, background: '#2563eb', color: '#fff',
                                                fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
                                            }}
                                        >
                                            <ExternalLink size={14} /> View on Lora Explorer — Verify TX
                                        </a>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p style={{ color: '#9ca3af' }}>No settlement data yet. Authorize an Agentic Settlement first.</p>
                        )}
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            {selectedShipment.last_jury && (
                                <button
                                    className="primary-btn"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                    onClick={handleDownloadAuditReport}
                                    disabled={isGeneratingReport}
                                >
                                    <Download size={16} /> {isGeneratingReport ? 'Generating…' : 'Download Audit Report'}
                                </button>
                            )}
                            <button className="primary-btn" style={{ flex: 1, background: '#6b7280' }} onClick={() => setSelectedShipment(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
