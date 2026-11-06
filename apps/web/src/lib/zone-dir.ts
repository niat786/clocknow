// Time zones grouped by UTC offset and by abbreviation, from the build-time zone tables
// (crates/citygen, offsets from time-core). Pure: callers pass the data in.
import type { ZoneTable } from './city-facts.ts';

export interface Period {
  start: number;
  end: number;
  offset: number;
  abbr: string;
}

/** Offset periods of one zone between `from` and `to` (Unix ms), merged when nothing changes. */
export function periods(t: ZoneTable, year: number): Period[] {
  const y = t[String(year)];
  if (!y) return [];
  const from = Date.UTC(year, 0, 1) - y.start_offset * 1000;
  const next = t[String(year + 1)];
  const to = next ? Date.UTC(year + 1, 0, 1) - next.start_offset * 1000 : Date.UTC(year + 1, 0, 1);
  const out: Period[] = [];
  let cur = { start: from, offset: y.start_offset, abbr: y.start_abbr };
  for (const c of y.changes) {
    out.push({ ...cur, end: c.at });
    cur = { start: c.at, offset: c.after, abbr: c.abbr };
  }
  out.push({ ...cur, end: to });
  return out.filter((p) => p.end > p.start);
}

/** "utc+5", "utc+5-30", "utc-3-30", "utc+0". */
export function offsetSlug(sec: number): string {
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  return `utc${sec < 0 ? '-' : '+'}${h}${m ? `-${String(m).padStart(2, '0')}` : ''}`;
}

/** "UTC+5:30", "UTC−3:30" (minus sign), "UTC+0". */
export function offsetLabel(sec: number): string {
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  return `UTC${sec < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Etc zone for a whole-hour offset (POSIX sign is reversed: UTC+5 is Etc/GMT-5). */
export function etcZone(sec: number): string | null {
  if (sec % 3600 !== 0 || Math.abs(sec) > 14 * 3600) return null;
  const h = sec / 3600;
  return h === 0 ? 'Etc/UTC' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

export interface ZoneUse {
  zone: string;
  /** True when the zone uses this offset (or abbreviation) all year. */
  allYear: boolean;
  periods: Period[];
}

export interface Directory {
  offsets: Map<number, ZoneUse[]>;
  abbrs: Map<string, Map<number, ZoneUse[]>>;
}

const isWord = (a: string): boolean => /^[A-Za-z]{2,5}$/.test(a);

export function directory(zones: Record<string, ZoneTable>, year: number): Directory {
  const offsets = new Map<number, ZoneUse[]>();
  const abbrs = new Map<string, Map<number, ZoneUse[]>>();
  for (const [zone, t] of Object.entries(zones)) {
    const ps = periods(t, year);
    for (const off of new Set(ps.map((p) => p.offset))) {
      const mine = ps.filter((p) => p.offset === off);
      const list = offsets.get(off) ?? [];
      list.push({ zone, allYear: mine.length === ps.length, periods: mine });
      offsets.set(off, list);
    }
    for (const ab of new Set(ps.map((p) => p.abbr))) {
      if (!isWord(ab)) continue;
      const mine = ps.filter((p) => p.abbr === ab);
      const off = mine[0]?.offset ?? 0;
      const byOff = abbrs.get(ab) ?? new Map<number, ZoneUse[]>();
      const list = byOff.get(off) ?? [];
      list.push({ zone, allYear: mine.length === ps.length, periods: mine });
      byOff.set(off, list);
      abbrs.set(ab, byOff);
    }
  }
  return { offsets, abbrs };
}

/** Common names of time-zone abbreviations, by abbreviation and offset (several mean different things). */
const NAMES: Record<string, string> = {
  'ACDT 37800': 'Australian Central Daylight Time', 'ACST 34200': 'Australian Central Standard Time',
  'ADT -10800': 'Atlantic Daylight Time', 'AEDT 39600': 'Australian Eastern Daylight Time',
  'AEST 36000': 'Australian Eastern Standard Time', 'AST -14400': 'Atlantic Standard Time',
  'AWST 28800': 'Australian Western Standard Time', 'BST 3600': 'British Summer Time',
  'CAT 7200': 'Central Africa Time', 'CDT -18000': 'Central Daylight Time (North America)',
  'CDT -14400': 'Cuba Daylight Time', 'CEST 7200': 'Central European Summer Time', 'CET 3600': 'Central European Time',
  'CST -21600': 'Central Standard Time (North America)', 'CST -18000': 'Cuba Standard Time', 'CST 28800': 'China Standard Time',
  'ChST 36000': 'Chamorro Standard Time', 'EAT 10800': 'East Africa Time', 'EDT -14400': 'Eastern Daylight Time',
  'EEST 10800': 'Eastern European Summer Time', 'EET 7200': 'Eastern European Time', 'EST -18000': 'Eastern Standard Time',
  'GMT 0': 'Greenwich Mean Time', 'HKT 28800': 'Hong Kong Time', 'HST -36000': 'Hawaii Standard Time',
  'IDT 10800': 'Israel Daylight Time', 'IST 3600': 'Irish Standard Time', 'IST 7200': 'Israel Standard Time',
  'IST 19800': 'India Standard Time', 'JST 32400': 'Japan Standard Time', 'KST 32400': 'Korea Standard Time',
  'MDT -21600': 'Mountain Daylight Time', 'MSK 10800': 'Moscow Time', 'MST -25200': 'Mountain Standard Time',
  'NZDT 46800': 'New Zealand Daylight Time', 'NZST 43200': 'New Zealand Standard Time', 'PDT -25200': 'Pacific Daylight Time',
  'PKT 18000': 'Pakistan Standard Time', 'PST -28800': 'Pacific Standard Time', 'PST 28800': 'Philippine Standard Time',
  'SAST 7200': 'South Africa Standard Time', 'SST -39600': 'Samoa Standard Time', 'WAT 3600': 'West Africa Time',
  'WEST 3600': 'Western European Summer Time', 'WET 0': 'Western European Time', 'WIB 25200': 'Western Indonesia Time',
  'WIT 32400': 'Eastern Indonesia Time', 'WITA 28800': 'Central Indonesia Time', 'UTC 0': 'Coordinated Universal Time',
};

export const abbrName = (abbr: string, offset: number): string => NAMES[`${abbr} ${offset}`] ?? '';
