// Wire format shared with apps/api (Axum). Keep both in step.
export const DEFAULT_ORIGINS = 'https://clocknow.net,https://www.clocknow.net';
export const MAX_PINGS = 64;
export const IDLE_MS = 60_000;
const MAX_MESSAGE = 256;

export function parseOrigins(list: string): string[] {
  return list
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0);
}

/** Browsers always send Origin; tools without one may connect, other sites may not. */
export function originAllowed(origin: string | null, allowed: readonly string[]): boolean {
  return origin === null || allowed.includes(origin);
}

/** Reply to a WebSocket ping `{"t0": ms}` with `{"t0","t1","t2"}`, or null for junk. */
export function pongFor(text: string, t1: number, t2: number): string | null {
  if (text.length > MAX_MESSAGE) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const t0 = (v as { t0?: unknown }).t0;
  if (typeof t0 !== 'number' || !Number.isFinite(t0)) return null;
  return JSON.stringify({ t0, t1, t2 });
}

export interface NowBody {
  t1: number;
  t2: number;
  server_id: string;
  tzdata_version: null;
  zone: null;
}

export const nowBody = (t1: number, t2: number, serverId: string): NowBody => ({
  t1,
  t2,
  server_id: serverId,
  tzdata_version: null,
  zone: null,
});
