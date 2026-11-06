// Plain-English description of a cron schedule from its expanded fields (parsed by time-core).
import type { CronFields } from '../engine/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** "a, b and c" */
export function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Step if values are lo, lo+s, lo+2s … reaching the end of the field; else null. */
function step(v: readonly number[], min: number, max: number): number | null {
  if (v.length < 2 || v[0] !== min) return null;
  const s = (v[1] ?? 0) - (v[0] ?? 0);
  return v.every((x, i) => x === min + i * s) && (v[v.length - 1] ?? 0) + s > max ? s : null;
}

/** Contiguous run [a, b] if the values have no gaps. */
function run(v: readonly number[]): [number, number] | null {
  if (v.length < 2) return null;
  return v.every((x, i) => x === (v[0] ?? 0) + i) ? [v[0] ?? 0, v[v.length - 1] ?? 0] : null;
}

const ordinal = (n: number): string => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};

function timePart(f: CronFields): string {
  const { minutes: mi, hours: h } = f;
  const allM = mi.length === 60;
  const allH = h.length === 24;
  const mStep = step(mi, 0, 59);
  const hStep = step(h, 0, 23);
  const hRun = run(h);
  const hours = (): string => (allH ? '' : h.length === 1 ? `, between ${pad(h[0] ?? 0)}:00 and ${pad(h[0] ?? 0)}:59` : hRun ? `, between ${pad(hRun[0])}:00 and ${pad(hRun[1])}:59` : hStep ? `, every ${hStep} hours` : `, during hours ${list(h.map((x) => pad(x)))}`);
  if (allM) return allH ? 'Every minute' : `Every minute${hours()}`;
  if (!allH && h.length * mi.length <= 4) return `At ${list(h.flatMap((x) => mi.map((m) => `${pad(x)}:${pad(m)}`)))}`;
  if (mStep) return `Every ${mStep} minutes${hours()}`;
  if (mi.length === 1) {
    const m = mi[0] ?? 0;
    if (allH) return m === 0 ? 'Every hour, on the hour' : `Every hour at ${pad(m)} minutes past`;
    if (hStep) return `Every ${hStep} hours at ${pad(m)} minutes past (${list(h.map((x) => `${pad(x)}:${pad(m)}`).slice(0, 4))}${h.length > 4 ? ' …' : ''})`;
    if (h.length <= 6) return `At ${list(h.map((x) => `${pad(x)}:${pad(m)}`))}`;
  }
  if (h.length * mi.length <= 6) return `At ${list(h.flatMap((x) => mi.map((m) => `${pad(x)}:${pad(m)}`)))}`;
  return `At minutes ${list(mi.map(String))}${hours() || ' of every hour'}`;
}

function weekdays(w: readonly number[]): string {
  const r = run(w);
  if (r && r[0] === 1 && r[1] === 5) return 'on weekdays (Monday to Friday)';
  if (w.length === 2 && w[0] === 0 && w[1] === 6) return 'on weekends';
  if (r && w.length > 2) return `${DAYS[r[0]]} to ${DAYS[r[1]]}`.replace(/^/, 'from ');
  return `on ${list(w.map((d) => `${DAYS[d]}s`))}`;
}

function dayPart(f: CronFields): string {
  const dom = f.days.length === 1 ? `on the ${ordinal(f.days[0] ?? 1)} of the month` : `on the ${list(f.days.map(ordinal))} of the month`;
  if (f.days_any && f.weekdays_any) return '';
  if (f.weekdays_any) return dom;
  if (f.days_any) return weekdays(f.weekdays);
  return `${dom} and also ${weekdays(f.weekdays)}`;
}

export function describeCron(f: CronFields): string {
  const parts = [timePart(f), dayPart(f)];
  if (f.months.length < 12) parts.push(`in ${list(f.months.map((m) => MONTHS[m - 1] ?? ''))}`);
  return `${parts.filter(Boolean).join(', ')}.`;
}
