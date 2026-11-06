import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, isFirstPartyFree, isOpenPath, period, quotaHeaders, resetAtMs } from './limits.ts';

const NOV = Date.UTC(2026, 10, 7, 12);

test('period and reset are calendar months in UTC', () => {
  assert.equal(period(NOV), '2026-11');
  assert.equal(period(Date.UTC(2026, 11, 31, 23, 59, 59)), '2026-12');
  assert.equal(resetAtMs(NOV), Date.UTC(2026, 11, 1));
  assert.equal(resetAtMs(Date.UTC(2026, 11, 31)), Date.UTC(2027, 0, 1));
});

test('the limit itself is allowed, one more is not', () => {
  assert.deepEqual(decide('free', 10_000), { allowed: true, limit: 10_000, remaining: 0 });
  assert.equal(decide('free', 10_001).allowed, false);
  assert.equal(decide('developer', 10_001).allowed, true);
});

test('enterprise is not metered here', () => {
  assert.deepEqual(decide('enterprise', 9e9), { allowed: true, limit: null, remaining: null });
});

test('headers: Retry-After only when blocked, whole seconds until the reset', () => {
  const ok = quotaHeaders(decide('free', 5), 'free', NOV);
  assert.equal(ok['x-ratelimit-remaining'], '9995');
  assert.equal(ok['retry-after'], undefined);
  const no = quotaHeaders(decide('free', 10_001), 'free', NOV);
  assert.equal(no['retry-after'], String((Date.UTC(2026, 11, 1) - NOV) / 1000));
  assert.equal(no['x-ratelimit-remaining'], '0');
});

test('open paths and first-party exemptions', () => {
  assert.ok(isOpenPath('/v1/convert'));
  assert.equal(isOpenPath('/v1/sun'), false);
  assert.ok(isOpenPath('/v1/signed'), 'anyone can audit signed time');
  assert.equal(isOpenPath('/v1/moon'), false);
  assert.ok(isFirstPartyFree('/v1/sync'));
  assert.equal(isFirstPartyFree('/v1/convert'), false);
});
