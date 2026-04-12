import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import algosdk from 'algosdk';
import { ExternalLink } from 'lucide-react';
import { BACKEND_URL } from '../constants/api';
import { peraWallet } from '../wallet/pera';

const ALGOD_SERVER = (import.meta.env.VITE_ALGORAND_NODE as string) || 'https://testnet-api.algonode.cloud';

type WitnessRow = {
  address?: string;
  tx_id?: string;
  lora_url?: string;
};

type Props = {
  shipmentId: string;
  hasVerdict: boolean;
  walletAddress: string | null;
  onConnectRequest?: () => void;
};

export function WitnessButton({ shipmentId, hasVerdict, walletAddress, onConnectRequest }: Props) {
  const [count, setCount] = useState(0);
  const [witnessed, setWitnessed] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    axios
      .get(`${BACKEND_URL}/witnesses/${encodeURIComponent(shipmentId)}`, { timeout: 12_000 })
      .then((r) => {
        const n = typeof r.data?.witness_count === 'number' ? r.data.witness_count : (r.data?.witnesses as WitnessRow[])?.length ?? 0;
        setCount(n);
      })
      .catch(() => {});
  }, [shipmentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onWitness = async () => {
    if (!hasVerdict || busy) return;
    if (!walletAddress) {
      onConnectRequest?.();
      return;
    }
    setBusy(true);
    try {
      const build = await axios.post(
        `${BACKEND_URL}/witness-shipment/build`,
        { shipment_id: shipmentId, witness_address: walletAddress },
        { timeout: 30_000 },
      );
      const txnB64 = build.data?.txn_b64 as string | undefined;
      if (!txnB64) throw new Error('No txn from server');

      const bin = Uint8Array.from(atob(txnB64), (c) => c.charCodeAt(0));
      const txn = algosdk.decodeUnsignedTransaction(bin);
      const signed = await peraWallet.signTransaction([[{ txn, signers: [walletAddress] }]]);
      const rawSigned = Array.isArray(signed) ? signed : [];
      const blobs: Uint8Array[] = rawSigned.map((item: unknown) => {
        if (item instanceof Uint8Array) return item;
        if (item && typeof item === 'object' && item !== null && 'blob' in item) {
          const b = (item as { blob: Uint8Array }).blob;
          if (b instanceof Uint8Array) return b;
        }
        return new Uint8Array();
      }).filter((b) => b.length > 0);
      if (!blobs.length) throw new Error('Sign failed');

      const algod = new algosdk.Algodv2('', ALGOD_SERVER, '');
      const sent = await algod.sendRawTransaction(blobs).do();
      const tid = (sent as { txId?: string; txid?: string }).txId ?? (sent as { txid?: string }).txid;
      if (!tid) throw new Error('No tx id');
      await algosdk.waitForConfirmation(algod, tid, 4);
      setTxId(tid);
      setWitnessed(true);
      setCount((c) => c + 1);
    } catch {
      /* user cancelled or network — no raw error string in UI */
    } finally {
      setBusy(false);
    }
  };

  const loraTx = txId ? `https://lora.algokit.io/testnet/transaction/${txId}` : '';

  return (
    <div style={{ marginTop: 14 }}>
      {!witnessed ? (
        <button
          type="button"
          disabled={!hasVerdict || busy}
          onClick={() => void onWitness()}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${hasVerdict ? 'var(--border)' : 'var(--dim)'}`,
            background: hasVerdict ? 'rgba(0,194,255,0.08)' : 'rgba(71,85,105,0.35)',
            color: hasVerdict ? 'var(--text)' : 'var(--dim)',
            cursor: hasVerdict && !busy ? 'pointer' : 'not-allowed',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          👁 Witness this · {count} on Algorand
        </button>
      ) : (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ You witnessed this verdict</span>
          {loraTx ? (
            <a href={loraTx} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: 'var(--accent)', fontWeight: 600 }}>
              Open your witness on Lora ↗ <ExternalLink size={14} style={{ verticalAlign: 'middle' }} />
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
