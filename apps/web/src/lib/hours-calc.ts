// Duration arithmetic for the hours calculator. Plain seconds; no dates or time zones.

/**
 * Seconds in a duration typed by a person, or null if it cannot be read. Accepts "8:45", "8:45:30",
 * "-0:45", "1h 20m", "90m", "45s", "2.5h", "2.5" (hours) and a leading + or -.
 */
export function parseDuration(text: string): number | null {
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let sign = 1;
  if (s[0] === '+' || s[0] === '-') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trim();
  }
  const clock = /^(\d{1,4}):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (clock) return sign * (Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0));
  if (/^\d+(\.\d+)?$/.test(s)) return sign * Math.round(Number(s) * 3600);
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g;
  let total = 0;
  let used = '';
  for (const m of s.matchAll(re)) {
    const n = Number(m[1]);
    const u = m[2]?.[0];
    total += u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
    used += m[0];
  }
  return used.replace(/\s/g, '') === s.replace(/\s/g, '') && used ? sign * Math.round(total) : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "14:30", "-0:45", "100:05:09" (seconds only when present). */
export function formatHMS(sec: number): string {
  const neg = sec < 0;
  const a = Math.abs(Math.round(sec));
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = a % 60;
  return `${neg ? '-' : ''}${h}:${pad(m)}${s ? `:${pad(s)}` : ''}`;
}

/** Decimal hours to two places, as payroll systems use: 14:30 → "14.50". */
export const decimalHours = (sec: number): string => (Math.round((sec / 3600) * 100) / 100).toFixed(2);

/** "HH:MM" to minutes after midnight, or null. */
export function clockMinutes(t: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Worked seconds for one shift; an end before the start means the shift ran past midnight. */
export function shiftSeconds(start: string, end: string, breakMin: number): number | null {
  const a = clockMinutes(start);
  const b = clockMinutes(end);
  if (a === null || b === null) return null;
  const span = (b - a + 1440) % 1440;
  const worked = span - (Number.isFinite(breakMin) ? Math.max(0, breakMin) : 0);
  return worked < 0 ? null : worked * 60;
}

/** Sum of lines; returns the total and the lines that could not be read. */
export function sumLines(text: string): { total: number; bad: string[]; count: number } {
  let total = 0;
  let count = 0;
  const bad: string[] = [];
  for (const line of text.split(/\n/)) {
    if (!line.trim()) continue;
    const v = parseDuration(line);
    if (v === null) bad.push(line.trim().slice(0, 20));
    else {
      total += v;
      count++;
    }
  }
  return { total, bad, count };
}
