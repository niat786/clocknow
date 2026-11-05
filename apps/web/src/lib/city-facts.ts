// Pure helpers for city and country pages. Input is the build-time data made by crates/citygen
// (offsets and clock changes come from time-core); this file only looks values up and formats them.

export interface Change { at: number; before: number; after: number; abbr: string }
export interface ZoneYear { start_offset: number; start_abbr: string; changes: Change[] }
/** Year ("2026") -> that year's data. */
export type ZoneTable = Record<string, ZoneYear>;
export interface CityRec {
  slug: string;
  name: string;
  ascii: string;
  country_code: string;
  admin1: string | null;
  lat: number;
  lon: number;
  population: number;
  zone: string;
  capital: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number): string => String(n).padStart(2, '0');

export function formatOffset(sec: number): string {
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  return `UTC${sec < 0 ? '-' : '+'}${h}${m ? `:${pad(m)}` : ''}`;
}

export function formatAmount(sec: number): string {
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 minutes';
}

export const describeChange = (c: Change): string =>
  `Clocks go ${c.after > c.before ? 'forward' : 'back'} ${formatAmount(c.after - c.before)}`;

/** Local date and time on the clock just before the change, e.g. "Sunday, 14 March 2027 at 02:00". */
export function formatChangeDate(c: Change): string {
  const d = new Date(c.at + c.before * 1000); // shifted instant read back as UTC fields = local wall time
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const years = (t: ZoneTable): string[] => Object.keys(t).sort((a, b) => Number(a) - Number(b));

/** Offset in force at `ms`, from the start of the first year in the table plus every change since. */
export function offsetAt(t: ZoneTable, ms: number): { offset: number; abbr: string } | null {
  const ys = years(t);
  const first = ys[0] === undefined ? undefined : t[ys[0]];
  if (!first) return null;
  let state = { offset: first.start_offset, abbr: first.start_abbr };
  for (const y of ys) for (const c of t[y]?.changes ?? []) if (c.at <= ms) state = { offset: c.after, abbr: c.abbr };
  return state;
}

export const changesIn = (t: ZoneTable, year: number): Change[] => t[String(year)]?.changes ?? [];

export function nextChange(t: ZoneTable, ms: number): Change | null {
  for (const y of years(t)) for (const c of t[y]?.changes ?? []) if (c.at > ms) return c;
  return null;
}

const nameKey = (c: CityRec): string => `${c.country_code}|${c.name}`;

/** Keys of names used by more than one city inside the same country. */
export function dupeNames(cities: readonly CityRec[]): Set<string> {
  const n = new Map<string, number>();
  for (const c of cities) n.set(nameKey(c), (n.get(nameKey(c)) ?? 0) + 1);
  return new Set([...n].filter(([, k]) => k > 1).map(([key]) => key));
}

/** "Karachi, Pakistan"; "Springfield, Illinois, United States" when the name repeats; "Singapore". */
export function placeName(c: CityRec, country: string, dupes: ReadonlySet<string>): string {
  if (c.name === country) return c.name;
  const region = dupes.has(nameKey(c)) && c.admin1 ? `, ${c.admin1}` : '';
  return `${c.name}${region}, ${country}`;
}

export function otherCities(sameCountry: readonly CityRec[], c: CityRec, n: number): CityRec[] {
  return sameCountry
    .filter((o) => o.slug !== c.slug)
    .sort((a, b) => b.population - a.population || a.slug.localeCompare(b.slug))
    .slice(0, n);
}

/** Phrase after the city name: "is 5 hours ahead of you", "has the same time as you". */
export function describeDiff(sec: number): string {
  if (sec === 0) return 'has the same time as you';
  return `is ${formatAmount(sec)} ${sec > 0 ? 'ahead of' : 'behind'} you`;
}
