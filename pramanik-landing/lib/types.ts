export type Verdict = 'SETTLE' | 'HOLD' | 'DISPUTE';
export type Incoterm = 'FOB' | 'CIF' | 'DDP' | 'EXW' | 'CPT';
export type ShipmentStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'DISPUTED' | 'SETTLED' | 'Delayed_Disaster' | 'Unknown';
export type AgentStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED';

export interface Shipment {
  id: string;
  origin: string;
  destination: string;
  escrow_algo: number;
  incoterm: Incoterm;
  status: ShipmentStatus;
  icegate_bill_no?: string;
  vessel_name?: string;
  departure_date?: string;
  created_at?: string;
  verdict_result?: VerdictResult;
}

export interface VerdictResult {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  incoterm_applied: string;
  force_majeure_applied: boolean;
  hash: string;
  txn_id?: string;
  nft_asset_id?: number;
  agents: AgentResult[];
}

export interface AgentResult {
  name: 'WEATHER_SENTINEL' | 'COMPLIANCE_AUDITOR' | 'FRAUD_DETECTOR' | 'CHIEF_ARBITER';
  status: AgentStatus;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface AuditEntry {
  timestamp: string;
  event: string;
  on_chain: boolean;
  detail?: string;
}
