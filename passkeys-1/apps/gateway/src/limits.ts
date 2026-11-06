// Tiers, quota periods and the 429 decision. Pure.
export type Tier = 'anon' | 'free' | 'developer' | 'business' | 'enterprise';

/** Requests per calendar month (UTC). `null` = contract-defined, not metered here. */
export const MONTHLY_LIMIT: Record<Tier, number | null> = {
  anon: 10_000,
  free: 10_000,
  developer: 500_000,
  business: 5_000_000,
  enterprise: null,
};

/** What a visitor without a key may call. Everything else needs a key. */
const OPEN_PATHS = new Set(['/v1/now', '/v1/signed', '/v1/zone', '/v1/convert', '/v1/difference']);
export const isOpenPath = (path: string): boolean => OPEN_PATHS.has(path);

/** Cheap clock-sync calls the website itself makes; never counted when they come from our own origins. */
const FIRST_PARTY_FREE = new Set(['/v1/now', '/v1/signed', '/v1/sync']);
export const isFirstPartyFree = (path: string): boolean => FIRST_PARTY_FREE.has(path);

export const isTier = (s: string): s is Tier => s in MONTHLY_LIMIT;

export function period(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Unix ms of the next period start (when the counters reset). */
export function resetAtMs(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export interface Decision {
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
}

/** `used` already includes the current request. */
export function decide(tier: Tier, used: number): Decision {
  const limit = MONTHLY_LIMIT[tier];
  if (limit === null) return { allowed: true, limit, remaining: null };
  return { allowed: used <= limit, limit, remaining: Math.max(0, limit - used) };
}

export function quotaHeaders(d: Decision, tier: Tier, nowMs: number): Record<string, string> {
  const h: Record<string, string> = { 'x-clocknow-tier': tier, 'x-ratelimit-reset': String(Math.floor(resetAtMs(nowMs) / 1000)) };
  if (d.limit !== null) h['x-ratelimit-limit'] = String(d.limit);
  if (d.remaining !== null) h['x-ratelimit-remaining'] = String(d.remaining);
  if (!d.allowed) h['retry-after'] = String(Math.max(1, Math.ceil((resetAtMs(nowMs) - nowMs) / 1000)));
  return h;
}
