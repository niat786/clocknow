// Verifies clocknow signed-time responses with the browser's built-in Ed25519 (WebCrypto).
// Format: see apps/api/src/signed.rs. The signed bytes must match `message` there exactly.
export const CONTEXT = 'clocknow-signed-time-v1';

export interface SignedTime {
  v: number;
  kid: string;
  t: number;
  radius_ms: number;
  nonce: string;
  server: string;
  sig: string;
}

export interface KeyInfo {
  kid: string;
  alg: string;
  public_key: string;
  status: string;
}

export type Verdict =
  | { ok: true; key: KeyInfo }
  | { ok: false; reason: 'unknown_key' | 'bad_signature' | 'malformed' | 'unsupported' | 'nonce_mismatch' };

const TOKEN = /^[A-Za-z0-9_-]*$/;
const isToken = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max && TOKEN.test(s);

export function parseSigned(x: unknown): SignedTime | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const ok =
    o.v === 1 &&
    isToken(o.kid, 32) && (o.kid as string).length > 0 &&
    Number.isSafeInteger(o.t) &&
    Number.isInteger(o.radius_ms) && (o.radius_ms as number) >= 0 &&
    isToken(o.nonce, 64) &&
    isToken(o.server, 32) &&
    isToken(o.sig, 100);
  return ok ? (o as unknown as SignedTime) : null;
}

export function parseKeys(x: unknown): KeyInfo[] {
  const keys = (x as { context?: unknown; keys?: unknown } | null)?.keys;
  if ((x as { context?: unknown })?.context !== CONTEXT || !Array.isArray(keys)) return [];
  return keys.filter((k): k is KeyInfo =>
    !!k && typeof k === 'object' && isToken((k as KeyInfo).kid, 32) && (k as KeyInfo).alg === 'Ed25519' && isToken((k as KeyInfo).public_key, 64));
}

// WebCrypto wants bytes backed by a plain ArrayBuffer, so copy into one.
export const message = (st: SignedTime): Uint8Array<ArrayBuffer> =>
  new Uint8Array(new TextEncoder().encode(`${CONTEXT}\nkid=${st.kid}\nt=${st.t}\nradius=${st.radius_ms}\nnonce=${st.nonce}\nserver=${st.server}`));

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (!TOKEN.test(s) || s.length % 4 === 1) return null;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random 22-character base64url nonce (128 bits). */
export const newNonce = (): string => b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));

export async function verifySigned(st: SignedTime, keys: readonly KeyInfo[], expectedNonce?: string): Promise<Verdict> {
  if (expectedNonce !== undefined && st.nonce !== expectedNonce) return { ok: false, reason: 'nonce_mismatch' };
  const key = keys.find((k) => k.kid === st.kid);
  if (!key) return { ok: false, reason: 'unknown_key' };
  const raw = b64urlDecode(key.public_key);
  const sig = b64urlDecode(st.sig);
  if (!raw || raw.length !== 32 || !sig || sig.length !== 64) return { ok: false, reason: 'malformed' };
  let pub: CryptoKey;
  try {
    pub = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
  } catch {
    return { ok: false, reason: 'unsupported' };
  }
  const good = await crypto.subtle.verify({ name: 'Ed25519' }, pub, sig, message(st));
  return good ? { ok: true, key } : { ok: false, reason: 'bad_signature' };
}
