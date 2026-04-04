import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, Route, Routes } from 'react-router-dom';
import { PeraWalletConnect } from "@perawallet/connect";
import algosdk from "algosdk";
import axios from 'axios';
import {
    Shield, Activity, Cloud, AlertTriangle, ExternalLink,
    CheckCircle, Play, X, Truck, Eye, Package,
    History, Zap, ArrowRight, Lock, Coins, Wifi,
    User, LogOut, Download, ClipboardCopy,
} from 'lucide-react';

import { BACKEND_URL, FALLBACK_APP_ID, API_TIMEOUT } from './constants/api';
import VerifyPage from './pages/VerifyPage';
import ProtocolPage from './pages/ProtocolPage';
import NaviBotPage from './pages/NaviBotPage';
import { NaviBotPanel } from './components/NaviBotPanel';
import { LandingPage } from './components/landing/LandingPage';
import { WitnessPanel } from './components/WitnessPanel';
import { WeatherCourt } from './components/WeatherCourt';
import { CustodyChain } from './components/CustodyChain';

const CITIES = ['Mumbai', 'Chennai', 'Delhi', 'Singapore', 'Dubai', 'Rotterdam'] as const;

type DashboardTxn = {
    tx_id?: string;
    action_plain?: string;
    method_name?: string;
    round?: number;
    lora_url?: string;
    timestamp?: string;
};

function timeAgo(iso: string): string {
    const t = new Date(iso).getTime();
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
    return `${Math.floor(s / 86400)} days ago`;
}

const peraWallet = new PeraWalletConnect({ chainId: 416002 });

const ALGOD_SERVER = (import.meta.env.VITE_ALGORAND_NODE as string) || 'https://testnet-api.algonode.cloud';

function shortTxId(txId: string): string {
    if (!txId || txId.length < 16) return txId;
    return `${txId.slice(0, 6)}…${txId.slice(-4)}`;
}

type ConfirmedActivity = {
    id: string;
    txId: string;
    label: string;
    amountMicro?: number;
    status: 'confirmed';
    round?: number;
    timestamp: string;
};

/** Disputed / legacy-flagged first, in transit next, settled last. */
function sortShipmentsStable<T extends { shipment_id: string; stage?: string }>(arr: T[]): T[] {
    const pri = (s: string) => {
        if (s === 'Disputed' || s === 'Delayed_Disaster') return 0;
        if (s === 'In_Transit' || s === 'Not_Registered') return 1;
        if (s === 'Settled') return 2;
        return 3;
    };
    return [...arr].sort((a, b) => {
        const pa = pri(a.stage ?? '');
        const pb = pri(b.stage ?? '');
        if (pa !== pb) return pa - pb;
        return (a.shipment_id ?? '').localeCompare(b.shipment_id ?? '');
    });
}
const EXPLORER_URL = "https://testnet.explorer.perawallet.app/tx/";

interface Shipment {
    shipment_id: string;
    origin: string;
    destination: string;
    lat: number;
    lon: number;
    dest_lat?: number | null;
    dest_lon?: number | null;
    stage: string;
    weather: any;
    logistics_events: any[];
    last_jury: any;
    supplier_address?: string | null;
    funds_locked_microalgo?: number;
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
    indexer_notes?: any[];
}

type Role = 'stakeholder' | 'supplier';

