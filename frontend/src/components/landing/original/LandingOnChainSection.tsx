import { FALLBACK_APP_ID, LORA_APP } from '../../../constants/api';

type Props = { onConnectWallet: () => void; appId?: number | null };

const LAST_KNOWN_VERDICT = 'SETTLE';
const LAST_KNOWN_CONFIDENCE = 97;
const LAST_KNOWN_ESCROW = 4.75;

export function LandingOnChainSection({ onConnectWallet, appId }: Props) {
  const resolvedAppId = appId && appId > 0 ? appId : FALLBACK_APP_ID;
  const loraUrl = LORA_APP(resolvedAppId);

  return (
    <section id="proof" className="section" style={{ backgroundColor: '#111', color: '#FAF8F4' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p className="tag" style={{ color: '#C17435' }}>
            Fully verifiable
          </p>
          <div className="divider" style={{ margin: '20px auto 28px' }} />
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: '#FAF8F4', marginBottom: '20px' }}>
            Don&apos;t trust us. Verify us.
          </h2>
          <p style={{ fontSize: '17px', color: '#E0E0E0', lineHeight: 1.75, maxWidth: '580px', margin: '0 auto' }}>
            Every decision pramanik makes is anchored to the Algorand blockchain. The contract is public. The verdict is
            public. The data sources are public. Anyone can audit every settlement, every time.
          </p>
        </div>

        <div
          style={{
            backgroundColor: '#1A1A1A',
            borderRadius: '16px',
            padding: '48px',
            border: '1px solid #2A2A2A',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 0,
          }}
        >
          {[
            {
              label: 'Last Verdict',
              value: LAST_KNOWN_VERDICT,
              sub: `${LAST_KNOWN_CONFIDENCE}% confidence score`,
              highlight: true,
            },
            {
              label: 'Escrow Released',
              value: `${LAST_KNOWN_ESCROW} ALGO`,
              sub: 'Settlement NFT minted',
              highlight: false,
            },
          ].map((item, i, arr) => (
            <div
              key={item.label}
              style={{
                padding: '36px 32px',
                borderRight: i < arr.length - 1 ? '1px solid #2A2A2A' : 'none',
              }}
            >
              <p
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#666',
                  marginBottom: '16px',
                }}
              >
                {item.label}
              </p>
              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '40px',
                  fontWeight: 800,
                  lineHeight: 1,
                  color: item.highlight ? '#C17435' : '#FAF8F4',
                  marginBottom: '12px',
                }}
              >
                {item.value}
              </p>
              <p style={{ fontSize: '13px', color: '#666' }}>{item.sub}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '32px',
            marginTop: '48px',
          }}
        >
          {[
            {
              icon: '📄',
              title: 'The reasoning is hashed',
              body: 'Every factor the system considered — weather data, customs documents, GPS records — is compressed into a SHA-256 hash and written to the transaction note on Algorand.',
            },
            {
              icon: '🔒',
              title: 'The contract is immutable',
              body: 'Once payment enters the escrow smart contract, neither party can withdraw it. Only the verdict can release it. We cannot access it. No one can.',
            },
            {
              icon: '📜',
              title: 'Settlement is provable forever',
              body: 'Every resolved dispute generates an ARC-69 NFT — a permanent, on-chain certificate that the payment was made, when, and on what grounds.',
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{ backgroundColor: '#1A1A1A', borderRadius: '12px', padding: '32px', border: '1px solid #2A2A2A' }}
            >
              <div style={{ fontSize: '28px', marginBottom: '16px' }}>{item.icon}</div>
              <h4
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#FAF8F4',
                  marginBottom: '12px',
                }}
              >
                {item.title}
              </h4>
              <p style={{ fontSize: '14px', color: '#CCCCCC', lineHeight: 1.75 }}>{item.body}</p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '64px', paddingTop: '48px', borderTop: '1px solid #2A2A2A' }}>
          <button
            type="button"
            onClick={onConnectWallet}
            style={{
              display: 'inline-block',
              backgroundColor: '#C17435',
              color: '#FFF',
              fontSize: '16px',
              fontWeight: 600,
              padding: '16px 40px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try a live dispute →
          </button>
          {loraUrl ? (
            <p style={{ marginTop: '16px' }}>
              <a
                href={loraUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '14px', color: '#C17435', textDecoration: 'none' }}
              >
                Verify contract on Lora ↗
              </a>
            </p>
          ) : null}
          <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>No wallet required to view. Connect to transact.</p>
        </div>
      </div>
    </section>
  );
}
