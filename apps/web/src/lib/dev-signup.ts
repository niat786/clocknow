// Pure helpers for the /developers sign-up flow.
/** The one-time token from `#token=<64 hex>` in the emailed link, or `undefined`. */
export function tokenFromHash(hash: string): string | undefined {
  const m = /^#token=([0-9a-f]{64})$/.exec(hash);
  return m?.[1];
}

export const looksLikeEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** A ready-to-run example for the page, using the person's own key once they have one. */
export function curlExample(path: string, key?: string): string {
  const auth = key ? ` \\\n  -H "Authorization: Bearer ${key}"` : '';
  return `curl "https://api.clocknow.net${path}"${auth}`;
}
