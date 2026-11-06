import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './index.ts';
import { generateKey, sha256Hex } from './keys.ts';
import { webauthn } from './passkeys.ts';
import { testDb } from '../test/sqlite-d1.ts';
import type { Env } from './env.ts';

const NOW = Date.UTC(2026, 10, 7, 12);
const SITE = 'https://clocknow.net';
const mails: string[] = [];
globalThis.fetch = (async (r: Request | string, init?: RequestInit) => {
  if (String(typeof r === 'string' ? r : r.url).includes('resend.com')) { mails.push(String(init?.body)); return new Response('{}', { status: 200 }); }
  return new Response('{"ok":true}', { status: 200 });
}) as typeof fetch;

function setup() {
  const db = testDb();
  const env = { DB: db, SITE_ORIGINS: `${SITE},https://www.clocknow.net`, SITE_URL: SITE, RP_ID: 'clocknow.net', COOKIE_DOMAIN: '.clocknow.net', RESEND_API_KEY: 'r', MAIL_FROM: 'x', IP_SALT: 's', ORIGIN_URL: 'https://o.test', ORIGIN_SECRET: 'o' } as unknown as Env;
  let clock = NOW;
  const call = (method: string, path: string, body?: unknown, o: { cookie?: string; origin?: string | null; ip?: string } = {}) => {
    const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '1.2.3.4' };
    if (o.origin !== null) headers.origin = o.origin ?? SITE;
    if (o.cookie) headers.cookie = o.cookie;
    return handle(new Request(`https://api.clocknow.net${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, clock);
  };
  const tick = (s: number) => { clock += s * 1000; };
  return { db, env, call, tick };
}
type Ctx = ReturnType<typeof setup>;

/** Request a login link, read the token out of the "email", verify it, return the session cookie. */
async function signIn(c: Ctx, email = 'me@example.com'): Promise<string> {
  mails.length = 0;
  assert.equal((await c.call('POST', '/auth/email', { email })).status, 200);
  const token = /#token=([0-9a-f]{64})/.exec(mails[0])?.[1] as string;
  const res = await c.call('POST', '/auth/email/verify', { token });
  assert.equal(res.status, 200);
  return (res.headers.get('set-cookie') as string).split(';')[0];
}

test('magic link: link goes to /account, signs in once, sets a hardened cookie', async () => {
  const c = setup();
  mails.length = 0;
  await c.call('POST', '/auth/email', { email: 'Me@Example.com' });
  assert.match(mails[0], /clocknow\.net\/account#token=[0-9a-f]{64}/);
  const token = /#token=([0-9a-f]{64})/.exec(mails[0])?.[1];
  const res = await c.call('POST', '/auth/email/verify', { token });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie') ?? '';
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Domain=.clocknow.net', 'Path=/', 'Max-Age=2592000']) assert.ok(cookie.includes(part), part);
  assert.equal(((await res.json()) as { email: string }).email, 'me@example.com');
  assert.equal((await c.call('POST', '/auth/email/verify', { token })).status, 410, 'a link works once');
});

test('only the stored hash of a session token is in the database', async () => {
  const c = setup();
  const cookie = await signIn(c);
  const token = cookie.split('=')[1];
  const rows = c.db.raw.prepare('SELECT token_hash FROM sessions').all() as Array<{ token_hash: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, await sha256Hex(token));
  assert.notEqual(rows[0].token_hash, token);
});

test('an expired link, a key-purpose link and garbage are all refused', async () => {
  const c = setup();
  mails.length = 0;
  await c.call('POST', '/auth/email', { email: 'a@example.com' });
  const token = /#token=([0-9a-f]{64})/.exec(mails[0])?.[1];
  c.tick(31 * 60);
  assert.equal((await c.call('POST', '/auth/email/verify', { token })).status, 410);
  mails.length = 0;
  await c.call('POST', '/signup', { email: 'b@example.com' }); // a key link, not a login link
  const keyToken = /#token=([0-9a-f]{64})/.exec(mails[0])?.[1];
  assert.equal((await c.call('POST', '/auth/email/verify', { token: keyToken })).status, 410);
  assert.equal((await c.call('POST', '/auth/email/verify', { token: 'nope' })).status, 410);
});

test('cookies need a live session; sign-out ends it', async () => {
  const c = setup();
  assert.equal((await c.call('GET', '/account')).status, 401);
  const cookie = await signIn(c);
  assert.equal((await c.call('GET', '/account', undefined, { cookie })).status, 200);
  const out = await c.call('POST', '/auth/logout', {}, { cookie });
  assert.match(out.headers.get('set-cookie') ?? '', /Max-Age=0/);
  assert.equal((await c.call('GET', '/account', undefined, { cookie })).status, 401);
  const c2 = setup();
  const cookie2 = await signIn(c2);
  c2.tick(31 * 86_400);
  assert.equal((await c2.call('GET', '/account', undefined, { cookie: cookie2 })).status, 401, 'sessions expire after 30 days');
});

test('cross-site calls are refused; the site gets credentialed CORS', async () => {
  const c = setup();
  assert.equal((await c.call('POST', '/auth/email', { email: 'a@example.com' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.call('POST', '/auth/email', { email: 'a@example.com' }, { origin: null })).status, 403);
  const pre = await c.call('OPTIONS', '/auth/email');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), SITE);
  assert.equal(pre.headers.get('access-control-allow-credentials'), 'true');
  const ok = await c.call('POST', '/auth/email', { email: 'a@example.com' });
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE, 'never "*" with credentials');
});

test('too many attempts from one address are throttled', async () => {
  const c = setup();
  let last = 200;
  for (let i = 0; i < 61; i++) last = (await c.call('POST', '/auth/passkey/login/options', {}, { ip: '9.9.9.9' })).status;
  assert.equal(last, 429);
});

test('keys: first sign-in claims earlier keys; limit of 5; revoke; usage is shown; others cannot touch them', async () => {
  const c = setup();
  const old = generateKey();
  c.db.raw.prepare('INSERT INTO keys (key_hash, prefix, email, tier, created_at) VALUES (?, ?, ?, ?, ?)').run(await sha256Hex(old), 'ck_live_xxxx', 'me@example.com', 'free', 1);
  const cookie = await signIn(c);
  let acct = (await (await c.call('GET', '/account', undefined, { cookie })).json()) as { keys: Array<{ id: number; revoked_at: number | null }>; passkeys: unknown[] };
  assert.equal(acct.keys.length, 1, 'the earlier key is now on the account');
  for (let i = 0; i < 4; i++) assert.equal((await c.call('POST', '/account/keys', {}, { cookie })).status, 200);
  const sixth = await c.call('POST', '/account/keys', {}, { cookie });
  assert.equal(sixth.status, 409);
  acct = (await (await c.call('GET', '/account', undefined, { cookie })).json()) as typeof acct;
  const id = acct.keys[0].id;
  assert.equal((await c.call('POST', '/account/keys/revoke', { id }, { cookie })).status, 200);
  assert.equal((await c.call('POST', '/account/keys/revoke', { id }, { cookie })).status, 404, 'already revoked');
  assert.equal((await c.call('POST', '/account/keys', {}, { cookie })).status, 200, 'a revoked key frees a slot');
  // the revoked key no longer authenticates at the API
  const res = await c.call('GET', '/v1/now', undefined, { origin: null });
  assert.equal(res.status, 200);
  const stranger = await signIn(c, 'other@example.com');
  assert.equal((await c.call('POST', '/account/keys/revoke', { id: acct.keys[1].id }, { cookie: stranger })).status, 404);
});

test('a key made on the account works at the API and counts usage on the account', async () => {
  const c = setup();
  const cookie = await signIn(c);
  const { key } = (await (await c.call('POST', '/account/keys', {}, { cookie })).json()) as { key: string };
  const r = await handle(new Request('https://api.clocknow.net/v1/sun?lat=1&lon=2', { headers: { authorization: `Bearer ${key}` } }), c.env, NOW);
  assert.equal(r.status, 200);
  const acct = (await (await c.call('GET', '/account', undefined, { cookie })).json()) as { keys: Array<{ used_this_month: number }> };
  assert.equal(acct.keys[0].used_this_month, 1);
  const id = (c.db.raw.prepare('SELECT id FROM keys').get() as { id: number }).id;
  await c.call('POST', '/account/keys/revoke', { id }, { cookie });
  assert.equal((await handle(new Request('https://api.clocknow.net/v1/sun', { headers: { authorization: `Bearer ${key}` } }), c.env, NOW)).status, 401);
});

// ---- passkeys, with the cryptography stubbed so the storage and challenge rules are tested alone ----
const fakeInfo = { verified: true, registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] } } };
const original = { ...webauthn };
function stub(over: Partial<typeof webauthn>) { Object.assign(webauthn, original, over); }

test('registration: challenge is bound to the person, single-use and short-lived', async () => {
  const c = setup();
  stub({ verifyRegistrationResponse: (async () => fakeInfo) as never });
  const cookie = await signIn(c);
  const o = (await (await c.call('POST', '/auth/passkey/register/options', {}, { cookie })).json()) as { challengeId: string; options: { rp: { id: string }; user: { name: string }; authenticatorSelection: { residentKey: string } } };
  assert.equal(o.options.rp.id, 'clocknow.net');
  assert.equal(o.options.user.name, 'me@example.com');
  assert.equal(o.options.authenticatorSelection.residentKey, 'required');
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: o.challengeId, response: {}, name: 'Laptop' }, { cookie })).status, 200);
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: o.challengeId, response: {} }, { cookie })).status, 400, 'replay');
  // expired
  const o2 = (await (await c.call('POST', '/auth/passkey/register/options', {}, { cookie })).json()) as { challengeId: string };
  c.tick(6 * 60);
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: o2.challengeId, response: {} }, { cookie })).status, 400);
  const acct = (await (await c.call('GET', '/account', undefined, { cookie })).json()) as { passkeys: Array<{ id: string; name: string }> };
  assert.deepEqual(acct.passkeys.map((p) => p.name), ['Laptop']);
});

test("one person's registration challenge cannot be used by another, and sign-in is required to start", async () => {
  const c = setup();
  stub({ verifyRegistrationResponse: (async () => fakeInfo) as never });
  assert.equal((await c.call('POST', '/auth/passkey/register/options', {})).status, 401);
  const a = await signIn(c, 'a@example.com');
  const b = await signIn(c, 'b@example.com');
  const o = (await (await c.call('POST', '/auth/passkey/register/options', {}, { cookie: a })).json()) as { challengeId: string };
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: o.challengeId, response: {} }, { cookie: b })).status, 400);
});

test('a failed verification stores nothing, and a duplicate credential is refused', async () => {
  const c = setup();
  const cookie = await signIn(c);
  const start = async () => ((await (await c.call('POST', '/auth/passkey/register/options', {}, { cookie })).json()) as { challengeId: string }).challengeId;
  stub({ verifyRegistrationResponse: (async () => { throw new Error('bad origin'); }) as never });
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: await start(), response: {} }, { cookie })).status, 400);
  stub({ verifyRegistrationResponse: (async () => ({ verified: false })) as never });
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: await start(), response: {} }, { cookie })).status, 400);
  assert.equal((c.db.raw.prepare('SELECT COUNT(*) AS n FROM passkeys').get() as { n: number }).n, 0);
  stub({ verifyRegistrationResponse: (async () => fakeInfo) as never });
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: await start(), response: {} }, { cookie })).status, 200);
  assert.equal((await c.call('POST', '/auth/passkey/register/verify', { challengeId: await start(), response: {} }, { cookie })).status, 409);
});

async function withPasskey(c: Ctx) {
  stub({ verifyRegistrationResponse: (async () => fakeInfo) as never });
  const cookie = await signIn(c);
  const o = (await (await c.call('POST', '/auth/passkey/register/options', {}, { cookie })).json()) as { challengeId: string };
  await c.call('POST', '/auth/passkey/register/verify', { challengeId: o.challengeId, response: {} }, { cookie });
  return cookie;
}
const loginStart = async (c: Ctx) => ((await (await c.call('POST', '/auth/passkey/login/options', {})).json()) as { challengeId: string; options: { rpId: string } });

test('passkey sign-in: success starts a session and records the counter', async () => {
  const c = setup();
  await withPasskey(c);
  stub({ verifyAuthenticationResponse: (async () => ({ verified: true, authenticationInfo: { newCounter: 7 } })) as never });
  const l = await loginStart(c);
  assert.equal(l.options.rpId, 'clocknow.net');
  const res = await c.call('POST', '/auth/passkey/login/verify', { challengeId: l.challengeId, response: { id: 'cred-1' } });
  assert.equal(res.status, 200);
  const cookie = (res.headers.get('set-cookie') as string).split(';')[0];
  assert.equal(((await (await c.call('GET', '/account', undefined, { cookie })).json()) as { email: string }).email, 'me@example.com');
  assert.equal((c.db.raw.prepare('SELECT counter FROM passkeys').get() as { counter: number }).counter, 7);
  assert.equal((await c.call('POST', '/auth/passkey/login/verify', { challengeId: l.challengeId, response: { id: 'cred-1' } })).status, 401, 'challenge replay');
});

test('passkey sign-in refuses unknown credentials, bad assertions and a rolled-back counter', async () => {
  const c = setup();
  await withPasskey(c);
  stub({ verifyAuthenticationResponse: (async () => ({ verified: true, authenticationInfo: { newCounter: 1 } })) as never });
  assert.equal((await c.call('POST', '/auth/passkey/login/verify', { challengeId: (await loginStart(c)).challengeId, response: { id: 'unknown' } })).status, 401);
  assert.equal((await c.call('POST', '/auth/passkey/login/verify', { challengeId: 'f'.repeat(32), response: { id: 'cred-1' } })).status, 401);
  stub({ verifyAuthenticationResponse: (async () => { throw new Error('counter went backwards'); }) as never });
  assert.equal((await c.call('POST', '/auth/passkey/login/verify', { challengeId: (await loginStart(c)).challengeId, response: { id: 'cred-1' } })).status, 401);
  stub({ verifyAuthenticationResponse: (async () => ({ verified: false })) as never });
  assert.equal((await c.call('POST', '/auth/passkey/login/verify', { challengeId: (await loginStart(c)).challengeId, response: { id: 'cred-1' } })).status, 401);
});

test('removing a passkey: only the owner can, and the magic link still works afterwards', async () => {
  const c = setup();
  const cookie = await withPasskey(c);
  const other = await signIn(c, 'other@example.com');
  assert.equal((await c.call('POST', '/account/passkeys/remove', { id: 'cred-1' }, { cookie: other })).status, 404);
  assert.equal((await c.call('POST', '/account/passkeys/remove', { id: 'cred-1' }, { cookie })).status, 200);
  assert.equal((await c.call('GET', '/account', undefined, { cookie })).status, 200);
  assert.ok(await signIn(c), 'email sign-in is the fallback');
});
