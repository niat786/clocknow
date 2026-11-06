// Local stand-in for the gateway (real handler, SQLite as D1) for browser tests. Not deployed.
import { createServer } from 'node:http';
import { handle } from '../src/index.ts';
import { testDb } from './sqlite-d1.ts';
import type { Env } from '../src/env.ts';

const mails: string[] = [];
globalThis.fetch = (async (_r: unknown, init?: RequestInit) => { mails.push(String(init?.body)); return new Response('{}'); }) as typeof fetch;
const env = { DB: testDb(), SITE_ORIGINS: 'http://localhost:4321', SITE_URL: 'http://localhost:4321', RP_ID: 'localhost', RESEND_API_KEY: 'r', MAIL_FROM: 'x', IP_SALT: 's', ORIGIN_URL: 'http://o.test', ORIGIN_SECRET: 'o' } as unknown as Env;
createServer(async (req, res) => {
  if (req.url === '/__mail') { res.end(JSON.stringify(mails)); return; }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await handle(new Request(`http://localhost:8787${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }), env, Date.now());
  const h: Record<string, string> = {};
  r.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(r.status, h);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787);
