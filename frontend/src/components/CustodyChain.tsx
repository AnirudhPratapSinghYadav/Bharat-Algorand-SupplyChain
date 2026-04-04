import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ExternalLink, Link2, PlusCircle } from 'lucide-react';
import { BACKEND_URL, API_TIMEOUT } from '../constants/api';

type Entry = {
  location?: string;
  handler_name?: string;
  timestamp?: string;
  asa_id?: number;
  lora_asset_url?: string;
  lora_tx_url?: string;
  prev_nft_id?: number;
};

type Props = {
  shipmentId: string;
  walletAddress: string | null;
  canAdd: boolean;
};

export function CustodyChain({ shipmentId, walletAddress, canAdd }: Props) {
  const [chain, setChain] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${BACKEND_URL}/custody/chain/${encodeURIComponent(shipmentId)}`, { timeout: API_TIMEOUT });
      setChain(r.data?.chain ?? []);
    } catch {
      setChain([]);
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addHandoff = async () => {
    const loc = window.prompt('Location (e.g. Mumbai Port)?', 'Mumbai Port');
    if (!loc) return;
    const name = window.prompt('Handler name?', 'Handler');
    if (!name) return;
    const addr = walletAddress || window.prompt('Handler Algorand address?', '') || '';
    if (addr.length < 52) {
      window.alert('Valid handler address required.');
      return;
    }
    setBusy(true);
    try {
      await axios.post(
        `${BACKEND_URL}/custody/handoff`,
        { shipment_id: shipmentId, handler_address: addr, location: loc, handler_name: name },
        { timeout: 60000 },
      );
      await load();
    } catch {
      window.alert('Custody mint failed (oracle / min balance).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', color: '#059669' }}>CHAIN OF CUSTODY · ARC-69</div>
        {canAdd ? (
          <button
            type="button"
            className="primary-btn"
            style={{ fontSize: '0.72rem', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            disabled={busy}
            onClick={() => void addHandoff()}
          >
            <PlusCircle size={14} /> Add handoff
          </button>
        ) : null}
      </div>
      <div style={{ marginTop: 12, borderLeft: '2px solid #34d399', paddingLeft: 12 }}>
        {chain.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>No custody NFTs yet for this shipment.</div>
        ) : (
          chain.map((c, i) => (
            <div key={i} style={{ marginBottom: 14, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: -17,
                  top: 4,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid #fff',
                }}
              />
              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{c.location}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{c.handler_name}</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{c.timestamp}</div>
              <div style={{ fontSize: '0.65rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Link2 size={11} /> ASA {c.asa_id}
                </span>
                {c.prev_nft_id ? <span>← prev {c.prev_nft_id}</span> : null}
                {c.lora_asset_url ? (
                  <a href={c.lora_asset_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem' }}>
                    <ExternalLink size={11} /> NFT on Lora
                  </a>
                ) : null}
                {c.lora_tx_url ? (
                  <a href={c.lora_tx_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem' }}>
                    Tx
                  </a>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
