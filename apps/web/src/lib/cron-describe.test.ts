import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCron } from './cron-describe.ts';
import type { CronFields } from '../engine/types.ts';

const range = (a: number, b: number, s = 1) => Array.from({ length: Math.floor((b - a) / s) + 1 }, (_, i) => a + i * s);
const f = (o: Partial<CronFields>): CronFields => ({
  minutes: range(0, 59), hours: range(0, 23), days: range(1, 31), months: range(1, 12), weekdays: range(0, 6), days_any: true, weekdays_any: true, ...o,
});

test('describes common schedules', () => {
  assert.equal(describeCron(f({})), 'Every minute.');
  assert.equal(describeCron(f({ minutes: range(0, 59, 15) })), 'Every 15 minutes.');
  assert.equal(describeCron(f({ minutes: [0] })), 'Every hour, on the hour.');
  assert.equal(describeCron(f({ minutes: [30], hours: [9], weekdays: range(1, 5), weekdays_any: false })), 'At 09:30, on weekdays (Monday to Friday).');
  assert.equal(describeCron(f({ minutes: [0], hours: [0], days: [1], days_any: false })), 'At 00:00, on the 1st of the month.');
  assert.equal(describeCron(f({ minutes: range(0, 59, 5), hours: range(9, 17) })), 'Every 5 minutes, between 09:00 and 17:59.');
  assert.equal(describeCron(f({ minutes: [0], hours: range(0, 23, 6) })), 'At 00:00, 06:00, 12:00 and 18:00.');
  assert.equal(describeCron(f({ minutes: [5], hours: range(0, 23, 2) })), 'Every 2 hours at 05 minutes past (00:05, 02:05, 04:05 and 06:05 …).');
  assert.equal(describeCron(f({ minutes: [0], hours: [0], days: [13], days_any: false, weekdays: [5], weekdays_any: false })), 'At 00:00, on the 13th of the month and also on Fridays.');
  assert.equal(describeCron(f({ minutes: [0], hours: [12], months: [1, 7] })), 'At 12:00, in January and July.');
  assert.equal(describeCron(f({ minutes: [15, 45], hours: [8, 20] })), 'At 08:15, 08:45, 20:15 and 20:45.');
  assert.equal(describeCron(f({ minutes: [0, 30], hours: [2] })), 'At 02:00 and 02:30.');
  assert.equal(describeCron(f({ minutes: range(0, 59, 10), hours: [2] })), 'Every 10 minutes, between 02:00 and 02:59.');
});
