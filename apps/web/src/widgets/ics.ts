// Builds a one-event iCalendar (.ics) file. Times are UTC, so every calendar app shows the right local time.
export interface IcsStamp {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface IcsEvent {
  title: string;
  description?: string;
  uid: string;
  start: IcsStamp;
  end: IcsStamp;
  stamp: IcsStamp;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export const icsDate = (s: IcsStamp): string =>
  `${pad(s.year, 4)}${pad(s.month)}${pad(s.day)}T${pad(s.hour)}${pad(s.minute)}${pad(s.second)}Z`;

/** RFC 5545 TEXT escaping; control characters are dropped so a title cannot inject properties. */
export const icsEscape = (s: string): string =>
  s.replace(/\p{Cc}/gu, (c) => (c === '\n' ? '\n' : '')).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Folds a content line at 75 octets, continuing with a space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//clocknow.net//Meeting planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid.replace(/[^A-Za-z0-9@.\-]/g, '')}`,
    `DTSTAMP:${icsDate(e.stamp)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}
