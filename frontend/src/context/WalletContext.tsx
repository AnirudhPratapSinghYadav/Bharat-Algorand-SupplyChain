import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { peraWallet } from '../wallet/pera';

export type Role = 'stakeholder' | 'supplier';

const ROLE_KEY = 'navi_role';

type WalletContextValue = {
  address: string | null;
  role: Role;
  switchRole: (newRole: Role) => void;
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  /** True during 200ms role transition (opacity fade). */
  isFading: boolean;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function readStoredRole(): Role {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    if (v === 'supplier' || v === 'stakeholder') return v;
  } catch {
    /* ignore */
  }
  return 'stakeholder';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(readStoredRole);
  const [isFading, setIsFading] = useState(false);

  const connect = useCallback(() => {
    peraWallet
      .connect()
      .then((accounts) => {
        const a = accounts[0];
        setAddress(a);
        try {
          sessionStorage.setItem('navi_trust_wallet', a);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const disconnect = useCallback(() => {
    peraWallet.disconnect();
    setAddress(null);
    try {
      sessionStorage.removeItem('navi_trust_wallet');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    peraWallet
      .reconnectSession()
      .then((accounts) => {
        if (accounts.length) {
          const a = accounts[0];
          setAddress(a);
          try {
            sessionStorage.setItem('navi_trust_wallet', a);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, []);

  const switchRole = useCallback(
    (newRole: Role) => {
      if (newRole === role) return;
      setIsFading(true);
      window.setTimeout(() => {
        setRole(newRole);
        try {
          localStorage.setItem(ROLE_KEY, newRole);
        } catch {
          /* ignore */
        }
        window.setTimeout(() => setIsFading(false), 200);
      }, 200);
    },
    [role],
  );

  const value = useMemo(
    () => ({
      address,
      role,
      switchRole,
      connect,
      disconnect,
      isConnected: !!address,
      isFading,
    }),
    [address, role, switchRole, connect, disconnect, isFading],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

/** @deprecated Prefer useWallet — kept for incremental migration. */
export function useRole() {
  const w = useWallet();
  return {
    role: w.role,
    switchRole: w.switchRole,
    dashboardSwitching: w.isFading,
  };
}
