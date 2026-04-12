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
    if (raw.length < 2) return null;

    const data: RiskPoint[] = raw.map((p) => ({
        ...p,
        timeLabel: p.timestamp
            ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—',
    }));

    return (
        <section className="card" style={{ marginTop: 16, padding: '16px 18px' }} aria-label="AI jury history">
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12 }}>AI Jury History</div>
            <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                            type="category"
                            dataKey="timeLabel"
                            tick={{ fontSize: 11 }}
                            label={{ value: 'Time', position: 'bottom', offset: 0, fontSize: 11 }}
                        />
                        <YAxis
                            type="number"
                            dataKey="score"
                            domain={[0, 100]}
                            tick={{ fontSize: 11 }}
                            label={{ value: 'Risk Score', angle: -90, position: 'insideLeft', fontSize: 11 }}
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
