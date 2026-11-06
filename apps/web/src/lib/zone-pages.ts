// Build-time view models for the /zones pages.
import { DATA } from './cities';
import { abbrName, directory, etcZone, offsetLabel, offsetSlug, type ZoneUse } from './zone-dir';
import { zoneDate } from './pair-diff';
import type { CityRec } from './city-facts';

export interface ZoneRow {
  zone: string;
  countries: string[];
  cities: CityRec[];
  when: string;
  allYear: boolean;
}

export interface OffsetPage { kind: 'offset'; slug: string; offset: number; label: string; clockZone: string | null; rows: ZoneRow[]; abbrs: string[] }
export interface AbbrPage { kind: 'abbr'; slug: string; abbr: string; meanings: Array<{ offset: number; label: string; name: string; clockZone: string; rows: ZoneRow[] }> }

const byZone = new Map<string, CityRec[]>();
for (const c of [...DATA.cities].sort((a, b) => b.population - a.population)) byZone.set(c.zone, [...(byZone.get(c.zone) ?? []), c]);

export const zoneYear = (): number => Math.max(DATA.first_year, new Date().getUTCFullYear());

function row(u: ZoneUse): ZoneRow {
  const cities = byZone.get(u.zone) ?? [];
  const t = DATA.zones[u.zone] ?? {};
  const when = u.allYear ? 'All year' : u.periods.map((p) => `${zoneDate(t, p.start)} – ${zoneDate(t, p.end - 1)}`).join('; ');
  return { zone: u.zone, countries: [...new Set(cities.map((c) => DATA.countries[c.country_code] ?? c.country_code))], cities: cities.slice(0, 4), when, allYear: u.allYear };
}

const people = (r: ZoneRow): number => (byZone.get(r.zone) ?? []).reduce((s, c) => s + c.population, 0);
const sortRows = (rows: ZoneRow[]): ZoneRow[] => rows.sort((a, b) => Number(b.allYear) - Number(a.allYear) || people(b) - people(a));

let cache: { offsets: OffsetPage[]; abbrs: AbbrPage[] } | null = null;

export function zonePages(): { offsets: OffsetPage[]; abbrs: AbbrPage[] } {
  if (cache) return cache;
  const d = directory(DATA.zones, zoneYear());
  const abbrsAt = new Map<number, Set<string>>();
  for (const [ab, m] of d.abbrs) for (const off of m.keys()) abbrsAt.set(off, (abbrsAt.get(off) ?? new Set()).add(ab));
  const offsets: OffsetPage[] = [...d.offsets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offset, uses]) => {
      const rows = sortRows(uses.map(row));
      const steady = rows.find((r) => r.allYear);
      return { kind: 'offset', slug: offsetSlug(offset), offset, label: offsetLabel(offset), clockZone: steady?.zone ?? etcZone(offset), rows, abbrs: [...(abbrsAt.get(offset) ?? [])].sort() };
    });
  const abbrs: AbbrPage[] = [...d.abbrs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([abbr, m]) => ({
      kind: 'abbr',
      slug: abbr.toLowerCase(),
      abbr,
      meanings: [...m.entries()].sort((a, b) => a[0] - b[0]).map(([offset, uses]) => {
        const rows = sortRows(uses.map(row));
        return { offset, label: offsetLabel(offset), name: abbrName(abbr, offset), clockZone: rows[0]?.zone ?? 'UTC', rows };
      }),
    }));
  cache = { offsets, abbrs };
  return cache;
}
