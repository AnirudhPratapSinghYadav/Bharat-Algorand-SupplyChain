/** Product-facing copy — no dev jargon in the UI. */

export function friendlyApiUnreachable(): string {
  return import.meta.env.DEV
    ? 'Oracle service is not reachable. Start the API locally, then refresh.'
    : 'Oracle service is temporarily unavailable. Check your connection or try again in a moment.';
}

export function friendlyShipmentsSyncFail(): string {
  return 'We could not refresh your shipment list. The oracle may be starting up — try again shortly.';
}

export function friendlyBackendOffline(): string {
  return 'Oracle service is offline. Your wallet is connected, but live data is unavailable until the API is running.';
}

export function friendlyOracleMismatch(): string {
  return 'Server configuration does not match the on-chain oracle for this contract. Registration and settlement may fail until the deployer fixes the oracle key.';
}

export function friendlyRetryShipmentsFail(): string {
  return 'Still unable to load shipments. If this persists, contact your administrator.';
}
