import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampInt, formatStopwatch, formatTimer, toMs } from './duration-format.ts';

test('stopwatch format', () => {
  assert.equal(formatStopwatch(0), '00:00.00');
  assert.equal(formatStopwatch(61_230), '01:01.23');
  assert.equal(formatStopwatch(3_723_450), '1:02:03.45');
  assert.equal(formatStopwatch(-5), '00:00.00');
});

test('timer format rounds up', () => {
  assert.equal(formatTimer(0), '00:00:00');
  assert.equal(formatTimer(1), '00:00:01');
  assert.equal(formatTimer(61_000), '00:01:01');
  assert.equal(formatTimer(359_999_000), '99:59:59');
});

test('toMs and clamp', () => {
  assert.equal(toMs(0, 1, 30), 90_000);
  assert.equal(toMs(0, 0, 90), 90_000);
  assert.equal(toMs(500, 0, 0), 359_999_000);
  assert.equal(clampInt(Number.NaN, 59), 0);
  assert.equal(clampInt(-3, 59), 0);
  assert.equal(clampInt(2.9, 59), 2);
});

test('formatMmSs', async () => {
  const { formatMmSs } = await import('./duration-format.ts');
  assert.equal(formatMmSs(0), '00:00');
  assert.equal(formatMmSs(1), '00:01');
  assert.equal(formatMmSs(25 * 60_000), '25:00');
  assert.equal(formatMmSs(3_600_000), '1:00:00');
  assert.equal(formatMmSs(3_661_000), '1:01:01');
  assert.equal(formatMmSs(-5), '00:00');
});
