import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
import { AsyncPanel } from './AsyncPanel';

type RiskPoint = {
  shipment_id: string;
  score: number;
  verdict: string;
  timestamp: string;
  timeLabel?: string;
};

function verdictColor(v: string) {
  const u = (v || '').toUpperCase();
  if (u === 'DISPUTE' || u === 'HOLD') return '#c45c4a';
  if (u === 'SETTLE' || u === 'APPROVED') return '#2a9d8f';
  return '#c17435';
}

function mapPoints(raw: RiskPoint[]): RiskPoint[] {
  return raw.map((p) => {
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
        ? new Date(p.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Recent',
    };
  });
}

export function JuryRiskHistoryChart() {
  const q = useQuery({
    queryKey: ['risk-history'],
    queryFn: async () => {
      const res = await axios.get<{ points?: RiskPoint[] }>(`${BACKEND_URL}/risk-history`, { timeout: 12000 });
      return res.data;
    },
    staleTime: 20_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const raw = q.data?.points ?? [];
  const data = mapPoints(raw);
  const hasChart = data.length > 0;
  const initialLoad = q.isLoading && !hasChart;
  const refreshing = q.isFetching && hasChart;
  const showErrorOnly = q.isError && !hasChart;

  if (initialLoad) {
    return (
      <AsyncPanel
        title="AI jury history"
        loading
        loadingMessage="Gathering past jury decisions for your corridors. This can take a moment while we read the audit trail."
        className="jury-history"
      />
    );
  }

  if (showErrorOnly) {
    const offline =
      axios.isAxiosError(q.error) &&
      (!q.error.response || q.error.code === 'ECONNABORTED' || q.error.message.includes('Network'));
    return (
      <AsyncPanel
        title="AI jury history"
        error
        errorMessage={
          offline
            ? 'We cannot reach the server right now. Start the API on port 8000, then refresh. Your escrow and shipments are unchanged.'
            : 'We could not load past jury decisions. Run settlement review on a shipment, or try again in a minute.'
        }
        className="jury-history"
      />
    );
  }

  if (!hasChart) {
    return (
      <AsyncPanel
        title="AI jury history"
        empty
        emptyMessage="No jury decisions yet. When you request settlement review on a shipment, each verdict will appear here as a point on the chart."
        className="jury-history"
      />
    );
  }

  return (
    <AsyncPanel title="AI jury history" refreshing={refreshing} className="jury-history">
      <p className="jury-history__sub">
        Each dot is one jury outcome. <span className="jury-history__legend jh-ok">Green</span> = release recommended,{' '}
        <span className="jury-history__legend jh-warn">red</span> = hold or dispute.
      </p>
      <div className="jury-history__chart">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d5" />
            <XAxis type="category" dataKey="timeLabel" tick={{ fontSize: 11, fill: '#4a4540' }} />
            <YAxis
              type="number"
              dataKey="score"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#4a4540' }}
              label={{
                value: 'Risk score',
                angle: -90,
                position: 'insideLeft',
                offset: 4,
                fontSize: 11,
                fill: '#4a4540',
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as RiskPoint;
                return (
                  <div className="jury-history__tooltip">
                    <div className="jury-history__tooltip-title">{d.shipment_id}</div>
                    <div>Score {d.score}</div>
                    <div>Outcome {d.verdict || 'Pending'}</div>
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
                    strokeWidth={1.5}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </AsyncPanel>
  );
}
