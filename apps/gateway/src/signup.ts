// Magic links. One emailed, single-use, 30-minute link proves control of an address; what it unlocks
// depends on its purpose: "key" reveals an API key once, "login" signs the person in. Tokens are stored
// hashed, so a copy of the database cannot be used to sign in.
import type { Env } from './env.ts';
import { generateKey, hex, isEmail, keyPrefix, sha256Hex } from './keys.ts';

export type Purpose = 'key' | 'login';

const TOKEN_TTL_S = 30 * 60;
const MAX_PER_HOUR = 3;

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

const COPY: Record<Purpose, { path: string; subject: string; lead: string }> = {
  key: { path: '/developers', subject: 'Your clocknow API key', lead: 'Open this link within 30 minutes to get your API key:' },
  login: { path: '/account', subject: 'Sign in to clocknow', lead: 'Open this link within 30 minutes to sign in:' },
};

async function sendMail(env: Env, to: string, link: string, purpose: Purpose): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to,
      subject: COPY[purpose].subject,
      text: `${COPY[purpose].lead}\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
    }),
  });
  return res.ok;
}

export async function requestLink(req: Request, env: Env, nowS: number, purpose: Purpose = 'key'): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) return json({ error: 'enter a valid email address' }, 400);

  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM signups WHERE email = ? AND created_at > ?')
    .bind(email, nowS - 3600)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_HOUR) return json({ error: 'too many requests for this address; try again in an hour' }, 429);

  const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  await env.DB.prepare('INSERT INTO signups (token_hash, email, created_at, expires_at, purpose) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), email, nowS, nowS + TOKEN_TTL_S, purpose)
    .run();

  if (!(await sendMail(env, email, `${env.SITE_URL}${COPY[purpose].path}#token=${token}`, purpose))) {
    return json({ error: 'email delivery is not available right now' }, 503);
  }
  // Same answer whether or not the address already has an account or key, so this cannot probe for them.
  return json({ ok: true });
}

/** Spends a magic-link token. Returns the verified email, or `null` if it is unknown, used, expired or for another purpose. */
export async function claimToken(env: Env, token: unknown, purpose: Purpose, nowS: number): Promise<string | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT email, expires_at, used_at, purpose FROM signups WHERE token_hash = ?')
    .bind(hash)
    .first<{ email: string; expires_at: number; used_at: number | null; purpose: string }>();
  if (!row || row.purpose !== purpose || row.used_at !== null || row.expires_at < nowS) return null;
  // Claim atomically: only one request can change the row, so only one gets the email.
  const claim = await env.DB.prepare('UPDATE signups SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(nowS, hash).run();
  return claim.meta.changes === 1 ? row.email : null;
}

export async function confirm(req: Request, env: Env, nowS: number): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const email = await claimToken(env, body?.token, 'key', nowS);
  if (!email) return json({ error: 'this link has expired or was already used' }, 410);

  const key = generateKey();
  await env.DB.prepare('INSERT INTO keys (key_hash, prefix, email, tier, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(key), keyPrefix(key), email, 'free', nowS)
    .run();
  return json({ key, tier: 'free', note: 'Store this key now; it is shown only once.' });
}
