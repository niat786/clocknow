// Pure helpers for the meeting planner: share-link parsing/building and minute-of-day formatting.
export const MAX_PEOPLE = 10;
export const DEFAULT_START = 9 * 60;
export const DEFAULT_END = 17 * 60;
export const DEFAULT_DURATION = 60;

export interface PlannerParams {
  /** City slugs or IANA zone names, in order. The first is the anchor. */
  tokens: string[];
  /** `YYYY-MM-DD`, or null for today. */
  date: string | null;
  duration: number;
  start: number;
  end: number;
}

const TOKEN = /^[A-Za-z0-9_+\-/]{1,64}$/;

export const isZoneToken = (t: string): boolean => t.includes('/') || t === 'UTC';

/** `HH:MM` to minutes after midnight. */
export function parseMinutes(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

export const formatMinutes = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function parsePlannerParams(search: string): PlannerParams {
  const q = new URLSearchParams(search);
  const tokens = (q.get('c') ?? '').split(',').filter((t) => TOKEN.test(t)).slice(0, MAX_PEOPLE);
  const d = q.get('d');
  const dur = Number(q.get('m'));
  const duration = Number.isInteger(dur) && dur >= 15 && dur <= 480 ? dur : DEFAULT_DURATION;
  const s = parseMinutes(q.get('ws') ?? '');
  const e = parseMinutes(q.get('we') ?? '');
  const ok = s !== null && e !== null && s !== e;
  return {
    tokens,
    date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
    duration,
    start: ok ? s : DEFAULT_START,
    end: ok ? e : DEFAULT_END,
  };
}

export function buildPlannerQuery(p: PlannerParams): string {
  const q = new URLSearchParams({ c: p.tokens.join(',') });
  if (p.date) q.set('d', p.date);
  q.set('m', String(p.duration));
  q.set('ws', formatMinutes(p.start));
  q.set('we', formatMinutes(p.end));
  return q.toString();
}
