// <verify-time> — fetches a signed timestamp with a fresh nonce and checks its Ed25519 signature
// in the browser, so visitors can see the time really came from clocknow and was not replayed.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { newNonce, parseKeys, parseSigned, verifySigned, type Verdict } from '../lib/signed-time';
import { formatIsoUtc } from './convert-params';

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';

const REASON: Record<Exclude<Verdict, { ok: true }>['reason'], string> = {
  unknown_key: 'The signing key is not in the published key list.',
  bad_signature: 'The signature does not match. Do not trust this timestamp.',
  malformed: 'The response or key is malformed.',
  unsupported: 'This browser cannot check Ed25519 signatures yet. Try a current Chrome, Edge, Firefox or Safari.',
  nonce_mismatch: 'The response is for a different request (possible replay).',
};

class VerifyTime extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML =
      '<button type="button" class="vt-go">Verify signed time</button>' +
      '<p class="vt-status" role="status" aria-live="polite"></p><dl class="cv-out vt-out"></dl>';
    this.querySelector('button')?.addEventListener('click', () => void this.#run());
  }

  async #run(): Promise<void> {
    const status = this.querySelector('.vt-status') as HTMLElement;
    const out = this.querySelector('.vt-out') as HTMLElement;
    const btn = this.querySelector('button') as HTMLButtonElement;
    out.replaceChildren();
    status.textContent = 'Checking…';
    btn.disabled = true;
    try {
      const nonce = newNonce();
      const sent = now();
      const [res, keysRes] = await Promise.all([
        fetch(`${API}/v1/signed?nonce=${nonce}`, { cache: 'no-store' }),
        fetch(`${API}/.well-known/clocknow-keys.json`),
      ]);
      const received = now();
      if (!res.ok || !keysRes.ok) throw new Error(`server answered ${res.status}/${keysRes.status}`);
      const st = parseSigned(await res.json());
      if (!st) throw new Error('the response was not a signed timestamp');
      const verdict = await verifySigned(st, parseKeys(await keysRes.json()), nonce);
      if (!verdict.ok) {
        status.textContent = `Not verified. ${REASON[verdict.reason]}`;
        return;
      }
      const utc = await engine.zoneTime(st.t, 'UTC');
      const mid = (sent + received) / 2;
      const half = Math.round((received - sent) / 2);
      const diff = Math.round(st.t - mid);
      status.textContent = `Verified: signed by clocknow key “${verdict.key.kid}” (${verdict.key.status}) for this request.`;
      const rows: Array<[string, string]> = [
        ['Server time', `${formatIsoUtc(utc)} ±${st.radius_ms} ms`],
        ['Server', st.server],
        ['This page’s clock', `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} ms from the server (±${half} ms network)`],
      ];
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        out.append(dt, dd);
      }
    } catch (e) {
      status.textContent = `Could not check: ${e instanceof Error ? e.message : String(e)}.`;
    } finally {
      btn.disabled = false;
    }
  }
}

if (!customElements.get('verify-time')) customElements.define('verify-time', VerifyTime);
