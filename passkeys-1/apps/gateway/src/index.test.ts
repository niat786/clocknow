import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './index.ts';
import { generateKey, sha256Hex } from './keys.ts';
import type { D1PreparedStatement, Env } from './env.ts';

// A tiny in-memory stand-in for the three D1 queries the gateway makes on the hot path.
function fakeDb(keys: Map<string, { id: number; tier: string; revoked_at: number | null }>, usage: Map<string, number>) {
  const stmt = (sql: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...a) => stmt(sql, a),
    first: async <T>() => {
      if (sql.includes('FROM keys')) return (keys.get(args[0] as string) ?? null) as T | null;
      if (sql.includes('INSERT INTO usage')) {
        const k = `${args[0]}|${args[1]}`;
        usage.set(k, (usage.get(k) ?? 0) + 1);
        return { count: usage.get(k) } as T;
      }
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => ({ meta: { changes: 1 } }),
  });
  return { prepare: (sql: string) => stmt(sql) };
}

const NOW = Date.UTC(2026, 10, 7);
const origin = { calls: [] as Request[] };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (r: Request) => {
  origin.calls.push(r);
  return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
process.on('exit', () => { globalThis.fetch = realFetch; });

async function setup(tier = 'developer') {
  const key = generateKey();
  const keys = new Map([[await sha256Hex(key), { id: 7, tier, revoked_at: null as number | null }]]);
  const usage = new Map<string, number>();
  const env = {
    DB: fakeDb(keys, usage), ORIGIN_URL: 'https://origin.test', ORIGIN_SECRET: 's3cret',
    SITE_ORIGINS: 'https://clocknow.net', SITE_URL: 'https://clocknow.net', MAIL_FROM: 'x', IP_SALT: 'salt',
  } as unknown as Env;
  return { key, keys, usage, env };
}
const get = (path: string, h: Record<string, string> = {}) => new Request('https://api.clocknow.net' + path, { headers: h });

test('anonymous callers may use open endpoints, and the origin gets the secret', async () => {
  const { env } = await setup();
  origin.calls.length = 0;
  const res = await handle(get('/v1/now?tz=Asia/Karachi', { 'cf-connecting-ip': '1.2.3.4' }), env, NOW);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-clocknow-tier'), 'anon');
  assert.equal(res.headers.get('x-ratelimit-remaining'), '9999');
  assert.equal(origin.calls[0].headers.get('x-origin-secret'), 's3cret');
  assert.equal(origin.calls[0].url, 'https://origin.test/v1/now?tz=Asia/Karachi');
});

test('keyed endpoints refuse anonymous callers before touching the origin', async () => {
  const { env } = await setup();
  origin.calls.length = 0;
  const res = await handle(get('/v1/sun?lat=1&lon=2'), env, NOW);
  assert.equal(res.status, 401);
  assert.equal(origin.calls.length, 0);
});

test('a valid key unlocks them and uses its tier', async () => {
  const { env, key } = await setup('developer');
  const res = await handle(get('/v1/sun', { authorization: `Bearer ${key}` }), env, NOW);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-clocknow-tier'), 'developer');
  assert.equal(res.headers.get('x-ratelimit-limit'), '500000');
});

test('unknown and revoked keys are rejected', async () => {
  const { env, key, keys } = await setup();
  assert.equal((await handle(get('/v1/now', { 'x-api-key': generateKey() }), env, NOW)).status, 401);
  assert.equal((await handle(get('/v1/now', { 'x-api-key': 'junk' }), env, NOW)).status, 401);
  keys.forEach((v) => (v.revoked_at = 1));
  assert.equal((await handle(get('/v1/now', { 'x-api-key': key }), env, NOW)).status, 401);
});

test('over the monthly limit returns 429 with Retry-After and never reaches the origin', async () => {
  const { env, key, usage } = await setup('free');
  usage.set('key:7|2026-11', 10_000);
  origin.calls.length = 0;
  const res = await handle(get('/v1/now', { 'x-api-key': key }), env, NOW);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), String((Date.UTC(2026, 11, 1) - NOW) / 1000));
  assert.equal(origin.calls.length, 0);
});

