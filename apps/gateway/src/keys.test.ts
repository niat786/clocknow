import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKey, isEmail, isKey, keyFromHeaders, keyPrefix, sha256Hex } from './keys.ts';

test('generated keys have the documented shape and are unique', () => {
  const a = generateKey();
  assert.match(a, /^ck_live_[A-Za-z0-9_-]{32}$/);
  assert.ok(isKey(a));
  assert.notEqual(a, generateKey());
  assert.equal(generateKey(() => new Uint8Array(24)), 'ck_live_' + 'A'.repeat(32));
});

test('isKey rejects look-alikes', () => {
  assert.equal(isKey('ck_live_short'), false);
  assert.equal(isKey('ck_test_' + 'A'.repeat(32)), false);
  assert.equal(isKey('ck_live_' + 'A'.repeat(31) + '!'), false);
  assert.equal(isKey(' ck_live_' + 'A'.repeat(32)), false);
});

test('sha256 matches a known vector', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('key is read from Bearer or X-API-Key', () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(keyFromHeaders(h({ authorization: 'Bearer abc' })), 'abc');
  assert.equal(keyFromHeaders(h({ authorization: 'bearer abc' })), 'abc');
  assert.equal(keyFromHeaders(h({ 'x-api-key': ' abc ' })), 'abc');
  assert.equal(keyFromHeaders(h({ authorization: 'Basic abc' })), undefined);
  assert.equal(keyFromHeaders(h({})), undefined);
});

test('prefix never reveals the secret part', () => {
  assert.equal(keyPrefix('ck_live_ABCDEFGH' + 'x'.repeat(24)), 'ck_live_ABCD');
});

test('emails', () => {
  assert.ok(isEmail('a@b.co'));
  for (const bad of ['', 'a@b', 'a b@c.com', '@c.com', 'a@b.c']) assert.equal(isEmail(bad), false, bad);
});
