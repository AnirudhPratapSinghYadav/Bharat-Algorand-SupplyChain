import { Link } from 'react-router-dom';
import { BookOpen, ExternalLink } from 'lucide-react';

const INCOTERMS = [
  ['FOB', 'Port of loading (on vessel)', 'Yes', 'No'],
  ['CIF', 'Port of loading (on vessel)', 'Yes', 'Yes'],
  ['DDP', 'Named destination', 'No', 'Yes'],
  ['EXW', "Seller's premises", 'No', 'No'],
  ['CPT', 'First carrier at origin', 'Yes', 'No'],
  ['DAP', 'Named destination (before unload)', 'No', 'No'],
] as const;

const LINKS = [
  { label: 'ICC Incoterms 2020', href: 'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/' },
  { label: 'UNCTAD Trade Logistics', href: 'https://unctad.org/topic/transport-and-trade-logistics' },
  { label: 'CISG (UN Sales Convention)', href: 'https://uncitral.un.org/en/texts/salegoods/conventions/sale_of_goods/cisg' },
  { label: 'India MSMED Act', href: 'https://msme.gov.in/msmed-act' },
  { label: 'Pramanik protocol', href: '/protocol', internal: true },
];

export function TradeRulesPanel() {
  return (
    <section className="trade-rules card" id="trade-rules" aria-labelledby="trade-rules-title">
      <div className="trade-rules__head">
        <BookOpen size={18} className="trade-rules__icon" aria-hidden />
        <div>
          <p className="trade-rules__kicker">Trade rules reference</p>
          <h3 id="trade-rules-title" className="trade-rules__title">
            Who is liable under which conditions?
          </h3>
          <p className="trade-rules__lead">
            Pramanik escrow + AI jury follow these practical rules. Weather delays usually freeze release until review.
          </p>
        </div>
      </div>

      <div className="trade-rules__table-wrap">
        <table className="trade-rules__table">
          <thead>
            <tr>
              <th>Incoterm</th>
              <th>Risk transfers at</th>
              <th>Buyer bears transit risk</th>
              <th>Seller must insure</th>
            </tr>
          </thead>
          <tbody>
            {INCOTERMS.map(([term, transfer, buyer, seller], i) => (
              <tr key={term} className={i % 2 === 1 ? 'trade-rules__row--alt' : undefined}>
                <td className="trade-rules__term">{term}</td>
                <td>{transfer}</td>
                <td className={buyer === 'Yes' ? 'trade-rules__yes' : 'trade-rules__no'}>{buyer === 'Yes' ? '✓' : '✗'}</td>
                <td className={seller === 'Yes' ? 'trade-rules__yes' : 'trade-rules__no'}>{seller === 'Yes' ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="trade-rules__force">
        <strong>Force majeure rule</strong>
        <p>
          Storms, port closure, or cyclone-level weather pause release — escrow stays locked until the jury reviews live
          weather and documents. Wave height &gt;5m or Beaufort wind &gt;9 aligns with common maritime insurance thresholds.
        </p>
      </div>

      <div className="trade-rules__un">
        <p className="trade-rules__un-title">UN &amp; international trade law</p>
        <p className="trade-rules__un-lead">
          Who bears risk when weather or force majeure hits depends on your Incoterm and these conventions — not on
          informal email disputes.
        </p>
        <ul className="trade-rules__un-list">
          <li>
            <a
              href="https://uncitral.un.org/en/texts/salegoods/conventions/sale_of_goods/cisg"
              target="_blank"
              rel="noopener noreferrer"
            >
              UN CISG (Convention on Contracts for the International Sale of Goods) ↗
            </a>
          </li>
          <li>
            <a href="https://uncitral.un.org/en/texts/transport" target="_blank" rel="noopener noreferrer">
              UNCITRAL transport law instruments ↗
            </a>
          </li>
          <li>
            <a
              href="https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ICC Incoterms 2020 (risk transfer rules) ↗
            </a>
          </li>
        </ul>
      </div>

      <p className="trade-rules__links-label">More references</p>
      <ul className="trade-rules__links">
        {LINKS.map((l) => (
          <li key={l.href}>
            {l.internal ? (
              <Link to={l.href}>
                {l.label} <ExternalLink size={12} />
              </Link>
            ) : (
              <a href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label} <ExternalLink size={12} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
