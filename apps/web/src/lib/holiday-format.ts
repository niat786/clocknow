// Pure holiday lookups and formatting; dates are plain YYYY-MM-DD strings. Data: lib/holidays.ts.

/** [date, name, flags?]; flags: "e" = estimated (moon-based or announced late), "o" = observed (moved). */
export type HolidayRow = [string, string] | [string, string, string];
export interface HolidayCountry {
  /** Bit 0 = Monday … bit 6 = Sunday, like the business-days calculator. */
  weekend: number;
  years: Record<string, HolidayRow[]>;
}
export interface HolidayData {
  source: string;
  first_year: number;
  last_year: number;
  countries: Record<string, HolidayCountry>;
}

export interface Holiday {
  date: string;
  name: string;
  weekday: string;
  estimated: boolean;
  observed: boolean;
  /** Falls on that country's weekend. */
  weekend: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** "3 April" */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** Sunday-zero weekday to the Monday-zero bit used by weekend masks. */
const bit = (sundayZero: number): number => 1 << ((sundayZero + 6) % 7);

export function holidaysOf(c: HolidayCountry, year: number): Holiday[] {
  return (c.years[String(year)] ?? []).map(([date, name, flags = '']) => {
    const wd = weekdayOf(date);
    return { date, name, weekday: DAYS[wd] ?? '', estimated: flags.includes('e'), observed: flags.includes('o'), weekend: (c.weekend & bit(wd)) !== 0 };
  });
}

/** Distinct days off that fall on working days. */
export function workdaysOff(list: readonly Holiday[]): number {
  return new Set(list.filter((h) => !h.weekend).map((h) => h.date)).size;
}

/** "Saturday and Sunday", "Friday and Saturday", "Sunday". */
export function weekendName(mask: number): string {
  const names = [1, 2, 3, 4, 5, 6, 0].filter((_, i) => mask & (1 << i)).map((d) => DAYS[d] ?? '');
  if (names.length === 0) return 'none';
  return names.length === 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

