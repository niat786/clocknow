// Main-thread client for the time engine worker. Lazy: the worker starts on first call.
import type { CivilDate, PlanOptions, PlanPerson, EngineReply, EngineRequest, EngineResults, Sample } from './types';

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
  tzdataVersion: () => call({ op: 'tzdataVersion' }),
};
