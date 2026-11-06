import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleName, formatWorld, monthName } from './world-names.ts';

const base = { months_in_year: 12, days_in_month: 30, days_in_year: 354, cycle: null, leap: false };

test('Hebrew Adar in plain and leap years', () => {
  assert.equal(monthName('hebrew', 6, false, 12), 'Adar');
  assert.equal(monthName('hebrew', 5, true, 13), 'Adar I');
  assert.equal(monthName('hebrew', 6, false, 13), 'Adar II');
  assert.equal(monthName('hebrew', 7, false, 13), 'Nisan');
});

test('Chinese months and cycle years', () => {
  assert.equal(monthName('chinese', 6, true, 13), 'Leap month 6 (闰六月)');
  assert.equal(monthName('chinese', 1, false, 12), 'Month 1 (正月)');
  assert.deepEqual(cycleName(43), { hanzi: '丙午', latin: 'bing-wu', animal: 'Horse', element: 'Fire' });
  assert.deepEqual(cycleName(1), { hanzi: '甲子', latin: 'jia-zi', animal: 'Rat', element: 'Wood' });
  assert.equal(formatWorld('chinese', { ...base, year: 2026, month: 9, number: 9, day: 21, cycle: 43 }), 'Month 9 (九月), day 21 · Year of the Fire Horse (丙午, bing-wu)');
});

test('formats with era', () => {
  assert.equal(formatWorld('persian', { ...base, year: 1405, month: 8, number: 8, day: 15 }), '15 Aban 1405 SH');
  assert.equal(formatWorld('indian', { ...base, year: 1948, month: 8, number: 8, day: 15 }), '15 Kartika 1948 Saka');
  assert.equal(formatWorld('hebrew', { ...base, year: 5787, month: 2, number: 2, day: 25 }), '25 Cheshvan 5787 AM');
});
