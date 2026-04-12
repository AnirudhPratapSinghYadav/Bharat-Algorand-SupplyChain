/**
 * Re-exports wallet + role from WalletContext (single source of truth).
 */
export { WalletProvider as RoleProvider, useWallet, useRole } from './WalletContext';
export type { Role } from './WalletContext';
