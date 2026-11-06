import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellText, isSummary } from './perf-summary.ts';

test('no data is stated plainly, never invented', () => {
  assert.deepEqual(cellText(null), { text: 'Not enough data yet', state: 'none' });
  assert.equal(cellText(undefined).state, 'none');
});

test('a number says how many visits it rests on and whether the target is met', () => {
  const c = { p75: '812 ms', n: 1234, good_share: 0.99, target: '1000 ms', meets_target: true };
  assert.deepEqual(cellText(c), { text: '812 ms (1,234 visits)', state: 'ok' });
  assert.equal(cellText({ ...c, meets_target: false }).state, 'over');
});

test('only well-formed summaries are accepted', () => {
  assert.ok(isSummary({ days: 7, metrics: { phone: {}, desktop: {} } }));
  assert.equal(isSummary(null), false);
  assert.equal(isSummary({ metrics: { phone: {} } }), false);
  assert.equal(isSummary('x'), false);
});
