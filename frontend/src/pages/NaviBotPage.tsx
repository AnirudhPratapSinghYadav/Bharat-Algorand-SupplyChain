import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { NaviBotPanel } from '../components/NaviBotPanel';
import { useRole } from '../context/RoleContext';

export default function NaviBotPage() {
  const { role } = useRole();
  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', padding: 24, paddingBottom: 120 }}>
      <Link to="/" style={{ color: '#2563eb', fontWeight: 600, display: 'inline-block', marginBottom: 16 }}>
        ← Dashboard
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Bot size={26} color="#2563eb" />
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>NaviBot</h1>
      </div>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16, maxWidth: 520 }}>
        Same fast backend as the floating panel — cached context and short answers.
      </p>
      <NaviBotPanel defaultOpen shipmentId={null} variant="inline" role={role} />
    </div>
  );
}
