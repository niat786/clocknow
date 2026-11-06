// WebAuthn registration and sign-in. The browser ceremony runs on the site (clocknow.net); this verifies it.
// The cryptography is @simplewebauthn/server's: we only store keys, check challenges and start sessions.
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Env } from './env.ts';
import { hex } from './keys.ts';
import { startSession, type User } from './session.ts';
import { json } from './signup.ts';

/** The four library calls, swappable in tests so the storage and challenge rules can be tested alone. */
export const webauthn = { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse };

const CHALLENGE_TTL_S = 5 * 60;

export const toB64u = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const origins = (env: Env): string[] => (env.SITE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function putChallenge(env: Env, challenge: string, purpose: 'register' | 'login', userId: number | null, nowS: number): Promise<string> {
  await env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(nowS).run();
  const id = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await env.DB.prepare('INSERT INTO challenges (id, challenge, purpose, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, challenge, purpose, userId, nowS + CHALLENGE_TTL_S)
    .run();
  return id;
}

/** A challenge works once: taking it deletes it. */
async function takeChallenge(env: Env, id: unknown, purpose: 'register' | 'login', nowS: number): Promise<{ challenge: string; user_id: number | null } | null> {
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) return null;
  return env.DB.prepare('DELETE FROM challenges WHERE id = ? AND purpose = ? AND expires_at >= ? RETURNING challenge, user_id').bind(id, purpose, nowS).first();
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const b = (await req.json().catch(() => null)) as unknown;
  return typeof b === 'object' && b !== null ? (b as Record<string, unknown>) : {};
}

export async function registerOptions(env: Env, user: User, nowS: number): Promise<Response> {
  const existing = (await env.DB.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?').bind(user.id).all<{ id: string; transports: string | null }>()).results ?? [];
  const options = await webauthn.generateRegistrationOptions({
    rpName: env.RP_NAME ?? 'clocknow',
    rpID: env.RP_ID,
    userName: user.email,
    userID: new TextEncoder().encode(`user-${user.id}`), // an opaque handle, never the email
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ? (JSON.parse(c.transports) as string[]) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  return json({ challengeId: await putChallenge(env, options.challenge, 'register', user.id, nowS), options });
}

export async function registerVerify(req: Request, env: Env, user: User, nowS: number): Promise<Response> {
  const b = await body(req);
  const ch = await takeChallenge(env, b.challengeId, 'register', nowS);
  if (!ch || ch.user_id !== user.id) return json({ error: 'this passkey request expired; start again' }, 400);
  let info;
  try {
    info = await webauthn.verifyRegistrationResponse({
      response: b.response as RegistrationResponseJSON,
      expectedChallenge: ch.challenge,
      expectedOrigin: origins(env),
      expectedRPID: env.RP_ID,
      requireUserVerification: false,
    });
  } catch {
    return json({ error: 'could not verify this passkey' }, 400);
  }
  if (!info.verified || !info.registrationInfo) return json({ error: 'could not verify this passkey' }, 400);
  const { credential } = info.registrationInfo;
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 40) : 'Passkey';
  const exists = await env.DB.prepare('SELECT 1 AS x FROM passkeys WHERE id = ?').bind(credential.id).first();
  if (exists) return json({ error: 'this passkey is already registered' }, 409);
  await env.DB.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(credential.id, user.id, toB64u(credential.publicKey), credential.counter, credential.transports ? JSON.stringify(credential.transports) : null, name, nowS)
    .run();
  return json({ ok: true, name });
}

export async function loginOptions(env: Env, nowS: number): Promise<Response> {
  // Discoverable credentials: no username, the authenticator offers the passkeys it holds for this site.
  const options = await webauthn.generateAuthenticationOptions({ rpID: env.RP_ID, userVerification: 'preferred' });
  return json({ challengeId: await putChallenge(env, options.challenge, 'login', null, nowS), options });
}

export async function loginVerify(req: Request, env: Env, nowS: number): Promise<Response> {
  const fail = (): Response => json({ error: 'could not sign in with this passkey' }, 401);
  const b = await body(req);
  const ch = await takeChallenge(env, b.challengeId, 'login', nowS);
  const response = b.response as AuthenticationResponseJSON | undefined;
  if (!ch || typeof response?.id !== 'string') return fail();
  const pk = await env.DB.prepare('SELECT id, user_id, public_key, counter, transports FROM passkeys WHERE id = ?')
    .bind(response.id)
    .first<{ id: string; user_id: number; public_key: string; counter: number; transports: string | null }>();
  if (!pk) return fail();
  let result;
  try {
    result = await webauthn.verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origins(env),
      expectedRPID: env.RP_ID,
      credential: { id: pk.id, publicKey: fromB64u(pk.public_key), counter: pk.counter, transports: pk.transports ? JSON.parse(pk.transports) : undefined },
      requireUserVerification: false,
    });
  } catch {
    return fail(); // includes a counter that went backwards (a cloned authenticator)
  }
  if (!result.verified) return fail();
  await env.DB.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').bind(result.authenticationInfo.newCounter, nowS, pk.id).run();
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(pk.user_id).first<User>();
  return user ? startSession(env, user, nowS) : fail();
}
