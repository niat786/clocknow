// Pure helpers for the converter pages: parsing and formatting only. All date maths is in time-core.
import type { CivilDate, DateDiff, ZoneTime } from '../engine/types';

export const MAX_HOLIDAYS = 400;

/** Weekend presets as time-core bit masks (bit 0 = Monday … bit 6 = Sunday). */
export const WEEKENDS = { 'sat-sun': 0b1100000, 'fri-sat': 0b0110000, fri: 0b0010000, sun: 0b1000000, none: 0 } as const;
export type WeekendKey = keyof typeof WEEKENDS;
export const isWeekendKey = (k: string): k is WeekendKey => Object.hasOwn(WEEKENDS, k);

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Shape check only (`YYYY-MM-DD`). Whether the date exists is decided by the engine. */
export function parseCivil(s: string): CivilDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

export const formatCivil = (d: CivilDate): string => `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;

/** `HH:MM` or `HH:MM:SS`. */
export function parseTime(s: string): { hour: number; minute: number; second: number } | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]), second: Number(m[3] ?? 0) } : null;
}

export interface Holidays {
  dates: CivilDate[];
  bad: string[];
  tooMany: boolean;
}

/** Splits on whitespace, commas and semicolons. */
export function parseHolidays(text: string): Holidays {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const dates: CivilDate[] = [];
  const bad: string[] = [];
  for (const t of tokens) {
    const d = parseCivil(t);
    if (d) dates.push(d);
    else bad.push(t.slice(0, 20));
  }
  return { dates: dates.slice(0, MAX_HOLIDAYS), bad: bad.slice(0, 5), tooMany: dates.length > MAX_HOLIDAYS };
}

export const formatZoneTime = (z: ZoneTime): string =>
  `${pad(z.year, 4)}-${pad(z.month)}-${pad(z.day)} ${pad(z.hour)}:${pad(z.minute)}:${pad(z.second)}`;

export const formatIsoUtc = (z: ZoneTime): string =>
  `${pad(z.year, 4)}-${pad(z.month)}-${pad(z.day)}T${pad(z.hour)}:${pad(z.minute)}:${pad(z.second)}.${pad(z.millisecond, 3)}Z`;

/** `YYYYMMDD` as a number, for ordering two civil dates. */
export const dayKey = (z: { year: number; month: number; day: number }): number => z.year * 10000 + z.month * 100 + z.day;

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

export function describeSpan(d: Pick<DateDiff, 'years' | 'months' | 'days'>): string {
  const parts = [
    d.years ? plural(d.years, 'year') : '',
    d.months ? plural(d.months, 'month') : '',
    d.days ? plural(d.days, 'day') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : '0 days';
}
