import { useState } from 'react';
import axios from 'axios';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';
import { BarChart3, ExternalLink } from 'lucide-react';

type PredictResult = {
  dispute_probability_pct?: number;
  risk_level?: string;
  recommended_escrow_multiplier?: number;
  factors?: Record<string, unknown>;
  message?: string;
  lora_prediction_url?: string;
};

export function RiskPrediction() {
  const [supplierReputation, setSupplierReputation] = useState(50);
  const [routeRisk, setRouteRisk] = useState(30);
  const [destinationCity, setDestinationCity] = useState('Dubai');
  const [amountAlgo, setAmountAlgo] = useState(1);
  const [shipmentId, setShipmentId] = useState('');
  const [res, setRes] = useState<PredictResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await axios.post<PredictResult>(
        `${BACKEND_URL}/predict/dispute-risk`,
        {
          supplier_reputation: supplierReputation,
          route_risk: routeRisk,
          destination_city: destinationCity,
          amount_algo: amountAlgo,
          shipment_id: shipmentId || null,
        },
        { timeout: API_TIMEOUT },
      );
      setRes(r.data);
    } catch {
      setRes({ message: 'Prediction unavailable (backend / oracle).' });
    } finally {
      setBusy(false);
    }
  };

  const pct = res?.dispute_probability_pct ?? 0;
  const color = pct > 65 ? '#dc2626' : pct > 35 ? '#ca8a04' : '#16a34a';

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(37,99,235,0.05))',
        border: '1px solid rgba(6,182,212,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <BarChart3 size={18} color="#0891b2" />
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Dead reckoning · dispute risk</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>
          Supplier reputation (0–100)
          <input
            type="number"
            value={supplierReputation}
            min={0}
            max={100}
            onChange={(e) => setSupplierReputation(Number(e.target.value))}
            style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>
          Route risk (0–100)
          <input
            type="number"
            value={routeRisk}
            min={0}
            max={100}
            onChange={(e) => setRouteRisk(Number(e.target.value))}
            style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>
          Destination city
          <input
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
            style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>
          Amount (ALGO)
          <input
            type="number"
            step="0.1"
            value={amountAlgo}
            min={0}
            onChange={(e) => setAmountAlgo(Number(e.target.value))}
            style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#64748b' }}>
          Shipment id (optional)
          <input
            value={shipmentId}
            onChange={(e) => setShipmentId(e.target.value)}
            placeholder="SHIP_…"
            style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        </label>
      </div>
      <button type="button" className="primary-btn" disabled={busy} onClick={() => void run()} style={{ fontSize: '0.8rem' }}>
        {busy ? 'Scoring…' : 'Run ML prediction + anchor note'}
      </button>
      {res ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: '#e5e7eb',
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>
            {pct}%<span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginLeft: 8 }}>dispute probability</span>
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: 6 }}>
            Risk level: <strong>{res.risk_level}</strong>
            {res.recommended_escrow_multiplier && res.recommended_escrow_multiplier > 1 ? (
              <span style={{ marginLeft: 8 }}>
                Recommended escrow: <strong>{res.recommended_escrow_multiplier}x</strong>
              </span>
            ) : null}
          </div>
          {res.factors ? (
            <ul style={{ fontSize: '0.72rem', color: '#475569', marginTop: 8, paddingLeft: 18 }}>
              {Object.entries(res.factors).map(([k, v]) => (
                <li key={k}>
                  {k}: {String(v)}
                </li>
              ))}
            </ul>
          ) : null}
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 8 }}>{res.message}</div>
          <div style={{ fontSize: '0.72rem', marginTop: 8 }}>Pre-shipment prediction recorded on Algorand (when oracle is configured).</div>
          {res.lora_prediction_url ? (
            <a href={res.lora_prediction_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <ExternalLink size={12} /> Lora · prediction tx
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
