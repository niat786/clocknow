// Main-thread client for the time engine worker. Lazy: the worker starts on first call.
import type { AsrRule, CivilDate, WorldCalendar, HighLatRule, PlanOptions, PlanPerson, PrayerMethod, EngineReply, EngineRequest, EngineResults, Sample } from './types';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EngineReply>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function call<K extends EngineRequest['op']>(
  req: Extract<EngineRequest, { op: K }>,
): Promise<EngineResults[K]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ ...req, id });
  });
}

export const engine = {
  addSample: (sample: Sample) => call({ op: 'addSample', sample }),
  estimate: (nowMs: number) => call({ op: 'estimate', nowMs }),
  clearSamples: () => call({ op: 'clearSamples' }),
  zoneTime: (unixMs: number, zone: string) => call({ op: 'zoneTime', unixMs, zone }),
  nextTransition: (unixMs: number, zone: string) => call({ op: 'nextTransition', unixMs, zone }),
  wallToUnixMs: (year: number, month: number, day: number, hour: number, minute: number, second: number, zone: string) =>
    call({ op: 'wallToUnixMs', year, month, day, hour, minute, second, zone }),
  /** Seconds that zone `b` is ahead of zone `a`. */
  offsetDifference: (unixMs: number, a: string, b: string) => call({ op: 'offsetDifference', unixMs, a, b }),
  parseUnix: (input: string) => call({ op: 'parseUnix', input }),
  dateDiff: (a: CivilDate, b: CivilDate) => call({ op: 'dateDiff', a, b }),
  businessDays: (a: CivilDate, b: CivilDate, weekendMask: number, holidays: CivilDate[] = []) =>
    call({ op: 'businessDays', a, b, weekendMask, holidays }),
  addBusinessDays: (date: CivilDate, n: number, weekendMask: number, holidays: CivilDate[] = []) =>
    call({ op: 'addBusinessDays', date, n, weekendMask, holidays }),
  planDay: (date: CivilDate, anchor: string, people: PlanPerson[], opts: PlanOptions) =>
    call({ op: 'planDay', date, anchor, people, opts }),
  /** Umm al-Qura date; rejects outside 1300-1600 AH. */
  toHijri: (date: CivilDate) => call({ op: 'toHijri', date }),
  sunDay: (date: CivilDate, lat: number, lon: number, zone: string) => call({ op: 'sunDay', date, lat, lon, zone }),
  sunPosition: (unixMs: number, lat: number, lon: number) => call({ op: 'sunPosition', unixMs, lat, lon }),
  moonInfo: (unixMs: number) => call({ op: 'moonInfo', unixMs }),
  seasons: (year: number) => call({ op: 'seasons', year }),
  prayerTimes: (date: CivilDate, lat: number, lon: number, zone: string, method: PrayerMethod, asr: AsrRule, high: HighLatRule) =>
    call({ op: 'prayerTimes', date, lat, lon, zone, method, asr, high }),
  isoWeek: (date: CivilDate) => call({ op: 'isoWeek', date }),
  /** Gregorian date of an Umm al-Qura date. */
  fromHijri: (date: CivilDate) => call({ op: 'fromHijri', date }),
  isoWeekSpan: (year: number, week: number) => call({ op: 'isoWeekSpan', year, week }),
  addDays: (date: CivilDate, n: number) => call({ op: 'addDays', date, n }),
  /** Clamps to the end of a shorter month (29 Feb + 12 months = 28 Feb). */
  addMonths: (date: CivilDate, n: number) => call({ op: 'addMonths', date, n }),
  toWorldDate: (cal: WorldCalendar, date: CivilDate) => call({ op: 'toWorldDate', cal, date }),
  /** `date.month` is the ordinal month (leap months count). */
  fromWorldDate: (cal: WorldCalendar, date: CivilDate) => call({ op: 'fromWorldDate', cal, date }),
  worldYearRange: (cal: WorldCalendar) => call({ op: 'worldYearRange', cal }),
  cronFields: (expr: string) => call({ op: 'cronFields', expr }),
  cronNext: (expr: string, afterMs: number, zone: string, count: number) => call({ op: 'cronNext', expr, afterMs, zone, count }),
  tzdataVersion: () => call({ op: 'tzdataVersion' }),
};
