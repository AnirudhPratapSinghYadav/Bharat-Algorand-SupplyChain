import { Link } from 'react-router-dom';
import { CloudRain, FileCheck, Fingerprint, Scale, Wallet } from 'lucide-react';

type Props = {
  role: 'stakeholder' | 'supplier';
};

const CHECKS = [
  {
    icon: CloudRain,
    title: 'Live weather',
    desc: 'Open-Meteo at destination before release.',
  },
  {
    icon: FileCheck,
    title: 'GST E-Way Bill',
    desc: 'Compliance Auditor verifies an e-way bill tied to the corridor ID (visible after jury).',
  },
  {
    icon: Wallet,
    title: 'Supplier trust',
    desc: 'On-chain score after settlements — not a placeholder number.',
  },
  {
    icon: Fingerprint,
    title: 'Jury hash',
    desc: 'Tamper-evident verdict — verify on the Verify page.',
  },
  {
    icon: Scale,
    title: 'Escrow contract',
    desc: 'ALGO locked until jury + settlement; Pera signs deposits.',
  },
];

export function PlatformChecksCard({ role }: Props) {
  return (
    <section className="platform-checks card" aria-label="What Pramanik verifies">
      <h3 className="platform-checks__title">What Pramanik checks</h3>
      <p className="platform-checks__lead">
        {role === 'supplier'
          ? 'Your profile tracks trust and payments. Each card below is one export lane with its own escrow, jury, and compliance row.'
          : 'Each registered corridor gets weather, GST e-way, chain alignment, and a recorded jury before funds move.'}
      </p>
      <ul className="platform-checks__grid">
        {CHECKS.map((c) => (
          <li key={c.title} className="platform-checks__item">
            <c.icon size={16} className="platform-checks__icon" aria-hidden />
            <div>
              <strong>{c.title}</strong>
              <span>{c.desc}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="platform-checks__foot">
        Public proof:{' '}
        <Link to="/verify">Verify a corridor ID</Link>
        {' · '}
        <Link to="/protocol">API &amp; protocol</Link>
      </p>
    </section>
  );
}
