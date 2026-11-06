import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockMinutes, decimalHours, formatHMS, parseDuration, shiftSeconds, sumLines } from './hours-calc.ts';

test('parses durations', () => {
  assert.equal(parseDuration('8:45'), 31500);
  assert.equal(parseDuration('+6:30'), 23400);
  assert.equal(parseDuration('-0:45'), -2700);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('1h 20m'), 4800);
  assert.equal(parseDuration('90 min'), 5400);
  assert.equal(parseDuration('2.5h'), 9000);
  assert.equal(parseDuration('2.5'), 9000);
  assert.equal(parseDuration('45s'), 45);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration('1h banana'), null);
  assert.equal(parseDuration('8:75'), null);
});

test('formats', () => {
  assert.equal(formatHMS(52200), '14:30');
  assert.equal(formatHMS(-2700), '-0:45');
  assert.equal(formatHMS(360309), '100:05:09');
  assert.equal(decimalHours(52200), '14.50');
  assert.equal(decimalHours(1200), '0.33');
});

test('shifts', () => {
  assert.equal(clockMinutes('9:05'), 545);
  assert.equal(clockMinutes('24:00'), null);
  assert.equal(shiftSeconds('09:00', '17:30', 30), 8 * 3600);
  assert.equal(shiftSeconds('22:00', '06:00', 0), 8 * 3600);
  assert.equal(shiftSeconds('09:00', '09:10', 30), null);
  assert.equal(shiftSeconds('9', '17:00', 0), null);
});

test('sums lines', () => {
  assert.deepEqual(sumLines('08:45\n+06:30\n-00:45\n\nfoo'), { total: 52200, bad: ['foo'], count: 3 });
});
