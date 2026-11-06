import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from './quick-answer.ts';

test('recognises quick questions', () => {
  assert.deepEqual(parseQuick('1762419543'), { kind: 'epoch', text: '1762419543' });
  assert.deepEqual(parseQuick('w45'), { kind: 'week', week: 45, year: null });
  assert.deepEqual(parseQuick('Week 1 2027'), { kind: 'week', week: 1, year: 2027 });
  assert.equal(parseQuick('w54'), null);
  assert.deepEqual(parseQuick('timer 15m'), { kind: 'timer', seconds: 900 });
  assert.deepEqual(parseQuick('timer 90 seconds'), { kind: 'timer', seconds: 90 });
  assert.deepEqual(parseQuick('timer 1.5h'), { kind: 'timer', seconds: 5400 });
  assert.deepEqual(parseQuick('3pm london in karachi'), { kind: 'convert', hour: 15, minute: 0, from: 'london', to: 'karachi' });
  assert.deepEqual(parseQuick('9:30 New York to Tokyo'), { kind: 'convert', hour: 9, minute: 30, from: 'new york', to: 'tokyo' });
  assert.deepEqual(parseQuick('12am utc to dubai'), { kind: 'convert', hour: 0, minute: 0, from: 'utc', to: 'dubai' });
  assert.equal(parseQuick('5 london to paris'), null);
  assert.equal(parseQuick('13pm london in paris'), null);
  assert.equal(parseQuick('london'), null);
});

test('recognises airport conversions', () => {
  assert.deepEqual(parseQuick('15:30 lhr in nrt'), { kind: 'convert', hour: 15, minute: 30, from: 'lhr', to: 'nrt' });
});

test('recognises cron expressions', () => {
  assert.deepEqual(parseQuick('*/15 9-17 * * 1-5'), { kind: 'cron', expr: '*/15 9-17 * * 1-5' });
  assert.deepEqual(parseQuick('  0 9  * * MON-FRI '), { kind: 'cron', expr: '0 9 * * mon-fri' });
  assert.equal(parseQuick('1 2 3 4 5'), null); // plain numbers are not a schedule
  assert.equal(parseQuick('* * * *'), null); // four fields
  assert.equal(parseQuick('* * * * * *'), null); // six fields
});

test('recognises date maths', () => {
  assert.deepEqual(parseQuick('today + 30 business days'), { kind: 'datemath', n: 30, unit: 'business' });
  assert.deepEqual(parseQuick('+90 days'), { kind: 'datemath', n: 90, unit: 'day' });
  assert.deepEqual(parseQuick('today - 2 weeks'), { kind: 'datemath', n: -14, unit: 'day' });
  assert.deepEqual(parseQuick('in 6 months'), { kind: 'datemath', n: 6, unit: 'month' });
  assert.deepEqual(parseQuick('1 year from now'), { kind: 'datemath', n: 12, unit: 'month' });
  assert.deepEqual(parseQuick('45 days ago'), { kind: 'datemath', n: -45, unit: 'day' });
  assert.deepEqual(parseQuick('+10 working days'), { kind: 'datemath', n: 10, unit: 'business' });
  assert.equal(parseQuick('+0 days'), null);
  assert.equal(parseQuick('+99999 days'), null);
});

