// Shapes returned by time-wasm. Keep in sync with crates/time-core.

export type SyncState = 'Locked' | 'Drifting' | 'Offline';

export interface Sample {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
}

export interface Estimate {
  offset_ms: number;
  error_ms: number;
  drift_ppm: number;
  state: SyncState;
  samples_used: number;
}

export interface ZoneTime {
  zone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  weekday: number;
  offset_seconds: number;
  abbreviation: string;
  is_dst: boolean;
}

export interface Transition {
  at_unix_ms: number;
  offset_before_seconds: number;
  offset_after_seconds: number;
  abbreviation_after: string;
  is_dst_after: boolean;
}

export type EngineRequest =
  | { op: 'addSample'; sample: Sample }
  | { op: 'estimate'; nowMs: number }
  | { op: 'clearSamples' }
  | { op: 'zoneTime'; unixMs: number; zone: string }
  | { op: 'nextTransition'; unixMs: number; zone: string }
  | { op: 'wallToUnixMs'; year: number; month: number; day: number; hour: number; minute: number; second: number; zone: string }
  | { op: 'offsetDifference'; unixMs: number; a: string; b: string }
  | { op: 'tzdataVersion' };

export interface EngineResults {
  addSample: boolean;
  estimate: Estimate;
  clearSamples: null;
  zoneTime: ZoneTime;
  nextTransition: Transition | null;
  wallToUnixMs: number;
  offsetDifference: number;
  tzdataVersion: string | null;
}

export type EngineMessage = EngineRequest & { id: number };

export type EngineReply =
  | { id: number; ok: true; result: EngineResults[EngineRequest['op']] }
  | { id: number; ok: false; error: string };
