import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Role = 'stakeholder' | 'supplier';

const STORAGE_KEY = 'navi_role';

type RoleContextValue = {
  role: Role;
  switchRole: (newRole: Role) => void;
  dashboardSwitching: boolean;
};

const RoleContext = createContext<RoleContextValue | null>(null);

function readStoredRole(): Role {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'supplier' || v === 'stakeholder') return v;
  } catch {
    /* ignore */
  }
  return 'stakeholder';
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(readStoredRole);
  const [dashboardSwitching, setDashboardSwitching] = useState(false);

  const switchRole = useCallback((newRole: Role) => {
    if (newRole === role) return;
    setDashboardSwitching(true);
    window.setTimeout(() => {
      setRole(newRole);
      try {
        localStorage.setItem(STORAGE_KEY, newRole);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setDashboardSwitching(false), 200);
    }, 200);
  }, [role]);

  const value = useMemo(
    () => ({ role, switchRole, dashboardSwitching }),
    [role, switchRole, dashboardSwitching],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
