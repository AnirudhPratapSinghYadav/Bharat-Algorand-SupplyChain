import { useEffect, useState } from 'react';
import axios from 'axios';
import { Scale, ExternalLink } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type Rep = {
  win_rate_pct?: number | null;
  total_staked_algo?: number;
  open_stakes?: number;
  wins?: number;
  losses?: number;
};

type StakeEntry = {
  verdict?: string;
  stake_tx?: string;
  status?: string;
  ts?: string;
};

export function OracleStake() {
  const [rep, setRep] = useState<Rep | null>(null);
  const [stakes, setStakes] = useState<Record<string, StakeEntry>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [r1, r2] = await Promise.all([
          axios.get(`${BACKEND_URL}/oracle/reputation`, { timeout: API_TIMEOUT }),
          axios.get(`${BACKEND_URL}/oracle/stakes`, { timeout: API_TIMEOUT }),
        ]);
        if (!cancelled) {
          setRep(r1.data);
          setStakes((r2.data?.stakes as Record<string, StakeEntry>) ?? {});
        }
      } catch {
        if (!cancelled) {
          setRep(null);
          setStakes({});
        }
      }
    };
    void run();
    const id = window.setInterval(run, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const recent = Object.entries(stakes)
    .slice(-4)
    .reverse();

  return (
    <div className="card" style={{ padding: '12px 14px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Scale size={16} color="#6366f1" />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', color: '#4f46e5' }}>ORACLE REPUTATION</span>
      </div>
      <p style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: 8 }}>The AI stakes 0.1 ALGO on each jury verdict (when oracle is funded).</p>
      {rep ? (
        <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5 }}>
          <div>
            Win rate: <strong>{rep.win_rate_pct != null ? `${rep.win_rate_pct}%` : '—'}</strong> ({rep.wins ?? 0}W / {rep.losses ?? 0}L)
          </div>
          <div>
            Total staked: <strong>{rep.total_staked_algo ?? 0}</strong> ALGO
          </div>
          <div>
            Open stakes: <strong>{rep.open_stakes ?? 0}</strong>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Stake metrics unavailable.</div>
      )}
      {recent.length > 0 ? (
        <ul style={{ marginTop: 10, paddingLeft: 16, fontSize: '0.68rem', color: '#475569' }}>
          {recent.map(([sid, s]) => (
            <li key={sid} style={{ marginBottom: 6 }}>
              {sid}: {s.verdict} · {s.status}
              {s.stake_tx ? (
                <a
                  href={`https://lora.algokit.io/testnet/transaction/${s.stake_tx}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  <ExternalLink size={10} /> Lora
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
