import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Shield, Smartphone, X } from 'lucide-react';
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
  onConnectWallet: () => void;
  onSubmit: (form: RegisterFormState) => void;
};

export function RegisterShipmentModal({
  open,
  onClose,
  busy,
  accountAddress,
  onConnectWallet,
  onSubmit,
}: Props) {
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

  const walletReady = !!accountAddress && accountAddress.length >= 58;

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

  return (
    <div className="modal-backdrop">
      <div className="card register-modal">
        <div className="register-modal__head">
          <h3>Register export corridor</h3>
          <button type="button" onClick={onClose} className="register-modal__close" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!walletReady ? (
          <div className="register-wallet-gate" role="status">
            <p className="register-wallet-gate__title">Connect your Pera Wallet to register a shipment</p>
            <p className="register-wallet-gate__copy">
              Escrow funding needs your wallet. Connect Pera first — the form unlocks after verification.
            </p>
            <button type="button" className="primary-btn" onClick={onConnectWallet}>
              Connect Pera Wallet
            </button>
          </div>
        ) : (
          <div className={`register-wallet-step register-wallet-step--ok`}>
            <div className="register-wallet-step__icon">
              <CheckCircle2 size={22} color="var(--success)" />
            </div>
            <div className="register-wallet-step__body">
              <strong>
                <span className="register-wallet-badge">● Wallet connected</span>{' '}
                {shortAddress(accountAddress!)}
              </strong>
              <p>
                Buyer wallet will sign escrow deposits. Registration is oracle-signed (no Pera popup for this step).
              </p>
            </div>
          </div>
        )}

        {walletReady ? (
          <>
            <div className="register-compliance-hint">
              <strong>What gets checked later</strong>
              <ul>
                <li>GST E-Way Bill at settlement review (shown on the corridor card)</li>
                <li>Live weather · on-chain escrow · supplier trust · four-agent jury</li>
              </ul>
            </div>

            <label className="register-label">Supplier wallet address</label>
            <input
              className="register-input register-input--mono"
              value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
              placeholder="58-character Algorand address"
            />
            {supplierWarn?.warning && typeof supplierWarn.score === 'number' ? (
              <div className="register-supplier-warn">
                Low trust score ({supplierWarn.score}/100). Consider higher planned escrow.
              </div>
            ) : null}

            <div className="register-grid-2">
              <div>
                <label className="register-label">Origin (India)</label>
                <select className="register-input" value={form.origin} onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}>
                  {INDIAN_PORTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="register-label">Destination</label>
                <select
                  className="register-input"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                >
                  {GLOBAL_DESTINATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="register-label">Commodity</label>
            <select className="register-input" value={form.commodity} onChange={(e) => setForm((f) => ({ ...f, commodity: e.target.value }))}>
              {commodityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="register-grid-2">
              <div>
                <label className="register-label">Planned escrow (ALGO)</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.1}
                  className="register-input"
                  value={form.escrow_algo}
                  onChange={(e) => setForm((f) => ({ ...f, escrow_algo: e.target.value }))}
                />
              </div>
              <div>
                <label className="register-label">Expected delivery</label>
                <input
                  type="date"
                  className="register-input"
                  value={form.expected_delivery}
                  onChange={(e) => setForm((f) => ({ ...f, expected_delivery: e.target.value }))}
                />
              </div>
            </div>
            <p className="register-escrow-preview">{escrowPreview}</p>

            <label className="register-label">Shipment reference</label>
            <div className="register-id-row">
              <input
                className="register-input register-input--mono"
                value={form.shipment_id}
                onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value }))}
                placeholder="Auto-generated if empty"
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    shipment_id: buildShipmentId(f.origin, f.destination, f.commodity),
                  }))
                }
              >
                Generate ID
              </button>
            </div>

            <p className="register-wallet-note">
              <Shield size={14} aria-hidden />
              <span>
                <strong>After register:</strong> the live journey tracker activates. Use <strong>Deposit ALGO</strong> on
                the new corridor card — Pera Wallet will ask you to approve that step.
              </span>
            </p>

            <div className="register-modal__foot">
              <button type="button" className="secondary-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={busy || !walletReady}
                onClick={() => {
                  if (!walletReady || !accountAddress) return;
                  const sid = form.shipment_id.trim() || buildShipmentId(form.origin, form.destination, form.commodity);
                  onSubmit({ ...form, shipment_id: sid, supplier: form.supplier.trim() || accountAddress });
                }}
              >
                {busy ? 'Registering on chain…' : 'Register corridor'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
