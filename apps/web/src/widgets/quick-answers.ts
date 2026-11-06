// Answers for quick questions in the search box ("3pm london in karachi", "15:30 lhr in nrt", "w45",
// an epoch number, "timer 15m", a cron expression, "today + 30 business days"). Loaded with the palette; all time maths runs in the engine.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { rank, type Entry } from '../lib/search-rank';
import type { Quick } from '../lib/quick-answer';
import { airportZone } from '../lib/airports';
import { WEEKENDS } from './convert-params';
import type { ZoneTime } from '../engine/types';

const pad = (n: number): string => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const when = (z: ZoneTime): string => `${DAYS[z.weekday - 1]} ${z.day} ${MONTHS[z.month - 1]} ${z.year}, ${pad(z.hour)}:${pad(z.minute)}`;
const local = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

function place(entries: readonly Entry[], name: string): { zone: string; label: string } | null {
  if (/^(utc|gmt|z)$/.test(name)) return { zone: 'UTC', label: 'UTC' };
  if (/^(here|local|my time)$/.test(name)) return { zone: local(), label: 'your time' };
  const ap = airportZone(name);
  if (ap) return { zone: ap, label: name.toUpperCase() };
  const hit = rank(entries.filter((e) => e.kind === 'city'), name, 1)[0];
  return hit ? { zone: hit.hint, label: hit.title.split(',')[0] ?? hit.title } : null;
}

export async function answer(q: Quick, entries: readonly Entry[]): Promise<Entry[]> {
  const one = await single(q, entries);
  return one === null ? [] : Array.isArray(one) ? one : [one];
}

const iso = (d: { year: number; month: number; day: number }): string => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

async function single(q: Quick, entries: readonly Entry[]): Promise<Entry | Entry[] | null> {
  switch (q.kind) {
    case 'timer': {
      const m = Math.floor(q.seconds / 60);
      const s = q.seconds % 60;
      const label = m ? `${m}-minute${s ? ` ${s}-second` : ''}` : `${s}-second`;
      return { title: `Set a ${label} timer`, hint: 'Timer', href: `/timer?s=${q.seconds}`, kind: 'page' };
    }
    case 'epoch': {
      const p = await engine.parseUnix(q.text);
      const [l, u] = await Promise.all([engine.zoneTime(p.unix_ms, local()), engine.zoneTime(p.unix_ms, 'UTC')]);
      return { title: `${when(l)} your time · ${pad(u.hour)}:${pad(u.minute)} UTC`, hint: `Unix ${p.unit}`, href: `/unix-timestamp?ts=${q.text}`, kind: 'page' };
    }
    case 'week': {
      const year = q.year ?? (await engine.zoneTime(now(), local())).year;
      const w = await engine.isoWeekSpan(year, q.week);
      const d = (x: { day: number; month: number }) => `${x.day} ${MONTHS[x.month - 1]}`;
      return { title: `Week ${w.week} of ${year}: Mon ${d(w.start)} – Sun ${d(w.end)} ${w.end.year}`, hint: 'ISO week', href: `/week?w=${w.week}&y=${year}`, kind: 'page' };
    }
    case 'cron': {
      const zone = local();
      const runs = await engine.cronNext(q.expr, now(), zone, 5);
      const href = `/cron?e=${encodeURIComponent(q.expr)}&z=${encodeURIComponent(zone)}`;
      return Promise.all(runs.map(async (r) => ({ title: when(await engine.zoneTime(r.unix_ms, zone)), hint: `Cron · ${zone}`, href, kind: 'page' as const })));
    }
    case 'datemath': {
      const t = await engine.zoneTime(now(), local());
      const start = { year: t.year, month: t.month, day: t.day };
      const d =
        q.unit === 'business' ? await engine.addBusinessDays(start, q.n, WEEKENDS['sat-sun'])
        : q.unit === 'month' ? await engine.addMonths(start, q.n)
        : await engine.addDays(start, q.n);
      const wd = (await engine.zoneTime(await engine.wallToUnixMs(d.year, d.month, d.day, 12, 0, 0, 'UTC'), 'UTC')).weekday;
      const k = Math.abs(q.n);
      const unit = q.unit === 'business' ? 'business day' : q.unit === 'month' ? 'month' : 'day';
      const href = q.unit === 'business' ? `/business-days?s=${iso(start)}&n=${q.n}` : `/date-difference?a=${iso(start)}&b=${iso(d)}`;
      return { title: `Today ${q.n < 0 ? '−' : '+'} ${k} ${unit}${k === 1 ? '' : 's'} = ${DAYS[wd - 1]} ${d.day} ${MONTHS[d.month - 1]} ${d.year}`, hint: q.unit === 'business' ? 'Mon–Fri, no holidays' : 'Date', href, kind: 'page' };
    }
    case 'convert': {
      const a = place(entries, q.from);
      const b = place(entries, q.to);
      if (!a || !b) return null;
      const today = await engine.zoneTime(now(), a.zone);
      const ms = await engine.wallToUnixMs(today.year, today.month, today.day, q.hour, q.minute, 0, a.zone);
      const [za, zb] = await Promise.all([engine.zoneTime(ms, a.zone), engine.zoneTime(ms, b.zone)]);
      const dayDiff = (zb.year * 10000 + zb.month * 100 + zb.day) - (za.year * 10000 + za.month * 100 + za.day);
      const rel = dayDiff > 0 ? ' next day' : dayDiff < 0 ? ' previous day' : '';
      const t = `${pad(za.hour)}:${pad(za.minute)}`;
      return {
        title: `${t} ${a.label} = ${pad(zb.hour)}:${pad(zb.minute)}${rel} ${b.label}`,
        hint: 'Today',
        href: `/time-zone-converter?from=${encodeURIComponent(a.zone)}&to=${encodeURIComponent(b.zone)}&t=${t}`,
        kind: 'page',
      };
    }
  }
}
