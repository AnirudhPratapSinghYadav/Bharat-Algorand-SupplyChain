/** Offline-friendly answers when /navibot is slow or unavailable. Mirrors backend keyword rules. */

export function matchAssistantFaq(query: string): string | null {
  const q = (query || '').toLowerCase().trim();
  if (!q) return null;

  if (q.includes('gstin') || q.includes('gst') || q.includes('eway') || q.includes('e-way')) {
    return (
      'At settlement review, the Compliance Auditor checks a GST E-Way Bill number derived from your shipment reference and records pass/fail on the jury report. ' +
      'You will see the bill number and status on the shipment card after review. Full GSTIN registry lookup is planned; today the demo uses the e-way bill oracle path.'
    );
  }
  if (q.includes('supplier') && (q.includes('shipment') || q.includes('difference') || q.includes('vs'))) {
    return (
      'A shipment is one export lane (route, escrow, jury, payment release). A supplier is the exporter wallet: trust score, completed deliveries, and optional exporter certificate. ' +
      'Open Supplier view for your business profile; each card below is a single corridor.'
    );
  }
  if (q.includes('register') || q.includes('how do i start')) {
    return (
      'Buyers: connect Pera Wallet, tap Register shipment, then Deposit ALGO on that corridor card. ' +
      'Suppliers: connect the same wallet in Supplier view to see lanes where you are the registered exporter.'
    );
  }
  if (q.includes('voice') || q.includes('microphone') || q.includes('speak')) {
    return (
      'Voice uses ElevenLabs when ELEVENLABS_AGENT_ID is set on the server. If voice is blank, use the Chat tab — it uses the same Pramanik knowledge and works without ElevenLabs.'
    );
  }
  if (q.includes('4 agent') || q.includes('four agent') || q.includes('jury')) {
    return (
      'Four agents review each corridor: Weather Sentinel (live weather), Compliance Auditor (chain + GST e-way), Fraud Detector (supplier history), Chief Arbiter (release or hold). ' +
      'The verdict is stored on Algorand with a hash you can verify.'
    );
  }
  if (q.includes('escrow') || q.includes('algo') || q.includes('lock')) {
    return 'Escrow ALGO sits in the smart contract until the jury recommends release. Fund from the shipment card with Pera Wallet; only your wallet can deposit.';
  }
  if (q.includes('hash') || q.includes('verify') || q.includes('proof')) {
    return 'Each jury outcome has a SHA-256 hash on-chain. Use the Verify page or POST /verify-hash to confirm the report was not tampered with.';
  }
  if (q.includes('passport') || q.includes('certificate')) {
    return 'Exporter certificate (optional): mint from your Supplier profile. Settlement certificate: minted automatically when payment is released for a corridor.';
  }
  if (q.includes('reputation') || q.includes('trust')) {
    return 'Trust score updates on Algorand after successful settlements. Until your first completed delivery, the dashboard shows Not rated yet — not a default number.';
  }
  if (q.includes('help') || q === 'hi' || q === 'hello') {
    return 'Ask about: registering a corridor, escrow, the 4-agent jury, GST e-way checks, supplier vs shipment, or paste a shipment reference ID.';
  }
  return null;
}

export const ASSISTANT_STARTER_QUESTIONS = [
  'What does Pramanik check at settlement?',
  'Supplier vs shipment — what is the difference?',
  'How do I register a new corridor?',
  'How does escrow release work?',
];
