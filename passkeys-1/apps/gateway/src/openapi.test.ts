// Contract: every public Rust route is documented, and every documented /v1 path exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOpenPath } from './limits.ts';

const root = new URL('../../../', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('apps/web/public/openapi.json', root), 'utf8')) as { paths: Record<string, { get?: { security?: object[] } }> };
const main = readFileSync(new URL('apps/api/src/main.rs', root), 'utf8');
const routes = [...main.matchAll(/\.route\("([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '/health');

test('every Rust route is in the OpenAPI spec', () => {
  const missing = routes.filter((r) => r !== '/v1/sync' && !(r in spec.paths));
  assert.deepEqual(missing, []);
});

test('every documented API path is a real route (or a gateway route)', () => {
  const gateway = ['/signup', '/signup/confirm'];
  const unknown = Object.keys(spec.paths).filter((p) => !routes.includes(p) && !gateway.includes(p));
  assert.deepEqual(unknown, []);
});

test('the spec and the gateway agree on which endpoints need a key', () => {
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.startsWith('/v1/') || !item.get) continue;
    const anonymousOk = (item.get.security ?? []).some((s) => Object.keys(s).length === 0);
    assert.equal(anonymousOk, isOpenPath(path), path);
  }
});
