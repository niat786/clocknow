/// <reference lib="webworker" />
// Runs time-wasm off the main thread.
import init, { WasmSync, zoneTime, nextTransition, tzdataVersion, wallToUnixMs, offsetDifference } from 'time-wasm';
import type { EngineMessage, EngineReply, EngineResults, EngineRequest } from './types';

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
