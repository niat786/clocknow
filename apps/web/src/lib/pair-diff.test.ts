import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSegments, hourTable, relation, zoneDate } from './pair-diff.ts';
import type { ZoneTable } from './city-facts.ts';

const H = 3600;
// London-like and New-York-like zones for one year; changes at made-up instants 100, 200, 300, 400.
const lon: ZoneTable = { '2026': { start_offset: 0, start_abbr: 'GMT', changes: [{ at: 200, before: 0, after: H, abbr: 'BST' }, { at: 400, before: H, after: 0, abbr: 'GMT' }] } };
const ny: ZoneTable = { '2026': { start_offset: -5 * H, start_abbr: 'EST', changes: [{ at: 100, before: -5 * H, after: -4 * H, abbr: 'EDT' }, { at: 300, before: -4 * H, after: -5 * H, abbr: 'EST' }] } };

test('segments where the gap changes', () => {
  assert.deepEqual(diffSegments(lon, ny, 0, 500), [
    { start: 0, end: 100, diff: -5 * H },
    { start: 100, end: 200, diff: -4 * H },
    { start: 200, end: 300, diff: -5 * H },
    { start: 300, end: 400, diff: -6 * H },
    { start: 400, end: 500, diff: -5 * H },
  ]);
  assert.deepEqual(diffSegments(lon, lon, 0, 500), [{ start: 0, end: 500, diff: 0 }]);
});

test('hour table wraps days and marks shared working hours', () => {
  const t = hourTable(5.5 * H);
  assert.deepEqual(t[0], { a: 0, b: 330, day: 0, work: false });
  assert.deepEqual(t[20], { a: 1200, b: 90, day: 1, work: false });
  assert.equal(t[9]?.work, true);
  assert.equal(t[13]?.work, false);
  assert.equal(hourTable(-5 * H)[2]?.day, -1);
});

test('wording', () => {
  assert.equal(relation(5 * H), '5 hours ahead of');
  assert.equal(relation(-1800), '30 minutes behind');
  assert.equal(relation(5.75 * H), '5 hours 45 minutes ahead of');
  assert.equal(relation(0), 'the same time as');
  assert.equal(zoneDate({ '2026': { start_offset: 5 * H, start_abbr: 'PKT', changes: [] } }, Date.UTC(2026, 2, 7, 22)), '8 March 2026');
});
