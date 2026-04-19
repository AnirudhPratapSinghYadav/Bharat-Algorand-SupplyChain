/**
 * Build unsigned pay + fund_shipment group using Algokit + algosdk v3 encodings.
 * Python `msgpack_encode` bytes are NOT decodable by JS `decodeUnsignedTransaction` (schema mismatch).
 */
import { AlgorandClient, microAlgos } from '@algorandfoundation/algokit-utils';
import { AppClient } from '@algorandfoundation/algokit-utils/types/app-client';
import type { BoxReference } from '@algorandfoundation/algokit-utils/types/app-manager';
import algosdk from 'algosdk';
import { makeEmptyTransactionSigner } from 'algosdk';
import navitrustArc56 from '../../../artifacts/NaviTrust.arc56.json';

const VALIDITY_WINDOW = 1000;

/** Mirrors `navitrust_shipment_box_refs` in algorand_client.py (8 refs, max per app call). */
export function navitrustFundShipmentBoxRefs(appId: number, shipmentId: string): BoxReference[] {
  const prefixes = ['st_', 'sp_', 'by_', 'fn_', 'rs_', 'vd_', 'rt_', 'ce_'] as const;
  const enc = new TextEncoder();
  return prefixes.map((p) => ({
    appId: BigInt(appId),
    name: enc.encode(p + shipmentId),
  }));
}

export async function buildNavitrustFundShipmentTransactions(params: {
  algod: algosdk.Algodv2;
  appId: number;
  buyerAddress: string;
  shipmentId: string;
  microAlgosAmt: number;
}): Promise<algosdk.Transaction[]> {
  const { algod, appId, buyerAddress, shipmentId, microAlgosAmt } = params;
  if (microAlgosAmt < 100_000) {
    throw new Error('Minimum funding is 100000 microAlgo (0.1 ALGO)');
  }

  const algorand = AlgorandClient.fromClients({ algod });
  const appAddr = algosdk.getApplicationAddress(Number(appId));

  const payTxn = await algorand.createTransaction.payment({
    sender: buyerAddress,
    receiver: appAddr,
    amount: microAlgos(microAlgosAmt),
    staticFee: microAlgos(2000),
    validityWindow: VALIDITY_WINDOW,
  });

  const paymentArg: algosdk.TransactionWithSigner = {
    txn: payTxn,
    signer: makeEmptyTransactionSigner(),
  };

  const appClient = new AppClient({
    appId: BigInt(appId),
    appSpec: JSON.stringify(navitrustArc56),
    algorand,
    defaultSender: buyerAddress,
  });

  const { transactions } = await appClient.createTransaction.call({
    sender: buyerAddress,
    method: 'fund_shipment',
    args: [shipmentId, paymentArg],
    boxReferences: navitrustFundShipmentBoxRefs(appId, shipmentId),
    extraFee: microAlgos(1000),
    validityWindow: VALIDITY_WINDOW,
  });

  algosdk.assignGroupID(transactions);
  return transactions;
}
