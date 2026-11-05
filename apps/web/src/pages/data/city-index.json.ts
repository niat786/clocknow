// Compact city list for the meeting planner's search box: [slug, label, zone]. Fetched on demand.
import { DATA, dupes, validateData } from '../../lib/cities';
import { placeName } from '../../lib/city-facts';

export function GET(): Response {
  validateData();
  const rows = DATA.cities.map((c) => [c.slug, placeName(c, DATA.countries[c.country_code] ?? c.country_code, dupes), c.zone]);
  return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } });
}
