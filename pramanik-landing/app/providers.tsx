'use client';

import { ReactNode } from 'react';
import { NetworkId, WalletId, WalletManager, WalletProvider } from '@txnlab/use-wallet-react';

const walletManager = new WalletManager({
  wallets: [
    WalletId.PERA,
    WalletId.DEFLY,
    WalletId.LUTE,
  ],
  defaultNetwork: NetworkId.TESTNET,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider manager={walletManager}>
      {children}
    </WalletProvider>
  );
}
