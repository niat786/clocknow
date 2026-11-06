// What a signed-in person sees and does: their passkeys and API keys.
import type { Env } from './env.ts';
import { generateKey, keyPrefix, sha256Hex } from './keys.ts';
import { period } from './limits.ts';
import type { User } from './session.ts';
import { json } from './signup.ts';

export const MAX_ACTIVE_KEYS = 5;

export async function account(env: Env, user: User, nowMs: number): Promise<unknown> {
  const passkeys = (
    await env.DB.prepare('SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at').bind(user.id).all()
  ).results ?? [];
  const keys = (
    await env.DB.prepare(
      `SELECT k.id AS id, k.prefix AS prefix, k.tier AS tier, k.created_at AS created_at, k.revoked_at AS revoked_at,
              COALESCE(u.count, 0) AS used_this_month
         FROM keys k LEFT JOIN usage u ON u.subject = 'key:' || k.id AND u.period = ?
        WHERE k.user_id = ? ORDER BY k.created_at`,
    ).bind(period(nowMs), user.id).all()
  ).results ?? [];
  return { email: user.email, passkeys, keys, max_active_keys: MAX_ACTIVE_KEYS };
}

export async function createKey(env: Env, user: User, nowS: number): Promise<Response> {
  const active = await env.DB.prepare('SELECT COUNT(*) AS n FROM keys WHERE user_id = ? AND revoked_at IS NULL').bind(user.id).first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS) return json({ error: `you can have ${MAX_ACTIVE_KEYS} active keys; revoke one first` }, 409);
  const key = generateKey();
  await env.DB.prepare('INSERT INTO keys (key_hash, prefix, email, tier, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(key), keyPrefix(key), user.email, 'free', nowS, user.id)
    .run();
  return json({ key, tier: 'free', note: 'Store this key now; it is shown only once.' });
}

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const b = (await req.json().catch(() => null)) as unknown;
  return typeof b === 'object' && b !== null ? (b as Record<string, unknown>) : {};
}

export async function revokeKey(req: Request, env: Env, user: User, nowS: number): Promise<Response> {
  const id = (await bodyOf(req)).id;
  if (typeof id !== 'number' || !Number.isInteger(id)) return json({ error: 'id is required' }, 400);
  const r = await env.DB.prepare('UPDATE keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(nowS, id, user.id).run();
  return r.meta.changes === 1 ? json({ ok: true }) : json({ error: 'no such active key' }, 404);
}

export async function removePasskey(req: Request, env: Env, user: User): Promise<Response> {
  const id = (await bodyOf(req)).id;
  if (typeof id !== 'string' || id.length > 512) return json({ error: 'id is required' }, 400);
  const r = await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return r.meta.changes === 1 ? json({ ok: true }) : json({ error: 'no such passkey' }, 404);
}
