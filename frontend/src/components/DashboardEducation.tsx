import { Link } from 'react-router-dom';
import { Cloud, ShieldCheck, ScanSearch, Gavel, Lock, Cpu, FileCheck } from 'lucide-react';

const AGENTS = [
    {
        key: 'sentinel',
        title: 'Weather Sentinel',
        icon: Cloud,
        accent: '#38bdf8',
        body: 'Pulls live Open-Meteo forecasts for the route and scores weather risk (storms, heat, precipitation) that could disrupt cold chain or delivery windows.',
    },
    {
        key: 'auditor',
        title: 'Compliance Auditor',
        icon: ShieldCheck,
        accent: '#a78bfa',
        body: 'Reads your Navi-Trust box on Algorand: status, escrow, supplier address, and cross-checks against SQLite so off-chain metadata cannot drift from chain truth.',
    },
    {
        key: 'fraud',
        title: 'Fraud Detector',
        icon: ScanSearch,
        accent: '#f472b6',
        body: 'Scores supplier history and inconsistency signals (e.g. route vs claims) before any payout logic runs — reducing duplicate or inflated disaster claims.',
    },
    {
        key: 'arbiter',
        title: 'Chief Arbiter',
        icon: Gavel,
        accent: '#fbbf24',
        body: 'Combines all agent outputs into a binding verdict (HOLD / DISPUTE / SETTLE-style) and drives the oracle-signed record_verdict transaction and audit trail.',
    },
] as const;

const FLOW = [
    { step: 1, title: 'Register shipment', detail: 'Oracle signs register_shipment — not your wallet. Escrow rules are written into chain state.', icon: FileCheck },
    { step: 2, title: 'Lock escrow', detail: 'You fund the shipment from Pera; ALGO is held in the app until settlement or dispute.', icon: Lock },
    { step: 3, title: 'Run AI Jury', detail: 'The four agents run in sequence; results are hashed and recorded on-chain with a verifiable note.', icon: Cpu },
    { step: 4, title: 'Verify & settle', detail: 'Use Verify for public proof, Audit trail for history, then settle to mint certificate flows.', icon: ShieldCheck },
] as const;

export function JuryPipelineSection() {
    return (
        <section
            className="card"
            style={{
                marginTop: 18,
                padding: '20px 22px',
                background: 'linear-gradient(165deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.55) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
            }}
            aria-labelledby="jury-pipeline-heading"
        >
            <div style={{ marginBottom: 6 }}>
                <h2 id="jury-pipeline-heading" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                    4-agent AI jury — what you are verifying
                </h2>
                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.55, maxWidth: 720 }}>
                    Each time you click <strong style={{ color: '#e2e8f0' }}>Run AI Jury</strong> on a shipment, the backend runs this pipeline with{' '}
                    <strong style={{ color: '#e2e8f0' }}>real weather APIs</strong> and <strong style={{ color: '#e2e8f0' }}>live box reads</strong>, then writes the verdict on Algorand.
                    Expand a shipment card to see <strong style={{ color: '#e2e8f0' }}>Live verdict terminal</strong> with per-agent JSON and the on-chain tx link.
                </p>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 12,
                    marginTop: 16,
                }}
            >
                {AGENTS.map((a, i) => {
                    const Icon = a.icon;
                    return (
                        <div
                            key={a.key}
                            style={{
                                padding: '14px 14px 16px',
                                borderRadius: 10,
                                background: 'rgba(15, 23, 42, 0.65)',
                                border: '1px solid rgba(148, 163, 184, 0.18)',
                                position: 'relative',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span
                                    style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        color: '#64748b',
                                        letterSpacing: '0.06em',
                                    }}
                                >
                                    {i + 1} / 4
                                </span>
                                <div
                                    style={{
                                        marginLeft: 'auto',
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: `${a.accent}22`,
                                        border: `1px solid ${a.accent}44`,
                                    }}
                                >
                                    <Icon size={18} color={a.accent} strokeWidth={2} />
                                </div>
                            </div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '0.88rem', fontWeight: 700, color: '#f1f5f9' }}>{a.title}</h3>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.5 }}>{a.body}</p>
                        </div>
                    );
                })}
            </div>

            <p style={{ margin: '16px 0 0', fontSize: '0.74rem', color: '#64748b', lineHeight: 1.5 }}>
                API: <code style={{ fontSize: '0.7rem', color: '#94a3b8' }}>POST /run-jury</code> returns{' '}
                <code style={{ fontSize: '0.7rem', color: '#94a3b8' }}>agent_dialogue</code> for dashboards — same names as above.
            </p>
        </section>
    );
}

export function TrustFlowSection() {
    return (
        <section
            className="card"
            style={{
                marginTop: 14,
                padding: '18px 22px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: 'rgba(15, 23, 42, 0.45)',
            }}
            aria-labelledby="trust-flow-heading"
        >
            <h2 id="trust-flow-heading" style={{ margin: '0 0 6px', fontSize: '0.98rem', fontWeight: 800, color: '#f8fafc' }}>
                End-to-end trust flow on Pramanik
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                Navi-Trust ties logistics risk, escrow, and proofs together. Use the links below to go deeper.
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
                {FLOW.map((f, idx) => {
                    const Icon = f.icon;
                    return (
                        <li
                            key={f.step}
                            style={{
                                display: 'flex',
                                gap: 14,
                                alignItems: 'flex-start',
                                paddingBottom: idx < FLOW.length - 1 ? 12 : 0,
                                borderBottom: idx < FLOW.length - 1 ? '1px solid rgba(148, 163, 184, 0.12)' : undefined,
                            }}
                        >
                            <div
                                style={{
                                    flexShrink: 0,
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    border: '1px solid rgba(56, 189, 248, 0.25)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    color: '#7dd3fc',
                                }}
                            >
                                {f.step}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <Icon size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e2e8f0' }}>{f.title}</span>
                                </div>
                                <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>{f.detail}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>
            <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <Link to="/verify" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7dd3fc' }}>
                    Public verify →
                </Link>
                <span style={{ color: '#475569' }}>|</span>
                <Link to="/protocol" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7dd3fc' }}>
                    Protocol state →
                </Link>
                <span style={{ color: '#475569' }}>|</span>
                <Link to="/navibot" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7dd3fc' }}>
                    NaviBot Q&amp;A →
                </Link>
            </div>
        </section>
    );
}
