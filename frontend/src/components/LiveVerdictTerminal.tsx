import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { X, Cloud, ShieldCheck, ScanSearch, Gavel, CheckCircle2, Loader2 } from 'lucide-react';
import { BACKEND_URL } from '../constants/api';

const CYAN = '#00C2FF';
const AMBER = '#F59E0B';
const BG = '#0B1120';
const GREEN = '#10B981';
const RED = '#EF4444';
const HOLD_COLOR = '#F59E0B';

export type RunJuryApiResponse = {
    shipment_id: string;
    origin?: string;
    destination?: string;
    verdict?: string;
    reasoning?: string;
    weather?: {
        temperature?: number;
        precipitation?: number;
        weather_code?: number;
        city?: string;
        wind_kmh?: number;
        precipitation_mm?: number;
    };
    sentinel?: {
        risk_score?: number;
        reasoning_narrative?: string;
        reasoning?: string;
        anomaly_detected?: boolean;
        mitigation?: string;
        recommendation?: string;
    };
    auditor?: {
        blockchain_status?: string;
        chain_status?: string;
        audit_report?: string;
        fraud_flag?: boolean;
        risk_score?: number;
        compliance_passed?: boolean;
    };
    fraud_detector?: {
        fraud_risk_score?: number;
        supplier_credibility?: string;
        recommendation?: string;
    };
    arbiter?: {
        final_risk_score?: number;
        verdict?: string;
        reasoning?: string;
        weighted_score?: number;
    };
    chief_justice?: {
        trigger_contract?: boolean;
        judgment?: string;
        reasoning_narrative?: string;
        final_risk_score?: number;
    };
    supplier_reputation?: { score?: number };
    trigger_contract?: boolean;
    on_chain_tx_id?: string | null;
    confirmed_round?: number | null;
    explorer_url?: string | null;
    lora_tx_url?: string | null;
    agent_dialogue?: { agent: string; message: string }[];
    /** Present when backend computed tamper-evident hash for this run */
    jury_hash?: { combined_hash?: string; hex?: string } | null;
};

export type JuryResult = {
    shipment_id: string;
    agent_dialogue: { agent: string; message: string }[];
    trigger_contract: boolean;
    logistics_events_used: number;
};

type Props = {
    shipmentId: string;
    destinationCity: string;
    originCity?: string;
    fundsLockedMicroalgo?: number;
    appId: number | null;
    onComplete: (result: JuryResult, raw: RunJuryApiResponse) => void;
    onClose: () => void;
    onSettle?: () => void;
    onViewDispute?: () => void;
};

type TermLine = { text: string; color: string };

function wmoDescription(code: number | undefined): string {
    if (code == null) return '—';
    if (code === 0) return 'Clear sky';
    if (code <= 3) return 'Mainly clear / partly cloudy';
    if (code <= 48) return 'Fog or depositing rime fog';
    if (code <= 67) return 'Rain or drizzle';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Rain showers';
    if (code <= 86) return 'Snow showers';
    if (code <= 99) return 'Thunderstorm';
    return `Weather code ${code}`;
}

function verdictKind(d: RunJuryApiResponse): 'SETTLE' | 'DISPUTE' | 'HOLD' {
    const raw =
        d.verdict ||
        d.arbiter?.verdict ||
        (d.chief_justice as { judgment?: string } | undefined)?.judgment ||
        '';
    const u = String(raw).toUpperCase();
    if (u === 'SETTLE' || u === 'DISPUTE' || u === 'HOLD') return u;
    return 'HOLD';
}

function riskBand(rs: number): string {
    if (rs > 80) return 'HIGH RISK';
    if (rs > 50) return 'MEDIUM RISK';
    return 'LOW RISK';
}

