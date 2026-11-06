// Options for printable pages, kept in the URL so a configured sheet can be shared or bookmarked.
export interface PrintOptions {
  paper: 'a4' | 'letter';
  start: 'mon' | 'sun';
  hijri: boolean;
  weeks: boolean;
}

export const PRINT_DEFAULTS: PrintOptions = { paper: 'a4', start: 'mon', hijri: false, weeks: true };

export function parsePrintOptions(search: string): PrintOptions {
  const q = new URLSearchParams(search);
  return {
    paper: q.get('paper') === 'letter' ? 'letter' : 'a4',
    start: q.get('start') === 'sun' ? 'sun' : 'mon',
    hijri: q.get('hijri') === '1',
    weeks: q.get('weeks') !== '0',
  };
}

/** Only non-default values, so the plain URL stays the canonical one. */
export function printQuery(o: PrintOptions): Record<string, string> {
  const out: Record<string, string> = {};
  if (o.paper !== PRINT_DEFAULTS.paper) out.paper = o.paper;
  if (o.start !== PRINT_DEFAULTS.start) out.start = o.start;
  if (o.hijri) out.hijri = '1';
  if (!o.weeks) out.weeks = '0';
  return out;
}
