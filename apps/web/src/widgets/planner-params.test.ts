import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerQuery, formatMinutes, isZoneToken, parseMinutes, parsePlannerParams } from './planner-params.ts';

test('minutes parse and format', () => {
  assert.equal(parseMinutes('09:30'), 570);
  assert.equal(parseMinutes('24:00'), null);
  assert.equal(parseMinutes('9:30'), null);
  assert.equal(formatMinutes(570), '09:30');
  assert.equal(formatMinutes(0), '00:00');
});

test('parses a share link', () => {
  const p = parsePlannerParams('?c=karachi,America%2FNew_York,london&d=2026-11-10&m=45&ws=08:00&we=18:30');
  assert.deepEqual(p.tokens, ['karachi', 'America/New_York', 'london']);
  assert.equal(p.date, '2026-11-10');
  assert.equal(p.duration, 45);
  assert.deepEqual([p.start, p.end], [480, 1110]);
});

test('bad input falls back to defaults', () => {
  const p = parsePlannerParams('?c=<script>,ok,a b&d=tomorrow&m=5&ws=09:00&we=09:00');
  assert.deepEqual(p.tokens, ['ok']);
  assert.equal(p.date, null);
  assert.equal(p.duration, 60);
  assert.deepEqual([p.start, p.end], [540, 1020]);
  assert.deepEqual(parsePlannerParams('').tokens, []);
});

test('at most 10 people', () => {
  const c = Array.from({ length: 14 }, (_, i) => `city${i}`).join(',');
  assert.equal(parsePlannerParams(`?c=${c}`).tokens.length, 10);
});

test('build and parse round-trip', () => {
  const p = { tokens: ['karachi', 'Europe/London'], date: '2026-11-10', duration: 90, start: 540, end: 1020 };
  assert.deepEqual(parsePlannerParams(`?${buildPlannerQuery(p)}`), p);
  assert.equal(isZoneToken('Europe/London'), true);
  assert.equal(isZoneToken('UTC'), true);
  assert.equal(isZoneToken('karachi'), false);
});
