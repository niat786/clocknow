import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIJRI_MONTHS, formatHijri, hijriMonthName, hijriSpan } from './calendar-names.ts';

test('twelve Hijri month names', () => {
  assert.equal(HIJRI_MONTHS.length, 12);
  assert.equal(hijriMonthName(9), 'Ramadan');
  assert.equal(hijriMonthName(13), '');
});

test('formatHijri', () => {
  assert.equal(formatHijri({ year: 1446, month: 9, day: 1 }), '1 Ramadan 1446 AH');
});

test('hijriSpan within a month, a year and across years', () => {
  assert.equal(hijriSpan({ year: 1447, month: 7, day: 3 }, { year: 1447, month: 7, day: 30 }), 'Rajab 1447 AH');
  assert.equal(hijriSpan({ year: 1447, month: 7, day: 12 }, { year: 1447, month: 8, day: 10 }), 'Rajab–Shaʻban 1447 AH');
  assert.equal(hijriSpan({ year: 1447, month: 12, day: 20 }, { year: 1448, month: 1, day: 18 }), 'Dhu al-Hijjah 1447 – Muharram 1448 AH');
});