function MainApp() {
    const [accountAddress, setAccountAddress] = useState<string | null>(null);
    const [role, setRole] = useState<Role>('stakeholder');
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [appId, setAppId] = useState<number | null>(null);
    const [juryRunning, setJuryRunning] = useState<string | null>(null);
    const [juryResult, setJuryResult] = useState<JuryResult | null>(null);
    const [auditTrail, setAuditTrail] = useState<AuditTrailData | null>(null);
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const [stats, setStats] = useState<{
        total_scans: number;
        verified_anomalies: number;
        contract_algo?: number;
        active_shipments?: number;
        total_settled?: number;
        total_disputed?: number;
    }>({ total_scans: 0, verified_anomalies: 0 });
    const [recentTxns, setRecentTxns] = useState<DashboardTxn[]>([]);
    const [registerModal, setRegisterModal] = useState(false);
    const [regForm, setRegForm] = useState({
        shipment_id: '',
        origin: 'Mumbai',
        destination: 'Dubai',
        supplier: '',
    });
    const [registerBusy, setRegisterBusy] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
    const [isPaying, setIsPaying] = useState<string | null>(null);
    const [boxStatuses, setBoxStatuses] = useState<Record<string, string>>({});
    const [mitigateModal, setMitigateModal] = useState<{ shipmentId: string } | null>(null);
    const [mitigateText, setMitigateText] = useState('');
    const [mitigateSubmitting, setMitigateSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [liveTelemetry, setLiveTelemetry] = useState<Record<string, { temp: number; humidity: number; vibration: number }>>({});
    const [confirmingTxLabel, setConfirmingTxLabel] = useState<string | null>(null);
    const [lastConfirmedTx, setLastConfirmedTx] = useState<ConfirmedActivity | null>(null);
    const [activityFeed, setActivityFeed] = useState<ConfirmedActivity[]>([]);
    const [oracleAddress, setOracleAddress] = useState<string | null>(null);
    const [chainHealth, setChainHealth] = useState(false);
    const [juryAgentIdx, setJuryAgentIdx] = useState(0);

    const refreshRecentTxns = useCallback(() => {
        axios
            .get(`${BACKEND_URL}/transactions`, { params: { limit: 5 }, timeout: 8000 })
            .then((r) => setRecentTxns(Array.isArray(r.data?.transactions) ? r.data.transactions : []))
            .catch(() => setRecentTxns([]));
    }, []);

    useEffect(() => {
        if (registerModal && accountAddress) {
            setRegForm((f) => ({ ...f, supplier: f.supplier || accountAddress }));
        }
    }, [registerModal, accountAddress]);

    /* ── Backend / algod health (dashboard navbar) ───────────── */
    useEffect(() => {
        if (!accountAddress) return;
        const check = async () => {
            try {
                const r = await fetch(`${BACKEND_URL}/health`);
                const d = (await r.json()) as { algod_ok?: boolean };
                setChainHealth(d.algod_ok === true);
            } catch {
                setChainHealth(false);
            }
        };
        void check();
        const interval = window.setInterval(() => void check(), 30000);
        return () => window.clearInterval(interval);
    }, [accountAddress]);

    /* ── Wallet reconnect on mount ─────────────────────────── */
    useEffect(() => {
        peraWallet
            .reconnectSession()
            .then((accounts) => {
                if (accounts.length) {
                    const a = accounts[0];
                    setAccountAddress(a);
                    try {
                        sessionStorage.setItem('navi_trust_wallet', a);
                    } catch {
                        /* ignore */
                    }
                }
            })
            .catch(() => {});
    }, []);

    /* ── Public Tracker: load config without wallet so verify tab works ─ */
    useEffect(() => {
        axios.get(`${BACKEND_URL}/config`).then((r) => setAppId(r.data?.app_id ?? null)).catch(() => {});
    }, []);

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
    }, [role, shipments]);

    /* ── Toast auto-dismiss ─ */
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    const recordConfirmedTx = useCallback(
        (entry: { txId: string; label: string; amountMicro?: number; round?: number; timestamp?: string }) => {
            const full: ConfirmedActivity = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                timestamp: entry.timestamp ?? new Date().toISOString(),
                txId: entry.txId,
                label: entry.label,
                amountMicro: entry.amountMicro,
                status: 'confirmed',
                round: entry.round,
            };
            setLastConfirmedTx(full);
            setTxId(entry.txId);
            setActivityFeed((prev) => [full, ...prev].slice(0, 24));
        },
        [],
    );

    /* ── Supplier: wallet-mapped filtering ─ */
    const displayedShipments = useMemo(() => {
        if (role !== 'supplier' || !accountAddress) return shipments;
        return shipments.filter((s) => !s.supplier_address || s.supplier_address === accountAddress);
    }, [shipments, role, accountAddress]);

    const focusVaultShip = useMemo(
        () => selectedShipment ?? (displayedShipments.length ? displayedShipments[0] : null),
        [selectedShipment, displayedShipments],
    );

    const vaultMilestones = useMemo(() => {
        if (!focusVaultShip) return [];
        const bal = focusVaultShip.funds_locked_microalgo ?? 0;
        return [
            { id: 'm05', label: '0.5 ALGO locked', threshold_micro: 500_000, reached: bal >= 500_000 },
            { id: 'm1', label: '1 ALGO locked', threshold_micro: 1_000_000, reached: bal >= 1_000_000 },
            { id: 'm2', label: '2 ALGO locked', threshold_micro: 2_000_000, reached: bal >= 2_000_000 },
        ];
    }, [focusVaultShip]);

    /* ── Data polling — only when wallet is connected ──────── */
    useEffect(() => {
        if (!accountAddress) { setIsLoading(false); return; }

        setIsLoading(true);

        const bootstrap = async () => {
            const opts = { timeout: API_TIMEOUT };
            try {
                // Fast path: single /bootstrap call (DB-only, ~1s) for presentation
                const bootRes = await axios.get(`${BACKEND_URL}/bootstrap`, opts).catch(() => null);
                if (bootRes?.data) {
                    const d = bootRes.data;
                    if (d.config) {
                        setAppId(d.config.app_id);
                        setOracleAddress(d.config.oracle_address ?? null);
                    }
                    if (d.stats) setStats(d.stats);
                    if (Array.isArray(d.shipments) && d.shipments.length > 0) {
                        setShipments(sortShipmentsStable(d.shipments));
                        const st: Record<string, string> = {};
                        d.shipments.forEach((s: any) => { st[s.shipment_id] = s.stage || ''; });
                        setBoxStatuses(st);
                    } else {
                        const res = await axios.get(`${BACKEND_URL}/shipments`, opts).catch(() => null);
                        const data = res?.data && Array.isArray(res.data) ? res.data : [];
                        setShipments(sortShipmentsStable(data));
                        const st: Record<string, string> = {};
                        data.forEach((s: any) => { st[s.shipment_id] = s.stage || ''; });
                        setBoxStatuses(st);
                    }
                } else {
                    // Fallback: parallel fetch
                    const [configRes, statsRes, shipmentsRes] = await Promise.allSettled([
                        axios.get(`${BACKEND_URL}/config`, opts),
                        axios.get(`${BACKEND_URL}/stats`, opts),
                        axios.get(`${BACKEND_URL}/shipments`, opts),
                    ]);
                    if (configRes.status === 'fulfilled') {
                        setAppId(configRes.value.data.app_id);
                        setOracleAddress(configRes.value.data.oracle_address ?? null);
                    }
                    if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
                    if (shipmentsRes.status === 'fulfilled') {
                        const raw = shipmentsRes.value.data;
                        const data = Array.isArray(raw) ? raw : [];
                        setShipments(sortShipmentsStable(data));
                        const st: Record<string, string> = {};
                        data.forEach((s: any) => { st[s.shipment_id] = s.stage || ''; });
                        setBoxStatuses(st);
                    } else {
                        setShipments([]);
                        setBoxStatuses({});
                    }
                }
            } catch {
                setShipments([]);
                setBoxStatuses({});
            } finally {
                setIsLoading(false);
            }
        };
        bootstrap();

        const safety = setTimeout(() => setIsLoading(false), 5500);
        return () => clearTimeout(safety);
    }, [accountAddress]);

    /* ── Ledger sync (5s) provides box status via /sync-ledger — single source of truth ── */

    useEffect(() => {
        if (!accountAddress) return;
        refreshRecentTxns();
    }, [accountAddress, isLoading, refreshRecentTxns, lastConfirmedTx?.txId]);

    useEffect(() => {
        if (!juryRunning) {
            setJuryAgentIdx(0);
            return;
        }
        setJuryAgentIdx(0);
        const t1 = window.setTimeout(() => setJuryAgentIdx(1), 1000);
        const t2 = window.setTimeout(() => setJuryAgentIdx(2), 2200);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [juryRunning]);

    /* ── Wallet ─────────────────────────────────────────────── */
    const handleConnectWallet = () => {
        peraWallet
            .connect()
            .then((accounts) => {
                const a = accounts[0];
                setAccountAddress(a);
                try {
                    sessionStorage.setItem('navi_trust_wallet', a);
                } catch {
                    /* ignore */
                }
            })
            .catch(() => {});
    };
    const disconnectWallet = () => {
        peraWallet.disconnect();
        setAccountAddress(null);
        try {
            sessionStorage.removeItem('navi_trust_wallet');
        } catch {
            /* ignore */
        }
    };

    /* ── Run Jury ───────────────────────────────────────────── */
    const handleRunJury = async (shipmentId: string) => {
        setJuryRunning(shipmentId);
        const safetyTimer = setTimeout(() => {
            setJuryRunning(null);
        }, 20000);
        try {
            const res = await axios.post(`${BACKEND_URL}/run-jury`, { shipment_id: shipmentId }, { timeout: 15000 });
            setJuryResult(res.data);

            const fresh = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
            axios.get(`${BACKEND_URL}/stats`).then(r => setStats(r.data)).catch(() => {});
            refreshRecentTxns();
        } catch (e: any) {
            setJuryRunning(null);
            const detail = e.response?.data?.detail ?? e.message ?? 'Unknown error';
            const msg = typeof detail === 'string' && detail.includes('already flagged')
                ? 'This shipment is already settled on Algorand. No further action needed. Open Audit Trail to view the on-chain record.'
                : 'Jury failed: ' + detail;
            alert(msg);
        } finally {
            clearTimeout(safetyTimer);
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
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
        } catch {
            setToast('Failed to submit mitigation');
        } finally {
            setMitigateSubmitting(false);
        }
    };

    const handleRegisterShipment = async () => {
        if (!regForm.shipment_id.trim() || !regForm.supplier.trim()) {
            setToast('Shipment ID and supplier address are required.');
            return;
        }
        setRegisterBusy(true);
        try {
            const regRes = await axios.post(`${BACKEND_URL}/register-shipment`, null, {
                params: {
                    shipment_id: regForm.shipment_id.trim(),
                    origin: regForm.origin,
                    destination: regForm.destination,
                    supplier: regForm.supplier.trim(),
                },
                timeout: 120_000,
            });
            const tid = (regRes.data as { tx_id?: string })?.tx_id;
            if (tid) {
                recordConfirmedTx({ txId: tid, label: 'Shipment registered' });
            }
            setToast('Shipment registered.');
            setRegisterModal(false);
            setRegForm((f) => ({ ...f, shipment_id: '' }));
            const fresh = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
            axios.get(`${BACKEND_URL}/stats`).then((r) => setStats(r.data)).catch(() => {});
            refreshRecentTxns();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setToast(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Registration failed');
        } finally {
            setRegisterBusy(false);
        }
    };

    const handleSettleShipment = async (shipmentId: string) => {
        try {
            const r = await axios.post(`${BACKEND_URL}/settle`, { shipment_id: shipmentId }, { timeout: 120_000 });
            const txId = (r.data as { tx_id?: string })?.tx_id;
            if (txId) recordConfirmedTx({ txId, label: 'Settlement completed' });
            setToast('Settlement submitted.');
            const fresh = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => axios.get(`${BACKEND_URL}/shipments`));
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
            axios.get(`${BACKEND_URL}/stats`).then((x) => setStats(x.data)).catch(() => {});
            refreshRecentTxns();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setToast(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Settlement failed');
        }
    };

    /* ── Audit Trail ────────────────────────────────────────── */
    const handleViewAudit = async (shipmentId: string) => {
        try {
            const res = await axios.get(`${BACKEND_URL}/audit-trail/${shipmentId}`);
            setAuditTrail(res.data);
        } catch {
            const ship = shipments.find((s) => s.shipment_id === shipmentId);
            if (ship) {
                setAuditTrail({
                    shipment_id: ship.shipment_id,
                    app_id: appId ?? FALLBACK_APP_ID,
                    network: 'TestNet',
                    on_chain_status: ship.stage || 'Unknown',
                    total_scans: ship.last_jury ? 1 : 0,
                    indexer_notes: [],
                    verdicts: ship.last_jury ? [{
                        verdict: ship.last_jury.chief_justice?.trigger_contract === 'approve' ? 'APPROVED' : 'REJECTED',
                        timestamp: new Date().toISOString(),
                        sentinel_score: ship.last_jury?.sentinel?.risk_score ?? 0,
                        auditor_status: ship.stage,
                        reasoning_narrative: ship.last_jury?.chief_justice?.reasoning_narrative || ship.last_jury?.chief_justice?.judgment,
                        tx_id: ship.last_jury?.on_chain_tx_id,
                    }] : [],
                });
            } else {
                alert("Audit trail fetch failed");
            }
        }
    };

    const sendSignedBlobsAndConfirm = async (
        blobs: Uint8Array[],
        meta: { label: string; amountMicro?: number },
        afterConfirm?: (ctx: { txId: string; round?: number }) => void | Promise<void>,
    ): Promise<boolean> => {
        if (!accountAddress) {
            setToast('Connect your wallet first.');
            return false;
        }
        if (!blobs.length) {
            setToast('No signed transactions to submit.');
            return false;
        }
        setConfirmingTxLabel(meta.label);
        try {
            const algodClient = new algosdk.Algodv2('', ALGOD_SERVER, '');
            const sent = await algodClient.sendRawTransaction(blobs).do();
            const tid =
                (sent as { txId?: string; txid?: string }).txId ?? (sent as { txid?: string }).txid;
            if (!tid) {
                setToast('Could not read transaction ID from the node.');
                return false;
            }
            const pending = await algosdk.waitForConfirmation(algodClient, tid, 20);
            const round = pending.confirmedRound != null ? Number(pending.confirmedRound) : undefined;
            recordConfirmedTx({
                txId: tid,
                label: meta.label,
                amountMicro: meta.amountMicro,
                round,
            });
            await afterConfirm?.({ txId: tid, round });
            setToast(`${meta.label} — confirmed on-chain.`);
            return true;
        } catch {
            setToast('Transaction was cancelled or could not be confirmed.');
            return false;
        } finally {
            setConfirmingTxLabel(null);
        }
    };

    const signSendConfirmB64Group = async (
        txnsB64: string[],
        meta: { label: string; amountMicro?: number },
        afterConfirm?: (ctx: { txId: string; round?: number }) => void | Promise<void>,
    ): Promise<boolean> => {
        if (!accountAddress) {
            setToast('Connect your wallet first.');
            return false;
        }
        try {
            const txns = txnsB64.map((b64) => {
                const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                return algosdk.decodeUnsignedTransaction(bin);
            });
            const signed = await peraWallet.signTransaction([txns.map((txn) => ({ txn, signers: [accountAddress] }))]);
            const rawSigned = Array.isArray(signed) ? signed : [];
            const blobs: Uint8Array[] = rawSigned.map((item: unknown) => {
                if (item instanceof Uint8Array) return item;
                if (item && typeof item === 'object' && item !== null && 'blob' in item) {
                    const b = (item as { blob: Uint8Array }).blob;
                    if (b instanceof Uint8Array) return b;
                }
                return new Uint8Array();
            }).filter((b) => b.length > 0);
            return sendSignedBlobsAndConfirm(blobs, meta, afterConfirm);
        } catch {
            setToast('Transaction was cancelled or could not be confirmed.');
            return false;
        }
    };

    /* ── Lock funds: NaviTrust fund_shipment (wallet-signed group) ─ */
    const handleFundEscrow = async (shipmentId: string) => {
        if (!accountAddress) {
            alert('Connect Pera Wallet first.');
            return;
        }
        if (!appId) {
            alert('APP_ID not loaded yet.');
            return;
        }
        setIsPaying(shipmentId);
        try {
            setToast('Confirm escrow in Pera Wallet…');
            const res = await axios.post(`${BACKEND_URL}/fund-shipment/build`, {
                shipment_id: shipmentId,
                buyer_address: accountAddress,
                amount_algo: 0.5,
            });
            const txnsB64: string[] = res.data.txns_b64;
            const txns = txnsB64.map((b64) => {
                const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                return algosdk.decodeUnsignedTransaction(bin);
            });
            const signed = await peraWallet.signTransaction([
                txns.map((txn) => ({ txn, signers: [accountAddress] })),
            ]);
            const rawSigned = Array.isArray(signed) ? signed : [];
            const blobs: Uint8Array[] = rawSigned.map((item: unknown) => {
                if (item instanceof Uint8Array) return item;
                if (item && typeof item === 'object' && item !== null && 'blob' in item) {
                    const b = (item as { blob: Uint8Array }).blob;
                    if (b instanceof Uint8Array) return b;
                }
                return new Uint8Array();
            }).filter((b) => b.length > 0);
            const ok = await sendSignedBlobsAndConfirm(blobs, {
                label: 'Escrow — fund shipment',
                amountMicro: res.data.micro_algo ?? 500_000,
            }, async (ctx) => {
                setPaymentReceipt({
                    kind: 'fund',
                    shipment_id: shipmentId,
                    micro_algo: res.data.micro_algo,
                    tx_id: ctx.txId,
                });
                const fresh = await axios.get(`${BACKEND_URL}/sync-ledger`).catch(() => ({ data: [] }));
                setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
                refreshRecentTxns();
            });
            if (!ok) return;
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string };
            alert('Funding failed: ' + (err.response?.data?.detail || err.message || 'Unknown error'));
        } finally {
            setIsPaying(null);
        }
    };

    /* ── Download Audit Report (styled HTML — professional layout) ─ */
    const handleDownloadReport = (ship: Shipment) => {
        const jury = ship.last_jury;
        const riskNum = typeof jury?.sentinel?.risk_score === 'number' ? jury.sentinel.risk_score : null;
        const risk = riskNum ?? 'N/A';
        const riskClass = riskNum != null ? (riskNum >= 80 ? 'high' : riskNum >= 50 ? 'medium' : 'low') : '';
        const reasoning = jury?.chief_justice?.reasoning_narrative || jury?.chief_justice?.judgment || 'No verdict.';
        const verdictLabel = jury?.chief_justice?.trigger_contract ? 'APPROVED' : 'REJECTED';
        const verdictColor = verdictLabel === 'APPROVED' ? '#059669' : '#dc2626';
        const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const events = ship.logistics_events || [];
        const eventRows = events.map((e: any) => `
            <tr><td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:0.9rem;">${esc((e.severity || 'N/A').toUpperCase())}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">${esc(e.event || JSON.stringify(e))}</td></tr>`).join('') || '<tr><td colspan="2" style="padding:16px;color:#9ca3af;font-size:0.9rem;">No events logged</td></tr>';
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Navi-Trust Audit Report — ${ship.shipment_id}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');</style></head>
<body style="font-family:'Inter',system-ui,-apple-system,sans-serif;margin:0;padding:0;background:#f8fafc;">
<div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;padding:28px 40px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
  <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.12em;opacity:0.8;margin-bottom:4px;">NAVI-TRUST</div>
  <h1 style="margin:0;font-size:1.5rem;font-weight:700;">Supply Chain Audit Report</h1>
  <div style="font-size:0.85rem;opacity:0.9;margin-top:8px;">${ship.shipment_id} · Generated ${new Date().toLocaleString()}</div>
</div>
<div style="max-width:680px;margin:0 auto;padding:32px 40px;">
  <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e2e8f0;overflow:hidden;margin-bottom:24px;">
    <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:0.95rem;color:#334155;">Shipment Overview</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:24px;">
      <div><div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Shipment ID</div><div style="font-weight:600;">${ship.shipment_id}</div></div>
      <div><div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Status</div><div style="font-weight:600;color:${ship.stage === 'Delayed_Disaster' ? '#dc2626' : '#2563eb'};">${ship.stage}</div></div>
      <div style="grid-column:1/-1;"><div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Route</div><div style="font-weight:500;">${ship.origin} → ${ship.destination}</div></div>
      <div><div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Risk Score</div><div><span style="display:inline-block;padding:6px 12px;border-radius:8px;font-weight:700;font-size:1rem;background:${riskClass === 'high' ? '#fef2f2' : riskClass === 'medium' ? '#fffbeb' : '#f0fdf4'};color:${riskClass === 'high' ? '#dc2626' : riskClass === 'medium' ? '#d97706' : '#059669'};">${risk}/100</span></div></div>
      <div><div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">AI Verdict</div><div style="font-weight:600;color:${verdictColor};">${verdictLabel}</div></div>
    </div>
  </div>
  <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e2e8f0;overflow:hidden;margin-bottom:24px;">
    <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:0.95rem;color:#334155;">AI Reasoning</div>
    <div style="padding:24px;background:#f8fafc;border-left:4px solid #2563eb;margin:0;font-size:0.95rem;line-height:1.6;color:#475569;">${esc(reasoning)}</div>
  </div>
  <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e2e8f0;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:0.95rem;color:#334155;">Logistics Events (${events.length})</div>
    <table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8fafc;"><th style="padding:12px 14px;text-align:left;font-size:0.7rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;width:100px;">Severity</th><th style="padding:12px 14px;text-align:left;font-size:0.7rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Event</th></tr></thead><tbody>${eventRows}</tbody></table>
  </div>
  <div style="margin-top:32px;padding:16px 24px;background:#f1f5f9;border-radius:8px;font-size:0.8rem;color:#64748b;text-align:center;">
    Navi-Trust · Algorand Testnet · APP_ID ${appId || 'N/A'} · ${new Date().toISOString()}
  </div>
</div>
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Audit_Report_${ship.shipment_id}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    /* ── Helpers ─────────────────────────────────────────────── */
    const stageStyle = (stage: string) => {
        if (stage === 'In_Transit') return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
        if (stage === 'Delayed_Disaster' || stage === 'Disputed') return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
        if (stage === 'Settled') return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
        if (stage === 'Not_Registered') return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
        return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
    };

    /* ══════════════════════════════════════════════════════════════
       LANDING (marketing)
    ══════════════════════════════════════════════════════════════ */
    if (!accountAddress) {
        return <LandingPage onConnectWallet={handleConnectWallet} />;
    }

    /* ═══════════════════════════════════════════════════════════
       A U T H E N T I C A T E D   D A S H B O A R D
    ═══════════════════════════════════════════════════════════ */
    return (
        <div className="dashboard-shell">
        <div className="dashboard-container">
            {/* ── HEADER ────────────────────────────────────── */}
            <header className="dash-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="dash-brand-icon">
                        <Shield size={20} color="#7dd3fc" strokeWidth={2} />
                    </div>
                    <div>
                        <h1 className="dash-title">Navi-Trust</h1>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: chainHealth ? '#34d399' : '#f87171' }}>
                        ● Algorand Testnet
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Role Toggle */}
                    <div className="dash-role-toggle">
                        <button
                            type="button"
                            onClick={() => setRole('stakeholder')}
                            className={`dash-role-btn${role === 'stakeholder' ? ' dash-role-btn--stakeholder-active' : ''}`}
                        >
                            <Eye size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />Stakeholder
                        </button>
                        <button
                            type="button"
                            onClick={() => setRole('supplier')}
                            className={`dash-role-btn${role === 'supplier' ? ' dash-role-btn--supplier-active' : ''}`}
                        >
                            <Truck size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />Supplier
                        </button>
                    </div>

                    {/* Wallet Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="dash-wallet-pill">
                            <div className="dash-wallet-avatar">
                                <User size={14} color="#e0e7ff" />
                            </div>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                            <span className="dash-wallet-addr">
                                {accountAddress.substring(0, 4)}...{accountAddress.substring(accountAddress.length - 5)}
                            </span>
                        </div>
                        <button type="button" onClick={disconnectWallet} className="dash-disconnect">
                            <LogOut size={13} /> Disconnect
                        </button>
                    </div>
                </div>
            </header>

            <nav className="dash-nav">
                <Link to="/verify">Verify</Link>
                <Link to="/protocol">Protocol</Link>
                <Link to="/navibot">NaviBot</Link>
            </nav>

            {/* ── Role Subtitle ──────────────────────────────── */}
            <p className="dash-subtitle">
                {role === 'stakeholder'
                    ? 'Stakeholder — monitor shipments, run the AI jury, and settle on-chain when ready.'
                    : 'Supplier — track your shipments and log mitigations.'}
            </p>

            {/* ── Last transaction + confirming state ───────── */}
            {(confirmingTxLabel || lastConfirmedTx) && (
                <div
                    className="card dash-tx-banner"
                    style={{
                        marginTop: 16,
                        marginBottom: 8,
                        padding: 16,
                        background: 'rgba(15,23,42,0.78)',
                        border: '1px solid rgba(148,163,184,0.35)',
                    }}
                >
                    {confirmingTxLabel ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span className="blink-dot" />
                            <div>
                                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem' }}>Waiting for confirmation…</div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>{confirmingTxLabel}</div>
                            </div>
                        </div>
                    ) : lastConfirmedTx ? (
                        <div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <CheckCircle size={22} color="#34d399" style={{ flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Confirmed on TestNet
                                        </div>
                                        <div style={{ fontWeight: 700, color: '#f8fafc', marginTop: 4, fontSize: '0.95rem' }}>{lastConfirmedTx.label}</div>
                                        {lastConfirmedTx.amountMicro != null ? (
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f0', marginTop: 6 }}>
                                                {(lastConfirmedTx.amountMicro / 1e6).toFixed(4)}{' '}
                                                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>ALGO</span>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                    <a
                                        href={`https://lora.algokit.io/testnet/transaction/${lastConfirmedTx.txId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            textDecoration: 'none',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            color: '#7dd3fc',
                                            padding: '4px 0',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        View on Lora ↗
                                    </a>
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        style={{ background: '#475569', fontSize: '0.78rem', padding: '8px 12px' }}
                                        onClick={() => {
                                            void navigator.clipboard.writeText(lastConfirmedTx.txId);
                                            setToast('Transaction ID copied.');
                                        }}
                                    >
                                        <ClipboardCopy size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        Copy tx id
                                    </button>
                                </div>
                            </div>
                            <div
                                style={{
                                    marginTop: 14,
                                    paddingTop: 12,
                                    borderTop: '1px solid rgba(148,163,184,0.2)',
                                    display: 'grid',
                                    gap: 6,
                                    fontSize: '0.78rem',
                                    color: '#cbd5e1',
                                }}
                            >
                                <div>
                                    <span style={{ color: '#64748b' }}>Transaction</span>{' '}
                                    <span style={{ color: '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{shortTxId(lastConfirmedTx.txId)}</span>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b' }}>Status</span>{' '}
                                    <span style={{ color: '#6ee7b7', fontWeight: 600 }}>Confirmed</span>
                                    {lastConfirmedTx.round != null ? (
                                        <span style={{ color: '#64748b' }}>{' · '}Round {lastConfirmedTx.round}</span>
                                    ) : null}
                                </div>
                                <div>
                                    <span style={{ color: '#64748b' }}>Time</span>{' '}
                                    {new Date(lastConfirmedTx.timestamp).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* ── Four stat cards + recent on-chain activity ──────────────── */}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 16 }}>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Package size={15} color="#38bdf8" />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Shipments</span>
                        </div>
                        <div className="dash-kpi-num" style={{ fontSize: '1.65rem', fontWeight: 700 }}>
                            {stats.active_shipments != null
                                ? String(stats.active_shipments)
                                : String(shipments.filter((s) => s.stage === 'In_Transit').length)}
                        </div>
                        {shipments.length === 0 ? (
                            <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '8px 0 0' }}>Register your first shipment below</p>
                        ) : null}
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <CheckCircle size={15} color="#059669" />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Settled</span>
                        </div>
                        <div className="dash-kpi-num" style={{ fontSize: '1.65rem', fontWeight: 700 }}>
                            {String(stats.total_settled ?? 0)}
                        </div>
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <AlertTriangle size={15} color="#dc2626" />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Disputed</span>
                        </div>
                        <div className="dash-kpi-num" style={{ fontSize: '1.65rem', fontWeight: 700 }}>
                            {String(stats.total_disputed ?? 0)}
                        </div>
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Wifi size={15} color="#4ade80" />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blockchain</span>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: chainHealth ? '#34d399' : '#f87171' }}>
                            {chainHealth ? 'Testnet online' : 'Offline'}
                        </div>
                    </div>
                </div>
            )}

            <section className="card" style={{ marginTop: 16, padding: '16px 18px' }} aria-label="Recent activity">
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12 }}>Recent activity</div>
                {isLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.85rem', color: '#94a3b8' }}>
                        <div
                            style={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                border: '2px solid rgba(125,211,252,0.25)',
                                borderTopColor: '#7dd3fc',
                                animation: 'spin 0.8s linear infinite',
                            }}
                        />
                        Loading from Algorand…
                    </div>
                ) : recentTxns.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No recent transactions yet.</p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {recentTxns.map((t) => (
                            <li
                                key={t.tx_id ?? `tx-${t.round}`}
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    fontSize: '0.82rem',
                                    color: '#cbd5e1',
                                }}
                            >
                                <span>{t.action_plain || t.method_name || 'Transaction'}</span>
                                <span style={{ color: '#64748b' }}>
                                    {t.timestamp ? timeAgo(t.timestamp) : t.round != null ? `Round ${t.round}` : '—'}
                                </span>
                                {t.lora_url ? (
                                    <a
                                        href={t.lora_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ color: '#7dd3fc', fontSize: '0.76rem', fontWeight: 600 }}
                                    >
                                        ↗ Lora
                                    </a>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {!isLoading && focusVaultShip && (
                <section className="card" style={{ marginTop: 16, padding: '18px 20px' }} aria-label="Escrow for selected shipment">
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Truck size={16} color="#38bdf8" /> Escrow (NaviTrust)
                        </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                            Shipment <span style={{ color: '#e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{focusVaultShip.shipment_id}</span> — escrow balance from the chain. Minimum deposit 0.5 ALGO per fund.
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: 16,
                            alignItems: 'stretch',
                        }}
                    >
                        <div
                            className="card"
                            style={{
                                minHeight: 120,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8',
                                fontSize: 13,
                                textAlign: 'center',
                                padding: 16,
                                background: 'rgba(30,41,59,0.5)',
                            }}
                        >
                            Route: {focusVaultShip.origin} → {focusVaultShip.destination}
                            {focusVaultShip.dest_lat != null && focusVaultShip.dest_lon != null
                                ? ` · approx. ${focusVaultShip.lat.toFixed(2)},${focusVaultShip.lon.toFixed(2)} → ${focusVaultShip.dest_lat.toFixed(2)},${focusVaultShip.dest_lon.toFixed(2)}`
                                : ''}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Vault balance (on-chain)
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0' }}>
                                {((focusVaultShip.funds_locked_microalgo ?? 0) / 1e6).toFixed(4)}{' '}
                                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>ALGO</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {vaultMilestones.map((m) => (
                                    <span
                                        key={m.id}
                                        style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            padding: '4px 10px',
                                            borderRadius: 999,
                                            border: '1px solid rgba(148,163,184,0.35)',
                                            background: m.reached ? 'rgba(52,211,153,0.15)' : 'rgba(30,41,59,0.6)',
                                            color: m.reached ? '#6ee7b7' : '#94a3b8',
                                        }}
                                    >
                                        {m.reached ? '✓ ' : ''}
                                        {m.label}
                                    </span>
                                ))}
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Recent deposits (your wallet)
                            </div>
                            <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: '0.78rem', color: '#cbd5e1' }}>
                                <span style={{ color: '#64748b' }}>After you deposit, a confirmation banner appears with a Lora link.</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                <button
                                    type="button"
                                    className="primary-btn"
                                    disabled={!!isPaying || !appId}
                                    onClick={() => handleFundEscrow(focusVaultShip.shipment_id)}
                                    style={{ flex: '1 1 140px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    <Lock size={14} /> {isPaying === focusVaultShip.shipment_id ? 'Signing…' : 'Deposit 0.5 ALGO'}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
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
                {displayedShipments.length === 0 ? (
                    <div
                        className="card"
                        style={{
                            gridColumn: '1 / -1',
                            padding: '28px 22px',
                            background: 'rgba(15,23,42,0.35)',
                            border: '1px solid rgba(148,163,184,0.25)',
                            textAlign: 'center',
                        }}
                    >
                        <Package size={32} color="#38bdf8" style={{ marginBottom: 12 }} />
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f1f5f9', marginBottom: 8 }}>No shipments registered yet.</div>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 18px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
                            Register a shipment on Algorand to see it here.
                        </p>
                        <button type="button" className="primary-btn" onClick={() => setRegisterModal(true)}>
                            Register shipment
                        </button>
                    </div>
                ) : null}
                {displayedShipments.map((ship) => {
                    const jury = ship.last_jury;
                    const risk = jury?.sentinel?.risk_score ?? null;
                    const sc = stageStyle(ship.stage);
                    const isRunning = juryRunning === ship.shipment_id;

                    const hasVerdictTx = !!(jury?.on_chain_tx_id);
                    const verdictFlagged = !!jury?.trigger_contract;
                    const awaitingOffChainSync = !(ship.origin && ship.origin !== 'N/A' && ship.destination && ship.destination !== 'N/A');
                    const cardFlagged = ship.stage === 'Disputed' || ship.stage === 'Delayed_Disaster';
                    const fundsMicro = ship.funds_locked_microalgo ?? 0;
                    const riskBandPct = risk !== null ? Math.min(100, Math.max(0, risk)) : 0;

                    return (
                        <div key={ship.shipment_id} className={`card${cardFlagged ? ' card-flagged' : ''}`} style={{ textAlign: 'left' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Package size={15} color="#2563eb" />
                                        <span style={{ fontSize: '0.8rem', fontFamily: 'ui-monospace, monospace' }}>{ship.shipment_id}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '0.875rem', color: '#374151' }}>
                                        {(ship.origin && ship.origin !== 'N/A' && ship.destination && ship.destination !== 'N/A') ? (
                                            <>
                                                <span>{ship.origin}</span>
                                                <ArrowRight size={13} color="#9ca3af" />
                                                <span>{ship.destination}</span>
                                            </>
                                        ) : (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6,
                                                background: '#fef3c7', color: '#92400e', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em',
                                            }}>
                                                AWAITING OFF-CHAIN SYNC
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                    <div style={{
                                        padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap',
                                    }}>
                                        {ship.stage.replace('_', ' ')}
                                    </div>
                                </div>
                            </div>

                            {fundsMicro > 0 && (
                                <div style={{ marginBottom: 10, fontSize: '0.8rem', color: '#64748b' }}>
                                    Funds locked:{' '}
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{(fundsMicro / 1e6).toFixed(2)} ALGO</span>
                                </div>
                            )}

                            {risk !== null && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>AI jury risk</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{risk} / 100</span>
                                        <div style={{ flex: 1, maxWidth: 140, height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
                                            <div style={{ width: `${riskBandPct}%`, height: '100%', background: risk > 80 ? '#dc2626' : risk > 50 ? '#d97706' : '#16a34a' }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Stats: Live Sensor Feed (Supplier) or Weather (Stakeholder) */}
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 8 }}>
                                Telemetry &amp; weather
                            </div>
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
                            </div>

                            {isRunning && role === 'stakeholder' && (
                                <div
                                    style={{
                                        marginBottom: 14,
                                        padding: 14,
                                        borderRadius: 10,
                                        background: 'rgba(15,23,42,0.06)',
                                        border: '1px solid rgba(148,163,184,0.35)',
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 10 }}>Running AI jury…</div>
                                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: '#475569', lineHeight: 1.8 }}>
                                        <li style={{ color: juryAgentIdx >= 0 ? '#0f172a' : '#94a3b8' }}>Sentry analyzing weather…</li>
                                        <li style={{ color: juryAgentIdx >= 1 ? '#0f172a' : '#94a3b8' }}>Auditor checking chain…</li>
                                        <li style={{ color: juryAgentIdx >= 2 ? '#0f172a' : '#94a3b8' }}>Arbiter deciding…</li>
                                    </ul>
                                </div>
                            )}

                            {role === 'stakeholder' && jury && !isRunning && (
                                <div
                                    style={{
                                        marginBottom: 14,
                                        padding: 14,
                                        borderRadius: 10,
                                        border: '1px solid #e5e7eb',
                                        background: '#fafafa',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                            Risk score: {risk ?? '—'} / 100
                                        </span>
                                        {risk != null && (
                                            <span
                                                style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                    padding: '2px 8px',
                                                    borderRadius: 6,
                                                    background: risk > 80 ? '#fef2f2' : risk > 50 ? '#fffbeb' : '#f0fdf4',
                                                    color: risk > 80 ? '#b91c1c' : risk > 50 ? '#b45309' : '#15803d',
                                                }}
                                            >
                                                {risk > 80 ? 'High risk' : risk > 50 ? 'Elevated' : 'Lower risk'}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.55, marginBottom: 8 }}>
                                        <span style={{ marginRight: 6 }} aria-hidden>🛰</span>
                                        <strong>Sentry:</strong> {jury.sentinel?.reasoning_narrative || jury.sentinel?.reasoning || '—'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.55, marginBottom: 8 }}>
                                        <span style={{ marginRight: 6 }} aria-hidden>📋</span>
                                        <strong>Auditor:</strong> {jury.auditor?.audit_report || jury.auditor?.blockchain_status || '—'}
                                        {fundsMicro > 0 ? (
                                            <span style={{ display: 'block', marginTop: 4, color: '#64748b' }}>
                                                Funds locked: {(fundsMicro / 1e6).toFixed(2)} ALGO
                                            </span>
                                        ) : null}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.55, marginBottom: 10 }}>
                                        <span style={{ marginRight: 6 }} aria-hidden>⚖️</span>
                                        <strong>Arbiter:</strong>{' '}
                                        {jury.chief_justice?.judgment === 'RECORDED' || verdictFlagged
                                            ? 'Verdict recorded on-chain'
                                            : jury.chief_justice?.judgment || (verdictFlagged ? 'Flag shipment' : 'Hold / no flag')}
                                        {jury.chief_justice?.reasoning_narrative ? (
                                            <span style={{ display: 'block', marginTop: 6, fontStyle: 'italic' }}>
                                                &ldquo;{jury.chief_justice.reasoning_narrative}&rdquo;
                                            </span>
                                        ) : null}
                                    </div>
                                    {jury.on_chain_tx_id ? (
                                        <a
                                            href={`https://lora.algokit.io/testnet/transaction/${jury.on_chain_tx_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                                display: 'inline-block',
                                                fontSize: '0.78rem',
                                                fontWeight: 600,
                                                color: '#2563eb',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            View verdict on Lora ↗
                                        </a>
                                    ) : null}
                                </div>
                            )}

                            <WitnessPanel shipmentId={ship.shipment_id} oracleAddress={oracleAddress} />
                            {role === 'stakeholder' && (
                                <WeatherCourt shipmentId={ship.shipment_id} destinationLabel={ship.destination || ''} />
                            )}
                            {role === 'supplier' && (
                                <CustodyChain
                                    shipmentId={ship.shipment_id}
                                    walletAddress={accountAddress}
                                    canAdd={Boolean(accountAddress)}
                                />
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
                                        {ship.stage === 'Settled' ? (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 120, fontSize: '0.8rem' }}
                                                onClick={() => void handleViewAudit(ship.shipment_id)}
                                            >
                                                <CheckCircle size={13} /> View certificate
                                            </button>
                                        ) : null}
                                        {(ship.stage === 'Disputed' || ship.stage === 'Delayed_Disaster') ? (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 120, fontSize: '0.8rem', background: '#b45309' }}
                                                onClick={() => void handleViewAudit(ship.shipment_id)}
                                            >
                                                <AlertTriangle size={13} /> View dispute
                                            </button>
                                        ) : null}
                                        {ship.stage === 'In_Transit' && hasVerdictTx && verdictFlagged ? (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 120, fontSize: '0.8rem', background: '#b45309' }}
                                                onClick={() => void handleViewAudit(ship.shipment_id)}
                                            >
                                                <AlertTriangle size={13} /> View dispute
                                            </button>
                                        ) : null}
                                        {ship.stage === 'In_Transit' && !hasVerdictTx ? (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                disabled={isRunning || awaitingOffChainSync}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    minWidth: 120,
                                                    fontSize: '0.8rem',
                                                    ...(awaitingOffChainSync ? { background: '#9ca3af', cursor: 'not-allowed' } : {}),
                                                }}
                                                onClick={() => void handleRunJury(ship.shipment_id)}
                                                title={awaitingOffChainSync ? 'Syncing shipment metadata' : undefined}
                                            >
                                                <Play size={13} /> {isRunning ? 'Running jury…' : 'Run AI jury'}
                                            </button>
                                        ) : null}
                                        {ship.stage === 'In_Transit' && hasVerdictTx && !verdictFlagged ? (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    minWidth: 120,
                                                    fontSize: '0.8rem',
                                                    background: '#059669',
                                                }}
                                                onClick={() => void handleSettleShipment(ship.shipment_id)}
                                            >
                                                <CheckCircle size={13} /> Settle shipment
                                            </button>
                                        ) : null}
                                        {ship.stage !== 'Not_Registered' && ship.stage !== 'Settled' && (
                                            <button
                                                type="button"
                                                disabled={isPaying === ship.shipment_id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                    fontSize: '0.75rem', padding: '6px 10px', borderRadius: 6,
                                                    background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                                                    cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                                                }}
                                                onClick={() => void handleFundEscrow(ship.shipment_id)}
                                            >
                                                <Coins size={12} /> {isPaying === ship.shipment_id ? 'Signing…' : 'Lock 0.5 ALGO'}
                                            </button>
                                        )}
                                    </>
                                )}
                                {role === 'supplier' && (
                                    <>
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
                                {role === 'stakeholder' && ship.stage !== 'Settled' && (
                                    <button
                                        type="button"
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.8rem' }}
                                        onClick={() => void handleViewAudit(ship.shipment_id)}
                                    >
                                        <History size={13} /> Audit trail
                                    </button>
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
            {juryResult && (() => {
                const jr = juryResult as JuryResult & {
                    sentinel?: { risk_score?: number; reasoning_narrative?: string; reasoning?: string };
                    auditor?: { audit_report?: string; blockchain_status?: string };
                    chief_justice?: { judgment?: string; reasoning_narrative?: string };
                    on_chain_tx_id?: string;
                    explorer_url?: string;
                };
                const rscore = jr.sentinel?.risk_score ?? null;
                const rband = rscore != null ? (rscore > 80 ? 'HIGH RISK' : rscore > 50 ? 'ELEVATED' : 'LOWER RISK') : '';
                return (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 520, width: '95%', textAlign: 'left', padding: '20px 22px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>AI jury result</h3>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{jr.shipment_id}</div>
                            </div>
                            <button type="button" onClick={() => setJuryResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>
                        <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fafafa', marginBottom: 16 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>Risk score: {rscore ?? '—'} / 100</span>
                                {rband ? (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', color: '#b45309' }}>{rband}</span>
                                ) : null}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55, marginBottom: 10 }}>
                                <strong>🛰 Sentry:</strong> {jr.sentinel?.reasoning_narrative || jr.sentinel?.reasoning || '—'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55, marginBottom: 10 }}>
                                <strong>📋 Auditor:</strong> {jr.auditor?.audit_report || jr.auditor?.blockchain_status || '—'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.55, marginBottom: 12 }}>
                                <strong>⚖️ Arbiter:</strong> {jr.chief_justice?.judgment || (jr.trigger_contract ? 'Recorded on-chain' : 'No on-chain flag')}
                                {jr.chief_justice?.reasoning_narrative ? (
                                    <span style={{ display: 'block', marginTop: 6, fontStyle: 'italic' }}>
                                        &ldquo;{jr.chief_justice.reasoning_narrative}&rdquo;
                                    </span>
                                ) : null}
                            </div>
                            {(jr.explorer_url || jr.on_chain_tx_id) ? (
                                <a
                                    href={jr.explorer_url || `https://lora.algokit.io/testnet/transaction/${jr.on_chain_tx_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: '0.78rem', fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                                >
                                    View verdict on Lora ↗
                                </a>
                            ) : null}
                        </div>
                        <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={() => setJuryResult(null)}>Close</button>
                    </div>
                </div>
                );
            })()}

            {/* ── Audit Trail Modal ─────────────────────────── */}
            {auditTrail && (
                <div className="modal-backdrop" style={{ zIndex: 9999 }}>
                    <div className="card" style={{ maxWidth: 650, width: '95%', textAlign: 'left', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Audit Trail &mdash; {auditTrail.shipment_id}</h3>
                                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                    APP_ID:{' '}
                                    <a
                                        href={`https://lora.algokit.io/testnet/application/${auditTrail.app_id ?? appId ?? FALLBACK_APP_ID}`}
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

                        {(auditTrail as any).indexer_notes?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Verifiable Transaction Notes (Indexer)
                                </div>
                                {(auditTrail as any).indexer_notes.map((n: any, i: number) => (
                                    <div key={i} style={{ padding: 10, marginBottom: 8, background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #10b981' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#111827', lineHeight: 1.5 }}>{n.reasoning}</div>
                                        {n.round && <div style={{ fontSize: '0.65rem', color: '#059669', marginTop: 4 }}>Block #{n.round}</div>}
                                        {n.tx_id && (
                                            <a href={`https://lora.algokit.io/testnet/transaction/${n.tx_id}`} target="_blank" rel="noreferrer"
                                               style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: '#2563eb', textDecoration: 'none' }}>
                                                <ExternalLink size={10} /> TX: {n.tx_id.substring(0, 12)}...
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

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

            {/* ── Register shipment modal ─────────────────────── */}
            {registerModal && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 440, width: '95%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Register shipment</h3>
                            <button type="button" onClick={() => setRegisterModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Shipment ID</label>
                        <input
                            value={regForm.shipment_id}
                            onChange={(e) => setRegForm((f) => ({ ...f, shipment_id: e.target.value }))}
                            placeholder="e.g. SHIP_MUMBAI_001"
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12, fontSize: '0.9rem' }}
                        />
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Origin</label>
                        <select
                            value={regForm.origin}
                            onChange={(e) => setRegForm((f) => ({ ...f, origin: e.target.value }))}
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12, fontSize: '0.9rem' }}
                        >
                            {CITIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Destination</label>
                        <select
                            value={regForm.destination}
                            onChange={(e) => setRegForm((f) => ({ ...f, destination: e.target.value }))}
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12, fontSize: '0.9rem' }}
                        >
                            {CITIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Supplier address</label>
                        <input
                            value={regForm.supplier}
                            onChange={(e) => setRegForm((f) => ({ ...f, supplier: e.target.value }))}
                            placeholder="Algorand address"
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 16, fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setRegisterModal(false)} style={{ padding: '10px 16px' }}>
                                Cancel
                            </button>
                            <button type="button" className="primary-btn" disabled={registerBusy} onClick={() => void handleRegisterShipment()}>
                                {registerBusy ? 'Registering…' : 'Register on Algorand'}
                            </button>
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
                            Shipment <span style={{ fontFamily: 'ui-monospace, monospace' }}>{mitigateModal.shipmentId}</span> — describe the resolution (e.g. &ldquo;Rebooted backup generator, temperature stabilizing&rdquo;):
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

            {/* ── Escrow funding confirmation ────────────────── */}
            {paymentReceipt && (
                <div className="modal-backdrop">
                    <div className="card" style={{ maxWidth: 500, width: '95%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Lock size={18} color="#16a34a" />
                                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Funds submitted on-chain</h3>
                            </div>
                            <button type="button" onClick={() => setPaymentReceipt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#9ca3af" />
                            </button>
                        </div>

                        <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 14, fontSize: '0.85rem', color: '#166534' }}>
                            Escrow deposit confirmed for{' '}
                            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{paymentReceipt.shipment_id}</span>
                            {paymentReceipt.micro_algo != null ? (
                                <span style={{ display: 'block', marginTop: 8 }}>
                                    Amount: {(paymentReceipt.micro_algo as number) / 1e6} ALGO
                                </span>
                            ) : null}
                        </div>

                        {paymentReceipt.tx_id ? (
                            <a
                                href={`https://lora.algokit.io/testnet/transaction/${paymentReceipt.tx_id}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ display: 'inline-block', fontWeight: 600, color: '#2563eb', fontSize: '0.8rem', marginBottom: 12 }}
                            >
                                View on Lora ↗
                            </a>
                        ) : null}

                        <button type="button" className="primary-btn" style={{ width: '100%', marginTop: 14 }} onClick={() => setPaymentReceipt(null)}>Close</button>
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
                                    <p style={{ margin: 0, color: '#374151', fontSize: '0.875rem', lineHeight: 1.6 }}>{selectedShipment.last_jury.sentinel?.reasoning_narrative || selectedShipment.last_jury.sentinel?.reasoning}</p>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <h4 style={{ color: '#2563eb', margin: '0 0 6px' }}>Compliance Auditor — On-Chain Verification</h4>
                                    <p style={{ margin: 0, color: '#374151', fontSize: '0.875rem', lineHeight: 1.6 }}>{selectedShipment.last_jury.auditor?.audit_report || selectedShipment.last_jury.auditor?.blockchain_status}</p>
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
                                    onClick={() => handleDownloadReport(selectedShipment)}
                                >
                                    <Download size={16} /> Download Audit Report
                                </button>
                            )}
                            <button className="primary-btn" style={{ flex: 1, background: '#6b7280' }} onClick={() => setSelectedShipment(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <footer className="dash-footer">
                <span className="dash-footer-brand">Navi-Trust</span>
                <nav className="dash-footer-nav" aria-label="Footer">
                    <Link to="/verify">Verify</Link>
                    <Link to="/protocol">Protocol</Link>
                    <Link to="/navibot">NaviBot</Link>
                </nav>
            </footer>

            {accountAddress && (
                <NaviBotPanel shipmentId={selectedShipment?.shipment_id ?? null} walletAddress={accountAddress} />
            )}
        </div>
        </div>
    );
}

export default function App() {
    return (
        <Routes>
            <Route path="/verify/wallet/:wallet" element={<VerifyPage />} />
            <Route path="/verify/:shipmentId" element={<VerifyPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/protocol" element={<ProtocolPage />} />
            <Route path="/navibot" element={<NaviBotPage />} />
            <Route path="/" element={<MainApp />} />
        </Routes>
    );
}
