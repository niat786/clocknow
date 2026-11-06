/// <reference lib="webworker" />
// Runs time-wasm off the main thread.
import init, { WasmSync, zoneTime, nextTransition, tzdataVersion, wallToUnixMs, offsetDifference, parseUnix, dateDiff, businessDays, addBusinessDays, planDay, toHijri, sunDay, sunPosition, moonInfo, seasons, prayerTimes, isoWeek } from 'time-wasm';
import type { EngineMessage, EngineReply, EngineResults, EngineRequest, CivilDate } from './types';

const flat = (list: CivilDate[]) => Int32Array.from(list.flatMap((d) => [d.year, d.month, d.day]));

declare const self: DedicatedWorkerGlobalScope;

const ready = init().then(() => new WasmSync());

function run(sync: WasmSync, req: EngineRequest): EngineResults[EngineRequest['op']] {
  switch (req.op) {
    case 'addSample': {
      const { t0, t1, t2, t3 } = req.sample;
      return sync.add(t0, t1, t2, t3);
    }
    case 'estimate':
      return sync.estimate(req.nowMs) as EngineResults['estimate'];
    case 'clearSamples':
      sync.clear();
      return null;
    case 'zoneTime':
      return zoneTime(req.unixMs, req.zone) as EngineResults['zoneTime'];
    case 'nextTransition':
      return nextTransition(req.unixMs, req.zone) as EngineResults['nextTransition'];
    case 'wallToUnixMs':
      return wallToUnixMs(req.year, req.month, req.day, req.hour, req.minute, req.second, req.zone);
    case 'offsetDifference':
      return offsetDifference(req.unixMs, req.a, req.b);
    case 'parseUnix':
      return parseUnix(req.input) as EngineResults['parseUnix'];
    case 'dateDiff':
      return dateDiff(req.a.year, req.a.month, req.a.day, req.b.year, req.b.month, req.b.day) as EngineResults['dateDiff'];
    case 'businessDays':
      return businessDays(req.a.year, req.a.month, req.a.day, req.b.year, req.b.month, req.b.day, req.weekendMask, flat(req.holidays));
    case 'addBusinessDays':
      return addBusinessDays(req.date.year, req.date.month, req.date.day, req.n, req.weekendMask, flat(req.holidays)) as EngineResults['addBusinessDays'];
    case 'planDay':
      return planDay(
        req.date.year, req.date.month, req.date.day, req.anchor,
        req.people.map((p) => p.zone).join(','),
        Uint16Array.from(req.people.flatMap((p) => [p.startMin, p.endMin])),
        req.opts.stepMin, req.opts.durationMin, req.opts.shoulderMin,
      ) as EngineResults['planDay'];
    case 'toHijri':
      return toHijri(req.date.year, req.date.month, req.date.day) as EngineResults['toHijri'];
    case 'sunDay':
      return sunDay(req.date.year, req.date.month, req.date.day, req.lat, req.lon, req.zone) as EngineResults['sunDay'];
    case 'sunPosition':
      return sunPosition(req.unixMs, req.lat, req.lon) as EngineResults['sunPosition'];
    case 'moonInfo':
      return moonInfo(req.unixMs) as EngineResults['moonInfo'];
    case 'seasons':
      return seasons(req.year) as EngineResults['seasons'];
    case 'prayerTimes':
      return prayerTimes(req.date.year, req.date.month, req.date.day, req.lat, req.lon, req.zone, req.method, req.asr, req.high) as EngineResults['prayerTimes'];
    case 'isoWeek':
      return isoWeek(req.date.year, req.date.month, req.date.day) as EngineResults['isoWeek'];
    case 'tzdataVersion':
      return tzdataVersion() ?? null;
  }
}

self.onmessage = async (e: MessageEvent<EngineMessage>) => {
  const { id, ...req } = e.data;
  let reply: EngineReply;
  try {
    reply = { id, ok: true, result: run(await ready, req) };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
};
