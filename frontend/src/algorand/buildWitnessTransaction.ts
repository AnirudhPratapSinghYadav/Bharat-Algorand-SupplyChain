import algosdk from 'algosdk';

import { ALGOD_URL } from '../constants/api';

/**
 * 0-ALGO self-payment with NAVI_WITNESS JSON note (matches app.py POST /witness-shipment/build).
 * Built client-side so algosdk v3 encodings match Pera (Python msgpack is not decodable in-browser).
 */
export async function buildWitnessTransaction(
  witnessAddress: string,
  shipmentId: string,
  shipmentStatus: string,
  appId: number,
): Promise<algosdk.Transaction> {
  if (!appId || appId <= 0) {
    throw new Error('APP_ID is required to witness');
  }
  const algodClient = new algosdk.Algodv2('', ALGOD_URL, '');
  const sp = await algodClient.getTransactionParams().do();
  sp.fee = 1000n;
  sp.flatFee = true;

  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const noteObj = {
    type: 'NAVI_WITNESS',
    app: appId,
    sid: shipmentId,
    status: shipmentStatus || 'Unknown',
    ts,
  };
  const noteStr = JSON.stringify(noteObj, ['type', 'app', 'sid', 'status', 'ts']);
  const note = new TextEncoder().encode(noteStr).slice(0, 1000);

  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: witnessAddress,
    receiver: witnessAddress,
    amount: 0n,
    note,
    suggestedParams: sp,
  });
}
