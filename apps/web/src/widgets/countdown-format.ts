// Pure helpers for the countdown page: URL parameters and remaining-time split.
export const MAX_TITLE = 80;
export const MAX_TARGET_S = 4_102_444_800; // 2100-01-01T00:00:00Z

export interface CountdownParams {
  /** Target instant, Unix seconds. */
  target: number;
  /** IANA zone the creator chose; used only to display the target. */
  zone: string;
  title: string;
}

/** Reads `?t=<unix seconds>&z=<zone>&n=<title>`. Returns null unless `t` is a valid instant. */
export function parseCountdownParams(search: string): CountdownParams | null {
  const q = new URLSearchParams(search);
  const t = q.get('t');
  if (!t || !/^\d{1,11}$/.test(t)) return null;
  const target = Number(t);
  if (target <= 0 || target > MAX_TARGET_S) return null;
  const z = q.get('z') ?? 'UTC';
  const zone = /^[A-Za-z0-9_+\-/]{1,64}$/.test(z) ? z : 'UTC';
  const title = (q.get('n') ?? '').replace(/\p{Cc}/gu, '').trim().slice(0, MAX_TITLE);
  return { target, zone, title };
}

export function buildQuery(p: { t: number; z: string; n: string }): string {
  const q = new URLSearchParams({ t: String(p.t), z: p.z });
  const n = p.n.trim().slice(0, MAX_TITLE);
  if (n) q.set('n', n);
  return q.toString();
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Splits remaining milliseconds. Rounds up, so it reads 0 only when the target is reached. */
export function splitRemaining(ms: number): Remaining {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
    done: total === 0,
  };
}
