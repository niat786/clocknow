// Clock changes worldwide, grouped into events (same instant, same jump), from the zone tables.
import { DATA } from './cities';
import { changesIn, describeChange, formatChangeDate, type Change, type CityRec } from './city-facts';

export interface ChangeEvent {
  at: number;
  change: Change;
  forward: boolean;
  zones: string[];
  countries: Array<{ cc: string; name: string }>;
  examples: CityRec[];
  /** "Clocks go forward 1 hour" */
  what: string;
  /** Local wall time in the first zone, "Sunday, 29 March 2026 at 01:00" */
  when: string;
}

export const changeYears = (): number[] => Object.keys(Object.values(DATA.zones)[0] ?? {}).map(Number).sort((a, b) => a - b);

const citiesIn = new Map<string, CityRec[]>();
for (const c of [...DATA.cities].sort((a, b) => b.population - a.population)) citiesIn.set(c.zone, [...(citiesIn.get(c.zone) ?? []), c]);

export function changeEvents(year: number): ChangeEvent[] {
  const groups = new Map<string, ChangeEvent>();
  for (const [zone, t] of Object.entries(DATA.zones)) {
    for (const c of changesIn(t, year)) {
      const key = `${c.at}|${c.after - c.before}`;
      const cities = citiesIn.get(zone) ?? [];
      const g = groups.get(key) ?? { at: c.at, change: c, forward: c.after > c.before, zones: [], countries: [], examples: [], what: describeChange(c), when: formatChangeDate(c) };
      g.zones.push(zone);
      for (const city of cities) {
        if (!g.countries.some((x) => x.cc === city.country_code)) g.countries.push({ cc: city.country_code, name: DATA.countries[city.country_code] ?? city.country_code });
      }
      g.examples.push(...cities.slice(0, 1));
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, countries: g.countries.sort((a, b) => a.name.localeCompare(b.name)), examples: g.examples.sort((a, b) => b.population - a.population).slice(0, 6) }))
    .sort((a, b) => a.at - b.at);
}

/** Countries (among those with city pages) where no zone changes its clocks in `year`. */
export function steadyCountries(year: number): string[] {
  const changing = new Set<string>();
  const all = new Set<string>();
  for (const c of DATA.cities) {
    all.add(c.country_code);
    if (changesIn(DATA.zones[c.zone] ?? {}, year).length) changing.add(c.country_code);
  }
  return [...all].filter((cc) => !changing.has(cc)).map((cc) => DATA.countries[cc] ?? cc).sort((a, b) => a.localeCompare(b));
}
