import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HOLIDAYS, WEEKENDS, dayKey, describeSpan, formatCivil, formatIsoUtc, formatZoneTime,
  isWeekendKey, parseCivil, parseHolidays, parseTime,
} from './convert-params.ts';

const zt = { zone: 'UTC', year: 2026, month: 11, day: 6, hour: 9, minute: 5, second: 7, millisecond: 42, weekday: 5, offset_seconds: 0, abbreviation: 'UTC', is_dst: false };

test('parseCivil checks shape only', () => {
  assert.deepEqual(parseCivil('2026-11-06'), { year: 2026, month: 11, day: 6 });
  assert.deepEqual(parseCivil(' 2023-02-29 '), { year: 2023, month: 2, day: 29 });
  assert.equal(parseCivil('2026-1-6'), null);
  assert.equal(parseCivil('06/11/2026'), null);
  assert.equal(formatCivil({ year: 987, month: 3, day: 4 }), '0987-03-04');
});

test('parseTime accepts HH:MM and HH:MM:SS', () => {
  assert.deepEqual(parseTime('09:30'), { hour: 9, minute: 30, second: 0 });
  assert.deepEqual(parseTime('23:59:58'), { hour: 23, minute: 59, second: 58 });
  assert.equal(parseTime('9:30'), null);
  assert.equal(parseTime(''), null);
});

test('parseHolidays splits on separators and reports bad tokens', () => {
  const r = parseHolidays('2026-12-25, 2026-12-26;2027-01-01\nnope 2026-13');
  assert.equal(r.dates.length, 3);
  assert.deepEqual(r.bad, ['nope', '2026-13']);
  assert.equal(r.tooMany, false);
  assert.deepEqual(parseHolidays(''), { dates: [], bad: [], tooMany: false });
});

test('parseHolidays caps the list', () => {
  const many = Array.from({ length: MAX_HOLIDAYS + 5 }, () => '2026-01-01').join(' ');
  const r = parseHolidays(many);
  assert.equal(r.dates.length, MAX_HOLIDAYS);
  assert.equal(r.tooMany, true);
});

test('weekend presets are time-core masks', () => {
  assert.equal(WEEKENDS['sat-sun'], 96);
  assert.equal(WEEKENDS['fri-sat'], 48);
  assert.equal(WEEKENDS.none, 0);
  assert.equal(isWeekendKey('fri'), true);
  assert.equal(isWeekendKey('toString'), false);
});

test('formatting', () => {
  assert.equal(formatZoneTime(zt), '2026-11-06 09:05:07');
  assert.equal(formatIsoUtc(zt), '2026-11-06T09:05:07.042Z');
  assert.ok(dayKey({ year: 2026, month: 11, day: 7 }) > dayKey({ year: 2026, month: 11, day: 6 }));
});

test('describeSpan pluralises and skips zeros', () => {
  assert.equal(describeSpan({ years: 26, months: 10, days: 5 }), '26 years, 10 months, 5 days');
  assert.equal(describeSpan({ years: 1, months: 0, days: 1 }), '1 year, 1 day');
  assert.equal(describeSpan({ years: 0, months: 0, days: 0 }), '0 days');
});
