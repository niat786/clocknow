// Pure helpers for the /account page.
export const QUOTA: Record<string, number | null> = { free: 10_000, developer: 500_000, business: 5_000_000, enterprise: null };

/** "1,234 of 10,000 this month", or just the count for an unmetered tier. */
export function usageText(used: number, tier: string): string {
  const cap = QUOTA[tier];
  const n = used.toLocaleString('en-US');
  return cap == null ? `${n} this month` : `${n} of ${cap.toLocaleString('en-US')} this month`;
}

/** Unix seconds as a UTC date, e.g. "7 Nov 2026"; "never" when absent. */
export function dayText(s: number | null | undefined): string {
  if (!s) return 'never';
  return new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Passkeys need the JSON helpers on PublicKeyCredential (Chrome 129, Safari 18.4, Firefox 119). */
export function passkeysSupported(w: { PublicKeyCredential?: unknown }): boolean {
  const p = w.PublicKeyCredential as { parseCreationOptionsFromJSON?: unknown; parseRequestOptionsFromJSON?: unknown } | undefined;
  return !!p && typeof p.parseCreationOptionsFromJSON === 'function' && typeof p.parseRequestOptionsFromJSON === 'function';
}
