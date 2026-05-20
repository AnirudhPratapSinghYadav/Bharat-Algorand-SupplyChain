import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';
import {
  buildShipmentId,
  COMMODITY_TYPES,
  formatEscrowTriple,
  GLOBAL_DESTINATIONS,
  INDIAN_PORTS,
  shortAddress,
} from '../lib/displayLabels';

export type RegisterFormState = {
  shipment_id: string;
  origin: string;
  destination: string;
  supplier: string;
  commodity: string;
  escrow_algo: string;
  expected_delivery: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  accountAddress: string | null;
  onSubmit: (form: RegisterFormState) => void;
};

export function RegisterShipmentModal({ open, onClose, busy, accountAddress, onSubmit }: Props) {
  const [form, setForm] = useState<RegisterFormState>({
    shipment_id: '',
    origin: 'Mumbai',
    destination: 'Rotterdam',
    supplier: '',
    commodity: 'Cotton Fabric',
    escrow_algo: '2',
    expected_delivery: '',
  });
  const [price, setPrice] = useState<{ algo_usd?: number | null; algo_inr?: number | null } | null>(null);
  const [supplierWarn, setSupplierWarn] = useState<{
    warning?: boolean;
    score?: number;
    warning_message?: string | null;
  } | null>(null);
  const [commodityOptions, setCommodityOptions] = useState<string[]>([...COMMODITY_TYPES]);

  useEffect(() => {
    if (!open) return;
    if (accountAddress) {
      setForm((f) => ({ ...f, supplier: f.supplier || accountAddress }));
    }
    const today = new Date();
    today.setDate(today.getDate() + 14);
    setForm((f) => ({
      ...f,
      expected_delivery: f.expected_delivery || today.toISOString().slice(0, 10),
    }));
  }, [open, accountAddress]);

  useEffect(() => {
    if (!open) {
      setPrice(null);
      setSupplierWarn(null);
      return;
    }
    let cancel = false;
    const load = async () => {
      try {
        const [priceRes, cfgRes] = await Promise.all([
          axios.get(`${BACKEND_URL}/price`, { timeout: API_TIMEOUT }),
          axios.get(`${BACKEND_URL}/config`, { timeout: API_TIMEOUT }),
        ]);
        if (!cancel && priceRes.data) setPrice(priceRes.data);
        const types = cfgRes.data?.commodity_types;
        if (!cancel && Array.isArray(types) && types.length) setCommodityOptions(types.map(String));
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, 10_000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const addr = form.supplier.trim();
    if (addr.length < 58) {
      setSupplierWarn(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const r = await axios.get(`${BACKEND_URL}/supplier-trust/${encodeURIComponent(addr)}`, {
          timeout: API_TIMEOUT,
        });
        setSupplierWarn(r.data?.warning === true ? r.data : null);
      } catch {
        setSupplierWarn(null);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [open, form.supplier]);

  const escrowAlgo = parseFloat(form.escrow_algo) || 0;
  const escrowPreview = useMemo(() => {
    const usd = typeof price?.algo_usd === 'number' ? escrowAlgo * price.algo_usd : null;
    const inr = typeof price?.algo_inr === 'number' ? escrowAlgo * price.algo_inr : null;
    return formatEscrowTriple(escrowAlgo, inr, usd);
  }, [escrowAlgo, price]);

  if (!open) return null;

  const fieldStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-raised)',
    color: 'var(--text)',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--muted)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div className="modal-backdrop">
      <div
        className="card"
        style={{ maxWidth: 520, width: '95%', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Register export shipment</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close">
            <X size={18} color="#9ca3af" />
          </button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Lock escrow and register on the dispute oracle. The server signs registration — no wallet popup for this step.
          Fund escrow from the shipment card after registration.
        </p>

        <label style={labelStyle}>Supplier wallet address</label>
        <input
          value={form.supplier}
          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
          placeholder="58-character Algorand address"
          style={{ ...fieldStyle, fontFamily: 'var(--mono)', marginBottom: 10 }}
        />
        {supplierWarn?.warning ? (
          <div
            style={{
              fontSize: '0.78rem',
              color: '#92400e',
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1px solid #eab308',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 12,
            }}
          >
            ⚠️ This supplier has a below-average trust score ({supplierWarn.score ?? '—'}/100). Consider a higher escrow
            amount. {supplierWarn.warning_message || ''}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Origin (India)</label>
            <select
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              style={fieldStyle}
            >
              {INDIAN_PORTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Destination</label>
            <select
              value={form.destination}
              onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              style={fieldStyle}
            >
              {GLOBAL_DESTINATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label style={labelStyle}>Commodity type</label>
        <select
          value={form.commodity}
          onChange={(e) => setForm((f) => ({ ...f, commodity: e.target.value }))}
          style={{ ...fieldStyle, marginBottom: 12 }}
        >
          {commodityOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div>
            <label style={labelStyle}>Planned escrow (ALGO)</label>
            <input
              type="number"
              min={0.5}
              step={0.1}
              value={form.escrow_algo}
              onChange={(e) => setForm((f) => ({ ...f, escrow_algo: e.target.value }))}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Expected delivery</label>
            <input
              type="date"
              value={form.expected_delivery}
              onChange={(e) => setForm((f) => ({ ...f, expected_delivery: e.target.value }))}
              style={fieldStyle}
            />
          </div>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 14px' }}>
          {escrowPreview} <span style={{ opacity: 0.7 }}>(updates every 10s)</span>
        </p>

        <label style={labelStyle}>Shipment reference (internal ID)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={form.shipment_id}
            onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value }))}
            placeholder="Auto-generated if empty"
            style={{ ...fieldStyle, flex: 1, fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
          />
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                shipment_id: buildShipmentId(f.origin, f.destination, f.commodity),
              }))
            }
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--accent)',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Generate ID
          </button>
        </div>

        {form.supplier ? (
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0 0 12px' }}>
            Supplier: {shortAddress(form.supplier)}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              background: 'rgba(148, 163, 184, 0.12)',
              border: '1px solid #475569',
              color: '#e2e8f0',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={() => {
              const sid =
                form.shipment_id.trim() || buildShipmentId(form.origin, form.destination, form.commodity);
              onSubmit({ ...form, shipment_id: sid });
            }}
          >
            {busy ? 'Registering…' : 'Lock Escrow & Register Shipment'}
          </button>
        </div>
      </div>
    </div>
  );
}
