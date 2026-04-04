import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CloudRain, ExternalLink } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type Row = { city?: string; tx_id?: string; lora_url?: string; weather?: { precipitation_mm?: number } };

type Props = {
  shipmentId: string;
  destinationLabel: string;
};

function cityToken(label: string): string {
  const known = ['Mumbai', 'Dubai', 'Rotterdam', 'Singapore', 'Shanghai', 'Chennai', 'Delhi', 'Hamburg', 'London', 'New York'];
  for (const c of known) {
    if (label.includes(c)) return c;
  }
  const first = label.split(/[,(]/)[0]?.trim();
  return first || 'Dubai';
}

export function WeatherCourt({ shipmentId, destinationLabel }: Props) {
  const city = useMemo(() => cityToken(destinationLabel), [destinationLabel]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/weather-oracle/history/${encodeURIComponent(city)}`, {
        params: { hours: 72 },
        timeout: API_TIMEOUT,
      });
      setRows(r.data?.readings ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      rows.map((x, i) => ({
        i,
        label: `#${i + 1}`,
        precip: Number(x.weather?.precipitation_mm ?? 0),
        lora_url: x.lora_url,
      })),
    [rows],
  );

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <CloudRain size={16} color="#2563eb" />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', color: '#1d4ed8' }}>WEATHER COURT</span>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
          {city} · shipment {shipmentId}
        </span>
      </div>
      <p style={{ fontSize: '0.72rem', color: '#475569', marginBottom: 8 }}>
        Hourly oracle snapshots are written to Algorand when the backend oracle is configured. Each point can link to Lora.
      </p>
      <div style={{ height: 140 }}>
        {loading ? (
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading weather history…</span>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} width={28} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { precip: number; lora_url?: string };
                  return (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: 8, borderRadius: 8, fontSize: 11 }}>
                      <div>{p.precip} mm precip</div>
                      {p.lora_url ? (
                        <a href={p.lora_url} target="_blank" rel="noreferrer">
                          Lora tx
                        </a>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="precip" stroke="#3b82f6" fill="rgba(59,130,246,0.25)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <a
        href={`${BACKEND_URL}/weather-oracle/dispute-evidence/${encodeURIComponent(shipmentId)}`}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}
      >
        <ExternalLink size={11} /> Blockchain weather record (JSON)
      </a>
    </div>
  );
}
