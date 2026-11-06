import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curlExample, looksLikeEmail, tokenFromHash } from './dev-signup.ts';

test('token is read only from a well-formed fragment', () => {
  const t = 'a'.repeat(64);
  assert.equal(tokenFromHash(`#token=${t}`), t);
  assert.equal(tokenFromHash(`#token=${t}&x=1`), undefined);
  assert.equal(tokenFromHash('#token=short'), undefined);
  assert.equal(tokenFromHash(`#token=${'g'.repeat(64)}`), undefined);
  assert.equal(tokenFromHash(''), undefined);
});

test('email check', () => {
  assert.ok(looksLikeEmail('me@example.com'));
  assert.equal(looksLikeEmail('me@example'), false);
});

test('curl example', () => {
  assert.equal(curlExample('/v1/zone?tz=Asia/Karachi'), 'curl "https://api.clocknow.net/v1/zone?tz=Asia/Karachi"');
  assert.match(curlExample('/v1/sun', 'ck_live_x'), /-H "Authorization: Bearer ck_live_x"/);
});
