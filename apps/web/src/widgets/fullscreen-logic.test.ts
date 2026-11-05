import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIFT_PX, parseFs, pixelShift, shouldAutoOled } from './fullscreen-logic.ts';

test('parseFs', () => {
  for (const s of ['?fs', '?fs=1', '?fs=true', '?a=1&fs=yes']) assert.equal(parseFs(s), true, s);
  for (const s of ['', '?', '?fs=0', '?fs=false', '?FS=1', '?x=1']) assert.equal(parseFs(s), false, s);
});

test('pixel shift stays within bounds and visits 9 distinct spots', () => {
  const seen = new Set<string>();
  for (let m = 0; m < 9; m++) {
    const { x, y } = pixelShift(m);
    assert.ok(Math.abs(x) <= SHIFT_PX && Math.abs(y) <= SHIFT_PX);
    seen.add(`${x},${y}`);
  }
  assert.equal(seen.size, 9);
});

test('pixel shift cycles every 9 minutes and handles odd input', () => {
  assert.deepEqual(pixelShift(5), pixelShift(14));
  assert.deepEqual(pixelShift(5.9), pixelShift(5));
  const neg = pixelShift(-1);
  assert.ok(Math.abs(neg.x) <= SHIFT_PX && Math.abs(neg.y) <= SHIFT_PX);
  assert.deepEqual(pixelShift(-1), pixelShift(8));
});

test('consecutive shifts are never the same spot', () => {
  for (let m = 0; m < 30; m++) assert.notDeepEqual(pixelShift(m), pixelShift(m + 1));
});

test('auto OLED only on Auto theme with a dark system', () => {
  assert.equal(shouldAutoOled(null, true), true);
  assert.equal(shouldAutoOled('', true), true);
  assert.equal(shouldAutoOled('night', true), false);
  assert.equal(shouldAutoOled('light', true), false);
  assert.equal(shouldAutoOled(null, false), false);
});
