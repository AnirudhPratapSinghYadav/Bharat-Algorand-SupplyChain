import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { ExternalLink, Radio } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type Reading = {
  timestamp?: string;
  temperature_c?: number;
  tx_id?: string;
  lora_url?: string;
};

type Props = {
  shipmentId: string;
  oracleAddress?: string | null;
};

const LORA_INDEX_HINT = (addr: string) =>
  `https://testnet-idx.algonode.cloud/v2/accounts/${encodeURIComponent(addr)}/transactions?limit=50`;

export function WitnessPanel({ shipmentId, oracleAddress }: Props) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [anomaly, setAnomaly] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${BACKEND_URL}/witness/history/${encodeURIComponent(shipmentId)}`, {
        timeout: API_TIMEOUT,
      });
      setReadings(r.data?.readings ?? []);
      setAnomaly(r.data?.anomaly_check ?? null);
    } catch {
      setError('Could not load witness history.');
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      readings.map((x, i) => ({
        i,
        t: x.timestamp ? new Date(x.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `#${i + 1}`,
        temp: Number(x.temperature_c ?? 0),
        lora_url: x.lora_url,
        tx_id: x.tx_id,
      })),
    [readings],
  );

  const recordNow = async () => {
    setRecording(true);
    setError(null);
    try {
      await axios.post(`${BACKEND_URL}/witness/record/${encodeURIComponent(shipmentId)}`, null, {
        timeout: 60000,
      });
      await load();
    } catch {
      setError('Record failed (oracle / network).');
    } finally {
      setRecording(false);
    }
  };

  const anomalyActive = Boolean(anomaly && (anomaly as { anomaly?: boolean }).anomaly);

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 10,
        background: anomalyActive ? 'rgba(220,38,38,0.08)' : 'rgba(15,23,42,0.04)',
        border: `1px solid ${anomalyActive ? 'rgba(220,38,38,0.35)' : '#e5e7eb'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', color: '#0891b2' }}>
          WITNESS PROTOCOL · IoT hash chain
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="primary-btn"
            style={{ fontSize: '0.72rem', padding: '6px 10px' }}
            disabled={recording}
            onClick={() => void recordNow()}
          >
            <Radio size={12} style={{ marginRight: 4 }} />
            {recording ? 'Recording…' : 'Record now'}
          </button>
          {oracleAddress ? (
            <a
              href={LORA_INDEX_HINT(oracleAddress)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb' }}
            >
              <ExternalLink size={12} /> Proofs (oracle txs)
            </a>
          ) : null}
        </div>
      </div>
      {anomalyActive ? (
        <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600 }}>
          Anomaly: {(anomaly as { severity?: string }).severity} · temp {(anomaly as { value?: number }).value}°C
        </div>
      ) : null}
      {error ? <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#dc2626' }}>{error}</div> : null}
      <div style={{ height: 160, marginTop: 10 }}>
        {loading ? (
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading readings…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 10 }} width={32} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { temp: number; lora_url?: string };
                  return (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: 8, borderRadius: 8, fontSize: 12 }}>
                      <div>{p.temp}°C</div>
                      {p.lora_url ? (
                        <a href={p.lora_url} target="_blank" rel="noreferrer">
                          Open Lora tx
                        </a>
                      ) : null}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={8} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '8°C', fill: '#b45309', fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="temp"
                stroke={anomalyActive ? '#dc2626' : '#06b6d4'}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
