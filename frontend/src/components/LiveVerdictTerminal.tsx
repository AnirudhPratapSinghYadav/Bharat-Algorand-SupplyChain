import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
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
    weather?: { temperature?: number; precipitation?: number; weather_code?: number };
    sentinel?: {
        risk_score?: number;
        reasoning_narrative?: string;
        reasoning?: string;
        anomaly_detected?: boolean;
        mitigation?: string;
    };
    auditor?: { blockchain_status?: string; audit_report?: string; fraud_flag?: boolean };
    chief_justice?: { trigger_contract?: boolean; judgment?: string; reasoning_narrative?: string };
    trigger_contract?: boolean;
    on_chain_tx_id?: string | null;
    confirmed_round?: number | null;
    explorer_url?: string | null;
    agent_dialogue?: { agent: string; message: string }[];
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
    const rs = d.sentinel?.risk_score ?? 0;
    if (rs > 65) return 'DISPUTE';
    if (d.trigger_contract) return 'SETTLE';
    return 'HOLD';
}

function riskBand(rs: number): string {
    if (rs > 80) return 'HIGH';
    if (rs > 50) return 'MEDIUM';
    return 'LOW';
}

function BlinkCursor() {
    return (
        <span style={{ animation: 'lvterm-blink 1s step-end infinite', marginLeft: 2 }} aria-hidden>
            ▌
        </span>
    );
}

function StaticLines({ lines }: { lines: TermLine[] }) {
    return (
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem', lineHeight: 1.65 }}>
            {lines.map((ln, i) => (
                <div key={i} style={{ color: ln.color, marginBottom: 2 }}>
                    <span style={{ opacity: 0.65, marginRight: 6 }}>›</span>
                    {ln.text}
                </div>
            ))}
        </div>
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
    appId,
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
            .post<RunJuryApiResponse>(`${BACKEND_URL}/run-jury`, { shipment_id: shipmentId }, { timeout: 120_000 })
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
    }, [shipmentId]);

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
        { text: 'NAVI-TRUST ORACLE', color: CYAN },
        { text: `Initiating jury for ${shipmentId}`, color: '#94a3b8' },
        { text: `Destination: ${destinationCity}`, color: '#94a3b8' },
        { text: 'Fetching live weather from Open-Meteo...', color: '#94a3b8' },
    ];

    const fundsAlgo = fundsLockedMicroalgo / 1e6;
    const appIdStr = appId && appId > 0 ? String(appId) : '—';

    const buildSentryLines = (d: RunJuryApiResponse): TermLine[] => {
        const w = d.weather ?? {};
        const s = d.sentinel ?? {};
        const rs = s.risk_score ?? 0;
        const temp = w.temperature ?? '—';
        const precip = w.precipitation ?? '—';
        const wc = wmoDescription(w.weather_code);
        const route = `${d.origin ?? originCity ?? '—'} → ${d.destination ?? destinationCity ?? '—'}`;
        const rec = s.anomaly_detected
            ? 'HOLD — elevated anomaly signals'
            : rs > 65
              ? 'DISPUTE — risk above threshold'
              : 'PROCEED ✓';
        return [
            { text: '[SENTRY AGENT]  Analyzing physical transport risk', color: CYAN },
            { text: `Weather at ${destinationCity}: ${temp}°C · ${precip}mm precip · (${wc})`, color: CYAN },
            { text: `Route: ${route}`, color: CYAN },
            { text: `Sentry risk score: ${rs} / 100`, color: CYAN },
            { text: `Recommendation: ${rec}`, color: CYAN },
        ];
    };

    const buildAuditorLines = (d: RunJuryApiResponse): TermLine[] => {
        const a = d.auditor ?? {};
        const st = a.blockchain_status ?? '—';
        const passed = !a.fraud_flag;
        return [
            { text: '[AUDITOR]  Reading Algorand blockchain state', color: AMBER },
            { text: `App #${appIdStr} · Box ${shipmentId}_status (ledger)`, color: AMBER },
            { text: `On-chain status: ${st}`, color: AMBER },
            { text: `Funds locked: ${fundsAlgo.toFixed(4)} ALGO`, color: AMBER },
            { text: `Fraud check: ${passed ? 'PASSED ✓' : 'FLAGGED'}`, color: AMBER },
        ];
    };

    const buildArbiterLines = (d: RunJuryApiResponse): TermLine[] => {
        const s = d.sentinel?.risk_score ?? 0;
        const cj = d.chief_justice ?? {};
        const v = verdictKind(d);
        const band = riskBand(s);
        const quote = (cj.reasoning_narrative || cj.judgment || d.sentinel?.reasoning_narrative || '').slice(0, 280);
        const vk = v === 'SETTLE' ? GREEN : v === 'DISPUTE' ? RED : HOLD_COLOR;
        const lines: TermLine[] = [
            { text: '[ARBITER]  Delivering final verdict', color: '#e2e8f0' },
            { text: `Sentry score: ${s} / 100  ·  Trigger on-chain: ${d.trigger_contract ? 'YES' : 'NO'}`, color: '#e2e8f0' },
            { text: '— — — — — — — — — — — — — — —', color: '#475569' },
            { text: `VERDICT: ${v}`, color: vk },
            { text: `Risk: ${s} / 100  ${band}`, color: vk },
        ];
        if (quote) {
            lines.push({ text: `"${quote}${quote.length >= 280 ? '…' : ''}"`, color: vk });
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

                {bootDone && !apiError && !apiData && (
                    <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem', marginTop: 10 }}>
                        › Awaiting oracle pipeline…
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
                    <div style={{ marginTop: 14 }}>
                        <StaticLines lines={buildSentryLines(apiData)} />
                    </div>
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
                    <div style={{ marginTop: 16 }}>
                        <StaticLines lines={buildAuditorLines(apiData)} />
                    </div>
                )}

                {apiData && secAuditor && !secArbiter && (
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

                {apiData && secArbiter && (
                    <div style={{ marginTop: 16 }}>
                        <StaticLines lines={buildArbiterLines(apiData)} />
                    </div>
                )}

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
                            {txId ? (
                                <a
                                    href={`https://lora.algokit.io/testnet/transaction/${txId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'center',
                                        padding: '14px 16px',
                                        borderRadius: 8,
                                        background: CYAN,
                                        color: BG,
                                        fontWeight: 800,
                                        fontSize: '0.88rem',
                                        textDecoration: 'none',
                                        letterSpacing: '0.02em',
                                    }}
                                >
                                    OPEN VERDICT ON LORA EXPLORER →
                                </a>
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
                                    Settle shipment
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
                                    View dispute details
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes lvterm-blink {
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
