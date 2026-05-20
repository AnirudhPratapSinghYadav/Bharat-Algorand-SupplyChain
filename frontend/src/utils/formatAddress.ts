/** Truncate Algorand addresses for dashboard display. */
export function formatAddress(addr: string | null | undefined): string {
  const a = (addr || '').trim();
  if (!a) return '';
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
