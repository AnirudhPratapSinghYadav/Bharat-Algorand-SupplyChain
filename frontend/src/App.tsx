import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import algosdk from "algosdk";
import axios from 'axios';
import {
    Shield, Activity, Cloud, AlertTriangle, ExternalLink,
    CheckCircle, Play, X, Truck, Eye, Package,
    History, Zap, ArrowRight, Lock, Coins, Wifi,
    User, LogOut, Download, ClipboardCopy,
} from 'lucide-react';

import { BACKEND_URL, FALLBACK_APP_ID, API_TIMEOUT, LORA_APP, loraAssetUrl, loraTransactionUrl } from './constants/api';
import {
    shipmentDisplayTitle,
    stageBadgeColors,
    stageUserLabel,
    juryButtonState,
    AGENT_DISPLAY,
    shortAddress,
    verdictUserLabel,
    DASHBOARD_PRODUCT_TITLE,
} from './lib/displayLabels';
import { AlgoEscrowHint } from './components/AlgoEscrowHint';
import { EscrowDisplay } from './components/EscrowDisplay';
import { AddressCopy } from './components/AddressCopy';
import { RegisterShipmentModal, type RegisterFormState } from './components/RegisterShipmentModal';
import { CertificateQr } from './components/CertificateQr';
import VerifyPage from './pages/VerifyPage';
import ProtocolPage from './pages/ProtocolPage';
import TransactionFeedPage from './pages/TransactionFeedPage';
import { FloatingAssistantWidget } from './components/FloatingAssistantWidget';
import { SettlementFlowProgress } from './components/SettlementFlowProgress';
import { TradeRulesPanel } from './components/TradeRulesPanel';
import { WalletProvider, useWallet } from './context/WalletContext';
import { LandingPage } from './components/landing/LandingPage';
import { ShipmentDestinationWeatherRow } from './components/DestinationWeather';
import { JuryRiskHistoryChart } from './components/JuryRiskHistoryChart';
import { SupplierProfileSection, mintSupplierPassport } from './components/SupplierProfileSection';
import { PlatformChecksCard } from './components/PlatformChecksCard';
import { ComplianceChecksStrip } from './components/ComplianceChecksStrip';
import { UserProfileModal } from './components/UserProfileModal';
import { LiveVerdictTerminal } from './components/LiveVerdictTerminal';
import { WitnessButton } from './components/WitnessButton';
import { ShipmentReportActions } from './components/ShipmentReport';
import { DashboardPdfReport } from './components/DashboardPdfReport';
import { DashboardLoadingHint } from './components/DashboardLoadingHint';
import { PostRegisterGuide } from './components/PostRegisterGuide';
import { peraWallet } from './wallet/pera';
import { buildNavitrustFundShipmentTransactions } from './algorand/buildNavitrustFundShipment';
import { useLiveTransactions } from './hooks/useWebSocket';

type DashboardTxn = {
    tx_id?: string;
    action?: string;
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
        if (s === 'VOID') return 2;
        if (s === 'Settled') return 3;
        return 4;
    };
    return [...arr].sort((a, b) => {
        const pa = pri(a.stage ?? '');
        const pb = pri(b.stage ?? '');
        if (pa !== pb) return pa - pb;
        return (a.shipment_id ?? '').localeCompare(b.shipment_id ?? '');
    });
}
const EXPLORER_URL = "https://testnet.explorer.perawallet.app/tx/";

function escrowUsdText(ship: { funds_usd?: number | null }): string | null {
    if (typeof ship.funds_usd === 'number' && Number.isFinite(ship.funds_usd)) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ship.funds_usd);
    }
    return null;
}

/** Toast uses green by default; treat failures (incl. "Mint failed: …") as errors for styling. */
function isErrorToastMessage(message: string): boolean {
    if (message.startsWith('✓')) return false;
    const m = message.toLowerCase();
    if (m.includes('registering on-chain (oracle signs')) return false;
    return /(^|[\s:])fail|failed|error|overspend|blocked|insufficient|not synced|could not|unauthorized|forbidden|registration failed|on-chain registration|mint failed|settlement failed|transaction was cancelled/i.test(
        m,
    );
}

