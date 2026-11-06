// City pairs that get a time-difference page: each of the first six cities with every other hub.
import { DATA } from './cities';
import type { CityRec } from './city-facts';

const ANCHORS = ['london', 'new-york', 'dubai', 'karachi', 'new-delhi', 'singapore'];
const HUBS = [
  ...ANCHORS,
  'los-angeles', 'chicago', 'toronto', 'vancouver', 'denver', 'mexico-city', 'sao-paulo', 'buenos-aires',
  'paris', 'berlin', 'madrid', 'moscow', 'istanbul', 'riyadh', 'cairo', 'lagos', 'johannesburg', 'nairobi',
  'tehran', 'kabul', 'lahore', 'mumbai', 'kathmandu', 'dhaka', 'bangkok', 'jakarta', 'manila', 'hong-kong',
  'shanghai', 'beijing', 'tokyo', 'seoul', 'sydney', 'auckland',
];

export interface Pair {
  a: CityRec;
  b: CityRec;
}

let cache: Pair[] | null = null;

export function cityPairs(): Pair[] {
  if (cache) return cache;
  const bySlug = new Map(DATA.cities.map((c) => [c.slug, c]));
  const hubs = HUBS.map((s) => bySlug.get(s)).filter((c): c is CityRec => c !== undefined);
  const out: Pair[] = [];
  hubs.forEach((a, i) => {
    if (!ANCHORS.includes(a.slug)) return;
    for (const b of hubs.slice(i + 1)) if (b.zone !== a.zone) out.push({ a, b });
  });
  cache = out;
  return out;
}

export const pairPath = (p: Pair): string => `/difference/${p.a.slug}/${p.b.slug}`;

/** Pages that exist for a city, for linking from city pages. */
export const pairsOf = (slug: string): Pair[] => cityPairs().filter((p) => p.a.slug === slug || p.b.slug === slug);
