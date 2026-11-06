// Builds apps/web/public/openapi.json. Run: node scripts/gen-openapi.mjs
// A contract test (apps/gateway/src/openapi.test.ts) fails if the Rust routes and this spec drift apart.
import { writeFileSync } from 'node:fs';

const q = (name, description, schema = { type: 'string' }, required = false, example) => ({ name, in: 'query', required, description, schema, ...(example !== undefined && { example }) });
const err = { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const quota = { $ref: '#/components/responses/Quota' };
const ok = (ref, description = 'OK') => ({ description, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } }, headers: { 'X-RateLimit-Limit': { $ref: '#/components/headers/Limit' }, 'X-RateLimit-Remaining': { $ref: '#/components/headers/Remaining' } } });
const op = (summary, description, parameters, ref, { open = true } = {}) => ({
  get: { summary, description, ...(open ? { security: [{}, { ApiKey: [] }] } : { security: [{ ApiKey: [] }] }), parameters, responses: { 200: ok(ref), 400: err, 401: { $ref: '#/components/responses/Unauthorized' }, 429: quota } },
});
const tz = (n, d, ex = 'Asia/Karachi') => q(n, d, { type: 'string' }, true, ex);
const t = q('t', 'Instant as Unix milliseconds (default: now).', { type: 'number' });

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'clocknow API',
    version: '1.0.0',
    summary: 'Time-zone, conversion and astronomy data from one audited Rust core.',
    description:
      'Every response of the zone endpoints carries `meta.error_bound_ms`, `meta.tzdata_version` and `meta.server_id`. ' +
      '`error_bound_ms` is `null` when the operator has not measured the server clock: accuracy is never invented. ' +
      'Without a key you may call the open endpoints (10,000 requests per month per IP). Create a free key at https://clocknow.net/developers.',
  },
  servers: [{ url: 'https://api.clocknow.net' }],
  paths: {
    '/v1/now': op('Server time', 'Server receive and send timestamps (clock sync), optionally with the wall time in a zone.', [q('tz', 'IANA zone, e.g. Asia/Karachi.')], 'Now'),
    '/v1/zone': op('Time in a zone', 'Wall-clock reading, UTC offset, abbreviation and the next offset change.', [tz('tz', 'IANA zone.'), t], 'Zone'),
    '/v1/convert': op('Convert a wall time', 'A date and time in one zone, shown in another. A time skipped by a DST jump resolves forward; a repeated time resolves to its first occurrence.', [tz('from', 'Source zone.'), tz('to', 'Target zone.', 'America/New_York'), q('time', 'Wall time in `from`: YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS.', { type: 'string' }, true, '2026-11-07T12:00')], 'Convert'),
    '/v1/difference': op('Difference between two zones', 'Both zone readings and the signed offset difference at one instant.', [tz('a', 'First zone.'), tz('b', 'Second zone.', 'Europe/London'), t], 'Difference'),
    '/v1/signed': op('Signed timestamp', 'Ed25519-signed time. Verify with the keys at /.well-known/clocknow-keys.json.', [q('nonce', 'Your own random value, echoed inside the signature to prevent replay.')], 'Generic'),
    '/v1/sun': op('Sunrise and sunset', 'Sun times for a place and date.', [q('lat', 'Latitude.', { type: 'number' }, true, 24.86), q('lon', 'Longitude.', { type: 'number' }, true, 67), q('date', 'YYYY-MM-DD (default: today).'), q('tz', 'IANA zone for the returned local times.')], 'Generic', { open: false }),
    '/v1/moon': op('Moon phase', 'Phase and illumination at an instant.', [q('t', 'Unix milliseconds (default: now).', { type: 'integer' })], 'Generic', { open: false }),
    '/v1/seasons': op('Equinoxes and solstices', 'Dates of the four seasonal events in a year.', [q('year', 'Year.', { type: 'integer' }, true, 2027)], 'Generic', { open: false }),
    '/.well-known/clocknow-keys.json': { get: { summary: 'Public signing keys', responses: { 200: { description: 'Key list', content: { 'application/json': { schema: { type: 'object' } } } } } } },
    '/signup': { post: { summary: 'Email me a key link', description: 'Sends a one-time link (valid 30 minutes) to the address. Up to 3 per address per hour.', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } }, responses: { 200: { description: 'Link sent' }, 400: err, 429: err, 503: err } } },
    '/signup/confirm': { post: { summary: 'Exchange the link token for a key', description: 'The key is shown once; only its hash is stored.', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } } }, responses: { 200: { description: 'Your key', content: { 'application/json': { schema: { type: 'object', properties: { key: { type: 'string' }, tier: { type: 'string' } } } } } }, 410: err } } },
  },
  components: {
    securitySchemes: { ApiKey: { type: 'http', scheme: 'bearer', description: 'Send `Authorization: Bearer ck_live_…` (or `X-API-Key`).' } },
    headers: {
      Limit: { description: 'Requests allowed this month.', schema: { type: 'integer' } },
      Remaining: { description: 'Requests left this month.', schema: { type: 'integer' } },
    },
    responses: {
      Unauthorized: { description: 'Missing, invalid or revoked key, or an endpoint that needs one.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Quota: { description: 'Monthly limit reached. `Retry-After` is the seconds until the counter resets.', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
      Meta: { type: 'object', required: ['error_bound_ms', 'tzdata_version', 'server_id'], properties: { error_bound_ms: { type: ['number', 'null'] }, tzdata_version: { type: ['string', 'null'] }, server_id: { type: 'string' } } },
      ZoneTime: { type: 'object', required: ['zone', 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'weekday', 'offset_seconds', 'abbreviation', 'is_dst'], properties: { zone: { type: 'string' }, year: { type: 'integer' }, month: { type: 'integer' }, day: { type: 'integer' }, hour: { type: 'integer' }, minute: { type: 'integer' }, second: { type: 'integer' }, millisecond: { type: 'integer' }, weekday: { type: 'integer', description: '1 = Monday … 7 = Sunday.' }, offset_seconds: { type: 'integer' }, abbreviation: { type: 'string' }, is_dst: { type: 'boolean' } } },
      Transition: { type: 'object', properties: { at_unix_ms: { type: 'integer' }, offset_before_seconds: { type: 'integer' }, offset_after_seconds: { type: 'integer' }, abbreviation_after: { type: 'string' }, is_dst_after: { type: 'boolean' } } },
      Now: { type: 'object', properties: { t1: { type: 'number' }, t2: { type: 'number' }, server_id: { type: 'string' }, tzdata_version: { type: ['string', 'null'] }, zone: { oneOf: [{ $ref: '#/components/schemas/ZoneTime' }, { type: 'null' }] } } },
      Zone: { type: 'object', required: ['unix_ms', 'time', 'next_change', 'meta'], properties: { unix_ms: { type: 'integer' }, time: { $ref: '#/components/schemas/ZoneTime' }, next_change: { oneOf: [{ $ref: '#/components/schemas/Transition' }, { type: 'null' }] }, meta: { $ref: '#/components/schemas/Meta' } } },
      Convert: { type: 'object', required: ['unix_ms', 'from', 'to', 'meta'], properties: { unix_ms: { type: 'integer' }, from: { $ref: '#/components/schemas/ZoneTime' }, to: { $ref: '#/components/schemas/ZoneTime' }, meta: { $ref: '#/components/schemas/Meta' } } },
      Difference: { type: 'object', required: ['unix_ms', 'a', 'b', 'b_ahead_of_a_seconds', 'meta'], properties: { unix_ms: { type: 'integer' }, a: { $ref: '#/components/schemas/ZoneTime' }, b: { $ref: '#/components/schemas/ZoneTime' }, b_ahead_of_a_seconds: { type: 'integer' }, meta: { $ref: '#/components/schemas/Meta' } } },
      Generic: { type: 'object', additionalProperties: true },
    },
  },
};
writeFileSync(new URL('../apps/web/public/openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log('wrote apps/web/public/openapi.json', Object.keys(spec.paths).length, 'paths');
