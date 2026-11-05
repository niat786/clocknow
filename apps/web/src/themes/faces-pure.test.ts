import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIGIT_SEGMENTS } from './segment-map.ts';
import { GLYPHS, layout } from './matrix-font.ts';
import { forward, handAngles } from './analog-math.ts';

test('seven-segment map', () => {
  assert.equal(Object.keys(DIGIT_SEGMENTS).length, 10);
  assert.equal(DIGIT_SEGMENTS['8'], 'abcdefg');
  assert.equal(DIGIT_SEGMENTS['1'], 'bc');
  // every digit uses only real segments and no digit repeats another's pattern
  for (const v of Object.values(DIGIT_SEGMENTS)) assert.match(v, /^[a-g]+$/);
  assert.equal(new Set(Object.values(DIGIT_SEGMENTS)).size, 10);
});

test('dot-matrix glyphs and layout', () => {
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, 7, ch);
    assert.ok(rows.every((r) => r.length === rows[0].length && /^[01]+$/.test(r)), ch);
  }
  const g = layout('12:34');
  assert.equal(g.length, 7);
  assert.equal(g[0].length, 4 * 5 + 1 + 4); // four digits, a 1-column colon, four gaps
  assert.ok(g.every((r) => r.length === g[0].length));
  assert.equal(layout('88:88:88')[0].length, 6 * 5 + 2 + 7);
});

test('analog hand angles', () => {
  assert.deepEqual(handAngles(0, 0, 0), { hour: 0, minute: 0, second: 0 });
  assert.deepEqual(handAngles(3, 0, 0), { hour: 90, minute: 0, second: 0 });
  assert.deepEqual(handAngles(15, 30, 0), { hour: 105, minute: 180, second: 0 });
  assert.equal(handAngles(0, 0, 30).second, 180);
});

test('hands only move forward', () => {
  assert.equal(forward(354, 0), 360);
  assert.equal(forward(360, 6), 366);
  assert.equal(forward(10, 10), 10);
  assert.equal(forward(714, 0), 720);
});
