// Real-user monitoring: validate a beacon, put each value in a histogram bucket, and estimate p75 from
// the buckets. Pure, so it is unit-tested in Node. Nothing here can identify a visitor.
export const METRICS = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const;
export type Metric = (typeof METRICS)[number];
export const DEVICES = ['phone', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

/** Routes are grouped so the table cannot grow without bound. */
export const ROUTES = ['/', '/time/*', '/timer', '/stopwatch', '/countdown', '/atomic', '/developers', 'other'] as const;
export type Route = (typeof ROUTES)[number];

/** Lower edge of each bucket. CLS is stored x1000 (0.1 becomes 100); the others are milliseconds. */
const MS_EDGES = [0, 50, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1250, 1500, 1800, 2100, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000];
const CLS_EDGES = [0, 1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 500, 1000];
export const edgesFor = (m: Metric): number[] => (m === 'CLS' ? CLS_EDGES : MS_EDGES);

/** Good thresholds from Google's Core Web Vitals (CLS x1000). */
export const GOOD: Record<Metric, number> = { LCP: 2500, INP: 200, CLS: 100, TTFB: 800, FCP: 1800 };
/** The budgets this site holds itself to, stricter than the thresholds above. */
export const TARGET: Record<Metric, number> = { LCP: 1000, INP: 100, CLS: 10, TTFB: 300, FCP: 800 };

export function bucketOf(m: Metric, value: number): number {
  const e = edgesFor(m);
  let i = 0;
  while (i + 1 < e.length && value >= e[i + 1]) i++;
  return i;
}

export interface Sample { route: Route; device: Device; metric: Metric; bucket: number }

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** `{ r: "/time/*", d: "phone", m: { LCP: 812, CLS: 3 } }` -> samples, ignoring anything out of range. */
export function parseBeacon(text: string): Sample[] {
  let body: unknown;
  try { body = JSON.parse(text); } catch { return []; }
  if (typeof body !== 'object' || body === null) return [];
  const { r, d, m } = body as { r?: unknown; d?: unknown; m?: unknown };
  const route: Route = isOneOf(ROUTES, r) ? r : 'other';
  if (!isOneOf(DEVICES, d) || typeof m !== 'object' || m === null) return [];
  const out: Sample[] = [];
  for (const metric of METRICS) {
    const v = (m as Record<string, unknown>)[metric];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 120_000) continue;
    out.push({ route, device: d, metric, bucket: bucketOf(metric, v) });
  }
  return out;
}

export interface Row { bucket: number; n: number }

/** The 75th percentile, interpolated inside its bucket; `null` below `minSamples`. */
export function percentile(metric: Metric, rows: Row[], p = 0.75, minSamples = 30): { value: number; n: number } | null {
  const n = rows.reduce((a, r) => a + r.n, 0);
  if (n < minSamples) return null;
  const e = edgesFor(metric);
  const sorted = [...rows].sort((a, b) => a.bucket - b.bucket);
  const rank = p * n;
  let seen = 0;
  for (const r of sorted) {
    if (seen + r.n >= rank) {
      const lo = e[r.bucket] ?? e[e.length - 1];
      const hi = e[r.bucket + 1] ?? lo; // the last bucket is open-ended: report its lower edge
      return { value: lo + ((rank - seen) / r.n) * (hi - lo), n };
    }
    seen += r.n;
  }
  return null;
}

/** Share of samples at or under the "good" threshold (by bucket lower edge, so slightly conservative). */
export function goodShare(metric: Metric, rows: Row[]): number {
  const n = rows.reduce((a, r) => a + r.n, 0);
  if (!n) return 0;
  const e = edgesFor(metric);
  const good = rows.filter((r) => (e[r.bucket + 1] ?? Infinity) <= GOOD[metric]).reduce((a, r) => a + r.n, 0);
  return good / n;
}

export const display = (metric: Metric, v: number): string => (metric === 'CLS' ? (v / 1000).toFixed(3) : `${Math.round(v)} ms`);