interface Shipment {
    shipment_id: string;
    display_label?: string | null;
    route?: string | null;
    commodity?: string | null;
    origin: string;
    destination: string;
    lat: number;
    lon: number;
    dest_lat?: number | null;
    dest_lon?: number | null;
    stage: string;
    created_at?: string | null;
    weather: any;
    logistics_events: any[];
    last_jury: any;
    supplier_address?: string | null;
    funds_locked_microalgo?: number;
    /** CoinGecko-derived escrow value (backend Phase 1) */
    funds_usd?: number | null;
    funds_inr?: number | null;
    supplier_reputation_score?: number | null;
    supplier_reputation_source?: string | null;
    on_chain?: {
        certificate_asa?: number;
        lora_cert_url?: string;
        funds_microalgo?: number;
        status?: string;
        /** Present when API exposes last settlement app-call tx id */
        settlement_tx_id?: string;
    };
    lora_app_url?: string;
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

function MainApp() {
    const queryClient = useQueryClient();
    const {
        address: accountAddress,
        role,
        switchRole,
        isFading,
        connect: handleConnectWallet,
        disconnect: disconnectWallet,
    } = useWallet();
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [appId, setAppId] = useState<number | null>(null);
    const [juryResult, setJuryResult] = useState<JuryResult | null>(null);
    const [auditTrail, setAuditTrail] = useState<AuditTrailData | null>(null);
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const [stats, setStats] = useState<{
        total_scans: number;
        verified_anomalies: number;
        contract_algo?: number;
        escrow_total_algo?: number;
        contract_app_address?: string;
        lora_contract_account_url?: string;
        lora_contract_url?: string;
        total_shipments?: number;
        active_shipments?: number;
        total_settled?: number;
        total_disputed?: number;
    }>({ total_scans: 0, verified_anomalies: 0 });
    const [recentTxns, setRecentTxns] = useState<DashboardTxn[]>([]);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [registerModal, setRegisterModal] = useState(false);
    const [registerBusy, setRegisterBusy] = useState(false);
    const [postRegister, setPostRegister] = useState<{
        shipmentId: string;
        plannedAlgo: number;
        loraUrl?: string | null;
    } | null>(null);
    const [highlightShipmentId, setHighlightShipmentId] = useState<string | null>(null);
    const [voidBusy, setVoidBusy] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [dataReady, setDataReady] = useState(false);
    const [paymentReceipt, setPaymentReceipt] = useState<any>(null);
    const [isPaying, setIsPaying] = useState<string | null>(null);
    const [boxStatuses, setBoxStatuses] = useState<Record<string, string>>({});
    const [mitigateModal, setMitigateModal] = useState<{ shipmentId: string } | null>(null);
    const [mitigateText, setMitigateText] = useState('');
    const [mitigateSubmitting, setMitigateSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmingTxLabel, setConfirmingTxLabel] = useState<string | null>(null);
    const [lastConfirmedTx, setLastConfirmedTx] = useState<ConfirmedActivity | null>(null);
    const [activityFeed, setActivityFeed] = useState<ConfirmedActivity[]>([]);
    const [oracleAddress, setOracleAddress] = useState<string | null>(null);
    const [chainHealth, setChainHealth] = useState(false);
    const [healthSnapshot, setHealthSnapshot] = useState<{
        algod_ok?: boolean;
        indexer_ok?: boolean;
        db_ok?: boolean;
        oracle_configured?: boolean;
        gemini_configured?: boolean;
        last_round?: number;
        oracle_address?: string | null;
        on_chain_oracle_address?: string | null;
        oracle_matches_app?: boolean | null;
    } | null>(null);
    /** When set, that shipment's card shows LiveVerdictTerminal instead of the standard body. */
    const [juryTerminalShipmentId, setJuryTerminalShipmentId] = useState<string | null>(null);
    const [settleReceipt, setSettleReceipt] = useState<{
        shipment_id: string;
        cert_asa_id: number;
        tx_id?: string;
        supplier_paid_algo?: number;
    } | null>(null);
    const [passportAsa, setPassportAsa] = useState<string | null>(null);
    const [passportMinting, setPassportMinting] = useState(false);
    /** Last error loading /shipments (API down, CORS, wrong VITE_API_URL, etc.) */
    const [shipmentsSyncError, setShipmentsSyncError] = useState<string | null>(null);

    const refreshRecentTxns = useCallback(() => {
        axios
            .get(`${BACKEND_URL}/transactions`, { params: { limit: 5 }, timeout: 8000 })
            .then((r) => {
                const d = r.data as unknown;
                const arr = Array.isArray(d) ? d : Array.isArray((d as { transactions?: unknown })?.transactions) ? (d as { transactions: DashboardTxn[] }).transactions : [];
                setRecentTxns(arr);
            })
            .catch(() => setRecentTxns([]));
    }, []);

    const { payload: liveWsPayload, connected: liveWsConnected } = useLiveTransactions(true);

    useEffect(() => {
        document.title = DASHBOARD_PRODUCT_TITLE;
    }, []);

    useEffect(() => {
        const rows = liveWsPayload?.transactions;
        if (!Array.isArray(rows) || rows.length === 0) return;
        setRecentTxns(
            rows.slice(0, 15).map((t: Record<string, unknown>) => ({
                tx_id: String(t.tx_id ?? ''),
                action: String(t.action ?? ''),
                lora_url: typeof t.lora_url === 'string' ? t.lora_url : undefined,
                timestamp: typeof t.timestamp === 'string' ? t.timestamp : undefined,
                round: typeof t.round === 'number' ? t.round : undefined,
            })),
        );
    }, [liveWsPayload]);

    const activeShipmentCount = useMemo(
        () => shipments.filter((s) => s.stage === 'In_Transit' || s.stage === 'Disputed' || s.stage === 'Delayed_Disaster').length,
        [shipments],
    );

    useEffect(() => {
        document.title = `Pramanik Oracle | ${activeShipmentCount} Active Shipments`;
    }, [activeShipmentCount]);

    /* ── Backend / algod health (poll every 15s while dashboard mounted) ─ */
    useEffect(() => {
        const check = async () => {
            try {
                const r = await fetch(`${BACKEND_URL}/health`);
                const d = (await r.json()) as {
                    algod_ok?: boolean;
                    indexer_ok?: boolean;
                    db_ok?: boolean;
                    oracle_configured?: boolean;
                    gemini_configured?: boolean;
                    last_round?: number;
                    oracle_address?: string | null;
                    on_chain_oracle_address?: string | null;
                    oracle_matches_app?: boolean | null;
                };
                setChainHealth(d.algod_ok === true);
                setHealthSnapshot(d);
            } catch {
                setChainHealth(false);
                setHealthSnapshot(null);
            }
        };
        void check();
        const interval = window.setInterval(() => void check(), 15_000);
        return () => window.clearInterval(interval);
    }, []);

    /* ── Public Tracker: load config without wallet so verify tab works ─ */
    useEffect(() => {
        axios.get(`${BACKEND_URL}/config`).then((r) => setAppId(r.data?.app_id ?? null)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!accountAddress) {
            setPassportAsa(null);
            return;
        }
        try {
            const v = sessionStorage.getItem(`navi_passport_asa_${accountAddress}`);
            setPassportAsa(v && /^\d+$/.test(v.trim()) ? v.trim() : null);
        } catch {
            setPassportAsa(null);
        }
    }, [accountAddress]);

    useEffect(() => {
        try {
            const p = sessionStorage.getItem('navi_pending_jury');
            if (p) {
                sessionStorage.removeItem('navi_pending_jury');
                setJuryTerminalShipmentId(p);
            }
        } catch {
            /* ignore */
        }
    }, []);

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

    /* Same on-chain list for both roles — cards differ by role. */
    const displayedShipments = useMemo(() => shipments, [shipments]);

    const supplierShipFilter = useCallback(
        (s: Shipment) => !s.supplier_address || !accountAddress || s.supplier_address === accountAddress,
        [accountAddress],
    );

    const stakeholderLockedAlgo = useMemo(
        () =>
            shipments
                .filter((s) => s.stage === 'In_Transit' || s.stage === 'Disputed' || s.stage === 'Delayed_Disaster')
                .reduce((acc, s) => acc + (s.funds_locked_microalgo ?? 0), 0) / 1e6,
        [shipments],
    );
    const stakeholderHasDisputedInEscrow = useMemo(
        () => shipments.some((s) => s.stage === 'Disputed' || s.stage === 'Delayed_Disaster'),
        [shipments],
    );
    const stakeholderProtectedCount = useMemo(
        () => shipments.filter((s) => s.stage !== 'Settled' && s.stage !== 'Not_Registered').length,
        [shipments],
    );

    const supplierPendingAlgo = useMemo(() => {
        if (!accountAddress) return null;
        const sum =
            shipments
                .filter((s) => supplierShipFilter(s) && s.stage === 'In_Transit')
                .reduce((a, s) => a + (s.funds_locked_microalgo ?? 0), 0) / 1e6;
        return sum > 0 ? sum : null;
    }, [shipments, accountAddress, supplierShipFilter]);

    const supplierFrozenAlgo = useMemo(() => {
        if (!accountAddress) return 0;
        return (
            shipments
                .filter((s) => supplierShipFilter(s) && (s.stage === 'Disputed' || s.stage === 'Delayed_Disaster'))
                .reduce((a, s) => a + (s.funds_locked_microalgo ?? 0), 0) / 1e6
        );
    }, [shipments, accountAddress, supplierShipFilter]);

    const supplierReceivedAlgo = useMemo(() => {
        if (!accountAddress) return 0;
        const sum =
            shipments
                .filter((s) => supplierShipFilter(s) && s.stage === 'Settled')
                .reduce((a, s) => a + (s.funds_locked_microalgo ?? 0), 0) / 1e6;
        return sum;
    }, [shipments, accountAddress, supplierShipFilter]);

    const supplierIdentityCounts = useMemo(() => {
        const settled = shipments.filter((s) => supplierShipFilter(s) && s.stage === 'Settled').length;
        const disputed = shipments.filter(
            (s) => supplierShipFilter(s) && (s.stage === 'Disputed' || s.stage === 'Delayed_Disaster'),
        ).length;
        return { settled, disputed };
    }, [shipments, supplierShipFilter]);

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

    const prevWalletRef = useRef<string | null>(null);

    /* ── Data polling — only when wallet is connected ──────── */
    useEffect(() => {
        if (!accountAddress) {
            prevWalletRef.current = null;
            setIsLoading(false);
            setIsRefreshing(false);
            setDataReady(false);
            return;
        }

        const walletChanged = prevWalletRef.current !== accountAddress;
        prevWalletRef.current = accountAddress;
        if (walletChanged) {
            setShipments([]);
            setBoxStatuses({});
        }

        const keepVisible = !walletChanged && shipments.length > 0;
        setIsLoading(true);
        if (keepVisible) {
            setIsRefreshing(true);
        } else {
            setDataReady(false);
        }

        const bootstrap = async () => {
            const opts = { timeout: API_TIMEOUT };
            try {
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
                    setShipmentsSyncError(null);
                    const raw = shipmentsRes.value.data;
                    const data = Array.isArray(raw) ? raw : [];
                    setShipments(sortShipmentsStable(data));
                    const st: Record<string, string> = {};
                    data.forEach((s: any) => {
                        st[s.shipment_id] = s.stage || '';
                    });
                    setBoxStatuses(st);
                } else {
                    setShipments([]);
                    setBoxStatuses({});
                    const reason = shipmentsRes.reason;
                    const msg =
                        reason && typeof reason === 'object' && 'message' in reason
                            ? String((reason as { message?: string }).message)
                            : 'Could not load shipments';
                    setShipmentsSyncError(null);
                }
            } catch {
                setShipments([]);
                setBoxStatuses({});
                setShipmentsSyncError(null);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
                setDataReady(true);
            }
        };
        void bootstrap();

        const safety = setTimeout(() => {
            setIsLoading(false);
            setIsRefreshing(false);
            setDataReady(true);
        }, 12000);
        return () => clearTimeout(safety);
    }, [accountAddress]);

