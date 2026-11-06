// POST /rum (beacon from the site) and GET /rum/summary (public p75 per metric).
import type { Env } from './env.ts';
import { sha256Hex } from './keys.ts';
import { DEVICES, METRICS, ROUTES, TARGET, display, goodShare, parseBeacon, percentile, type Device, type Metric, type Route } from './rum.ts';

const MAX_BODY = 2048;
const MAX_PER_IP_PER_DAY = 300;
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export async function collect(req: Request, env: Env, nowMs: number): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });

  // A small per-visitor daily cap so one client cannot skew the numbers. The IP is only hashed into a counter.
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const subject = `rum:${(await sha256Hex(`${env.IP_SALT ?? ''}|${ip}`)).slice(0, 16)}`;
  const seen = await env.DB.prepare(
    'INSERT INTO usage (subject, period, count) VALUES (?, ?, 1) ON CONFLICT(subject, period) DO UPDATE SET count = count + 1 RETURNING count',
  ).bind(subject, dayOf(nowMs)).first<{ count: number }>();
  if ((seen?.count ?? 1) > MAX_PER_IP_PER_DAY) return new Response(null, { status: 204 });

  const day = dayOf(nowMs);
  for (const s of parseBeacon(text)) {
    await env.DB.prepare(
      'INSERT INTO rum (day, route, device, metric, bucket, n) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(day, route, device, metric, bucket) DO UPDATE SET n = n + 1',
    ).bind(day, s.route, s.device, s.metric, s.bucket).run();
  }
  return new Response(null, { status: 204 });
}

export async function summary(url: URL, env: Env, nowMs: number): Promise<Response> {
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const routeQ = url.searchParams.get('route');
  const route: Route | null = ROUTES.find((r) => r === routeQ) ?? null;
  const since = dayOf(nowMs - (days - 1) * 86_400_000);

  const rows = (
    await env.DB.prepare(
      'SELECT device, metric, bucket, SUM(n) AS n FROM rum WHERE day >= ? AND (? IS NULL OR route = ?) GROUP BY device, metric, bucket',
    ).bind(since, route, route).all<{ device: Device; metric: Metric; bucket: number; n: number }>()
  ).results ?? [];

  const out: Record<string, Record<string, { p75: string; p75_raw: number; n: number; good_share: number; target: string; meets_target: boolean } | null>> = {};
  for (const device of DEVICES) {
    out[device] = {};
    for (const metric of METRICS) {
      const mine = rows.filter((r) => r.device === device && r.metric === metric).map((r) => ({ bucket: r.bucket, n: r.n }));
      const p = percentile(metric, mine);
      out[device][metric] = p && {
        p75: display(metric, p.value), p75_raw: Math.round(p.value * 1000) / 1000, n: p.n,
        good_share: Math.round(goodShare(metric, mine) * 1000) / 1000,
        target: display(metric, TARGET[metric]), meets_target: p.value <= TARGET[metric],
      };
    }
  }
  return json({ days, route: route ?? 'all', since, metrics: out }, 200, { 'cache-control': 'public, max-age=300' });
}