const PIPELINE: { key: 's' | 'a' | 'f' | 'r'; label: string; short: string; Icon: typeof Cloud; color: string }[] = [
    { key: 's', label: 'Weather Sentinel', short: 'Sentinel', Icon: Cloud, color: CYAN },
    { key: 'a', label: 'Compliance Auditor', short: 'Audit', Icon: ShieldCheck, color: AMBER },
    { key: 'f', label: 'Fraud Detector', short: 'Fraud', Icon: ScanSearch, color: '#a78bfa' },
    { key: 'r', label: 'Chief Arbiter', short: 'Arbiter', Icon: Gavel, color: '#e2e8f0' },
];

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginBottom: 4 }}>
                <span>Risk score (0–{max})</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: '#e2e8f0', fontWeight: 700 }}>{Math.round(value)}</span>
            </div>
            <div style={{ height: 9, borderRadius: 5, background: 'rgba(15,23,42,0.9)', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.15)' }}>
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 5,
                        background: `linear-gradient(90deg, ${color}55, ${color})`,
                        transition: 'width 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                />
            </div>
        </div>
    );
}

function PipelineStepper({
    activeIndex,
    doneMask,
}: {
    /** 0–3 = which agent is currently running; -1 = idle / all complete */
    activeIndex: number;
    doneMask: boolean[];
}) {
    return (
        <div
            style={{
                marginBottom: 18,
                padding: '14px 12px',
                borderRadius: 10,
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
            }}
            aria-label="Jury pipeline progress"
        >
            <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', marginBottom: 12 }}>
                PRAMANIK · 4-AGENT JURY PIPELINE
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 8,
                    alignItems: 'start',
                }}
            >
                {PIPELINE.map((p, i) => {
                    const done = doneMask[i] === true;
                    const active = activeIndex === i;
                    const Icon = p.Icon;
                    return (
                        <div key={p.key} style={{ textAlign: 'center', minWidth: 0 }}>
                            <div
                                style={{
                                    width: '100%',
                                    maxWidth: 52,
                                    margin: '0 auto 8px',
                                    height: 44,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: `2px solid ${done ? p.color : active ? `${p.color}bb` : 'rgba(71,85,105,0.45)'}`,
                                    background: active ? `${p.color}28` : done ? `${p.color}18` : 'rgba(15,23,42,0.85)',
                                    boxShadow: active ? `0 0 18px ${p.color}40` : 'none',
                                    transition: 'all 0.35s ease',
                                }}
                            >
                                {done ? (
                                    <CheckCircle2 size={22} color={p.color} strokeWidth={2.5} />
                                ) : active ? (
                                    <Loader2 size={22} color={p.color} className="lv-jury-spin" />
                                ) : (
                                    <Icon size={19} color="#64748b" strokeWidth={2} />
                                )}
                            </div>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', lineHeight: 1.2 }}>{p.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

type StatRow = { k: string; v: string };

function AgentPerformanceCard({
    step,
    title,
    accent,
    score,
    rows,
    badge = 'Complete',
}: {
    step: number;
    title: string;
    accent: string;
    score: number;
    rows: StatRow[];
    badge?: string;
}) {
    return (
        <div
            style={{
                marginTop: 14,
                padding: '14px 16px',
                borderRadius: 10,
                borderLeft: `4px solid ${accent}`,
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.5) 100%)',
                border: '1px solid rgba(148, 163, 184, 0.12)',
                borderLeftWidth: 4,
                animation: 'lv-card-in 0.45s ease both',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span
                        style={{
                            flexShrink: 0,
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            background: `${accent}22`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: accent,
                        }}
                    >
                        {step}
                    </span>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#f1f5f9', lineHeight: 1.2 }}>{title}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                            Live output from <code style={{ fontSize: '0.65rem', color: '#94a3b8' }}>POST /run-jury</code>
                        </div>
                    </div>
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>{badge}</span>
            </div>
            <ScoreBar value={score} color={accent} />
            <dl style={{ margin: '12px 0 0', display: 'grid', gap: 8 }}>
                {rows.map((row) => (
                    <div key={row.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.74rem' }}>
                        <dt style={{ margin: 0, color: '#64748b', flex: '0 0 38%', minWidth: 0 }}>{row.k}</dt>
                        <dd style={{ margin: 0, color: '#cbd5e1', flex: 1, wordBreak: 'break-word', lineHeight: 1.45 }}>{row.v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function buildSentinelPerf(d: RunJuryApiResponse, destinationCity: string): { score: number; rows: StatRow[] } {
    const w = d.weather ?? {};
    const s = d.sentinel ?? {};
    const city = w.city || destinationCity;
    const rs = typeof s.risk_score === 'number' && !Number.isNaN(s.risk_score) ? s.risk_score : 0;
    const rec = String(s.reasoning_narrative || s.reasoning || s.recommendation || '').trim().slice(0, 280) || '—';
    const precip = (w as { precipitation_mm?: number }).precipitation_mm ?? w.precipitation;
    return {
        score: rs,
        rows: [
            { k: 'Weather hub (Open-Meteo)', v: String(city) },
            {
                k: 'Live conditions',
                v: `${w.temperature ?? '—'}°C · ${precip != null ? `${precip}mm` : '—'} rain · ${(w as { wind_kmh?: number }).wind_kmh ?? '—'} km/h wind`,
            },
            { k: 'Sky / WMO', v: wmoDescription(w.weather_code) },
            { k: 'Sentinel analysis', v: rec },
        ],
    };
}

function buildAuditorPerf(d: RunJuryApiResponse, fundsAlgo: number): { score: number; rows: StatRow[] } {
    const a = d.auditor ?? {};
    const st = a.blockchain_status ?? a.chain_status ?? '—';
    const ars = typeof a.risk_score === 'number' && !Number.isNaN(a.risk_score) ? a.risk_score : 0;
    const passed = a.compliance_passed !== undefined ? a.compliance_passed : !a.fraud_flag;
    const auditSnippet = String(a.audit_report || '').trim().slice(0, 240) || '—';
    return {
        score: ars,
        rows: [
            { k: 'On-chain status', v: String(st) },
            { k: 'Escrow observed', v: `${fundsAlgo.toFixed(4)} ALGO (from jury read)` },
            { k: 'Compliance', v: passed ? 'Passed — chain vs metadata aligned' : 'Flagged — mismatch or fraud signal' },
            { k: 'Auditor report', v: auditSnippet },
        ],
    };
}

function buildFraudPerf(d: RunJuryApiResponse): { score: number; rows: StatRow[] } {
    const f = d.fraud_detector ?? {};
    const fr = typeof f.fraud_risk_score === 'number' && !Number.isNaN(f.fraud_risk_score) ? f.fraud_risk_score : 0;
    const rep =
        typeof d.supplier_reputation?.score === 'number' && !Number.isNaN(d.supplier_reputation.score)
            ? d.supplier_reputation.score
            : null;
    const cred = String(f.supplier_credibility || '').trim() || '—';
    const rec = String(f.recommendation || '').trim().slice(0, 220) || '—';
    return {
        score: fr,
        rows: [
            {
                k: 'Supplier reputation',
                v: rep != null ? `${rep}/100 (on-chain / indexer where available)` : 'Not yet indexed — jury uses defaults',
            },
            { k: 'Fraud risk', v: `${fr}/100` },
            { k: 'Credibility', v: cred },
            { k: 'Detector recommendation', v: rec },
        ],
    };
}

function buildArbiterPerf(d: RunJuryApiResponse): { score: number; rows: StatRow[] } {
    const arb = d.arbiter;
    const finalScoreRaw =
        arb?.final_risk_score ??
        (d.chief_justice as { final_risk_score?: number } | undefined)?.final_risk_score ??
        d.sentinel?.risk_score ??
        0;
    const finalScore = typeof finalScoreRaw === 'number' && !Number.isNaN(finalScoreRaw) ? finalScoreRaw : 0;
    const weightedRaw = arb?.weighted_score ?? finalScore;
    const weighted = typeof weightedRaw === 'number' && !Number.isNaN(weightedRaw) ? weightedRaw : finalScore;
    const v = verdictKind(d);
    const quote = (
        d.reasoning ||
        arb?.reasoning ||
        (d.chief_justice as { reasoning_narrative?: string } | undefined)?.reasoning_narrative ||
        d.sentinel?.reasoning_narrative ||
        ''
    )
        .trim()
        .slice(0, 420);
    return {
        score: finalScore,
        rows: [
            { k: 'Binding verdict', v: `${v} · ${riskBand(finalScore)}` },
            { k: 'Chief Arbiter score', v: `${weighted}/100` },
            {
                k: 'Reasoning (excerpt)',
                v: quote ? `"${quote}${quote.length >= 420 ? '…' : ''}"` : '—',
            },
            {
                k: 'record_verdict',
                v: d.on_chain_tx_id
                    ? `Tx ${String(d.on_chain_tx_id).slice(0, 10)}…${String(d.on_chain_tx_id).slice(-6)}`
                    : 'Prepared in this response',
            },
        ],
    };
}

function BlinkCursor() {
    return (
        <span style={{ animation: 'lvterm-blink 1s step-end infinite', marginLeft: 2 }} aria-hidden>
            ▌
        </span>
    );
}

function TypingLines({
    lines,
    charMs,
    onDone,
    startDelayMs = 0,
    instanceKey,
}: {
    lines: TermLine[];
    charMs: number;
    onDone: () => void;
    startDelayMs?: number;
    instanceKey: string;
}) {
    const [li, setLi] = useState(0);
    const [ci, setCi] = useState(0);
    const [ready, setReady] = useState(false);
    const finishedRef = useRef(false);

    useEffect(() => {
        finishedRef.current = false;
        setLi(0);
        setCi(0);
        setReady(false);
    }, [instanceKey]);

    useEffect(() => {
        const t = window.setTimeout(() => setReady(true), startDelayMs);
        return () => window.clearTimeout(t);
    }, [startDelayMs, instanceKey]);

    useEffect(() => {
        if (ready && lines.length === 0 && !finishedRef.current) {
            finishedRef.current = true;
            onDone();
        }
    }, [ready, lines.length, onDone]);

    useEffect(() => {
        if (!ready || lines.length === 0) return;
        if (li >= lines.length) {
            if (!finishedRef.current) {
                finishedRef.current = true;
                onDone();
            }
            return;
        }
        const line = lines[li].text;
        if (ci >= line.length) {
            const t = window.setTimeout(() => {
                setLi((x) => x + 1);
                setCi(0);
            }, 100);
            return () => window.clearTimeout(t);
        }
        const t = window.setTimeout(() => setCi((c) => c + 1), charMs);
        return () => window.clearTimeout(t);
    }, [ready, lines, li, ci, charMs, onDone]);

    if (!lines.length) return null;

    return (
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem', lineHeight: 1.65 }}>
            {lines.slice(0, li + 1).map((ln, i) => (
                <div key={i} style={{ color: ln.color, marginBottom: 2 }}>
                    <span style={{ opacity: 0.65, marginRight: 6 }}>›</span>
                    {i === li ? (
                        <>
                            {ln.text.slice(0, ci)}
                            {ci < ln.text.length ? <BlinkCursor /> : null}
                        </>
                    ) : (
                        ln.text
                    )}
                </div>
            ))}
        </div>
    );
}

export function LiveVerdictTerminal({
    shipmentId,
    destinationCity,
    originCity,
    fundsLockedMicroalgo = 0,
    appId: _appId,
    onComplete,
    onClose,
    onSettle,
    onViewDispute,
}: Props) {
    const [apiData, setApiData] = useState<RunJuryApiResponse | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [bootDone, setBootDone] = useState(false);
    const [secSentry, setSecSentry] = useState(false);
    const [secAuditor, setSecAuditor] = useState(false);
    const [secFraud, setSecFraud] = useState(false);
    const [secArbiter, setSecArbiter] = useState(false);
    const [showChain, setShowChain] = useState(false);
    const [showCta, setShowCta] = useState(false);
    const completedRef = useRef(false);

    const runComplete = useCallback(
        (d: RunJuryApiResponse) => {
            if (completedRef.current) return;
            completedRef.current = true;
            const jr: JuryResult = {
                shipment_id: d.shipment_id,
                agent_dialogue: d.agent_dialogue ?? [],
                trigger_contract: !!d.trigger_contract,
                logistics_events_used: 0,
            };
            onComplete(jr, d);
        },
        [onComplete],
    );

    useEffect(() => {
        let cancelled = false;
        axios
            .post<RunJuryApiResponse>(
                `${BACKEND_URL}/run-jury`,
                { shipment_id: shipmentId, destination_city: destinationCity },
                { timeout: 120_000 },
            )
            .then((res) => {
                if (!cancelled) setApiData(res.data);
            })
            .catch((e) => {
                if (!cancelled) {
                    const detail = e.response?.data?.detail ?? e.message ?? 'Request failed';
                    setApiError(typeof detail === 'string' ? detail : 'Jury failed');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [shipmentId, destinationCity]);

    useEffect(() => {
        if (!secArbiter || !apiData) return;
        const t = window.setTimeout(() => setShowChain(true), 400);
        return () => window.clearTimeout(t);
    }, [secArbiter, apiData]);

    useEffect(() => {
        if (!showChain || !apiData) return;
        const delay = apiData.on_chain_tx_id ? 1800 : 600;
        const t = window.setTimeout(() => {
            setShowCta(true);
            runComplete(apiData);
        }, delay);
        return () => window.clearTimeout(t);
    }, [showChain, apiData, runComplete]);

    const bootLines: TermLine[] = [
        { text: `Initiating 4-agent jury for ${shipmentId}...`, color: CYAN },
        { text: `Destination hub: ${destinationCity}`, color: '#94a3b8' },
    ];

    const fundsAlgo = fundsLockedMicroalgo / 1e6;

    const buildSentryLines = (d: RunJuryApiResponse): TermLine[] => {
        const w = d.weather ?? {};
        const s = d.sentinel ?? {};
        const rs = s.risk_score ?? 0;
        const temp = w.temperature ?? '—';
        const precip = (w as { precipitation_mm?: number }).precipitation_mm ?? w.precipitation ?? '—';
        const wind = (w as { wind_kmh?: number }).wind_kmh ?? '—';
        const wc = wmoDescription(w.weather_code);
        const city = w.city || destinationCity;
        const rec = String(s.recommendation || s.reasoning_narrative || '').slice(0, 120) || '—';
        return [
            { text: `[🛰 WEATHER SENTINEL] Fetching live weather for ${city}...`, color: CYAN },
            { text: `Weather at ${city}: ${temp}°C · ${precip}mm · ${wind}km/h`, color: CYAN },
            { text: `Sentinel risk: ${rs}/100 · ${rec}`, color: CYAN },
        ];
    };

    const buildAuditorLines = (d: RunJuryApiResponse): TermLine[] => {
        const a = d.auditor ?? {};
        const st = a.blockchain_status ?? a.chain_status ?? '—';
        const ars = typeof a.risk_score === 'number' ? a.risk_score : 0;
        const passed = a.compliance_passed !== undefined ? a.compliance_passed : !a.fraud_flag;
        return [
            { text: '[📋 COMPLIANCE AUDITOR] Reading Algorand box storage...', color: AMBER },
            { text: `On-chain status: ${st} · Funds: ${fundsAlgo.toFixed(4)} ALGO`, color: AMBER },
            { text: `Auditor risk: ${ars}/100 · ${passed ? 'PASSED' : 'ISSUES FOUND'}`, color: AMBER },
        ];
    };

    const buildFraudLines = (d: RunJuryApiResponse): TermLine[] => {
        const f = d.fraud_detector ?? {};
        const fr = f.fraud_risk_score ?? 0;
        const rep =
            typeof d.supplier_reputation?.score === 'number' && !Number.isNaN(d.supplier_reputation.score)
                ? d.supplier_reputation.score
                : 50;
        const cred = f.supplier_credibility || f.recommendation || 'assessed';
        return [
            { text: '[🔍 FRAUD DETECTOR] Analyzing supplier history...', color: '#a78bfa' },
            { text: `Supplier reputation: ${rep}/100`, color: '#a78bfa' },
            { text: `Fraud risk: ${fr}/100 · ${cred}`, color: '#a78bfa' },
        ];
    };

    const buildArbiterLines = (d: RunJuryApiResponse): TermLine[] => {
        const arb = d.arbiter;
        const finalScore =
            arb?.final_risk_score ??
            (d.chief_justice as { final_risk_score?: number } | undefined)?.final_risk_score ??
            d.sentinel?.risk_score ??
            0;
        const weighted = arb?.weighted_score ?? finalScore;
        const cj = d.chief_justice ?? {};
        const v = verdictKind(d);
        const band = riskBand(finalScore);
        const quote = (
            d.reasoning ||
            arb?.reasoning ||
            cj.reasoning_narrative ||
            cj.judgment ||
            d.sentinel?.reasoning_narrative ||
            ''
        ).slice(0, 400);
        const vk = v === 'SETTLE' ? GREEN : v === 'DISPUTE' ? RED : HOLD_COLOR;
        const lines: TermLine[] = [
            { text: '[⚖ CHIEF ARBITER] Delivering final verdict...', color: '#e2e8f0' },
            { text: `Weighted score: ${weighted}/100`, color: '#e2e8f0' },
            { text: '— — — — — — — — — — — — — — —', color: '#475569' },
            { text: `VERDICT: ${v}   RISK: ${finalScore}/100   ${band}`, color: vk },
        ];
        if (quote) {
            lines.push({ text: `"${quote}${quote.length >= 400 ? '…' : ''}"`, color: vk });
        }
        lines.push({ text: '— — — — — — — — — — — — — — —', color: '#475569' });
        return lines;
    };

    const vk = apiData ? verdictKind(apiData) : 'HOLD';
    const borderColor =
        !apiData && !apiError
            ? CYAN
            : apiError
              ? RED
              : showCta
                ? vk === 'SETTLE'
                    ? GREEN
                    : vk === 'DISPUTE'
                      ? RED
                      : HOLD_COLOR
                : CYAN;

    const txId = apiData?.on_chain_tx_id ?? '';
    const roundN = apiData?.confirmed_round;
    const loraVerdictUrl =
        apiData?.lora_tx_url || apiData?.explorer_url || (txId ? `https://lora.algokit.io/testnet/transaction/${txId}` : '');

    const waitingHttp = bootDone && !apiData && !apiError;
    let pipelineActive = -1;
    let pipelineDone = [false, false, false, false] as boolean[];
    if (apiData && !apiError) {
        pipelineDone = [secSentry, secAuditor, secFraud, secArbiter];
        pipelineActive = !secSentry ? 0 : !secAuditor ? 1 : !secFraud ? 2 : !secArbiter ? 3 : -1;
    } else if (waitingHttp) {
        pipelineActive = 0;
    }

    const arbAccent = vk === 'SETTLE' ? GREEN : vk === 'DISPUTE' ? RED : HOLD_COLOR;
    const juryHashHex = apiData?.jury_hash?.hex || apiData?.jury_hash?.combined_hash || '';
    const arbiterPerf = apiData ? buildArbiterPerf(apiData) : null;

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                background: BG,
                borderRadius: 10,
                border: `2px solid ${borderColor}`,
                boxShadow: `0 0 24px ${borderColor}22`,
                padding: '16px 18px 20px',
                transition: 'border-color 0.45s ease',
            }}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="Close verdict terminal"
                style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(148,163,184,0.25)',
                    borderRadius: 6,
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    lineHeight: 1,
                }}
            >
                <X size={16} />
            </button>

            <div style={{ paddingRight: 36 }}>
                {!bootDone && (
                    <TypingLines
                        instanceKey="boot"
                        lines={bootLines}
                        charMs={18}
                        onDone={() => setBootDone(true)}
                    />
                )}

                {bootDone && !apiError && (
                    <PipelineStepper activeIndex={pipelineActive} doneMask={pipelineDone} />
                )}

                {bootDone && !apiError && !apiData && (
                    <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem', marginTop: 4 }}>
                        › Calling oracle — real Open-Meteo + Algorand boxes + Gemini / fallbacks…
                        <BlinkCursor />
                    </div>
                )}

                {apiError && (
                    <div style={{ color: RED, fontFamily: 'monospace', fontSize: '0.85rem', marginTop: 10 }}>
                        ERROR: {apiError}
                    </div>
                )}

                {apiData && bootDone && !secSentry && (
                    <div style={{ marginTop: 14 }}>
                        <TypingLines
                            instanceKey={`sentry-${shipmentId}`}
                            lines={buildSentryLines(apiData)}
                            charMs={18}
                            startDelayMs={150}
                            onDone={() => setSecSentry(true)}
                        />
                    </div>
                )}

                {apiData && secSentry && (
                    <AgentPerformanceCard
                        step={1}
                        title="Weather Sentinel"
                        accent={CYAN}
                        {...buildSentinelPerf(apiData, destinationCity)}
                    />
                )}

                {apiData && secSentry && !secAuditor && (
                    <div style={{ marginTop: 16 }}>
                        <TypingLines
                            instanceKey={`auditor-${shipmentId}`}
                            lines={buildAuditorLines(apiData)}
                            charMs={18}
                            startDelayMs={120}
                            onDone={() => setSecAuditor(true)}
                        />
                    </div>
                )}

                {apiData && secAuditor && (
                    <AgentPerformanceCard
                        step={2}
                        title="Compliance Auditor"
                        accent={AMBER}
                        {...buildAuditorPerf(apiData, fundsAlgo)}
                    />
                )}

                {apiData && secAuditor && !secFraud && (
                    <div style={{ marginTop: 16 }}>
                        <TypingLines
                            instanceKey={`fraud-${shipmentId}`}
                            lines={buildFraudLines(apiData)}
                            charMs={16}
                            startDelayMs={100}
                            onDone={() => setSecFraud(true)}
                        />
                    </div>
                )}

                {apiData && secFraud && (
                    <AgentPerformanceCard
                        step={3}
                        title="Fraud Detector"
                        accent="#a78bfa"
                        {...buildFraudPerf(apiData)}
                    />
                )}

                {apiData && secFraud && !secArbiter && (
                    <div style={{ marginTop: 16 }}>
                        <TypingLines
                            instanceKey={`arbiter-${shipmentId}`}
                            lines={buildArbiterLines(apiData)}
                            charMs={16}
                            startDelayMs={100}
                            onDone={() => setSecArbiter(true)}
                        />
                    </div>
                )}

                {apiData && secArbiter && arbiterPerf ? (
                    <AgentPerformanceCard
                        step={4}
                        title="Chief Arbiter"
                        accent={arbAccent}
                        badge="Verdict sealed"
                        score={arbiterPerf.score}
                        rows={arbiterPerf.rows}
                    />
                ) : null}

                {apiData && showChain && (
                    <div
                        style={{
                            marginTop: 18,
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.78rem',
                            color: '#94a3b8',
                            lineHeight: 1.6,
                        }}
                    >
                        {txId ? (
                            <>
                                <div style={{ color: CYAN }}>› Recording verdict on Algorand...</div>
                                <div>
                                    › Transaction submitted: {txId.slice(0, 8)}…{txId.slice(-5)}
                                </div>
                                <div>› Waiting for confirmation...</div>
                                {roundN != null ? (
                                    <div style={{ color: GREEN }}>› ✓ Confirmed in round {roundN}</div>
                                ) : (
                                    <div style={{ color: AMBER }}>› Submitted (confirming…)</div>
                                )}
                                {juryHashHex ? (
                                    <div style={{ marginTop: 10, wordBreak: 'break-all', color: '#64748b', fontSize: '0.72rem' }}>
                                        › Jury integrity hash (verify with <code style={{ color: '#94a3b8' }}>POST /verify-hash</code>):{' '}
                                        <span style={{ color: '#a5b4fc' }}>{juryHashHex.slice(0, 20)}…{juryHashHex.slice(-12)}</span>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div style={{ color: AMBER }}>
                                › No new on-chain transaction this run (hold path, pre-flagged shipment, or jury did not
                                trigger contract).
                            </div>
                        )}
                    </div>
                )}

                {apiData && showCta && (
                    <div style={{ marginTop: 22 }}>
                        <div
                            style={{
                                padding: '18px 16px',
                                borderRadius: 10,
                                border: '1px solid rgba(0,194,255,0.35)',
                                background: 'rgba(0,194,255,0.06)',
                                textAlign: 'center',
                            }}
                        >
                            <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 600 }}>
                                This verdict is now permanent on Algorand.
                            </p>
                            <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: '0.82rem' }}>
                                No one can change it. Open Lora and read the Note tab (NAVI_VERDICT JSON).
                            </p>
                            {loraVerdictUrl ? (
                                <button
                                    type="button"
                                    onClick={() => window.open(loraVerdictUrl, '_blank', 'noopener,noreferrer')}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'center',
                                        padding: '14px 16px',
                                        borderRadius: 8,
                                        background: 'var(--accent, #00C2FF)',
                                        color: '#000',
                                        fontWeight: 800,
                                        fontSize: '0.88rem',
                                        letterSpacing: '0.02em',
                                        border: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    OPEN VERDICT ON LORA EXPLORER →
                                </button>
                            ) : (
                                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>
                                    Use Audit trail or Lora application history to inspect prior verdict transactions.
                                </p>
                            )}
                            {txId ? (
                                <p
                                    style={{
                                        margin: '12px 0 0',
                                        fontSize: '0.72rem',
                                        color: '#64748b',
                                        fontFamily: 'monospace',
                                        wordBreak: 'break-all',
                                    }}
                                >
                                    Transaction: {txId}
                                </p>
                            ) : null}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                            {vk === 'SETTLE' && onSettle ? (
                                <button
                                    type="button"
                                    onClick={onSettle}
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: 8,
                                        border: `2px solid ${GREEN}`,
                                        background: 'transparent',
                                        color: GREEN,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        fontSize: '0.82rem',
                                    }}
                                >
                                    💰 Settle Shipment
                                </button>
                            ) : null}
                            {vk === 'DISPUTE' && onViewDispute ? (
                                <button
                                    type="button"
                                    onClick={onViewDispute}
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: 8,
                                        border: `2px solid ${RED}`,
                                        background: 'transparent',
                                        color: RED,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        fontSize: '0.82rem',
                                    }}
                                >
                                    View Dispute Details
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(148,163,184,0.35)',
                                    background: 'transparent',
                                    color: '#94a3b8',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes lvterm-blink {
                    50% { opacity: 0; }
                }
                @keyframes lv-card-in {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .lv-jury-spin {
                    animation: lv-jury-spin 0.9s linear infinite;
                }
                @keyframes lv-jury-spin {
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
        </div>
    );
}
