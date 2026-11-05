const pad = (n: number): string => String(n).padStart(2, '0');

export const MAX_TIMER_MS = 359_999_000; // 99:59:59

/** Whole non-negative integer from user input, capped at max. */
export function clampInt(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(0, Math.floor(v)));
}

/** Hours/minutes/seconds to milliseconds, capped at 99:59:59. */
export function toMs(h: number, m: number, s: number): number {
  const ms = ((clampInt(h, 999) * 60 + clampInt(m, 999)) * 60 + clampInt(s, 999)) * 1000;
  return Math.min(MAX_TIMER_MS, ms);
}

/** Stopwatch text: MM:SS.cc, or H:MM:SS.cc from one hour. */
export function formatStopwatch(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 10));
  const cs = t % 100;
  const total = Math.floor(t / 100);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${h > 0 ? `${h}:${pad(m)}` : pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** Timer text HH:MM:SS. Remaining time rounds up, so 00:00:00 only shows at the end. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
