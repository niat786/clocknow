import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, nextIndex } from './day-count.ts';

test('days between dates', () => {
  assert.equal(daysBetween('2026-11-06', '2026-12-25'), 49);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2028-03-01', '2028-02-28'), -2);
});

test('next date', () => {
  const d = ['2026-01-01', '2026-03-20', '2026-12-25'];
  assert.equal(nextIndex(d, '2026-03-20'), 1);
  assert.equal(nextIndex(d, '2026-03-21'), 2);
  assert.equal(nextIndex(d, '2027-01-01'), -1);
});
