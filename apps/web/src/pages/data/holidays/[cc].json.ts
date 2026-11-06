// Public holidays of one country for the business-days calculator: { weekend, years: { "2026": ["2026-01-01", ...] } }.
import { HOLIDAYS } from '../../../lib/holidays';

export function getStaticPaths() {
  return Object.keys(HOLIDAYS.countries).map((cc) => ({ params: { cc: cc.toLowerCase() }, props: { cc } }));
}

export function GET({ props }: { props: { cc: string } }): Response {
  const c = HOLIDAYS.countries[props.cc];
  const years: Record<string, string[]> = {};
  for (const [y, rows] of Object.entries(c?.years ?? {})) years[y] = [...new Set(rows.map((r) => r[0]))];
  return new Response(JSON.stringify({ weekend: c?.weekend ?? 0, years }), { headers: { 'content-type': 'application/json' } });
}
