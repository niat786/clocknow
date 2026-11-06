// clocknow API gateway (api.clocknow.net): keys, monthly quotas, then a proxy to the Rust API.
import type { Env } from './env.ts';
import { keyFromHeaders, isKey, sha256Hex } from './keys.ts';
import { decide, isFirstPartyFree, isOpenPath, isTier, period, quotaHeaders, type Tier } from './limits.ts';
import { handleAuth, isAuthPath } from './auth-routes.ts';
import { collect, summary } from './rum-routes.ts';
import { confirm, requestLink } from './signup.ts';

const json = (body: unknown, status: number, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-api-key, content-type',
  'access-control-expose-headers': 'x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after, x-clocknow-tier',
  'access-control-max-age': '86400',
};

async function count(env: Env, subject: string, nowMs: number): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO usage (subject, period, count) VALUES (?, ?, 1) ON CONFLICT(subject, period) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(subject, period(nowMs))
    .first<{ count: number }>();
  return row?.count ?? 1;
}

async function authenticate(env: Env, key: string): Promise<{ id: number; tier: Tier } | null> {
  if (!isKey(key)) return null;
  const row = await env.DB.prepare('SELECT id, tier, revoked_at FROM keys WHERE key_hash = ?')
    .bind(await sha256Hex(key))
    .first<{ id: number; tier: string; revoked_at: number | null }>();
  if (!row || row.revoked_at !== null || !isTier(row.tier)) return null;
  return { id: row.id, tier: row.tier };
}

export async function handle(req: Request, env: Env, nowMs = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  if (isAuthPath(url.pathname)) return handleAuth(req, env, url, nowMs);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (url.pathname === '/signup' && req.method === 'POST') return withCors(await requestLink(req, env, Math.floor(nowMs / 1000)));
  if (url.pathname === '/signup/confirm' && req.method === 'POST') return withCors(await confirm(req, env, Math.floor(nowMs / 1000)));
  if (url.pathname === '/rum' && req.method === 'POST') return withCors(await collect(req, env, nowMs));
  if (url.pathname === '/rum/summary' && req.method === 'GET') return withCors(await summary(url, env, nowMs));
  if (url.pathname === '/health') return new Response('ok');
  if (!url.pathname.startsWith('/v1/') && url.pathname !== '/.well-known/clocknow-keys.json') return withCors(json({ error: 'not found' }, 404));
  if (req.method !== 'GET') return withCors(json({ error: 'method not allowed' }, 405));

  const presented = keyFromHeaders(req.headers);
  let subject: string;
  let tier: Tier;
  let metered = true;

  if (presented !== undefined) {
    const k = await authenticate(env, presented);
    if (!k) return withCors(json({ error: 'invalid or revoked API key' }, 401, { 'www-authenticate': 'Bearer' }));
    subject = `key:${k.id}`;
    tier = k.tier;
  } else {
    const origin = req.headers.get('origin');
    const site = (env.SITE_ORIGINS ?? '').split(',').map((s) => s.trim());
    if (origin && site.includes(origin) && isFirstPartyFree(url.pathname)) metered = false;
    if (metered && !isOpenPath(url.pathname) && url.pathname !== '/.well-known/clocknow-keys.json') {
      return withCors(json({ error: 'this endpoint needs an API key: https://clocknow.net/developers' }, 401, { 'www-authenticate': 'Bearer' }));
    }
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    subject = `ip:${(await sha256Hex(`${env.IP_SALT ?? ''}|${ip}`)).slice(0, 16)}`;
    tier = 'anon';
  }

  let quota: Record<string, string> = {};
  if (metered) {
    const d = decide(tier, await count(env, subject, nowMs));
    quota = quotaHeaders(d, tier, nowMs);
    if (!d.allowed) return withCors(json({ error: 'monthly request limit reached', tier }, 429, quota));
  }

  const upstream = new Request(env.ORIGIN_URL + url.pathname + url.search, {
    method: 'GET',
    headers: {
      'x-origin-secret': env.ORIGIN_SECRET,
      ...(req.headers.get('upgrade') ? { upgrade: req.headers.get('upgrade') as string, origin: req.headers.get('origin') ?? '' } : {}),
    },
  });
  const res = await fetch(upstream);
  if (res.status === 101) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...CORS, ...quota })) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export default { fetch: (req: Request, env: Env): Promise<Response> => handle(req, env) };
