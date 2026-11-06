import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice, receiptText } from './device-offset.ts';

test('describes how far the device clock is from true time', () => {
  assert.equal(describeDevice(1420), 'Your device clock is 1.42 s fast');
  assert.equal(describeDevice(-380), 'Your device clock is 380 ms slow');
  assert.equal(describeDevice(-12_340), 'Your device clock is 12.34 s slow');
  assert.equal(describeDevice(125_000), 'Your device clock is 2 min 5 s fast');
  assert.equal(describeDevice(3), 'Your device clock agrees with UTC to within 5 ms');
  assert.equal(describeDevice(-4.9), 'Your device clock agrees with UTC to within 5 ms');
});

test('builds a receipt that keeps the signed response untouched', () => {
  const response = { v: 1, kid: 'k1', t: 1762419543123, radius_ms: 3, nonce: 'abc', server: 'edge1', sig: 'zzz' };
  const text = receiptText({
    checkedAt: '2026-11-06T16:00:00.000Z',
    nonce: 'abc',
    requestUrl: 'https://api.clocknow.net/v1/signed?nonce=abc',
    keysUrl: 'https://api.clocknow.net/.well-known/clocknow-keys.json',
    response,
    kid: 'k1',
    keyStatus: 'active',
    deviceAheadMs: 1420,
    networkMs: 12,
  });
  const r = JSON.parse(text);
  assert.deepEqual(r.response, response);
  assert.equal(r.verified_in_browser, true);
  assert.equal(r.device_clock_ahead_ms, 1420);
  assert.match(r.how_to_verify, /clocknow-signed-time-v1/);
  assert.ok(text.endsWith('\n'));
});
