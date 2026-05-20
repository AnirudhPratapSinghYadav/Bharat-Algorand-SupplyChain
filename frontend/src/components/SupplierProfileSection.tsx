import { useQuery, keepPreviousData } from '@tanstack/react-query';
import axios from 'axios';
import { Building2, ExternalLink, Wallet } from 'lucide-react';
import { BACKEND_URL, loraAssetUrl } from '../constants/api';
import { AsyncPanel } from './AsyncPanel';

type Rep = { score: number | null; source?: string; has_box?: boolean };

type Props = {
  accountAddress: string;
  appId: number | null;
  settledCount: number;
  disputedCount: number;
  passportAsa: string | null;
  passportMinting: boolean;
  pendingAlgo: number | null;
  frozenAlgo: number;
  receivedAlgo: number;
  onMintPassport: () => void;
};

function repLabel(rep: Rep | null | undefined): { scoreText: string; hint: string; showBar: boolean } {
  if (rep?.has_box && typeof rep.score === 'number') {
    return {
      scoreText: `${rep.score} / 100`,
      hint: 'Built from completed deliveries recorded on Algorand.',
      showBar: true,
    };
  }
  return {
    scoreText: 'Not rated yet',
    hint: 'Your trust score appears after a corridor settles and payment is released to you.',
    showBar: false,
  };
}

export function SupplierProfileSection({
  accountAddress,
  appId,
  settledCount,
  disputedCount,
  passportAsa,
  passportMinting,
  pendingAlgo,
  frozenAlgo,
  receivedAlgo,
  onMintPassport,
}: Props) {
  const repQ = useQuery({
    queryKey: ['supplier-reputation', accountAddress],
    queryFn: async () => {
      const r = await axios.get(`${BACKEND_URL}/supplier/${encodeURIComponent(accountAddress)}/reputation`, {
        timeout: 12_000,
      });
      const raw = r.data?.score;
      const score = typeof raw === 'number' && !Number.isNaN(raw) ? raw : null;
      return {
        score: typeof score === 'number' ? score : null,
        source: typeof r.data?.source === 'string' ? r.data.source : undefined,
        has_box: r.data?.has_box === true,
      } as Rep;
    },
    enabled: !!accountAddress,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const supplierRep = repQ.data;
  const initialRepLoad = repQ.isLoading && supplierRep === undefined;
  const refreshingRep = repQ.isFetching && supplierRep !== undefined;
  const repFailed = repQ.isError && supplierRep === undefined;

  const { scoreText, hint, showBar } = repLabel(supplierRep);
  const barPct = showBar && typeof supplierRep?.score === 'number' ? Math.min(100, supplierRep.score) : 0;

  return (
    <AsyncPanel
      title="Your exporter profile"
      loading={initialRepLoad}
      refreshing={refreshingRep}
      error={repFailed}
      loadingMessage="Loading your business record from the blockchain…"
      errorMessage="Could not refresh trust score. Figures below are from your last successful load or live corridors."
      className="supplier-profile supplier-profile--identity"
    >
      <p className="supplier-profile__intro">
        <Building2 size={16} aria-hidden />
        This is <strong>you as the supplier</strong> — not a single shipment. Corridors you serve are listed below.
      </p>

      <div className="supplier-profile__wallet-row">
        <Wallet size={15} aria-hidden />
        <span className="supplier-profile__wallet-label">Pera wallet</span>
        <span className="supplier-profile__wallet">{accountAddress.slice(0, 10)}…{accountAddress.slice(-8)}</span>
      </div>

      <div className="supplier-profile__payments">
        <span className="supplier-profile__payments-title">Payment summary (all your corridors)</span>
        <div className="supplier-profile__payments-grid">
          <div>
            <span className="supplier-profile__pay-label">Awaiting release</span>
            <strong>{pendingAlgo != null ? `${pendingAlgo.toFixed(4)} ALGO` : 'None'}</strong>
          </div>
          <div>
            <span className="supplier-profile__pay-label">Frozen in dispute</span>
            <strong className={frozenAlgo > 0 ? 'supplier-profile__pay-warn' : undefined}>
              {frozenAlgo > 0 ? `${frozenAlgo.toFixed(4)} ALGO` : 'None'}
            </strong>
          </div>
          <div>
            <span className="supplier-profile__pay-label">Received (settled)</span>
            <strong className={receivedAlgo > 0 ? 'supplier-profile__pay-ok' : undefined}>
              {receivedAlgo > 0 ? `${receivedAlgo.toFixed(4)} ALGO` : 'None yet'}
            </strong>
          </div>
        </div>
      </div>

      <div className="supplier-profile__rep">
        <span className="supplier-profile__rep-label">Trust score (on-chain)</span>
        <div className="supplier-profile__rep-row">
          <div className="supplier-profile__rep-bar" aria-hidden>
            <div className="supplier-profile__rep-fill" style={{ width: `${barPct}%` }} />
          </div>
          <span className="supplier-profile__rep-score">{scoreText}</span>
        </div>
        <p className="supplier-profile__rep-hint">{hint}</p>
      </div>

      <p className="supplier-profile__stats">
        Completed deliveries <strong>{settledCount}</strong>
        <span className="supplier-profile__sep">·</span>
        Open disputes <strong>{disputedCount}</strong>
      </p>

      <div className="supplier-profile__passport">
        <span className="supplier-profile__passport-tag">Exporter certificate (optional)</span>
        <p className="supplier-profile__passport-copy">
          A public business card on Algorand for buyers — separate from settlement certificates on each corridor.
        </p>
        {passportAsa ? (
          <div>
            <p className="supplier-profile__passport-id">
              Asset <strong>{passportAsa}</strong>
            </p>
            {loraAssetUrl(passportAsa) ? (
              <a href={loraAssetUrl(passportAsa)} target="_blank" rel="noopener noreferrer" className="supplier-profile__link">
                View on Lora <ExternalLink size={14} />
              </a>
            ) : null}
          </div>
        ) : (
          <button type="button" className="secondary-btn" disabled={passportMinting || !appId} onClick={onMintPassport}>
            {passportMinting ? 'Creating…' : 'Mint exporter certificate'}
          </button>
        )}
      </div>
    </AsyncPanel>
  );
}

export async function mintSupplierPassport(accountAddress: string): Promise<{ asaId?: string; message?: string; error?: string }> {
  try {
    const r = await axios.post<{ passport_asa_id?: number | null; message?: string }>(
      `${BACKEND_URL}/mint-supplier-passport`,
      { supplier_address: accountAddress },
      { timeout: 45_000 },
    );
    const id = r.data?.passport_asa_id;
    if (id != null && id > 0) {
      return {
        asaId: String(id),
        message:
          r.data?.message ||
          'Certificate minted on chain. Open Pera Wallet and opt in to the asset if prompted, then refresh.',
      };
    }
    return { message: r.data?.message || 'Certificate submitted. Refresh in a moment.' };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const d = err.response?.data;
      if (d && typeof d === 'object' && 'detail' in d) {
        const detail = (d as { detail?: unknown }).detail;
        if (typeof detail === 'string') return { error: detail };
      }
    }
    return { error: 'Could not create the certificate right now. Try again in a minute.' };
  }
}
