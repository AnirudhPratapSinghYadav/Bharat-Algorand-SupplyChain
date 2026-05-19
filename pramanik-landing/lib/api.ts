import { API_BASE } from './constants';
import { Shipment, VerdictResult, AuditEntry } from './types';

export async function registerShipment(data: {
  shipment_id: string;
  origin: string;
  destination: string;
  escrow_algo: number;
  incoterm: string;
  departure_date?: string;
  vessel_name?: string;
  icegate_bill_no?: string;
}) {
  // Mapping to backend models.py RegisterShipmentBody if needed. 
  // app.py uses /register (or /register_shipment)
  const res = await fetch(`${API_BASE}/register_shipment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getShipments(): Promise<Shipment[]> {
  // Fetch from the actual Python backend (/dispute-feed or /shipments)
  // Our Python backend uses /dispute-feed for listing
  const res = await fetch(`${API_BASE}/dispute-feed`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  
  // Adapt backend data to frontend types
  return (data.feed || []).map((item: any) => ({
    id: item.shipment_id || item.id,
    origin: item.origin || 'Unknown',
    destination: item.destination || 'Unknown',
    escrow_algo: item.funds_algo || 0,
    incoterm: 'FOB', // Backend might not store incoterm explicitly, fallback to FOB for demo
    status: item.status || 'Unknown',
    created_at: item.timestamp,
  }));
}

export async function runJury(shipmentId: string) {
  // app.py uses POST /run-jury
  const res = await fetch(`${API_BASE}/run-jury`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipment_id: shipmentId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getVerdict(shipmentId: string): Promise<VerdictResult> {
  // Try to fetch specific verification
  const res = await fetch(`${API_BASE}/verify/${shipmentId}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  
  // Extract verdict info
  const vjson = data.verdict_json ? JSON.parse(data.verdict_json) : {};
  return {
    verdict: vjson.verdict || 'HOLD',
    confidence: vjson.confidence || 0,
    reasoning: vjson.reasoning || '',
    incoterm_applied: vjson.incoterm || 'FOB',
    force_majeure_applied: vjson.force_majeure || false,
    hash: data.on_chain?.verdict_hash || '',
    txn_id: data.on_chain?.verdict_tx_id || '',
    nft_asset_id: data.certificate_asa_id || undefined,
    agents: [] // Populated by UI during run
  };
}

export async function getAuditTrail(shipmentId: string): Promise<AuditEntry[]> {
  const res = await fetch(`${API_BASE}/witnesses/${shipmentId}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  
  return (data.witnesses || []).map((w: any) => ({
    timestamp: w.timestamp,
    event: w.summary || 'Event recorded',
    on_chain: !!w.tx_id,
    detail: w.reasoning_narrative || '',
  }));
}
