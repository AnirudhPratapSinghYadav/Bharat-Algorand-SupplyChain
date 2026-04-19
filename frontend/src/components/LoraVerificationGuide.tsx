/**
 * Explains what “verification on Lora” means and which JSON fields to expect
 * for verdict transactions, assets (ARC-69), and the smart contract application.
 */

const NAVI_VERDICT_EXAMPLE = `{
  "type": "NAVI_VERDICT",
  "v": "3",
  "app": 123456789,
  "sid": "SHIP_MUMBAI_001",
  "score": 72,
  "verdict": "HOLD",
  "reason": "…",
  "agents": {
    "sentinel": 65,
    "auditor": 70,
    "fraud": 40,
    "arbiter": 72
  },
  "weather": { "city": "Dubai", "precip": 0.2, "wind": 18, "desc": "…" },
  "ts": "2026-04-18T12:00:00Z",
  "jury_hash": "…"
}`;

type Props = {
    /** Smaller single-column for sidebars; full width for main panels */
    variant?: 'full' | 'compact';
};

export function LoraVerificationGuide({ variant = 'full' }: Props) {
    const isCompact = variant === 'compact';
    return (
        <div
            style={{
                marginTop: isCompact ? 8 : 12,
                padding: isCompact ? '10px 12px' : '14px 16px',
                borderRadius: 10,
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                fontSize: isCompact ? '0.72rem' : '0.78rem',
                lineHeight: 1.55,
                color: '#94a3b8',
            }}
        >
            <div style={{ fontWeight: 800, color: '#7dd3fc', marginBottom: 8, fontSize: isCompact ? '0.7rem' : '0.75rem', letterSpacing: '0.06em' }}>
                LORA · READ THE JSON
            </div>
            <p style={{ margin: '0 0 10px', color: '#cbd5e1' }}>
                <strong style={{ color: '#e2e8f0' }}>Lora</strong> is Algorand’s explorer UI. Every important Pramanik action has a transaction or asset on{' '}
                <strong style={{ color: '#e2e8f0' }}>TestNet</strong>. Open the link → use the <strong style={{ color: '#e2e8f0' }}>Note</strong> or{' '}
                <strong style={{ color: '#e2e8f0' }}>ARC-69 metadata</strong> tab — that is your machine-readable proof.
            </p>

            <details style={{ marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#bae6fd', listStylePosition: 'outside' }}>
                    Verdict transaction (app call) — <code style={{ fontSize: '0.68rem' }}>NAVI_VERDICT</code> JSON in the Note
                </summary>
                <p style={{ margin: '8px 0 6px' }}>
                    After <strong style={{ color: '#e2e8f0' }}>Run AI Jury</strong>, the oracle submits <code style={{ fontSize: '0.65rem' }}>record_verdict</code>. The attached note is
                    JSON (≤1000 bytes) so auditors can verify scores without trusting our UI.
                </p>
                <FieldTable
                    rows={[
                        ['type', 'Always NAVI_VERDICT — identifies the schema.'],
                        ['sid', 'Your shipment_id — ties the note to box storage.'],
                        ['score / verdict', 'Chief Arbiter output; matches on-chain verdict box.'],
                        ['agents.sentinel … arbiter', 'Per-agent scores at decision time.'],
                        ['weather', 'Open-Meteo snapshot used in that run.'],
                        ['jury_hash', 'Optional tamper-evident hash (verify via API POST /verify-hash).'],
                    ]}
                />
                <pre
                    style={{
                        margin: '10px 0 0',
                        padding: 10,
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid rgba(51,65,85,0.6)',
                        fontSize: '0.62rem',
                        color: '#a5b4fc',
                        overflow: 'auto',
                        maxHeight: isCompact ? 140 : 200,
                        lineHeight: 1.4,
                    }}
                >
                    {NAVI_VERDICT_EXAMPLE}
                </pre>
            </details>

            <details style={{ marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#bae6fd', listStylePosition: 'outside' }}>
                    Supplier Passport / NAVI-CERT (ASA) — ARC-69 metadata on Lora
                </summary>
                <p style={{ margin: '8px 0 6px' }}>
                    Certificates and the <strong style={{ color: '#e2e8f0' }}>Supplier Passport</strong> are Algorand Standard Assets. On Lora, open the{' '}
                    <strong style={{ color: '#e2e8f0' }}>Asset</strong> page → <strong style={{ color: '#e2e8f0' }}>ARC-69</strong> tab: you’ll see JSON metadata (name, image URL,
                    traits) the oracle attached when minting. That is how you prove “this NFT is the passport the protocol minted” without our database.
                </p>
                <FieldTable
                    rows={[
                        ['name / unit-name', 'Human-readable labels on-chain.'],
                        ['properties / traits', 'Reputation tier, app id, or shipment refs — varies by mint.'],
                        ['Reserve / clawback', 'Usually disabled for trust-minimized certs.'],
                    ]}
                />
            </details>

            <details>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#bae6fd', listStylePosition: 'outside' }}>
                    Smart contract (application) page on Lora
                </summary>
                <p style={{ margin: '8px 0 0' }}>
                    Shows global counters, program version, and links into <strong style={{ color: '#e2e8f0' }}>box storage</strong> for each shipment. Use it to confirm{' '}
                    <code style={{ fontSize: '0.65rem' }}>APP_ID</code> matches your backend and that escrow sits in the app account you expect.
                </p>
            </details>
        </div>
    );
}

function FieldTable({ rows }: { rows: [string, string][] }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', marginTop: 6 }}>
            <tbody>
                {rows.map(([k, v]) => (
                    <tr key={k}>
                        <td
                            style={{
                                verticalAlign: 'top',
                                padding: '4px 8px 4px 0',
                                color: '#7dd3fc',
                                fontFamily: 'ui-monospace, monospace',
                                width: '28%',
                            }}
                        >
                            {k}
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '4px 0', color: '#cbd5e1' }}>{v}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** One-line hint + link pattern for repeated Lora CTAs */
export function LoraInlineHint({ context }: { context: 'verdict' | 'asset' | 'app' | 'generic' }) {
    const t =
        context === 'verdict'
            ? 'On Lora, open the transaction → Note tab — JSON type NAVI_VERDICT.'
            : context === 'asset'
              ? 'On Lora, open the asset → ARC-69 tab for oracle metadata JSON.'
              : context === 'app'
                ? 'On Lora, confirm application id and global state match your deployment.'
                : 'Use Lora’s Note / ARC-69 tabs to read on-chain JSON proofs.';
    return (
        <p style={{ margin: '6px 0 0', fontSize: '0.68rem', color: '#64748b', lineHeight: 1.45 }}>
            <span style={{ color: '#94a3b8' }}>{t}</span>
        </p>
    );
}
