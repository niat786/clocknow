import { test } from 'node:test';
import assert from 'node:assert/strict';
import { H, HORIZON_Y, W, pathOf, xOf, yOf } from './sun-arc-math.ts';

test('mapping', () => {
  assert.equal(xOf(0), 0);
  assert.equal(xOf(1), W);
  assert.equal(xOf(2), W);
  assert.equal(yOf(90), 8);
  assert.equal(yOf(-30), H - 8);
  assert.equal(yOf(-80), H - 8);
  assert.ok(HORIZON_Y > yOf(45) && HORIZON_Y < yOf(-10));
});

test('path', () => {
  assert.equal(pathOf([[0, 0], [0.5, 90]]), `M0.0 ${HORIZON_Y.toFixed(1)} L150.0 8.0`);
});
