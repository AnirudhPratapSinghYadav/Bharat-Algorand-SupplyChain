/**
 * Inline SVG: Algorand → smart contract → 4-agent jury → immutable verdict.
 */
export function TrustStackIllustration() {
    return (
        <div className="trust-stack-wrap" aria-hidden>
            <svg viewBox="0 0 520 200" className="trust-stack-svg" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="ts-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
                    </linearGradient>
                    <filter id="ts-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="b" />
                        <feMerge>
                            <feMergeNode in="b" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <marker id="ts-arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
                    </marker>
                </defs>
                <rect x="8" y="24" width="504" height="152" rx="16" fill="url(#ts-grad)" stroke="rgba(56,189,248,0.25)" strokeWidth="1" />
                <text x="260" y="48" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="system-ui,sans-serif" fontWeight="600">
                    Trust stack — all layers verifiable on TestNet
                </text>
                <g filter="url(#ts-glow)">
                    <rect x="32" y="72" width="88" height="88" rx="12" fill="rgba(15,23,42,0.85)" stroke="#22d3ee" strokeWidth="1.5" />
                    <text x="76" y="108" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="700" fontFamily="system-ui,sans-serif">
                        Algorand
                    </text>
                    <text x="76" y="128" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="ui-monospace,monospace">
                        L1 + indexer
                    </text>

                    <rect x="148" y="72" width="88" height="88" rx="12" fill="rgba(15,23,42,0.85)" stroke="#fbbf24" strokeWidth="1.5" />
                    <text x="192" y="104" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">
                        Pramanik
                    </text>
                    <text x="192" y="122" textAnchor="middle" fill="#64748b" fontSize="8.5" fontFamily="system-ui,sans-serif">
                        escrow · boxes
                    </text>

                    <rect x="264" y="64" width="112" height="104" rx="12" fill="rgba(15,23,42,0.9)" stroke="#a78bfa" strokeWidth="1.5" />
                    <text x="320" y="92" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">
                        4-agent jury
                    </text>
                    <text x="320" y="110" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="system-ui,sans-serif">
                        Sentinel → Audit
                    </text>
                    <text x="320" y="124" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="system-ui,sans-serif">
                        Fraud → Arbiter
                    </text>
                    <text x="320" y="148" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="ui-monospace,monospace">
                        Open-Meteo + LLM
                    </text>

                    <rect x="400" y="72" width="88" height="88" rx="12" fill="rgba(15,23,42,0.85)" stroke="#34d399" strokeWidth="1.5" />
                    <text x="444" y="108" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="700" fontFamily="system-ui,sans-serif">
                        Verdict
                    </text>
                    <text x="444" y="128" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="ui-monospace,monospace">
                        NAVI_VERDICT
                    </text>
                </g>
                <path d="M 120 116 L 138 116" stroke="#475569" strokeWidth="2" markerEnd="url(#ts-arr)" />
                <path d="M 236 116 L 254 116" stroke="#475569" strokeWidth="2" markerEnd="url(#ts-arr)" />
                <path d="M 376 116 L 394 116" stroke="#475569" strokeWidth="2" markerEnd="url(#ts-arr)" />
            </svg>
            <style>{`
                .trust-stack-wrap {
                    margin-top: 14px;
                    margin-bottom: 4px;
                    border-radius: 14px;
                    overflow: hidden;
                    border: 1px solid rgba(56, 189, 248, 0.15);
                    background: rgba(15, 23, 42, 0.4);
                }
                .trust-stack-svg {
                    display: block;
                    width: 100%;
                    height: auto;
                    max-height: 220px;
                }
            `}</style>
        </div>
    );
}
