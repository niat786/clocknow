import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, icsDate, icsEscape, icsFold } from './ics.ts';

const at = (h: number, mi = 0) => ({ year: 2026, month: 11, day: 10, hour: h, minute: mi, second: 0 });

test('date format', () => {
  assert.equal(icsDate(at(9, 5)), '20261110T090500Z');
});

test('escaping', () => {
  assert.equal(icsEscape('Plan; A, B\\C'), 'Plan\\; A\\, B\\\\C');
  assert.equal(icsEscape('x\r\nATTENDEE:evil'), 'x\\nATTENDEE:evil'.replace('\\n', '\\n'));
  assert.ok(!icsEscape('line1\nline2').includes('\n'));
});

test('folding at 75 octets', () => {
  const folded = icsFold('X'.repeat(200));
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), 'X'.repeat(200));
  assert.equal(icsFold('short'), 'short');
});

test('folding never splits a multi-byte character', () => {
  const folded = icsFold('é'.repeat(80));
  assert.equal(folded.replace(/\r\n /g, ''), 'é'.repeat(80));
});

test('event structure', () => {
  const s = buildIcs({ title: 'Sync, weekly', uid: 'abc-1@clocknow.net', start: at(9), end: at(10), stamp: at(8) });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.ok(s.includes('DTSTART:20261110T090000Z\r\n'));
  assert.ok(s.includes('DTEND:20261110T100000Z\r\n'));
  assert.ok(s.includes('SUMMARY:Sync\\, weekly\r\n'));
  assert.equal(s.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')), true);
});

test('uid cannot inject lines', () => {
  const s = buildIcs({ title: 't', uid: 'a\r\nEND:VEVENT', start: at(9), end: at(10), stamp: at(8) });
  assert.equal(s.match(/END:VEVENT/g)?.length, 1);
});
