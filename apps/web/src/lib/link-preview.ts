// Page title and description for shared links, so Slack, WhatsApp and GitHub show what the link is
// ("Launch day · Fri, 13 Nov 2026, 15:00 UTC") instead of the site name. Pure: run by the Pages
// Functions in apps/web/functions. Text is plain; the caller escapes it.
import { parseCountdownParams } from '../widgets/countdown-format.ts';
import { formatMinutes, parsePlannerParams } from '../widgets/planner-params.ts';

export interface Preview {
  title: string;
  description: string;
}

const ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;
const place = (t: string): string => {
  const last = t.split('/').pop() ?? t;
  return last.replace(/[_-]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
};

function when(unixS: number, zone: string): string {
  const base: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...base, timeZone: zone }).format(new Date(unixS * 1000));
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...base, timeZone: 'UTC' }).format(new Date(unixS * 1000));
  }
}

export function previewFor(pathname: string, search: string): Preview | null {
  if (pathname === '/countdown') {
    const p = parseCountdownParams(search);
    if (!p) return null;
    const moment = when(p.target, p.zone);
    return {
      title: `${p.title || 'Countdown'} · ${moment}`.slice(0, 140),
      description: `Live countdown to ${moment}. Every screen that opens this link counts to the same instant, synced to UTC.`,
    };
  }
  if (pathname === '/meeting-planner') {
    const p = parsePlannerParams(search);
    if (p.tokens.length < 2) return null;
    const names = p.tokens.map(place).join(', ');
    return {
      title: `Meeting time: ${names}`,
      description: `Find a time that works in ${names}: ${p.duration} min, working hours ${formatMinutes(p.start)}–${formatMinutes(p.end)}.`,
    };
  }
  if (pathname === '/time-zone-converter') {
    const q = new URLSearchParams(search);
    const from = q.get('from') ?? '';
    const to = q.get('to') ?? '';
    if (!ZONE.test(from) || !ZONE.test(to)) return null;
    const t = /^\d{2}:\d{2}$/.test(q.get('t') ?? '') ? q.get('t') : null;
    const a = place(from);
    const b = place(to);
    return {
      title: t ? `${t} ${a} to ${b} time` : `${a} to ${b} time converter`,
      description: `Convert the time between ${a} and ${b}, with daylight saving handled by the exact time zone rules.`,
    };
  }
  return null;
}
