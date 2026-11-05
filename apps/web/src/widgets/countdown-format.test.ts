import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, parseCountdownParams, splitRemaining } from './countdown-format.ts';

test('parses a valid link', () => {
  assert.deepEqual(parseCountdownParams('?t=1766602800&z=Asia%2FKarachi&n=Eid'), {
    target: 1766602800,
    zone: 'Asia/Karachi',
    title: 'Eid',
  });
});

test('rejects bad or missing instants', () => {
  for (const s of ['', '?t=', '?t=abc', '?t=-5', '?t=0', '?t=99999999999', '?t=1.5', '?n=x'])
    assert.equal(parseCountdownParams(s), null, s);
});

test('sanitizes zone and title', () => {
  const p = parseCountdownParams('?t=100&z=%3Cscript%3E&n=%07%20%20Hello%0A' + 'x'.repeat(200));
  assert.equal(p?.zone, 'UTC');
  assert.equal(p?.title.startsWith('Hello'), true);
  assert.equal(p?.title.length, 80);
});

test('buildQuery round-trips', () => {
  const q = buildQuery({ t: 1766602800, z: 'Asia/Karachi', n: ' Eid & fun ' });
  assert.deepEqual(parseCountdownParams('?' + q), { target: 1766602800, zone: 'Asia/Karachi', title: 'Eid & fun' });
  assert.equal(buildQuery({ t: 5, z: 'UTC', n: '  ' }), 't=5&z=UTC');
});

test('splitRemaining', () => {
  assert.deepEqual(splitRemaining(90_061_000), { days: 1, hours: 1, minutes: 1, seconds: 1, done: false });
  assert.deepEqual(splitRemaining(1), { days: 0, hours: 0, minutes: 0, seconds: 1, done: false });
  assert.deepEqual(splitRemaining(0), { days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  assert.equal(splitRemaining(-500).done, true);
});
