import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { BACKEND_URL } from '../../constants/api';

export function QuickProofSection() {
  const q = useQuery({
    queryKey: ['landing-quick-proof-config'],
    queryFn: async () =>
      (await axios.get(`${BACKEND_URL}/config`, { timeout: 8000 })).data as { demo_shipments?: string[] },
    staleTime: 60_000,
  });

  const ids = Array.isArray(q.data?.demo_shipments) ? q.data!.demo_shipments! : [];

  if (q.isLoading) {
    return (
      <section className="nt-section nt-quick-proof" aria-label="Try without wallet">
        <p className="nt-quick-proof-label">Try it without logging in</p>
        <p className="nt-quick-proof-hint">Loading public verify links…</p>
      </section>
    );
  }

  if (!ids.length) {
    return (
      <section className="nt-section nt-quick-proof" aria-label="Try without wallet">
        <p className="nt-quick-proof-label">Try it without logging in</p>
        <p className="nt-quick-proof-hint">Open Verify from the nav and enter a shipment ID from your deployment.</p>
      </section>
    );
  }

  return (
    <section className="nt-section nt-quick-proof" aria-label="Try without wallet">
      <p className="nt-quick-proof-label">Try it without logging in</p>
      <div className="nt-quick-proof-pills">
        {ids.map((id) => (
          <Link key={id} to={`/verify/${id}`} className="nt-quick-proof-pill">
            {id}
          </Link>
        ))}
      </div>
      <p className="nt-quick-proof-hint">Each link opens the public verify page. No wallet required.</p>
    </section>
  );
}