test('our own site is not metered for sync calls, but is for everything else', async () => {
  const { env, usage } = await setup();
  const site = { origin: 'https://clocknow.net', 'cf-connecting-ip': '5.6.7.8' };
  const r1 = await handle(get('/v1/now', site), env, NOW);
  assert.equal(r1.headers.get('x-ratelimit-limit'), null);
  assert.equal(usage.size, 0);
  const r2 = await handle(get('/v1/convert?from=a&to=b&time=c', site), env, NOW);
  assert.equal(r2.headers.get('x-ratelimit-limit'), '10000');
  assert.equal(usage.size, 1);
});

test('the visitor IP is stored hashed, never in clear', async () => {
  const { env, usage } = await setup();
  await handle(get('/v1/now', { 'cf-connecting-ip': '9.9.9.9' }), env, NOW);
  for (const k of usage.keys()) assert.ok(!k.includes('9.9.9.9'));
});

test('other paths and methods', async () => {
  const { env } = await setup();
  assert.equal((await handle(get('/admin'), env, NOW)).status, 404);
  assert.equal((await handle(new Request('https://api.clocknow.net/v1/now', { method: 'POST' }), env, NOW)).status, 405);
  const pre = await handle(new Request('https://api.clocknow.net/v1/now', { method: 'OPTIONS' }), env, NOW);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /x-api-key/);
});

// ---- RUM -----------------------------------------------------------------------------------
test('beacons are stored as bucket counts and summarised as p75', async () => {
  const rum = new Map<string, number>();
  const usage = new Map<string, number>();
  const db = {
    prepare: (sql: string) => {
      let args: unknown[] = [];
      const st: D1PreparedStatement = {
        bind: (...a) => { args = a; return st; },
        first: async <T>() => {
          if (sql.includes('INSERT INTO usage')) { const k = `${args[0]}|${args[1]}`; usage.set(k, (usage.get(k) ?? 0) + 1); return { count: usage.get(k) } as T; }
          return null;
        },
        all: async <T>() => {
          const rows = [...rum.entries()].map(([k, n]) => { const [, , device, metric, bucket] = k.split('|'); return { device, metric, bucket: Number(bucket), n }; });
          return { results: rows as T[] };
        },
        run: async () => { if (sql.includes('INTO rum')) { const k = args.slice(0, 5).join('|'); rum.set(k, (rum.get(k) ?? 0) + 1); } return { meta: { changes: 1 } }; },
      };
      return st;
    },
  };
  const env = { DB: db, IP_SALT: 's' } as unknown as Env;
  const post = (body: string) => handle(new Request('https://api.clocknow.net/rum', { method: 'POST', body, headers: { 'cf-connecting-ip': '1.1.1.1' } }), env, NOW);
  for (let i = 0; i < 40; i++) assert.equal((await post('{"r":"/","d":"phone","m":{"LCP":800}}')).status, 204);
  assert.equal((await post('x'.repeat(5000))).status, 413);
  assert.ok([...rum.keys()].every((k) => !k.includes('1.1.1.1')), 'no visitor data in the table');
  const res = await handle(new Request('https://api.clocknow.net/rum/summary?days=7'), env, NOW);
  const body = (await res.json()) as { metrics: { phone: { LCP: { n: number; meets_target: boolean } | null }; desktop: { LCP: unknown } } };
  assert.equal(body.metrics.phone.LCP?.n, 40);
  assert.equal(body.metrics.phone.LCP?.meets_target, true);
  assert.equal(body.metrics.desktop.LCP, null);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
});

test('the per-visitor daily cap stops counting extra beacons', async () => {
  const usage = new Map<string, number>([['rum:0|2026-11-07', 0]]);
  let stored = 0;
  const db = { prepare: (sql: string) => { let a: unknown[] = []; const st: D1PreparedStatement = { bind: (...x) => { a = x; return st; }, first: async <T>() => { if (sql.includes('INSERT INTO usage')) { const k = `${a[0]}|${a[1]}`; usage.set(k, (usage.get(k) ?? 0) + 301); return { count: usage.get(k) } as T; } return null; }, all: async () => ({ results: [] }), run: async () => { stored++; return { meta: { changes: 1 } }; } }; return st; } };
  const res = await handle(new Request('https://api.clocknow.net/rum', { method: 'POST', body: '{"r":"/","d":"phone","m":{"LCP":800}}', headers: { 'cf-connecting-ip': '2.2.2.2' } }), { DB: db, IP_SALT: 's' } as unknown as Env, NOW);
  assert.equal(res.status, 204);
  assert.equal(stored, 0);
});
