import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayMonth, holidaysOf, weekdayOf, weekendName, workdaysOff, type HolidayCountry } from './holiday-format.ts';

const c: HolidayCountry = {
  weekend: 0b1100000,
  years: { '2026': [['2026-12-25', 'Christmas Day'], ['2026-12-26', 'Boxing Day'], ['2026-12-28', 'Boxing Day', 'o'], ['2026-03-20', 'Eid al-Fitr', 'e']] },
};

test('weekday and labels', () => {
  assert.equal(weekdayOf('2026-11-06'), 5);
  assert.equal(dayMonth('2026-04-03'), '3 April');
  assert.equal(weekendName(0b1100000), 'Saturday and Sunday');
  assert.equal(weekendName(0b0110000), 'Friday and Saturday');
  assert.equal(weekendName(0b1000000), 'Sunday');
  assert.equal(weekendName(0b1010000), 'Friday and Sunday');
});

test('flags and weekend days', () => {
  const list = holidaysOf(c, 2026);
  assert.deepEqual(list.map((h) => [h.weekday, h.weekend, h.observed, h.estimated]), [
    ['Friday', false, false, false],
    ['Saturday', true, false, false],
    ['Monday', false, true, false],
    ['Friday', false, false, true],
  ]);
  assert.equal(workdaysOff(list), 3);
  assert.deepEqual(holidaysOf(c, 2030), []);
});
