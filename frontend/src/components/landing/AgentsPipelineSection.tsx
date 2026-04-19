import { Cloud, ShieldCheck, ScanSearch, Gavel, ArrowDown, ArrowRight } from 'lucide-react';

const AGENTS = [
  {
    step: '01',
    title: 'Weather Sentinel',
    Icon: Cloud,
    accent: '#22d3ee',
    tag: 'Open-Meteo · live route weather',
    body:
      'Pulls real forecasts for your destination hub — temperature, precipitation, wind, and WMO codes — and turns them into a numerical risk score before anything hits the chain.',
  },
  {
    step: '02',
    title: 'Compliance Auditor',
    Icon: ShieldCheck,
    accent: '#fbbf24',
    tag: 'Algorand boxes · SQLite cross-check',
    body:
      'Reads shipment state straight from contract box storage and compares it to off-chain metadata so status, escrow, and supplier cannot drift apart unnoticed.',
  },
  {
    step: '03',
    title: 'Fraud Detector',
    Icon: ScanSearch,
    accent: '#c084fc',
    tag: 'Supplier history · anomaly signals',
    body:
      'Scores inconsistency and credibility using reputation signals and route context — the safety layer before any payout logic or dispute flag is finalized.',
  },
  {
    step: '04',
    title: 'Chief Arbiter',
    Icon: Gavel,
    accent: '#f8fafc',
    tag: 'Binding verdict · oracle-signed tx',
    body:
      'Merges every signal into HOLD, DISPUTE, or SETTLE-style outcomes, then the oracle records verdict JSON on-chain with a verifiable note you can open on Lora.',
  },
] as const;

export function AgentsPipelineSection() {
  return (
    <section className="nt-section nt-section--airy nt-agents" id="agents" aria-labelledby="nt-agents-title">
      <p className="nt-agents-eyebrow">Intelligence layer</p>
      <h2 id="nt-agents-title" className="nt-section-title nt-agents-title">
        Four agents. One pipeline. Real data.
      </h2>
      <p className="nt-section-lead nt-section-lead--wide">
        When you run the AI jury on a shipment, the backend executes this sequence with{' '}
        <strong>live APIs</strong> and <strong>real chain reads</strong> — not canned demos. Each agent emits scores
        and reasoning; the Chief Arbiter alone authorizes what gets written to Algorand.
      </p>

      <div className="nt-agents-flow" aria-hidden>
        <span className="nt-agents-flow-label">Data flow</span>
        <div className="nt-agents-flow-track">
          <span>Open-Meteo</span>
          <ArrowRight className="nt-agents-flow-chevron" size={16} aria-hidden />
          <span>Boxes + DB</span>
          <ArrowRight className="nt-agents-flow-chevron" size={16} aria-hidden />
          <span>Fraud model</span>
          <ArrowRight className="nt-agents-flow-chevron" size={16} aria-hidden />
          <span>record_verdict</span>
        </div>
      </div>

      <ol className="nt-agents-grid">
        {AGENTS.map((a, i) => {
          const Icon = a.Icon;
          return (
            <li key={a.step} className="nt-agent-card nt-card">
              <div className="nt-agent-card-top">
                <span className="nt-agent-step" style={{ color: a.accent }}>
                  {a.step}
                </span>
                <div
                  className="nt-agent-icon-wrap"
                  style={{
                    borderColor: `${a.accent}44`,
                    background: `linear-gradient(145deg, ${a.accent}18, transparent)`,
                    boxShadow: `0 0 32px ${a.accent}12`,
                  }}
                >
                  <Icon size={26} color={a.accent} strokeWidth={2} aria-hidden />
                </div>
              </div>
              <h3 className="nt-agent-card-title">{a.title}</h3>
              <p className="nt-agent-card-tag">{a.tag}</p>
              <p className="nt-agent-card-body">{a.body}</p>
              {i < AGENTS.length - 1 ? (
                <div className="nt-agent-connector nt-agent-connector--mobile" aria-hidden>
                  <ArrowDown size={20} className="nt-agent-connector-icon" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="nt-agents-footnote">
        Gemini (and deterministic fallbacks) power the narrative layers; the smart contract only accepts oracle-signed
        registration and verdict calls — your wallet signs escrow and settlement, not the jury math.
      </p>
    </section>
  );
}