    /* ── Poll ledger every 20s — fixes empty UI if first request failed or after external registration ─ */
    useEffect(() => {
        if (!accountAddress) return;
        const poll = async () => {
            setIsRefreshing(true);
            try {
                const [s, st] = await Promise.all([
                    axios.get(`${BACKEND_URL}/shipments`, { timeout: API_TIMEOUT }),
                    axios.get(`${BACKEND_URL}/stats`, { timeout: API_TIMEOUT }),
                ]);
                const data = Array.isArray(s.data) ? s.data : [];
                setShipments(sortShipmentsStable(data));
                setStats(st.data);
                setShipmentsSyncError(null);
                const bx: Record<string, string> = {};
                data.forEach((row: { shipment_id?: string; stage?: string }) => {
                    if (row.shipment_id) bx[row.shipment_id] = row.stage || '';
                });
                setBoxStatuses(bx);
            } catch {
                setShipmentsSyncError(null);
            } finally {
                setIsRefreshing(false);
            }
        };
        const id = window.setInterval(() => void poll(), 20_000);
        return () => window.clearInterval(id);
    }, [accountAddress]);

    /* ── Ledger sync (5s) via GET /shipments — single source of truth ── */

    useEffect(() => {
        if (!accountAddress) return;
        refreshRecentTxns();
    }, [accountAddress, isLoading, refreshRecentTxns, lastConfirmedTx?.txId]);

