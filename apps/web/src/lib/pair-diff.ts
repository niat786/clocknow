// Time difference between two zones over time, from the build-time zone tables (offsets come from
// time-core via crates/citygen). Pure: no clocks are read here.
import { offsetAt, type ZoneTable } from './city-facts.ts';

export interface Segment {
  start: number;
  end: number;
  /** Seconds that B is ahead of A. */
  diff: number;
}

/** Periods of constant difference between `from` and `to` (Unix ms). */
export function diffSegments(a: ZoneTable, b: ZoneTable, from: number, to: number): Segment[] {
  const cuts = new Set<number>([from]);
  for (const t of [a, b]) for (const y of Object.values(t)) for (const c of y.changes) if (c.at > from && c.at < to) cuts.add(c.at);
  const times = [...cuts].sort((x, y) => x - y);
  const out: Segment[] = [];
  times.forEach((start, i) => {
    const end = times[i + 1] ?? to;
    const oa = offsetAt(a, start)?.offset;
    const ob = offsetAt(b, start)?.offset;
    if (oa === undefined || ob === undefined) return;
    const diff = ob - oa;
    const last = out[out.length - 1];
    if (last && last.diff === diff) last.end = end;
    else out.push({ start, end, diff });
  });
  return out;
}

export interface HourRow {
  /** Minutes after midnight in A and in B. */
  a: number;
  b: number;
  /** -1, 0 or +1: the day in B relative to A. */
  day: number;
  /** Both places are between 08:00 and 18:00. */
  work: boolean;
}

export function hourTable(diffSec: number): HourRow[] {
  const d = Math.round(diffSec / 60);
  return Array.from({ length: 24 }, (_, h) => {
    const a = h * 60;
    const raw = a + d;
    const b = ((raw % 1440) + 1440) % 1440;
    const day = raw < 0 ? -1 : raw >= 1440 ? 1 : 0;
    const inWork = (m: number) => m >= 8 * 60 && m < 18 * 60;
    return { a, b, day, work: inWork(a) && inWork(b) };
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "8 March 2026", read in the zone of `t` (wall clock just after the instant). */
export function zoneDate(t: ZoneTable, ms: number): string {
  const off = offsetAt(t, ms)?.offset ?? 0;
  const d = new Date(ms + off * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "5 hours ahead of", "30 minutes behind", "the same time as". */
export function relation(diffSec: number): string {
  if (diffSec === 0) return 'the same time as';
  const a = Math.abs(diffSec);
  const h = Math.floor(a / 3600);
  const m = Math.round((a % 3600) / 60);
  const parts = [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} minutes` : ''].filter(Boolean).join(' ');
  return `${parts} ${diffSec > 0 ? 'ahead of' : 'behind'}`;
}

export const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
