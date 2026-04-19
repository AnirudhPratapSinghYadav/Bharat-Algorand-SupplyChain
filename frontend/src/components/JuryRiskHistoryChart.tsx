import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { BACKEND_URL } from '../constants/api';

type RiskPoint = {
    shipment_id: string;
    score: number;
    verdict: string;
    timestamp: string;
    timeLabel?: string;
};

function verdictColor(v: string) {
    if (v === 'DISPUTE') return '#dc2626';
    if (v === 'SETTLE') return '#16a34a';
    if (v === 'HOLD') return '#d97706';
    return '#64748b';
}

export function JuryRiskHistoryChart() {
    const q = useQuery({
        queryKey: ['risk-history'],
        queryFn: async () => {
            const res = await axios.get<{ points?: RiskPoint[] }>(`${BACKEND_URL}/risk-history`, { timeout: 8000 });
            return res.data;
        },
        staleTime: 0,
        refetchInterval: false,
    });
    const raw = q.data?.points || [];

    if (q.isLoading) {
        return (
            <section className="card" style={{ marginTop: 16, padding: '16px 18px' }} aria-label="AI jury history">
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>AI Jury History</div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Loading verdict history…</p>
            </section>
        );
    }

    if (q.isError) {
        return (
            <section className="card" style={{ marginTop: 16, padding: '16px 18px' }} aria-label="AI jury history">
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>AI Jury History</div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#f87171' }}>Could not load risk history. Is the backend running?</p>
            </section>
        );
    }

    if (raw.length === 0) {
        return (
            <section className="card" style={{ marginTop: 16, padding: '16px 18px' }} aria-label="AI jury history">
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>AI Jury History</div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    No risk points yet. Run <strong style={{ color: '#e2e8f0' }}>AI Jury</strong> on a shipment (saves to the server audit trail), or ensure shipments have on-chain{' '}
                    <code style={{ color: '#e2e8f0', fontSize: '0.75rem' }}>record_verdict</code> / risk boxes — the API also merges live box scores into this chart.
                </p>
            </section>
        );
    }

    const data: RiskPoint[] = raw.map((p) => {
        const score =
            typeof p.score === 'number' && !Number.isNaN(p.score)
                ? p.score
                : typeof (p as unknown as { sentinel_score?: number }).sentinel_score === 'number'
                  ? (p as unknown as { sentinel_score: number }).sentinel_score
                  : 0;
        return {
            ...p,
            score,
            timeLabel: p.timestamp
                ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '—',
        };
    });

    return (
        <section className="card" style={{ marginTop: 16, padding: '16px 18px' }} aria-label="AI jury history">
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12 }}>AI Jury History</div>
            <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                            type="category"
                            dataKey="timeLabel"
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            label={{ value: 'Time', position: 'bottom', offset: 0, fontSize: 11, fill: '#94a3b8' }}
                        />
                        <YAxis
                            type="number"
                            dataKey="score"
                            domain={[0, 100]}
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            label={{ value: 'Risk Score', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
                        />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0].payload as RiskPoint;
                                return (
                                    <div
                                        style={{
                                            background: '#fff',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: 8,
                                            padding: '8px 10px',
                                            fontSize: '0.78rem',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600 }}>{d.shipment_id}</div>
                                        <div>Score: {d.score}</div>
                                        <div>Verdict: {d.verdict}</div>
                                    </div>
                                );
                            }}
                        />
                        <Scatter
                            data={data}
                            shape={(props: { cx?: number; cy?: number; payload?: RiskPoint }) => {
                                const { cx, cy, payload } = props;
                                if (cx == null || cy == null || !payload) return null;
                                return (
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r={7}
                                        fill={verdictColor(payload.verdict)}
                                        stroke="#fff"
                                        strokeWidth={1}
                                    />
                                );
                            }}
                        />
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}
