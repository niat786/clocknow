// Run: node --test src/widgets/clock-format.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallParts, formatHM, formatSS, formatError, formatAgo, intlOffsetSeconds, pill } from './clock-format.ts';

const KARACHI = 5 * 3600;
const at = Date.UTC(2026, 10, 5, 17, 8, 41, 250); // 22:08:41.250 PKT

test('wall parts at a fixed offset', () => {
  assert.deepEqual(wallParts(at, KARACHI), { y: 2026, mo: 11, d: 5, h: 22, m: 8, s: 41 });
});

test('24 h and 12 h formatting', () => {
  const p = wallParts(at, KARACHI);
  assert.deepEqual(formatHM(p, false), { hm: '22:08', period: '' });
  assert.deepEqual(formatHM(p, true), { hm: '10:08', period: 'PM' });
  assert.deepEqual(formatHM({ ...p, h: 0 }, true), { hm: '12:08', period: 'AM' });
  assert.equal(formatSS(p), ':41');
});

test('error and age labels', () => {
  assert.equal(formatError(0.4), '±<1 ms');
  assert.equal(formatError(8.4), '±8 ms');
  assert.equal(formatError(2400), '±2.4 s');
  assert.equal(formatAgo(12_900), '12 s ago');
  assert.equal(formatAgo(185_000), '3 min ago');
});

test('intl fallback offset', () => {
  assert.equal(intlOffsetSeconds('Asia/Karachi', at), KARACHI);
  assert.equal(intlOffsetSeconds('Asia/Kathmandu', at), 5 * 3600 + 45 * 60);
  assert.equal(intlOffsetSeconds('America/New_York', at), -5 * 3600);
});

test('pill states', () => {
  assert.equal(pill('syncing', null, 0).state, 'syncing');
  assert.equal(pill('failed', null, 0).state, 'offline');
  const locked = { offset_ms: 3, error_ms: 8, drift_ppm: 0, state: 'Locked' as const, samples_used: 4 };
  assert.deepEqual(pill('ready', locked, 12_000), { state: 'locked', text: 'Locked · ±8 ms · synced 12 s ago' });
  assert.equal(pill('ready', { ...locked, state: 'Drifting', error_ms: 140 }, 0).state, 'drifting');
});
