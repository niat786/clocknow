// API key format and hashing. Pure and runtime-neutral (Web Crypto only), so it is unit-tested in Node.
const PREFIX = 'ck_live_';
const KEY_RE = /^ck_live_[A-Za-z0-9_-]{32}$/;

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** `ck_live_` + 32 URL-safe characters (192 bits of randomness). */
export function generateKey(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return PREFIX + b64url(random(24));
}

export const isKey = (s: string): boolean => KEY_RE.test(s);

/** SHA-256 hex. Keys carry 192 random bits, so a plain fast hash is enough (no password stretching). */
export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** The key sent with a request: `Authorization: Bearer ck_live_…` or `X-API-Key`. `undefined` if none. */
export function keyFromHeaders(h: { get(name: string): string | null }): string | undefined {
  const auth = h.get('authorization');
  const bearer = auth && /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  return bearer || h.get('x-api-key')?.trim() || undefined;
}

/** Shown in lists so a person can tell keys apart without exposing the secret part. */
export const keyPrefix = (key: string): string => key.slice(0, PREFIX.length + 4);

export const isEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
