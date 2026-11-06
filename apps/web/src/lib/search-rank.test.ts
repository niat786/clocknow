import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, rank, type Entry } from './search-rank.ts';

const E: Entry[] = [
  { title: 'Timer', hint: 'Timers', href: '/timer', kind: 'page' },
  { title: 'Time zone converter', hint: 'Tools', href: '/time-zone-converter', kind: 'page' },
  { title: 'Karachi, Pakistan', hint: 'Asia/Karachi', href: '/time/karachi', kind: 'city' },
  { title: 'Zürich, Switzerland', hint: 'Europe/Zurich', href: '/time/zurich', kind: 'city' },
  { title: 'Timbuktu, Mali', hint: 'Africa/Bamako', href: '/time/timbuktu', kind: 'city' },
];

test('accent folding', () => {
  assert.equal(fold('Zürich'), 'zurich');
  assert.equal(rank(E, 'zur')[0].href, '/time/zurich');
});

test('pages first, then prefix before substring', () => {
  assert.deepEqual(rank(E, 'tim').map((e) => e.href), ['/timer', '/time-zone-converter', '/time/timbuktu']);
  assert.deepEqual(rank(E, 'converter').map((e) => e.href), ['/time-zone-converter']);
  assert.equal(rank(E, 'pakistan')[0].href, '/time/karachi');
  assert.equal(rank(E, 'asia/kar')[0].href, '/time/karachi');
});

test('empty query lists pages only and limit applies', () => {
  assert.ok(rank(E, '').every((e) => e.kind === 'page'));
  assert.equal(rank(E, 'i', 2).length, 2);
  assert.deepEqual(rank(E, 'qqq'), []);
});
