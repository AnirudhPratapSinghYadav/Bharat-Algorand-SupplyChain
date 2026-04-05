import { PeraWalletConnect } from '@perawallet/connect';

/** Shared Pera connector for dashboard + custody flows. */
export const peraWallet = new PeraWalletConnect({ chainId: 416002 });
