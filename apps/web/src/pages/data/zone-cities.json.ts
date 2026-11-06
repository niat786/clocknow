// Largest city per time zone: { zone: [name, lat, lon] }. Lets the home page draw the sun's path for
// the visitor's time zone without asking for their location.
import { DATA, validateData } from '../../lib/cities';

export function GET(): Response {
  validateData();
  const out: Record<string, [string, number, number]> = {};
  for (const c of [...DATA.cities].sort((a, b) => b.population - a.population)) {
    if (!out[c.zone]) out[c.zone] = [c.name, Math.round(c.lat * 1000) / 1000, Math.round(c.lon * 1000) / 1000];
  }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
}
