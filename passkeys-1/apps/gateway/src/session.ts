// Browser sessions: an opaque random token in an HttpOnly cookie, stored hashed in D1.
import type { Env } from './env.ts';
import { hex, sha256Hex } from './keys.ts';
import { json } from './signup.ts';

export const COOKIE = 'ck_session';
export const SESSION_DAYS = 30;

export interface User { id: number; email: string }

export const newToken = (): string => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);

/** Set-Cookie value. `Secure` whenever the site is https; `Domain` only when configured (production). */
export function cookieHeader(token: string, env: Pick<Env, 'SITE_URL' | 'COOKIE_DOMAIN'>, maxAgeS: number): string {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeS}`];
  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  if (env.SITE_URL.startsWith('https://')) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export async function createSession(env: Env, userId: number, nowS: number): Promise<{ token: string; setCookie: string }> {
  const token = newToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, nowS, nowS + SESSION_DAYS * 86_400)
    .run();
  return { token, setCookie: cookieHeader(token, env, SESSION_DAYS * 86_400) };
}

export async function userFor(env: Env, req: Request, nowS: number): Promise<User | null> {
  const token = readCookie(req.headers.get('cookie'), COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare(
    'SELECT u.id AS id, u.email AS email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  ).bind(await sha256Hex(token), nowS).first<User>();
}

export async function destroySession(env: Env, req: Request): Promise<string> {
  const token = readCookie(req.headers.get('cookie'), COOKIE);
  if (token && /^[0-9a-f]{64}$/.test(token)) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return cookieHeader('', env, 0);
}

/** Signs a verified person in: a fresh session token (never reused across logins) in a cookie. */
export async function startSession(env: Env, user: User, nowS: number, extra: Record<string, unknown> = {}): Promise<Response> {
  const { setCookie } = await createSession(env, user.id, nowS);
  return json({ email: user.email, ...extra }, 200, { 'set-cookie': setCookie });
}
