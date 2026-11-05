import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64urlDecode, b64urlEncode, message, newNonce, parseKeys, parseSigned, verifySigned } from './signed-time.ts';

// Same golden vector as apps/api/src/signed.rs (RFC 8032 test key 1).
const GOLDEN = { v: 1, kid: 'test', t: 1793929327182, radius_ms: 100, nonce: 'abc_-123', server: 'fly-sin-abc123', sig: 'F_Q0B9s2zyXPZ8iUJTu-tcGerFPbjy1m9fmAH9X2L56SipOTcfpg8bne0YOJAWZks03XNulSkvObhoVm2TAhBQ' };
const KEYS = { context: 'clocknow-signed-time-v1', keys: [{ kid: 'test', alg: 'Ed25519', public_key: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo', status: 'current' }] };

test('message bytes match the server', () => {
  assert.equal(new TextDecoder().decode(message(GOLDEN)), 'clocknow-signed-time-v1\nkid=test\nt=1793929327182\nradius=100\nnonce=abc_-123\nserver=fly-sin-abc123');
});

test('golden vector verifies', async () => {
  const st = parseSigned(GOLDEN);
  assert.ok(st);
  const v = await verifySigned(st, parseKeys(KEYS), 'abc_-123');
  assert.deepEqual(v.ok, true);
});

test('tampering, wrong nonce and unknown keys fail', async () => {
  const keys = parseKeys(KEYS);
  assert.deepEqual(await verifySigned({ ...GOLDEN, t: GOLDEN.t + 1 }, keys), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(await verifySigned({ ...GOLDEN, radius_ms: 1 }, keys), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(await verifySigned(GOLDEN, keys, 'other'), { ok: false, reason: 'nonce_mismatch' });
  assert.deepEqual(await verifySigned({ ...GOLDEN, kid: 'nope' }, keys), { ok: false, reason: 'unknown_key' });
  assert.deepEqual(await verifySigned({ ...GOLDEN, sig: 'AAAA' }, keys), { ok: false, reason: 'malformed' });
});

test('parsing rejects bad shapes', () => {
  assert.equal(parseSigned(null), null);
  assert.equal(parseSigned({ ...GOLDEN, v: 2 }), null);
  assert.equal(parseSigned({ ...GOLDEN, t: 1.5 }), null);
  assert.equal(parseSigned({ ...GOLDEN, nonce: 'a b' }), null);
  assert.equal(parseSigned({ ...GOLDEN, kid: '' }), null);
  assert.deepEqual(parseKeys({ context: 'other', keys: KEYS.keys }), []);
  assert.deepEqual(parseKeys({ context: KEYS.context, keys: [{ kid: 'x', alg: 'RSA', public_key: 'a', status: 'current' }] }), []);
});

test('base64url and nonces', () => {
  assert.equal(b64urlEncode(new Uint8Array([0xfb, 0xff])), '-_8');
  assert.deepEqual(b64urlDecode('-_8'), new Uint8Array([0xfb, 0xff]));
  assert.equal(b64urlDecode('a+b'), null);
  assert.equal(b64urlDecode('a'), null);
  const n = newNonce();
  assert.match(n, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(n, newNonce());
});
