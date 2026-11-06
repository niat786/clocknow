import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeShortDiff, isWorkHour } from './world-format.ts';

test('short offsets', () => {
  assert.equal(describeShortDiff(4 * 3600), '+4h');
  assert.equal(describeShortDiff(-5 * 3600), '−5h');
  assert.equal(describeShortDiff(5.5 * 3600), '+5:30h');
  assert.equal(describeShortDiff(-(3 * 3600 + 45 * 60)), '−3:45h');
  assert.equal(describeShortDiff(0), '±0');
});

test('work hours', () => {
  assert.equal(isWorkHour(9), true);
  assert.equal(isWorkHour(16), true);
  assert.equal(isWorkHour(17), false);
  assert.equal(isWorkHour(8), false);
});
