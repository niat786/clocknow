import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellText, countdown, instantsOf, nextPrayer } from './prayer-table.ts';

test('cells and countdown', () => {
  assert.equal(cellText({ hour: 5, minute: 7 }), '05:07');
  assert.equal(cellText({ hour: 0, minute: 30 }, true), '00:30*');
  assert.equal(cellText(null), '—');
  assert.equal(countdown(3_909_000), '1:05:09');
  assert.equal(countdown(750_400), '12:30');
  assert.equal(countdown(-5), '0:00');
});

test('next prayer skips sunrise and missing times', () => {
  const t = instantsOf({ fajr: 100, sunrise: 200, dhuhr: 300, asr: null, maghrib: 500, isha: 600, adjusted: false });
  assert.deepEqual(t, [100, 200, 300, null, 500, 600]);
  assert.equal(nextPrayer(t, 50), 0);
  assert.equal(nextPrayer(t, 150), 2);
  assert.equal(nextPrayer(t, 350), 4);
  assert.equal(nextPrayer(t, 700), -1);
});
