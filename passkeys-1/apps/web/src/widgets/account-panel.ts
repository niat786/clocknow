// <account-panel> — sign in (passkey or emailed link), then manage passkeys and API keys.
import { dayText, passkeysSupported, usageText } from '../lib/account-view';
import { looksLikeEmail, tokenFromHash } from '../lib/dev-signup';

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';
type Data = Record<string, unknown>;
interface Passkey { id: string; name: string; created_at: number; last_used_at: number | null }
interface Key { id: number; prefix: string; tier: string; created_at: number; revoked_at: number | null; used_this_month: number }
interface Account { email: string; passkeys: Passkey[]; keys: Key[]; max_active_keys: number }

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Data }> {
  try {
    const res = await fetch(API + path, {
      method, credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection and try again.' } };
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

class AccountPanel extends HTMLElement {
  #status = el('p', 'ac-status');
  #body = el('div', 'ac-body');
  #newKey = el('div', 'ac-newkey');
  #passkeys = passkeysSupported(window);

  connectedCallback(): void {
    this.#status.setAttribute('role', 'status');
    this.#status.setAttribute('aria-live', 'polite');
    this.#newKey.hidden = true;
    this.replaceChildren(this.#body, this.#status, this.#newKey);
    const token = tokenFromHash(location.hash);
    void (token ? this.#viaLink(token) : this.#load());
    // A link opened while this page is already showing arrives as a hash change, not a reload.
    addEventListener('hashchange', () => { const t = tokenFromHash(location.hash); if (t) void this.#viaLink(t); });
  }

  #say(msg: string): void { this.#status.textContent = msg; }

  async #viaLink(token: string): Promise<void> {
    history.replaceState(null, '', location.pathname + location.search); // the token must not stay in the address bar
    this.#say('Signing you in…');
    const r = await call('POST', '/auth/email/verify', { token });
    if (!r.ok) { this.#signedOut(); return void this.#say(String(r.data.error ?? 'This link did not work. Request a new one.')); }
    await this.#load();
  }

  async #load(): Promise<void> {
    const r = await call('GET', '/account');
    if (r.ok) return this.#signedIn(r.data as unknown as Account);
    this.#signedOut();
    if (r.status === 0) this.#say(String(r.data.error));
  }

  #signedOut(): void {
    const form = el('form', 'ac-form');
    form.noValidate = true;
    const label = el('label', '', 'Email');
    label.htmlFor = 'ac-email';
    const input = el('input');
    input.id = 'ac-email'; input.type = 'email'; input.autocomplete = 'username webauthn'; input.placeholder = 'you@example.com';
    const send = el('button', 'ac-primary', 'Email me a sign-in link');
    send.type = 'submit';
    const row = el('div', 'ac-row');
    row.append(input, send);
    form.append(label, row);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!looksLikeEmail(email)) return this.#say('Enter a valid email address.');
      this.#say('Sending…');
      void call('POST', '/auth/email', { email }).then((r) => this.#say(r.ok ? 'Check your inbox. The link works for 30 minutes.' : String(r.data.error ?? 'Something went wrong.')));
    });
    const parts: HTMLElement[] = [];
    if (this.#passkeys) {
      parts.push(button('Sign in with a passkey', () => void this.#passkeyLogin(), 'ac-primary ac-passkey'), el('p', 'ac-or', 'or use your email'));
    }
    this.#body.replaceChildren(...parts, form);
  }

  async #passkeyLogin(): Promise<void> {
    this.#say('Waiting for your passkey…');
    const o = await call('POST', '/auth/passkey/login/options', {});
    if (!o.ok) return this.#say(String(o.data.error ?? 'Could not start sign-in.'));
    try {
      const cred = (await navigator.credentials.get({
        publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(o.data.options as never),
      })) as PublicKeyCredential | null;
      if (!cred) return this.#say('Sign-in cancelled.');
      const v = await call('POST', '/auth/passkey/login/verify', { challengeId: o.data.challengeId, response: cred.toJSON() });
      if (!v.ok) return this.#say(String(v.data.error ?? 'That passkey was not accepted.'));
      this.#say('');
      await this.#load();
    } catch {
      this.#say('Sign-in cancelled or not available on this device. You can use the email link instead.');
    }
  }

  async #addPasskey(): Promise<void> {
    this.#say('Follow your device prompt…');
    const o = await call('POST', '/auth/passkey/register/options', {});
    if (!o.ok) return this.#say(String(o.data.error ?? 'Could not start.'));
    try {
      const cred = (await navigator.credentials.create({
        publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(o.data.options as never),
      })) as PublicKeyCredential | null;
      if (!cred) return this.#say('Cancelled.');
      const v = await call('POST', '/auth/passkey/register/verify', { challengeId: o.data.challengeId, response: cred.toJSON(), name: this.#deviceName() });
      this.#say(v.ok ? 'Passkey added.' : String(v.data.error ?? 'That passkey was not accepted.'));
      if (v.ok) await this.#load();
    } catch {
      this.#say('Cancelled or not available on this device.');
    }
  }

  #deviceName(): string {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
    return `${os} passkey`;
  }

  #signedIn(a: Account): void {
    const head = el('p', 'ac-who');
    head.append('Signed in as ', el('strong', '', a.email), ' ');
    head.append(button('Sign out', () => void call('POST', '/auth/logout', {}).then(() => { this.#newKey.hidden = true; this.#say(''); this.#signedOut(); }), 'ac-link'));

    const pk = el('section');
    pk.append(el('h2', '', 'Passkeys'));
    if (!a.passkeys.length) pk.append(el('p', '', 'No passkeys yet. A passkey lets you sign in with your fingerprint, face or device PIN.'));
    const pl = el('ul', 'ac-list');
    for (const p of a.passkeys) {
      const li = el('li');
      li.append(el('span', 'ac-name', p.name), el('span', 'ac-meta', `added ${dayText(p.created_at)}, last used ${dayText(p.last_used_at)}`),
        button('Remove', () => void call('POST', '/account/passkeys/remove', { id: p.id }).then(() => this.#load()), 'ac-link'));
      pl.append(li);
    }
    pk.append(pl);
    if (this.#passkeys) pk.append(button('Add a passkey', () => void this.#addPasskey(), 'ac-primary'));
    else pk.append(el('p', 'ac-meta', 'This browser cannot create passkeys. Email sign-in still works.'));

    const ks = el('section');
    ks.append(el('h2', '', 'API keys'));
    const active = a.keys.filter((k) => !k.revoked_at);
    const kl = el('ul', 'ac-list');
    for (const k of active) {
      const li = el('li');
      li.append(el('code', 'ac-name', `${k.prefix}…`), el('span', 'ac-meta', `${k.tier} · ${usageText(k.used_this_month, k.tier)} · created ${dayText(k.created_at)}`),
        button('Revoke', () => void call('POST', '/account/keys/revoke', { id: k.id }).then((r) => { this.#say(r.ok ? 'Key revoked.' : String(r.data.error)); return this.#load(); }), 'ac-link'));
      kl.append(li);
    }
    ks.append(kl);
    const add = button('Create a key', () => void this.#createKey(), 'ac-primary');
    add.disabled = active.length >= a.max_active_keys;
    ks.append(add);
    if (add.disabled) ks.append(el('p', 'ac-meta', `You can have ${a.max_active_keys} active keys. Revoke one to make another.`));
    this.#body.replaceChildren(head, pk, ks);
  }

  async #createKey(): Promise<void> {
    const r = await call('POST', '/account/keys', {});
    if (!r.ok || typeof r.data.key !== 'string') return this.#say(String(r.data.error ?? 'Could not create a key.'));
    const key = r.data.key;
    const code = el('code', 'ac-code', key);
    this.#newKey.replaceChildren(el('p', '', 'Your new key. Copy it now: it is shown only once.'), code,
      button('Copy key', () => void navigator.clipboard?.writeText(key).then(() => this.#say('Copied.')), 'ac-primary'));
    this.#newKey.hidden = false;
    await this.#load();
  }
}
customElements.define('account-panel', AccountPanel);
