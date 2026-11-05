// Cloudflare Worker: edge time for clocknow.net. Same responses as apps/api for /v1/now and /v1/sync.
// Date.now() in Workers has millisecond resolution and only advances between I/O events, which
// adds far less error than the network round trip this saves.
import { DEFAULT_ORIGINS, IDLE_MS, MAX_PINGS, nowBody, originAllowed, parseOrigins, pongFor } from './protocol';

const json = (body: unknown, status: number, headers: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

function session(): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  let pings = 0;
  const closeIdle = () => server.close(1000, 'idle');
  let idle = setTimeout(closeIdle, IDLE_MS);
  server.addEventListener('message', (ev: MessageEvent) => {
    const t1 = Date.now();
    clearTimeout(idle);
    idle = setTimeout(closeIdle, IDLE_MS);
    if (typeof ev.data !== 'string') return;
    pings += 1;
    if (pings > MAX_PINGS) {
      server.close(1008, 'too many pings');
      return;
    }
    const reply = pongFor(ev.data, t1, Date.now());
    if (reply) server.send(reply);
  });
  server.addEventListener('close', () => clearTimeout(idle));
  return new Response(null, { status: 101, webSocket: client });
}

/** Shared by the Worker (clocknow.net/v1/*) and the Pages Function (clocknow.pages.dev/v1/*). */
export function handle(req: Request, allowedOrigins: string | undefined): Response {
  const t1 = Date.now();
  const url = new URL(req.url);
  const allowed = parseOrigins(allowedOrigins ?? DEFAULT_ORIGINS);
  const origin = req.headers.get('origin');
  const colo = (req.cf as { colo?: string } | undefined)?.colo ?? 'edge';
  const serverId = `cf-${colo}`;
  const headers: Record<string, string> = { vary: 'Origin', 'x-server': serverId };
  if (origin && allowed.includes(origin)) headers['access-control-allow-origin'] = origin;

  if (req.method === 'OPTIONS') {
    if (!headers['access-control-allow-origin']) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: { ...headers, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' },
    });
  }
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405, headers);

  if (url.pathname === '/v1/sync') {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected websocket' }, 426, headers);
    if (!originAllowed(origin, allowed)) return new Response(null, { status: 403 });
    return session();
  }
  if (url.pathname === '/v1/now') {
    if (url.searchParams.has('tz'))
      return json({ error: 'zone data is served by https://api.clocknow.net/v1/now' }, 400, headers);
    return json(nowBody(t1, Date.now(), serverId), 200, headers);
  }
  return json({ error: 'not found' }, 404, headers);
}

export default {
  fetch: (req: Request, env: Env): Response => handle(req, env.ALLOWED_ORIGINS),
} satisfies ExportedHandler<Env>;