    const refreshAfterJury = useCallback(async () => {
        const fresh = await axios.get(`${BACKEND_URL}/shipments`);
        setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
        axios.get(`${BACKEND_URL}/stats`).then((r) => setStats(r.data)).catch(() => {});
        refreshRecentTxns();
        void queryClient.invalidateQueries({ queryKey: ['risk-history'] });
        void queryClient.invalidateQueries({ queryKey: ['shipments'] });
        void queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, [queryClient, refreshRecentTxns]);

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
            const fresh = await axios.get(`${BACKEND_URL}/shipments`);
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
        } catch {
            setToast('Failed to submit mitigation');
        } finally {
            setMitigateSubmitting(false);
        }
    };

    const handleRegisterShipment = async (form: RegisterFormState) => {
        if (!accountAddress) {
            setToast('Wallet disconnected. Please reconnect Pera Wallet.');
            return;
        }
        if (!form.shipment_id.trim() || !form.supplier.trim()) {
            setToast('Shipment reference and supplier address are required.');
            return;
        }
        setRegisterBusy(true);
        try {
            setToast('Registering on-chain (oracle signs on the server)…');
            const route = `${form.origin} → ${form.destination} | ${form.commodity}`;
            const plannedAlgo = Math.max(0.5, parseFloat(form.escrow_algo) || 1);
            const regRes = await axios.post(
                `${BACKEND_URL}/register-shipment`,
                {
                    shipment_id: form.shipment_id.trim(),
                    origin: form.origin,
                    destination: form.destination,
                    route,
                    commodity: form.commodity,
                    supplier_address: form.supplier.trim(),
                    planned_escrow_algo: plannedAlgo,
                    origin_lat: 0,
                    origin_lon: 0,
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 120_000,
                },
            );
            const rid = form.shipment_id.trim();
            const rtx = typeof regRes.data?.tx_id === 'string' ? regRes.data.tx_id : '';
            const rlora = typeof regRes.data?.lora_tx_url === 'string' ? regRes.data.lora_tx_url : '';
            setRegisterModal(false);
            setPostRegister({
                shipmentId: rid,
                plannedAlgo,
                loraUrl: rlora || null,
            });
            setHighlightShipmentId(rid);
            setToast(
                rtx
                    ? `✓ ${rid} registered — next: Deposit ${plannedAlgo.toFixed(2)} ALGO in Pera Wallet`
                    : `✓ ${rid} registered — deposit escrow on the corridor card`,
            );
            const fresh = await axios.get(`${BACKEND_URL}/shipments`, {
                params: { _: Date.now() },
                timeout: API_TIMEOUT,
            });
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
            setShipmentsSyncError(null);
            axios.get(`${BACKEND_URL}/stats`).then((r) => setStats(r.data)).catch(() => {});
            refreshRecentTxns();
            void queryClient.invalidateQueries({ queryKey: ['risk-history'] });
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: unknown }; status?: number } };
            const d = err.response?.data?.detail;
            let msg = 'Registration failed.';
            if (typeof d === 'string') {
                msg = d;
            } else if (d && typeof d === 'object' && 'fraud_report' in d) {
                const fr = (d as { fraud_report?: { verdict?: string } }).fraud_report;
                msg = `Fraud check blocked registration (${fr?.verdict ?? 'review'}). Try another supplier or route.`;
            } else if (Array.isArray(d)) {
                msg = d.map((x: { msg?: string }) => x.msg || '').filter(Boolean).join(' ') || msg;
            }
            setToast(msg);
        } finally {
            setRegisterBusy(false);
        }
    };

    const handleVoidShipment = async (shipmentId: string) => {
        if (!window.confirm('Void this shipment? Escrow is refunded (buyer or oracle); supplier reputation drops on-chain.')) {
            return;
        }
        setVoidBusy(shipmentId);
        try {
            const r = await axios.post(`${BACKEND_URL}/void/${encodeURIComponent(shipmentId)}`, null, { timeout: 120_000 });
            const tx = typeof r.data?.tx_id === 'string' ? r.data.tx_id : '';
            setToast(tx ? `Shipment voided · TX ${tx.slice(0, 10)}…` : 'Shipment voided.');
            const fresh = await axios.get(`${BACKEND_URL}/shipments`);
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
            refreshRecentTxns();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            setToast(err.response?.data?.detail || 'Void failed — is the wallet the oracle and is the contract upgraded?');
        } finally {
            setVoidBusy(null);
        }
    };

    const handleSettleShipment = async (shipmentId: string) => {
        try {
            const r = await axios.post(`${BACKEND_URL}/settle`, { shipment_id: shipmentId }, { timeout: 120_000 });
            const data = r.data as {
                tx_id?: string;
                cert_asa_id?: number;
                supplier_paid_algo?: number;
            };
            const txId = data?.tx_id;
            const cert = typeof data?.cert_asa_id === 'number' ? data.cert_asa_id : 0;
            if (txId) recordConfirmedTx({ txId, label: 'Settlement completed' });
            setSettleReceipt({
                shipment_id: shipmentId,
                cert_asa_id: cert,
                tx_id: txId,
                supplier_paid_algo: typeof data?.supplier_paid_algo === 'number' ? data.supplier_paid_algo : undefined,
            });
            setToast('Settlement submitted.');
            const fresh = await axios.get(`${BACKEND_URL}/shipments`);
            setShipments(sortShipmentsStable(Array.isArray(fresh.data) ? fresh.data : []));
            axios.get(`${BACKEND_URL}/stats`).then((x) => setStats(x.data)).catch(() => {});
            refreshRecentTxns();
            void queryClient.invalidateQueries({ queryKey: ['risk-history'] });
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
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
                    network: 'Algorand',
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
            // Pera API: SignerTransaction[][] — outer array = atomic groups, inner = txns in that group
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
            return sendSignedBlobsAndConfirm(blobs, meta, afterConfirm);
        } catch {
            setToast('Transaction was cancelled or could not be confirmed.');
            return false;
        }
    };

    /* ── Lock funds: NaviTrust fund_shipment (wallet-signed group) ─ */
    const handleFundEscrow = async (shipmentId: string, amountAlgo = 0.5) => {
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
            setToast('Opening Pera Wallet — approve the escrow deposit to continue.');
            const res = await axios.post(`${BACKEND_URL}/fund-shipment/build`, {
                shipment_id: shipmentId,
                buyer_address: accountAddress,
                amount_algo: amountAlgo,
            });
            const micro =
                typeof res.data.micro_algo === 'number'
                    ? res.data.micro_algo
                    : typeof res.data.amount_microalgo === 'number'
                      ? res.data.amount_microalgo
                      : Math.round(Number(amountAlgo) * 1_000_000);
            const algodClient = new algosdk.Algodv2('', ALGOD_SERVER, '');
            const txns = await buildNavitrustFundShipmentTransactions({
                algod: algodClient,
                appId: appId!,
                buyerAddress: accountAddress,
                shipmentId,
                microAlgosAmt: micro,
            });
            // Pera API: SignerTransaction[][] — outer array = atomic groups, inner = txns in that group
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
                const fresh = await axios.get(`${BACKEND_URL}/shipments`).catch(() => ({ data: [] }));
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
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pramanik Audit Report — ${ship.shipment_id}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');</style></head>
<body style="font-family:'Inter',system-ui,-apple-system,sans-serif;margin:0;padding:0;background:#f8fafc;">
<div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;padding:28px 40px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
  <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.12em;opacity:0.8;margin-bottom:4px;">PRAMANIK</div>
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
    Pramanik · Settlement audit · ${new Date().toISOString()}
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
        if (stage === 'VOID') return { bg: '#f4f4f5', color: '#71717a', border: '#d4d4d8' };
        if (stage === 'Not_Registered') return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
        return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
    };

    const cardAccentBorder = (stage: string): string | undefined => {
        if (stage === 'Disputed' || stage === 'Delayed_Disaster') return '3px solid var(--danger)';
        if (stage === 'Settled') return '3px solid var(--success)';
        if (stage === 'In_Transit') return '3px solid var(--accent)';
        if (stage === 'VOID') return '3px solid #a1a1aa';
        return undefined;
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
                <div className="dash-header-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div className="dash-brand-icon">
                        <Shield size={20} color="var(--accent)" strokeWidth={2} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <h1 className="dash-title" title="Pramanik — Dispute Oracle for Indian Exporters">Pramanik</h1>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)' }}>Dispute oracle · Indian export escrow</p>
                    </div>
                </div>

                <div className="dash-header-status">
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: chainHealth ? 'var(--success)' : 'var(--muted)' }}>
                        {chainHealth ? '● Live' : '○ Syncing'}
                    </span>
                    {healthSnapshot?.oracle_address && healthSnapshot.oracle_matches_app !== false ? (
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--success)', fontFamily: 'var(--mono)' }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginRight: 6 }} />
                            Oracle: {shortAddress(healthSnapshot.oracle_address)} ✓
                        </span>
                    ) : null}
                </div>

                <div className="dash-header-actions">
                    {/* Role Toggle */}
                    <div className="dash-role-toggle">
                        <button
                            type="button"
                            onClick={() => switchRole('stakeholder')}
                            className={`dash-role-btn${role === 'stakeholder' ? ' dash-role-btn--stakeholder-active' : ''}`}
                            title="Buyer / escrow: fund shipments, request settlement review, release payment — your wallet signs fund transactions."
                        >
                            <Eye size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            {role === 'stakeholder' ? '● ' : ''}Stakeholder
                        </button>
                        <button
                            type="button"
                            onClick={() => switchRole('supplier')}
                            className={`dash-role-btn${role === 'supplier' ? ' dash-role-btn--supplier-active' : ''}`}
                            title="Supplier: view shipments where you are the registered supplier; track escrow and reputation."
                        >
                            <Truck size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            {role === 'supplier' ? '● ' : ''}Supplier
                        </button>
                    </div>

                    <Link
                        to="/activity"
                        className="dash-history-btn"
                        title="Full on-chain history, Lora verification, and PDF export"
                    >
                        <History size={14} aria-hidden />
                        Transaction history
                    </Link>

                    <button
                        type="button"
                        className="primary-btn"
                        style={{ padding: '8px 14px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                        onClick={() => {
                            if (!accountAddress) {
                                setToast('Connect Pera Wallet first — you will sign escrow deposits from your phone.');
                                handleConnectWallet();
                                return;
                            }
                            setRegisterModal(true);
                        }}
                        title="Verify Pera Wallet, register corridor on-chain, then deposit ALGO from the card."
                    >
                        Register shipment
                    </button>

                    {/* Wallet Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                            type="button"
                            className="dash-wallet-pill dash-wallet-pill--interactive"
                            onClick={() => setProfileModalOpen(true)}
                            title="Open profile"
                            aria-label="Open wallet profile"
                        >
                            <div className="dash-wallet-avatar">
                                <User size={14} color="#e0e7ff" />
                            </div>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                            <span className="dash-wallet-addr">
                                <AddressCopy address={accountAddress} />
                            </span>
                        </button>
                        <button type="button" onClick={disconnectWallet} className="dash-disconnect">
                            <LogOut size={13} /> Disconnect
                        </button>
                    </div>
                </div>
            </header>

            {(isPaying || confirmingTxLabel) ? (
                <div className="dash-wallet-hint" role="status">
                    <strong>Pera Wallet</strong>
                    <span>
                        {confirmingTxLabel
                            ? `Confirming: ${confirmingTxLabel}`
                            : 'Approve the transaction in Pera Wallet to move escrow on-chain.'}
                    </span>
                </div>
            ) : null}

            <div className={`dashboard-content${isFading ? ' fading' : ''}${isLoading && !dataReady ? ' dashboard-content--loading' : ''}`}>
            <div className={`dash-page-intro${dataReady ? ' dash-page-intro--ready' : ''}`}>
                <h2 className="dash-subtitle">
                    {role === 'stakeholder' ? 'Escrow portfolio' : 'Supplier portfolio'}
                </h2>
                <p className="dash-page-intro__sub">
                    {role === 'stakeholder'
                        ? 'Active corridors, locked ALGO, and settlement status.'
                        : 'Incoming payments and on-chain reputation.'}
                </p>
            </div>

            {isLoading && !dataReady && shipments.length === 0 ? <DashboardLoadingHint /> : null}

            <SettlementFlowProgress
                shipments={shipments}
                stats={stats}
                loading={isLoading && !dataReady}
                refreshing={isRefreshing}
            />

            <TradeRulesPanel />

            {postRegister ? (
                <PostRegisterGuide
                    shipmentId={postRegister.shipmentId}
                    plannedAlgo={postRegister.plannedAlgo}
                    loraUrl={postRegister.loraUrl}
                    shipment={shipments.find((s) => s.shipment_id === postRegister.shipmentId) ?? null}
                    onDismiss={() => setPostRegister(null)}
                    onScrollToShipment={() => {
                        const el = document.getElementById(`corridor-${postRegister.shipmentId}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                />
            ) : null}

            {accountAddress && dataReady ? (
                <DashboardPdfReport stats={stats} shipments={shipments} appId={appId} wallet={accountAddress} />
            ) : null}

            {dataReady ? <PlatformChecksCard role={role} /> : null}

            {role === 'supplier' && accountAddress ? (
                <SupplierProfileSection
                    accountAddress={accountAddress}
                    appId={appId}
                    settledCount={supplierIdentityCounts.settled}
                    disputedCount={supplierIdentityCounts.disputed}
                    passportAsa={passportAsa}
                    passportMinting={passportMinting}
                    pendingAlgo={supplierPendingAlgo}
                    frozenAlgo={supplierFrozenAlgo}
                    receivedAlgo={supplierReceivedAlgo}
                    onMintPassport={async () => {
                        if (!accountAddress) return;
                        setPassportMinting(true);
                        const result = await mintSupplierPassport(accountAddress);
                        if (result.asaId) {
                            try {
                                sessionStorage.setItem(`navi_passport_asa_${accountAddress}`, result.asaId);
                            } catch {
                                /* ignore */
                            }
                            setPassportAsa(result.asaId);
                        }
                        if (result.message) setToast(result.message);
                        if (result.error) setToast(result.error);
                        setPassportMinting(false);
                    }}
                />
            ) : null}

            {/* ── KPI cards ──────────────── */}
            {role === 'stakeholder' && dataReady ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 16 }}>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Package size={15} color="var(--accent)" />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shipments</span>
                        </div>
                        <div className="dash-kpi-num" style={{ fontSize: '1.65rem', fontWeight: 700 }}>
                            {String(stats.total_shipments ?? 0)}
                        </div>
                        <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '8px 0 0' }}>On-chain counter</p>
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Lock size={15} color={Number(stats.escrow_total_algo) > 0 ? 'var(--accent)' : 'var(--muted)'} />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Locked escrow</span>
                        </div>
                        <div
                            className="dash-kpi-num"
                            style={{
                                fontSize: '1.65rem',
                                fontWeight: 700,
                                color: Number(stats.escrow_total_algo) > 0 ? 'var(--accent)' : 'var(--muted)',
                            }}
                        >
                            {stats.escrow_total_algo != null ? `${Number(stats.escrow_total_algo).toFixed(4)}` : '—'}
                        </div>
                        <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '8px 0 0', display: 'flex', alignItems: 'center' }}>
                            ALGO (crypto) <AlgoEscrowHint size={12} />
                        </p>
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <AlertTriangle size={15} color={(stats.total_disputed ?? 0) > 0 ? 'var(--danger)' : 'var(--muted)'} />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disputed</span>
                        </div>
                        <div
                            className="dash-kpi-num"
                            style={{
                                fontSize: '1.65rem',
                                fontWeight: 700,
                                color: (stats.total_disputed ?? 0) > 0 ? 'var(--danger)' : 'var(--muted)',
                            }}
                        >
                            {String(stats.total_disputed ?? 0)}
                        </div>
                    </div>
                    <div className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Wifi size={15} color="#4ade80" />
                            <span className="dash-kpi-label" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contract</span>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: chainHealth ? '#34d399' : '#f87171' }}>Network Online</div>
                        {appId ? (
                            <a
                                href={LORA_APP(Number(appId))}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}
                            >
                                View on Lora ↗ <ExternalLink size={14} />
                            </a>
                        ) : (
                            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '8px 0 0' }}>Loading app…</p>
                        )}
                    </div>
                </div>
            ) : null}

            {!isLoading && stats.escrow_total_algo != null && role === 'stakeholder' ? (
                <div
                    className="dash-alert"
                    style={{
                        marginTop: 12,
                        background: 'var(--bg-raised)',
                        border: '1px solid var(--border)',
                        fontSize: '0.82rem',
                        color: 'var(--muted)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <Coins size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
                    <span>
                        Contract holds <strong style={{ color: '#111' }}>{stats.escrow_total_algo.toFixed(4)} ALGO</strong>
                        <AlgoEscrowHint size={12} />
                    </span>
                    {(stats.lora_contract_url || stats.lora_contract_account_url) && (
                        <a
                            href={stats.lora_contract_url || stats.lora_contract_account_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontWeight: 600, color: 'var(--accent)', marginLeft: 4 }}
                        >
                            View account ↗
                        </a>
                    )}
                </div>
            ) : null}

            {accountAddress ? <JuryRiskHistoryChart /> : null}

            {!isLoading && role === 'stakeholder' && focusVaultShip && (
                <section className="card" style={{ marginTop: 16, padding: '18px 20px' }} aria-label="Escrow for selected shipment">
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Truck size={16} color="#38bdf8" /> Escrow (Pramanik)
                        </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                            <strong style={{ color: '#e2e8f0' }}>{shipmentDisplayTitle(focusVaultShip)}</strong> — escrow balance from the chain. Minimum deposit 0.5 ALGO (crypto) per fund.
                            <AlgoEscrowHint size={12} />
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
                            {(focusVaultShip.funds_locked_microalgo ?? 0) <= 0 ? (
                                <>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>No escrow locked yet</div>
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.45 }}>
                                        Fund this shipment to lock ALGO in the smart contract (minimum 0.5 ALGO per deposit).
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Vault balance (on-chain)
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0' }}>
                                        {((focusVaultShip.funds_locked_microalgo ?? 0) / 1e6).toFixed(4)}{' '}
                                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>ALGO</span>
                                    </div>
                                    {escrowUsdText(focusVaultShip) ? (
                                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#6ee7b7', marginTop: 4 }}>
                                            Escrow ≈ {escrowUsdText(focusVaultShip)}
                                        </div>
                                    ) : null}
                                </>
                            )}
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
                            <p style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.45, margin: '0 0 8px' }}>
                                <strong style={{ color: '#cbd5e1' }}>Why Pera?</strong> Escrow moves <em>your</em> funds into the contract — only your wallet can authorize deposits (Pera wallet).
                                <strong style={{ color: '#cbd5e1' }}>Register shipment</strong> is server-signed with the oracle key — no wallet popup.
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                <button
                                    type="button"
                                    className="primary-btn"
                                    disabled={!!isPaying || !appId}
                                    onClick={() => handleFundEscrow(focusVaultShip.shipment_id)}
                                    style={{ flex: '1 1 140px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    <Lock size={14} /> {isPaying === focusVaultShip.shipment_id ? 'Signing…' : 'Deposit 0.5 ALGO (crypto)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {!isLoading && displayedShipments.length > 0 ? (
                <div className="dash-section-head">
                    <h2 className="dash-section-title">
                        {role === 'supplier' ? 'Your export corridors' : 'Registered export corridors'}
                    </h2>
                    <p className="dash-section-sub">
                        Each card is one deal: route, escrow, weather, GST e-way check, and jury — not your supplier profile above.
                    </p>
                </div>
            ) : null}

            {/* ── SHIPMENT CARDS ─────────────── */}
            {dataReady ? (
            <div className="grid">
                {displayedShipments.length === 0 ? (
                    <div className="card dash-empty-corridors">
                        <Package size={32} color="var(--accent)" style={{ marginBottom: 12 }} />
                        <div className="dash-empty-corridors__title">No corridors registered yet</div>
                        <p className="dash-empty-corridors__copy">
                            Connect Pera Wallet, then <strong>Register shipment</strong>. After on-chain registration, deposit ALGO on
                            the new corridor card — your live journey tracker updates automatically.{' '}
                            <Link to="/verify">Verify by reference ID</Link>.
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
                    const hasVerdictTx = !!(jury?.on_chain_tx_id);
                    const verdictFlagged = !!jury?.trigger_contract;
                    const awaitingOffChainSync = !(ship.origin && ship.origin !== 'N/A' && ship.destination && ship.destination !== 'N/A');
                    const cardFlagged = ship.stage === 'Disputed' || ship.stage === 'Delayed_Disaster';
                    const cardDisputedPulse = cardFlagged;
                    const fundsMicro = ship.funds_locked_microalgo ?? 0;
                    const riskBandPct = risk !== null ? Math.min(100, Math.max(0, risk)) : 0;
                    const certAsa =
                        settleReceipt?.shipment_id === ship.shipment_id
                            ? settleReceipt.cert_asa_id
                            : ship.on_chain?.certificate_asa ?? 0;
                    const supplierPaidAlgo =
                        settleReceipt?.shipment_id === ship.shipment_id
                            ? settleReceipt.supplier_paid_algo
                            : undefined;
                    const settleTxId =
                        settleReceipt?.shipment_id === ship.shipment_id
                            ? settleReceipt.tx_id
                            : typeof ship.on_chain?.settlement_tx_id === 'string'
                              ? ship.on_chain.settlement_tx_id
                              : undefined;

                    const terminalOpen = juryTerminalShipmentId === ship.shipment_id;

                    return (
                        <div
                            key={ship.shipment_id}
                            id={`corridor-${ship.shipment_id}`}
                            className={`card${cardFlagged ? ' card-flagged' : ''}${cardDisputedPulse ? ' card-disputed' : ''}${highlightShipmentId === ship.shipment_id ? ' corridor-card--highlight' : ''}`}
                            style={{ textAlign: 'left', borderLeft: cardAccentBorder(ship.stage) }}
                        >
                            {terminalOpen ? (
                                <LiveVerdictTerminal
                                    shipmentId={ship.shipment_id}
                                    destinationCity={ship.destination || '—'}
                                    originCity={ship.origin || ''}
                                    fundsLockedMicroalgo={fundsMicro}
                                    appId={appId}
                                    onComplete={(_jr, _raw) => {
                                        void refreshAfterJury();
                                    }}
                                    onClose={() => setJuryTerminalShipmentId(null)}
                                    onSettle={
                                        ship.stage === 'In_Transit'
                                            ? () => void handleSettleShipment(ship.shipment_id)
                                            : undefined
                                    }
                                    onViewDispute={() => void handleViewAudit(ship.shipment_id)}
                                />
                            ) : null}
                            {terminalOpen ? null : (
                            <>
                            <span className="corridor-card__tag">Export corridor</span>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <Package size={15} color="var(--accent)" />
                                        <span className="corridor-card__title">
                                            {shipmentDisplayTitle(ship)}
                                        </span>
                                    </div>
                                    {ship.commodity ? (
                                        <p className="corridor-card__commodity">{ship.commodity}</p>
                                    ) : null}
                                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                                        <button
                                            type="button"
                                            onClick={() => void navigator.clipboard.writeText(ship.shipment_id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: 0,
                                                cursor: 'pointer',
                                                color: 'var(--accent)',
                                                fontSize: '0.68rem',
                                                fontWeight: 600,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                            }}
                                            title={ship.shipment_id}
                                        >
                                            <ClipboardCopy size={12} /> Copy reference
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '0.875rem', color: '#374151' }}>
                                        {(ship.origin && ship.origin !== 'N/A' && ship.destination && ship.destination !== 'N/A') ? null : (
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
                                        background: stageBadgeColors(ship.stage).bg,
                                        color: stageBadgeColors(ship.stage).color,
                                        border: `1px solid ${stageBadgeColors(ship.stage).border}`,
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {stageUserLabel(ship.stage)}
                                    </div>
                                </div>
                            </div>

                            <ComplianceChecksStrip
                                shipmentId={ship.shipment_id}
                                auditor={jury?.auditor}
                                sentinel={jury?.sentinel}
                            />

                            {cardFlagged ? (
                                <div
                                    style={{
                                        marginBottom: 14,
                                        padding: 14,
                                        borderRadius: 10,
                                        border: '1px solid rgba(239,68,68,0.45)',
                                        background: 'linear-gradient(135deg, rgba(127,29,29,0.2) 0%, rgba(15,23,42,0.5) 100%)',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fecaca', letterSpacing: '0.04em', marginBottom: 8 }}>
                                        {role === 'supplier' ? '⚠ PAYMENT FROZEN' : '⚠ ESCROW FROZEN'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.55, marginBottom: 6 }}>
                                        <span style={{ fontWeight: 800, color: '#F59E0B' }}>{(fundsMicro / 1e6).toFixed(4)} ALGO (crypto)</span>
                                        <AlgoEscrowHint size={12} />
                                        {escrowUsdText(ship) ? (
                                            <span style={{ fontWeight: 800, color: '#86efac', marginLeft: 8 }}>
                                                (~{escrowUsdText(ship)})
                                            </span>
                                        ) : null}{' '}
                                        locked · Cannot be released until the dispute is resolved by the oracle.
                                    </div>
                                    {risk != null ? (
                                        <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                                            Risk verdict:{' '}
                                            <strong>{risk}/100</strong>
                                            {jury?.sentinel?.reasoning_narrative || jury?.sentinel?.reasoning
                                                ? ` — ${String(jury.sentinel.reasoning_narrative || jury.sentinel.reasoning).slice(0, 120)}${String(jury.sentinel.reasoning_narrative || jury.sentinel.reasoning).length > 120 ? '…' : ''}`
                                                : null}
                                        </div>
                                    ) : null}
                                    {(jury?.sentinel?.reasoning_narrative || jury?.sentinel?.reasoning) && (
                                        <div
                                            style={{
                                                fontSize: '0.75rem',
                                                color: '#94a3b8',
                                                fontStyle: 'italic',
                                                lineHeight: 1.5,
                                                borderLeft: '2px solid rgba(245,158,11,0.5)',
                                                paddingLeft: 10,
                                            }}
                                        >
                                            &ldquo;{jury.sentinel.reasoning_narrative || jury.sentinel.reasoning}&rdquo;
                                        </div>
                                    )}
                                    <Link
                                        to={`/verify/${encodeURIComponent(ship.shipment_id)}`}
                                        style={{ display: 'inline-block', marginTop: 12, fontWeight: 700, fontSize: '0.78rem', color: '#fbbf24' }}
                                    >
                                        View proof ↗
                                    </Link>
                                    <div style={{ marginTop: 6 }}>
                                        <Link
                                            to={`/verify/${encodeURIComponent(ship.shipment_id)}`}
                                            style={{ display: 'inline-block', fontWeight: 700, fontSize: '0.76rem', color: '#86efac' }}
                                        >
                                            Verify jury hash ↗
                                        </Link>
                                    </div>
                                </div>
                            ) : null}

                            <ShipmentDestinationWeatherRow destination={ship.destination} />

                            {role === 'stakeholder' && ship.stage === 'In_Transit' && fundsMicro === 0 && !terminalOpen ? (
                                <div
                                    style={{
                                        marginBottom: 14,
                                        padding: 14,
                                        borderRadius: 10,
                                        border: '2px solid rgba(56,189,248,0.45)',
                                        background: 'rgba(14,165,233,0.08)',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0c4a6e', marginBottom: 6 }}>No escrow locked</div>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                                        Lock ALGO to enable the AI jury and automatic settlement when conditions are met.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        <button
                                            type="button"
                                            className="primary-btn"
                                            disabled={isPaying === ship.shipment_id}
                                            style={{ fontSize: '0.78rem', padding: '8px 14px' }}
                                            onClick={() => void handleFundEscrow(ship.shipment_id, 0.5)}
                                        >
                                            <Lock size={13} /> Lock 0.5 ALGO
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isPaying === ship.shipment_id}
                                            style={{
                                                fontSize: '0.78rem',
                                                padding: '8px 14px',
                                                borderRadius: 8,
                                                border: '1px solid #0ea5e9',
                                                background: '#fff',
                                                color: '#0369a1',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                            onClick={() => void handleFundEscrow(ship.shipment_id, 1.0)}
                                        >
                                            Custom 1 ALGO
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {role === 'supplier' && !terminalOpen && (ship.stage === 'In_Transit' || ship.stage === 'Settled') ? (
                                <div
                                    style={{
                                        marginBottom: 14,
                                        padding: 14,
                                        borderRadius: 10,
                                        border: '1px solid rgba(148,163,184,0.25)',
                                        background: 'rgba(248,250,252,0.95)',
                                    }}
                                >
                                    {ship.stage === 'In_Transit' ? (
                                        <>
                                            <div style={{ fontSize: '0.8rem', color: '#334155', marginBottom: 6 }}>
                                                Buyer locked:{' '}
                                                <strong style={{ color: '#059669' }}>
                                                    {fundsMicro > 0 ? (
                                                        <>
                                                            {(fundsMicro / 1e6).toFixed(4)} ALGO ✓
                                                            {escrowUsdText(ship) ? (
                                                                <span style={{ color: '#059669', marginLeft: 6 }}>({escrowUsdText(ship)})</span>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        'No escrow yet — buyer must fund'
                                                    )}
                                                </strong>
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
                                                {hasVerdictTx ? 'Verdict on record — awaiting settlement flow.' : 'Awaiting AI jury verdict from buyer.'}
                                            </div>
                                        </>
                                    ) : null}
                                    {ship.stage === 'Settled' ? (
                                        <>
                                            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#15803d', marginBottom: 6 }}>✓ PAYMENT RECEIVED</div>
                                            <div style={{ fontSize: '0.8rem', color: '#334155', marginBottom: 8 }}>
                                                Payment released to your account from escrow
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
                                                Your reputation score is tracked on-chain (see card above).
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {settleTxId ? (
                                                    <a
                                                        href={loraTransactionUrl(settleTxId)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{ fontWeight: 700, fontSize: '0.78rem', color: '#15803d' }}
                                                    >
                                                        View settlement ↗
                                                    </a>
                                                ) : null}
                                                {certAsa > 0 ? (
                                                    <a
                                                        href={loraAssetUrl(certAsa)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{ fontWeight: 700, fontSize: '0.78rem', color: '#15803d' }}
                                                    >
                                                        View certificate ↗
                                                    </a>
                                                ) : null}
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}

                            {role === 'stakeholder' &&
                            ship.supplier_reputation_source === 'algorand_box_storage' &&
                            typeof ship.supplier_reputation_score === 'number' ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8 }}>
                                    Supplier trust score:{' '}
                                    <strong style={{ color: '#111' }}>{ship.supplier_reputation_score}</strong>/100
                                    <span style={{ color: 'var(--success)', marginLeft: 6 }}>(on-chain)</span>
                                </div>
                            ) : null}

                            {ship.stage === 'Settled' && certAsa > 0 ? (
                                <div
                                    style={{
                                        marginBottom: 12,
                                        padding: 16,
                                        borderRadius: 10,
                                        border: '1px solid #86efac',
                                        background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
                                    }}
                                >
                                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#14532d', marginBottom: 12 }}>
                                        On-chain settlement proof
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div>
                                            <div style={{ fontSize: '0.84rem', color: '#166534', fontWeight: 700, marginBottom: 8 }}>
                                                ✓{' '}
                                                {supplierPaidAlgo != null
                                                    ? `${supplierPaidAlgo.toFixed(4)} ALGO released to supplier`
                                                    : typeof ship.on_chain?.funds_microalgo === 'number' && ship.on_chain.funds_microalgo > 0
                                                      ? `${(ship.on_chain.funds_microalgo / 1e6).toFixed(4)} ALGO released to supplier (from escrow)`
                                                      : 'ALGO released to supplier from escrow'}
                                            </div>
                                            {settleTxId ? (
                                                <a
                                                    href={loraTransactionUrl(settleTxId)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: 6,
                                                        padding: '10px 14px',
                                                        borderRadius: 8,
                                                        background: '#16a34a',
                                                        color: '#fff',
                                                        fontWeight: 700,
                                                        fontSize: '0.8rem',
                                                        textDecoration: 'none',
                                                        width: '100%',
                                                        boxSizing: 'border-box',
                                                    }}
                                                >
                                                    View payment on Lora ↗
                                                </a>
                                            ) : (
                                                <div style={{ fontSize: '0.75rem', color: '#15803d' }}>
                                                    Payment tx: open audit trail or Lora app history for this shipment.
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ borderTop: '1px solid rgba(22,101,52,0.2)', paddingTop: 12 }}>
                                            <div style={{ fontSize: '0.84rem', color: '#166534', fontWeight: 700, marginBottom: 4 }}>
                                                ✓ Settlement certificate <strong>#{certAsa}</strong>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#166534', marginBottom: 10, lineHeight: 1.45 }}>
                                                This is your permanent settlement proof — scan or open on Lora.
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                                                <CertificateQr url={loraAssetUrl(certAsa)} size={88} />
                                            </div>
                                            <a
                                                href={loraAssetUrl(certAsa)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    padding: '10px 14px',
                                                    borderRadius: 8,
                                                    border: '2px solid #15803d',
                                                    background: '#fff',
                                                    color: '#14532d',
                                                    fontWeight: 700,
                                                    fontSize: '0.8rem',
                                                    textDecoration: 'none',
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                }}
                                            >
                                                View certificate on Lora ↗
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ) : ship.stage === 'Settled' ? (
                                <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600, marginBottom: 8 }}>
                                    Settlement confirmed on Algorand — refresh if certificate ASA is not shown yet.
                                </div>
                            ) : null}

                            {role === 'stakeholder' && fundsMicro > 0 && (
                                <div style={{ marginBottom: 10, fontSize: '0.8rem', color: '#94a3b8' }}>
                                    Escrow locked:{' '}
                                    <EscrowDisplay
                                        algo={fundsMicro / 1e6}
                                        inr={ship.funds_inr}
                                        usd={ship.funds_usd}
                                        style={{ fontWeight: 600, color: '#e2e8f0' }}
                                    />
                                </div>
                            )}

                            {role === 'stakeholder' && risk !== null && (
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

                            {/* Open-Meteo live weather at destination (same for buyer and supplier) */}
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 8 }}>
                                Route conditions
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                                {ship.weather &&
                                typeof ship.weather === 'object' &&
                                (ship.weather.temp_c != null || ship.weather.temperature != null) ? (
                                    <div>
                                        <div style={{ color: '#9ca3af', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Live weather at destination (Open-Meteo)
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#374151', marginTop: 4 }}>
                                            <Cloud size={13} color="#6b7280" />
                                            {ship.weather.temp_c != null
                                                ? `${Number(ship.weather.temp_c).toFixed(1)}°C`
                                                : ship.weather.temperature != null
                                                  ? `${Number(ship.weather.temperature).toFixed(1)}°C`
                                                  : '—'}
                                            {ship.weather.precipitation_mm != null || ship.weather.precipitation != null
                                                ? ` · precip ${ship.weather.precipitation_mm ?? ship.weather.precipitation} mm`
                                                : ''}
                                            {ship.weather.wind_kmh != null ? ` · wind ${ship.weather.wind_kmh} km/h` : ''}
                                        </div>
                                        {ship.weather.description ? (
                                            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 4 }}>{String(ship.weather.description)}</div>
                                        ) : null}
                                    </div>
                                ) : null}
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

                            {role === 'stakeholder' && jury && !terminalOpen && (
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
                                            Settlement Confidence: {risk ?? '—'} / 100
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
                                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.55, marginBottom: 8, wordBreak: 'break-word' }}>
                                        <span style={{ marginRight: 6 }} aria-hidden>{AGENT_DISPLAY.sentinel.icon}</span>
                                        <strong>{AGENT_DISPLAY.sentinel.label}:</strong> {jury.sentinel?.reasoning_narrative || jury.sentinel?.reasoning || '—'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.55, marginBottom: 8, wordBreak: 'break-word' }}>
                                        <span style={{ marginRight: 6 }} aria-hidden>{AGENT_DISPLAY.auditor.icon}</span>
                                        <strong>{AGENT_DISPLAY.auditor.label}:</strong> {jury.auditor?.audit_report || jury.auditor?.blockchain_status || '—'}
                                        {fundsMicro > 0 ? (
                                            <span style={{ display: 'block', marginTop: 4, color: '#64748b' }}>
                                                Funds locked: {(fundsMicro / 1e6).toFixed(2)} ALGO
                                                {escrowUsdText(ship) ? (
                                                    <span style={{ color: '#059669', marginLeft: 6 }}>· {escrowUsdText(ship)}</span>
                                                ) : null}
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
                                        <Link
                                            to={`/verify/${encodeURIComponent(ship.shipment_id)}`}
                                            style={{
                                                display: 'inline-block',
                                                fontSize: '0.78rem',
                                                fontWeight: 600,
                                                color: '#2563eb',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            View proof ↗
                                        </Link>
                                    ) : null}
                                    {jury.on_chain_tx_id ? (
                                        <Link
                                            to={`/verify/${encodeURIComponent(ship.shipment_id)}`}
                                            style={{
                                                display: 'inline-block',
                                                marginLeft: 12,
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                color: '#16a34a',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            Verify jury hash ↗
                                        </Link>
                                    ) : null}
                                </div>
                            )}

                            {role === 'stakeholder' && jury && !terminalOpen ? (
                                <WitnessButton
                                    shipmentId={ship.shipment_id}
                                    shipmentStatus={ship.stage}
                                    appId={appId}
                                    hasVerdict={!!(jury.on_chain_tx_id || ship.last_jury)}
                                    walletAddress={accountAddress}
                                    onConnectRequest={handleConnectWallet}
                                />
                            ) : null}

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
                                        {ship.stage === 'In_Transit' && !hasVerdictTx ? (() => {
                                            const jb = juryButtonState(ship.stage, fundsMicro, awaitingOffChainSync);
                                            return (
                                            <button
                                                type="button"
                                                className="primary-btn"
                                                disabled={jb.disabled}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    minWidth: 120,
                                                    fontSize: '0.8rem',
                                                    ...(jb.disabled ? { background: '#9ca3af', cursor: 'not-allowed' } : {}),
                                                }}
                                                onClick={() => !jb.disabled && setJuryTerminalShipmentId(ship.shipment_id)}
                                                title={jb.disabled ? jb.label : undefined}
                                            >
                                                <Play size={13} /> {jb.label}
                                            </button>
                                            );
                                        })() : null}
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
                                                <CheckCircle size={13} /> Release Payment
                                            </button>
                                        ) : null}
                                        {healthSnapshot?.oracle_address &&
                                        accountAddress &&
                                        accountAddress === healthSnapshot.oracle_address &&
                                        ship.stage !== 'Settled' &&
                                        ship.stage !== 'VOID' &&
                                        ship.stage !== 'Not_Registered' ? (
                                            <button
                                                type="button"
                                                disabled={voidBusy === ship.shipment_id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    fontSize: '0.75rem',
                                                    padding: '6px 12px',
                                                    borderRadius: 6,
                                                    background: 'rgba(248,113,113,0.15)',
                                                    color: '#fecaca',
                                                    border: '1px solid rgba(248,113,113,0.4)',
                                                    cursor: voidBusy === ship.shipment_id ? 'wait' : 'pointer',
                                                    fontWeight: 600,
                                                }}
                                                title="Oracle only — void on-chain (refund + rep penalty)"
                                                onClick={() => void handleVoidShipment(ship.shipment_id)}
                                            >
                                                {voidBusy === ship.shipment_id ? 'Cancelling…' : 'Cancel Shipment (Fraud)'}
                                            </button>
                                        ) : null}
                                        {ship.stage !== 'Not_Registered' &&
                                            ship.stage !== 'Settled' &&
                                            !(ship.stage === 'In_Transit' && fundsMicro === 0) && (
                                            <button
                                                type="button"
                                                disabled={isPaying === ship.shipment_id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                    fontSize: '0.75rem', padding: '6px 10px', borderRadius: 6,
                                                    background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                                                    cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                                                }}
                                                onClick={() => void handleFundEscrow(ship.shipment_id, 0.5)}
                                            >
                                                <Coins size={12} /> {isPaying === ship.shipment_id ? 'Signing…' : 'Lock 0.5 ALGO (crypto)'}
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
                            <ShipmentReportActions
                                shipment={ship}
                                appId={appId}
                                verifyBaseUrl={
                                    typeof window !== 'undefined' ? `${window.location.origin}/verify` : 'https://navitrustapp.vercel.app/verify'
                                }
                            />
                            </>
                            )}
                        </div>
                    );
                })}
            </div>
            ) : null}

            </div>

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
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>Settlement Confidence: {rscore ?? '—'} / 100</span>
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
                                    href={jr.explorer_url || loraTransactionUrl(jr.on_chain_tx_id)}
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
                                        href={LORA_APP(Number(auditTrail.app_id ?? appId ?? FALLBACK_APP_ID) || 0)}
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
                                href={LORA_APP(Number(auditTrail.app_id) || 0)}
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
                                            <a href={loraTransactionUrl(n.tx_id)} target="_blank" rel="noreferrer"
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
                                                href={loraTransactionUrl(v.tx_id)}
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

            <UserProfileModal
                open={profileModalOpen}
                onClose={() => setProfileModalOpen(false)}
                address={accountAddress}
                role={role}
                appId={appId}
            />

            {/* ── Register shipment modal ─────────────────────── */}
            <RegisterShipmentModal
                open={registerModal}
                onClose={() => setRegisterModal(false)}
                busy={registerBusy}
                accountAddress={accountAddress}
                onConnectWallet={handleConnectWallet}
                onSubmit={(form) => void handleRegisterShipment(form)}
            />

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
                    padding: '12px 24px', borderRadius: 8, background: isErrorToastMessage(toast) ? '#fef2f2' : '#f0fdf4',
                    color: isErrorToastMessage(toast) ? '#dc2626' : '#16a34a', fontWeight: 600, fontSize: '0.875rem',
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
                                href={loraTransactionUrl(paymentReceipt.tx_id)}
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
                                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{shipmentDisplayTitle(selectedShipment)}</h2>
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
                                            href={loraTransactionUrl(selectedShipment.last_jury.on_chain_tx_id)}
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
                            <p style={{ color: '#9ca3af' }}>No settlement review yet. Use Request Settlement Review on the shipment card.</p>
                        )}
                        {selectedShipment.logistics_events?.length ? (
                            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#64748b' }}>Logistics timeline</h4>
                                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: '#374151', lineHeight: 1.6 }}>
                                    {selectedShipment.logistics_events.slice(0, 8).map((ev, i) => (
                                        <li key={i}>{typeof ev === 'string' ? ev : JSON.stringify(ev)}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {role === 'stakeholder' && selectedShipment.stage !== 'Settled' && selectedShipment.stage !== 'VOID' ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                                <button
                                    type="button"
                                    className="primary-btn"
                                    style={{ fontSize: '0.78rem' }}
                                    onClick={() => {
                                        setSelectedShipment(null);
                                        setJuryTerminalShipmentId(selectedShipment.shipment_id);
                                    }}
                                >
                                    <Play size={13} /> Request Settlement Review
                                </button>
                                {selectedShipment.stage === 'In_Transit' && selectedShipment.last_jury?.on_chain_tx_id ? (
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        style={{ fontSize: '0.78rem', background: '#059669' }}
                                        onClick={() => void handleSettleShipment(selectedShipment.shipment_id)}
                                    >
                                        <CheckCircle size={13} /> Release Payment
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
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

            <footer className="dash-footer dash-footer--minimal">
                <span className="dash-footer-brand">pramanik</span>
                <span className="dash-footer-meta">Algorand Testnet · {new Date().getFullYear()}</span>
            </footer>

            <FloatingAssistantWidget
                walletAddress={accountAddress}
                shipmentId={selectedShipment?.shipment_id ?? focusVaultShip?.shipment_id ?? null}
                role={role}
                onRequestRunJury={(sid) => setJuryTerminalShipmentId(sid)}
            />

        </div>
        </div>
    );
}

export default function App() {
    return (
        <WalletProvider>
            <Routes>
                <Route path="/verify/wallet/:wallet" element={<VerifyPage />} />
                <Route path="/verify/:shipmentId" element={<VerifyPage />} />
                <Route path="/verify" element={<VerifyPage />} />
                <Route path="/protocol" element={<ProtocolPage />} />
                <Route path="/activity" element={<TransactionFeedPage />} />
                <Route path="/pramanik-bot" element={<Navigate to="/" replace />} />
                <Route path="/navibot" element={<Navigate to="/" replace />} />
                <Route path="/" element={<MainApp />} />
            </Routes>
        </WalletProvider>
    );
}
