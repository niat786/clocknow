// Pure helpers for clock display. No DOM, no clock reads — easy to test.
import type { Estimate } from '../engine/types';

export interface WallParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  m: number;
  s: number;
}

/** Wall-clock fields for an instant at a fixed UTC offset (offset comes from time-core). */
export function wallParts(utcMs: number, offsetSeconds: number): WallParts {
  const t = new Date(utcMs + offsetSeconds * 1000);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    m: t.getUTCMinutes(),
    s: t.getUTCSeconds(),
  };
}

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;

export function formatHM(p: WallParts, hour12: boolean): { hm: string; period: string } {
  if (!hour12) return { hm: `${pad2(p.h)}:${pad2(p.m)}`, period: '' };
  const h = p.h % 12 === 0 ? 12 : p.h % 12;
  return { hm: `${pad2(h)}:${pad2(p.m)}`, period: p.h < 12 ? 'AM' : 'PM' };
}

export const formatSS = (p: WallParts): string => `:${pad2(p.s)}`;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(p: WallParts, locale?: string): string {
  const key = locale ?? '';
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    dateFormatters.set(key, f);
  }
  return f.format(Date.UTC(p.y, p.mo - 1, p.d, 12));
}

/** Fallback offset from the browser's own tz data, used only until the engine is ready. */
export function intlOffsetSeconds(zone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(utcMs);
  const get = (t: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((x) => x.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 1000);
}

export function formatError(ms: number): string {
  if (ms < 1) return '±<1 ms';
  if (ms < 1000) return `±${Math.round(ms)} ms`;
  return `±${(ms / 1000).toFixed(1)} s`;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s ago`;
  return `${Math.floor(s / 60)} min ago`;
}

export type PillState = 'syncing' | 'locked' | 'drifting' | 'offline';

export function pill(
  phase: 'syncing' | 'ready' | 'failed',
  est: Estimate | null,
  sinceSyncMs: number,
): { state: PillState; text: string } {
  if (phase === 'syncing' && !est) return { state: 'syncing', text: 'Syncing…' };
  if (!est || est.state === 'Offline') {
    return { state: 'offline', text: 'Offline · Device clock' };
  }
  const state: PillState = est.state === 'Locked' ? 'locked' : 'drifting';
  const label = est.state === 'Locked' ? 'Locked' : 'Drifting';
  return { state, text: `${label} · ${formatError(est.error_ms)} · synced ${formatAgo(sinceSyncMs)}` };
}
