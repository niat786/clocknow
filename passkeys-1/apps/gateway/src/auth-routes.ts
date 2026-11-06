// /auth/* and /account/*: browser-only endpoints for people signing in to the site. They use a session
// cookie, so they answer only the site's own origins (with credentials) and reject cross-site POSTs.
import type { Env } from './env.ts';
import { sha256Hex } from './keys.ts';
import { destroySession, startSession, userFor, type User } from './session.ts';
import { claimToken, json, requestLink } from './signup.ts';
import { account, createKey, revokeKey, removePasskey } from './account.ts';
import { loginOptions, loginVerify, registerOptions, registerVerify } from './passkeys.ts';

const MAX_AUTH_PER_IP_PER_HOUR = 60;

export const isAuthPath = (p: string): boolean => p.startsWith('/auth/') || p === '/account' || p.startsWith('/account/');

function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('origin');
  return origin && (env.SITE_ORIGINS ?? '').split(',').map((s) => s.trim()).includes(origin) ? origin : null;
}

function withCreds(res: Response, origin: string): Response {
  const headers = new Headers(res.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.append('vary', 'Origin');
  return new Response(res.body, { status: res.status, headers });
}

async function upsertUser(env: Env, email: string, nowS: number): Promise<User> {
  await env.DB.prepare('INSERT INTO users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(email, nowS).run();
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first<User>();
  if (!user) throw new Error('user upsert failed');
  // Keys made earlier with this (verified) address now belong to the account.
  await env.DB.prepare('UPDATE keys SET user_id = ? WHERE email = ? AND user_id IS NULL').bind(user.id, email).run();
  return user;
}

export async function handleAuth(req: Request, env: Env, url: URL, nowMs: number): Promise<Response> {
  const origin = allowedOrigin(req, env);
  if (!origin) return new Response(null, { status: 403 });
  if (req.method === 'OPTIONS') {
    return withCreds(new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' } }), origin);
  }
  return withCreds(await route(req, env, url, nowMs), origin);
}

async function route(req: Request, env: Env, url: URL, nowMs: number): Promise<Response> {
  const nowS = Math.floor(nowMs / 1000);
  const path = url.pathname;

  // A per-visitor hourly cap on every browser auth call (IP stored only as a salted hash).
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const hourly = await env.DB.prepare(
    'INSERT INTO usage (subject, period, count) VALUES (?, ?, 1) ON CONFLICT(subject, period) DO UPDATE SET count = count + 1 RETURNING count',
  ).bind(`auth:${(await sha256Hex(`${env.IP_SALT ?? ''}|${ip}`)).slice(0, 16)}`, new Date(nowMs).toISOString().slice(0, 13)).first<{ count: number }>();
  if ((hourly?.count ?? 1) > MAX_AUTH_PER_IP_PER_HOUR) return json({ error: 'too many attempts; try again later' }, 429);

  if (req.method === 'GET' && path === '/account') {
    const user = await userFor(env, req, nowS);
    return user ? json(await account(env, user, nowMs)) : json({ error: 'not signed in' }, 401);
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Public steps: no session yet.
  if (path === '/auth/email') return requestLink(req, env, nowS, 'login');
  if (path === '/auth/email/verify') {
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    const email = await claimToken(env, body?.token, 'login', nowS);
    if (!email) return json({ error: 'this link has expired or was already used' }, 410);
    return startSession(env, await upsertUser(env, email, nowS), nowS);
  }
  if (path === '/auth/passkey/login/options') return loginOptions(env, nowS);
  if (path === '/auth/passkey/login/verify') return loginVerify(req, env, nowS);
  if (path === '/auth/logout') return json({ ok: true }, 200, { 'set-cookie': await destroySession(env, req) });

  // Everything else needs a signed-in person.
  const user = await userFor(env, req, nowS);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (path === '/auth/passkey/register/options') return registerOptions(env, user, nowS);
  if (path === '/auth/passkey/register/verify') return registerVerify(req, env, user, nowS);
  if (path === '/account/keys') return createKey(env, user, nowS);
  if (path === '/account/keys/revoke') return revokeKey(req, env, user, nowS);
  if (path === '/account/passkeys/remove') return removePasskey(req, env, user);
  return json({ error: 'not found' }, 404);
}
