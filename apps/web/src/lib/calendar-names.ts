// Names and labels for the calendar pages. No date maths: the numbers come from time-core.
import type { HijriDate } from '../engine/types';

export const GREGORIAN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const HIJRI_MONTHS = [
  'Muharram', 'Safar', 'Rabiʻ al-awwal', 'Rabiʻ al-thani', 'Jumada al-awwal', 'Jumada al-thani',
  'Rajab', 'Shaʻban', 'Ramadan', 'Shawwal', 'Dhu al-Qiʻdah', 'Dhu al-Hijjah',
] as const;

export const hijriMonthName = (m: number): string => HIJRI_MONTHS[m - 1] ?? '';

export const formatHijri = (h: HijriDate): string => `${h.day} ${hijriMonthName(h.month)} ${h.year} AH`;

/** "Rajab 1447 AH", "Rajab–Shaʻban 1447 AH" or "Dhu al-Hijjah 1447 – Muharram 1448 AH". */
export function hijriSpan(a: HijriDate, b: HijriDate): string {
  if (a.year === b.year && a.month === b.month) return `${hijriMonthName(a.month)} ${a.year} AH`;
  if (a.year === b.year) return `${hijriMonthName(a.month)}–${hijriMonthName(b.month)} ${a.year} AH`;
  return `${hijriMonthName(a.month)} ${a.year} – ${hijriMonthName(b.month)} ${b.year} AH`;
}

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
