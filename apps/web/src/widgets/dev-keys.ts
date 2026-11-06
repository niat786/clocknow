// <dev-keys> — email sign-up for an API key, and the one-time reveal when the emailed link is opened.
import { looksLikeEmail, tokenFromHash } from '../lib/dev-signup';

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: 'Could not reach the server. Check your connection and try again.' } };
  }
}

class DevKeys extends HTMLElement {
  #status!: HTMLElement;

  connectedCallback(): void {
    this.innerHTML =
      '<form class="dk-form" novalidate><label for="dk-email">Email</label>' +
      '<div class="dk-row"><input id="dk-email" type="email" autocomplete="email" required placeholder="you@example.com" />' +
      '<button type="submit">Email me a key link</button></div></form>' +
      '<p class="dk-status" role="status" aria-live="polite"></p><div class="dk-key" hidden></div>';
    this.#status = this.querySelector('.dk-status') as HTMLElement;
    this.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.#request();
    });
    const token = tokenFromHash(location.hash);
    if (token) void this.#reveal(token);
  }

  async #request(): Promise<void> {
    const email = (this.querySelector('input') as HTMLInputElement).value.trim();
    if (!looksLikeEmail(email)) return void (this.#status.textContent = 'Enter a valid email address.');
    this.#status.textContent = 'Sending…';
    const r = await post('/signup', { email });
    this.#status.textContent = r.ok ? 'Check your inbox. The link works for 30 minutes.' : String(r.data.error ?? 'Something went wrong.');
  }

  async #reveal(token: string): Promise<void> {
    history.replaceState(null, '', location.pathname + location.search); // the token must not stay in the address bar
    this.#status.textContent = 'Creating your key…';
    const r = await post('/signup/confirm', { token });
    if (!r.ok || typeof r.data.key !== 'string') return void (this.#status.textContent = String(r.data.error ?? 'This link did not work.'));
    const box = this.querySelector('.dk-key') as HTMLElement;
    box.hidden = false;
    box.innerHTML = '<p><strong>Your API key</strong>. Copy it now: it is shown only once.</p><p><code class="dk-code"></code></p><button type="button">Copy key</button>';
    const key = r.data.key;
    (box.querySelector('.dk-code') as HTMLElement).textContent = key;
    box.querySelector('button')?.addEventListener('click', () => void navigator.clipboard?.writeText(key).then(() => (this.#status.textContent = 'Copied.')));
    this.#status.textContent = '';
  }
}
customElements.define('dev-keys', DevKeys);
