import { VerdictResult } from '@/lib/types';

interface VerdictCardProps {
  result: VerdictResult;
}

export default function VerdictCard({ result }: VerdictCardProps) {
  const getVerdictColor = () => {
    switch (result.verdict) {
      case 'SETTLE': return 'text-[#22C55E] border-[#22C55E]';
      case 'HOLD': return 'text-[#EAB308] border-[#EAB308]';
      case 'DISPUTE': return 'text-[#EF4444] border-[#EF4444]';
      default: return 'text-[#F5F5F2] border-[#2A2F36]';
    }
  };

  const getVerdictBg = () => {
    switch (result.verdict) {
      case 'SETTLE': return 'bg-[#22C55E]';
      case 'HOLD': return 'bg-[#EAB308]';
      case 'DISPUTE': return 'bg-[#EF4444]';
      default: return 'bg-[#4A5568]';
    }
  };

  // Create a primitive text progress bar for confidence
  const barCount = 14;
  const filledBars = Math.round((result.confidence / 100) * barCount);
  const barString = '█'.repeat(filledBars) + '░'.repeat(barCount - filledBars);

  return (
    <div className="font-mono text-[13px] bg-[#161A20] border border-[#2A2F36] rounded-[10px] p-6">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-6 border-b border-[#2A2F36] pb-6">
        <div>
          <p className="text-[#9AA5B4] mb-1">VERDICT</p>
          <p className={`text-2xl font-bold ${getVerdictColor().split(' ')[0]}`}>
            {result.verdict}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[#9AA5B4] mb-1">CONFIDENCE</p>
          <p className="text-[#F5F5F2]">{result.confidence}%</p>
          <p className={getVerdictColor().split(' ')[0]}>{barString}</p>
        </div>
      </div>

      {/* Reasoning */}
      <div className="mb-6">
        <p className="text-[#9AA5B4] mb-2 border-b border-[#2A2F36] pb-1">REASONING</p>
        <div className="text-[#F5F5F2] whitespace-pre-wrap leading-relaxed">
          {result.reasoning}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-[#9AA5B4]">
        <div>
          INCOTERM APPLIED: <span className="text-[#F5F5F2]">{result.incoterm_applied}</span>
        </div>
        <div>
          FORCE MAJEURE: <span className="text-[#F5F5F2]">{result.force_majeure_applied ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* Hash */}
      <div className="mb-6">
        <p className="text-[#9AA5B4] mb-2 border-b border-[#2A2F36] pb-1">HASH</p>
        <p className="text-[#7DD3FC] break-all mb-2">
          {result.hash || 'Not available'}
        </p>
        {result.txn_id ? (
          <p className="text-[#9AA5B4]">
            Written to Algorand transaction note.<br />
            <a 
              href={`https://lora.algokit.io/testnet/transaction/${result.txn_id}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#3A6FF7] hover:underline"
            >
              [View on Lora ↗]
            </a>
          </p>
        ) : (
          <p className="text-[#9AA5B4]">Verdict computed. Settlement pending.</p>
        )}
      </div>

      {/* Settlement Details */}
      {result.verdict === 'SETTLE' && (
        <div>
          <p className="text-[#9AA5B4] mb-2 border-b border-[#2A2F36] pb-1">SETTLEMENT</p>
          <ul className="text-[#22C55E] space-y-1">
            <li>✓ Escrow released to Supplier</li>
            {result.nft_asset_id && (
              <li>✓ ARC-69 NFT minted: Asset ID {result.nft_asset_id}</li>
            )}
            <li>✓ Atomic transaction confirmed</li>
          </ul>
        </div>
      )}

    </div>
  );
}
