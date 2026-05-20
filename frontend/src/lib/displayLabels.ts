/** User-facing copy for MSME exporters (not internal agent/API names). */

export function shortAddress(addr: string | null | undefined): string {
  const a = (addr || '').trim();
  if (a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shipmentCardTitle(origin?: string, destination?: string, createdAt?: string | null): string {
  const o = (origin || '').split(',')[0].trim() || 'Origin';
  const d = (destination || '').split(',')[0].trim() || 'Destination';
  let datePart = '';
  if (createdAt) {
    try {
      const dt = new Date(createdAt);
      if (!Number.isNaN(dt.getTime())) {
        datePart = ` | ${dt.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
      }
    } catch {
      /* ignore */
    }
  }
  return `${o} → ${d}${datePart}`;
}

export const AGENT_DISPLAY: Record<string, { label: string; icon: string }> = {
  sentinel: { label: 'Weather Risk Analysis', icon: '🌦' },
  auditor: { label: 'Contract Verification', icon: '🔍' },
  fraud: { label: 'Fraud Check', icon: '🛡' },
  arbiter: { label: 'Final Verdict', icon: '⚖' },
};

export function verdictUserLabel(verdict: string | null | undefined): string {
  const v = (verdict || '').toUpperCase().trim();
  if (v === 'SETTLE' || v === 'APPROVED') return '✅ Payment Released';
  if (v === 'DISPUTE' || v === 'DISPUTED') return '⚠️ Dispute Escalated';
  if (v === 'HOLD') return '⏳ Under Review';
  return '⏳ Under Review';
}

export function stageUserLabel(stage: string | null | undefined): string {
  const s = (stage || '').replace(/_/g, ' ').trim();
  if (!s) return 'Pending';
  if (s === 'In Transit' || s === 'IN TRANSIT') return 'In transit';
  if (s === 'Not Registered' || s === 'NOT REGISTERED') return 'Awaiting registration';
  if (s === 'Settled' || s === 'SETTLED') return 'Settled';
  if (s === 'Disputed' || s === 'DISPUTED' || s === 'Delayed Disaster') return 'Disputed';
  if (s === 'VOID') return 'Voided';
  return s;
}

export function stageBadgeColors(stage: string | null | undefined): { bg: string; color: string; border: string } {
  const s = (stage || '').toUpperCase().replace(/ /g, '_');
  if (s === 'IN_TRANSIT') return { bg: 'rgba(58,111,247,0.15)', color: '#93c5fd', border: '#3A6FF7' };
  if (s === 'DISPUTED' || s === 'DELAYED_DISASTER') return { bg: 'rgba(249,115,22,0.15)', color: '#fdba74', border: '#F97316' };
  if (s === 'SETTLED') return { bg: 'rgba(34,197,94,0.12)', color: '#bbf7d0', border: '#22c55e' };
  if (s === 'VOID') return { bg: 'rgba(107,114,128,0.15)', color: '#d1d5db', border: '#6b7280' };
  if (s === 'CREATED' || s === 'NOT_REGISTERED') return { bg: 'rgba(234,179,8,0.12)', color: '#fde68a', border: '#eab308' };
  return { bg: 'rgba(0,194,255,0.08)', color: '#bae6fd', border: 'var(--accent)' };
}

export const DASHBOARD_PRODUCT_TITLE = 'Pramanik — Dispute Oracle for Indian Exporters';

export const JURY_BUTTON_LABEL = 'Request Settlement Review';

export function formatEscrowTriple(
  algo: number,
  inr?: number | null,
  usd?: number | null,
): string {
  const a = `${algo.toFixed(2)} ALGO`;
  const i =
    typeof inr === 'number' && Number.isFinite(inr)
      ? `₹${inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
      : '≈ ₹–';
  const u =
    typeof usd === 'number' && Number.isFinite(usd)
      ? `$${usd.toFixed(2)}`
      : '≈ $–';
  return `${a} / ${i} / ${u}`;
}

export type JuryButtonState =
  | { disabled: true; label: 'Already Settled' }
  | { disabled: true; label: 'Awaiting Funds' }
  | { disabled: true; label: 'Syncing shipment…' }
  | { disabled: false; label: typeof JURY_BUTTON_LABEL };

export function juryButtonState(
  stage: string,
  fundsMicro: number,
  awaitingOffChainSync: boolean,
): JuryButtonState {
  if (stage === 'Settled') return { disabled: true, label: 'Already Settled' };
  if (awaitingOffChainSync) return { disabled: true, label: 'Syncing shipment…' };
  if (stage === 'In_Transit' && fundsMicro <= 0) return { disabled: true, label: 'Awaiting Funds' };
  return { disabled: false, label: JURY_BUTTON_LABEL };
}

export function settlementConfidenceLabel(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—';
  return `${Math.round(Math.min(100, Math.max(0, score)))}%`;
}

export const INDIAN_PORTS = [
  'Mumbai',
  'Chennai',
  'Delhi',
  'Kolkata',
  'Kandla',
  'Cochin',
  'Visakhapatnam',
  'Surat',
] as const;

export const GLOBAL_DESTINATIONS = [
  'Rotterdam',
  'Singapore',
  'Dubai',
  'Shanghai',
  'Los Angeles',
  'Hamburg',
  'Jeddah',
  'London',
] as const;

export const COMMODITY_TYPES = ['Textiles', 'Spices', 'Electronics', 'Handicrafts', 'Other'] as const;

export function buildShipmentId(origin: string, destination: string, commodity: string): string {
  const o = origin.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const d = destination.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const c = commodity.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const ts = Date.now().toString(36).slice(-5).toUpperCase();
  return `PRM-${o}-${d}-${c}-${ts}`;
}
