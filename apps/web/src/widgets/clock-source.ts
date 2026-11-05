// The one corrected clock for the whole page. Syncs with the API through the engine worker.
// true time = performance.timeOrigin + performance.now() + offset
import { engine } from '../engine/engine';
import type { Estimate, Sample } from '../engine/types';

export type Phase = 'syncing' | 'ready' | 'failed';
export interface ClockStatus {
  phase: Phase;
  estimate: Estimate | null;
  /** Local monotonic ms of the last accepted sync, or null. */
  lastSyncAt: number | null;
}

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';
// Edge servers first, in order (comma-separated PUBLIC_EDGE_URL), then the origin API as fallback.
const EDGES = ((import.meta.env.PUBLIC_EDGE_URL as string | undefined) ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const BASES = [...EDGES, API];
let baseIdx = 0;
const base = (): string => BASES[baseIdx] ?? API;
const PING_TIMEOUT_MS = 3000;
const RESYNC_MS = 5 * 60_000;
const SLEW_MS = 2000;
const JUMP_MS = 250;

const local = (): number => performance.timeOrigin + performance.now();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let offset = 0;
let slew: { from: number; to: number; start: number } | null = null;
let status: ClockStatus = { phase: 'syncing', estimate: null, lastSyncAt: null };
const listeners = new Set<() => void>();
let started = false;
let ws: WebSocket | null = null;
const waiting = new Map<number, (s: Sample) => void>();

/** Corrected current time in Unix ms. */
export function now(): number {
  const t = local();
  if (slew) {
    const k = (t - slew.start) / SLEW_MS;
    if (k >= 1) {
      offset = slew.to;
      slew = null;
    } else {
      return t + slew.from + (slew.to - slew.from) * k;
    }
  }
  return t + offset;
}

export const getStatus = (): ClockStatus => status;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(next: ClockStatus): void {
  status = next;
  listeners.forEach((fn) => fn());
}

function applyOffset(target: number): void {
  const current = now() - local();
  if (status.lastSyncAt === null || Math.abs(target - current) > JUMP_MS) {
    offset = target;
    slew = null;
  } else {
    slew = { from: current, to: target, start: local() };
  }
}

function openSocket(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const sock = new WebSocket(base().replace(/^http/, 'ws') + '/v1/sync');
      const done = () => resolve();
      sock.onopen = () => {
        ws = sock;
        done();
      };
      sock.onerror = done;
      sock.onclose = () => {
        if (ws === sock) ws = null;
      };
      sock.onmessage = (e: MessageEvent<string>) => {
        const t3 = local();
        const r = JSON.parse(e.data) as { t0: number; t1: number; t2: number };
        waiting.get(r.t0)?.({ t0: r.t0, t1: r.t1, t2: r.t2, t3 });
        waiting.delete(r.t0);
      };
      setTimeout(done, PING_TIMEOUT_MS);
    } catch {
      resolve();
    }
  });
}

async function ping(): Promise<Sample | null> {
  const t0 = local();
  if (ws && ws.readyState === WebSocket.OPEN) {
    const sock = ws;
    return new Promise((resolve) => {
      waiting.set(t0, resolve);
      sock.send(JSON.stringify({ t0 }));
      setTimeout(() => {
        if (waiting.delete(t0)) resolve(null);
      }, PING_TIMEOUT_MS);
    });
  }
  try {
    const res = await fetch(`${base()}/v1/now`, { cache: 'no-store' });
    const t3 = local();
    if (!res.ok) return null;
    const b = (await res.json()) as { t1: number; t2: number };
    return { t0, t1: b.t1, t2: b.t2, t3 };
  } catch {
    return null;
  }
}

function useBase(i: number): void {
  if (i === baseIdx) return;
  baseIdx = i;
  ws?.close();
  ws = null;
}

async function collect(count: number): Promise<number> {
  if (!ws) await openSocket();
  let accepted = 0;
  for (let i = 0; i < count; i++) {
    const s = await ping();
    if (s && (await engine.addSample(s))) accepted++;
    if (accepted === 0 && i >= 1) break; // this server isn't answering; let the caller fall back
    if (i < count - 1) await sleep(200);
  }
  return accepted;
}

async function burst(count: number): Promise<void> {
  // Try the edge first on every burst; fall back to the next server if it gives no samples.
  let accepted = 0;
  for (let i = 0; i < BASES.length && accepted === 0; i++) {
    useBase(i);
    accepted = await collect(count);
  }
  const est = await engine.estimate(local());
  if (est.state === 'Offline') {
    setStatus({ phase: 'failed', estimate: null, lastSyncAt: status.lastSyncAt });
    return;
  }
  applyOffset(est.offset_ms);
  setStatus({ phase: 'ready', estimate: est, lastSyncAt: accepted > 0 ? local() : status.lastSyncAt });
}

async function safeBurst(count: number): Promise<void> {
  try {
    await burst(count);
  } catch {
    setStatus({ ...status, phase: status.estimate ? status.phase : 'failed' });
  }
}

async function loop(): Promise<void> {
  await safeBurst(8);
  for (;;) {
    await sleep(RESYNC_MS);
    if (document.visibilityState === 'visible') await safeBurst(4);
  }
}

/** Starts syncing once per page. Safe to call many times. */
export function startSync(): void {
  if (started) return;
  started = true;
  void loop();
  document.addEventListener('visibilitychange', () => {
    const last = status.lastSyncAt;
    if (document.visibilityState === 'visible' && (last === null || local() - last > 60_000)) {
      void safeBurst(4);
    }
  });
  addEventListener('online', () => void safeBurst(4));
}
