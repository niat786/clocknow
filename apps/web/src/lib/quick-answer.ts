// Recognises quick questions typed into the search box. Pure parsing; answers are computed by the
// palette with the engine.
export type Quick =
  | { kind: 'epoch'; text: string }
  | { kind: 'week'; week: number; year: number | null }
  | { kind: 'timer'; seconds: number }
  | { kind: 'convert'; hour: number; minute: number; from: string; to: string }
  | { kind: 'cron'; expr: string }
  | { kind: 'datemath'; n: number; unit: 'day' | 'month' | 'business' };

const UNIT = '(business days?|working days?|weekdays?|days?|weeks?|months?|years?)';

function dateMath(s: string): Quick | null {
  const m =
    new RegExp(`^(?:(?:today|now) ?)?([+-]) ?(\\d{1,5}) ?${UNIT}$`).exec(s) ??
    new RegExp(`^(?:in )?(\\d{1,5}) ?${UNIT}(?: (from now|from today|ago))?$`).exec(s);
  if (!m) return null;
  const signed = m[1] === '+' || m[1] === '-';
  const count = Number(signed ? m[2] : m[1]);
  const word = (signed ? m[3] : m[2]) ?? '';
  const tail = signed ? '' : (m[3] ?? '');
  const sign = (signed ? m[1] === '-' : tail === 'ago') ? -1 : 1;
  if (!signed && !tail && !s.startsWith('in ')) return null; // "30 days" alone is not a question
  let n = count * sign;
  let unit: 'day' | 'month' | 'business' = 'day';
  if (/^(business|working|weekday)/.test(word)) unit = 'business';
  else if (word.startsWith('week')) n *= 7;
  else if (word.startsWith('month')) unit = 'month';
  else if (word.startsWith('year')) { unit = 'month'; n *= 12; }
  return n === 0 || Math.abs(n) > 40_000 ? null : { kind: 'datemath', n, unit };
}

const CRON_FIELD = /^[0-9a-z*,\/?-]+$/;
function cron(s: string): Quick | null {
  const parts = s.split(' ');
  if (parts.length !== 5 || !parts.every((p) => CRON_FIELD.test(p))) return null;
  return /[^0-9 ]/.test(s) ? { kind: 'cron', expr: s } : null;
}

export function parseQuick(input: string): Quick | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^-?\d{9,19}$/.test(s)) return { kind: 'epoch', text: s };
  const cr = cron(s);
  if (cr) return cr;
  const dm = dateMath(s);
  if (dm) return dm;
  let m = /^(?:w|wk|week) ?(\d{1,2})(?:,? (\d{4}))?$/.exec(s);
  if (m) {
    const week = Number(m[1]);
    return week >= 1 && week <= 53 ? { kind: 'week', week, year: m[2] ? Number(m[2]) : null } : null;
  }
  m = /^(?:timer|countdown|alarm in) (\d{1,3}(?:\.\d+)?) ?(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)?$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    const u = m[2]?.[0] ?? 'm';
    const seconds = Math.round(n * (u === 'h' ? 3600 : u === 's' ? 1 : 60));
    return seconds > 0 && seconds <= 359_999 ? { kind: 'timer', seconds } : null;
  }
  m = /^(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a\.m\.|p\.m\.)? (?:in |at )?(.+?) (?:in|to) (.+)$/.exec(s);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] ?? 0);
    const ap = m[3]?.[0];
    if (ap && (hour < 1 || hour > 12)) return null;
    if (ap === 'p' && hour < 12) hour += 12;
    if (ap === 'a' && hour === 12) hour = 0;
    if (!ap && !m[2]) return null; // "5 london to paris" is too vague
    if (hour > 23 || minute > 59) return null;
    return { kind: 'convert', hour, minute, from: (m[4] ?? '').trim(), to: (m[5] ?? '').trim() };
  }
  return null;
}
