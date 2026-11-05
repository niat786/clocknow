// <tm-countdown> — Essentials countdown. `?t=<unix s>&z=<zone>&n=<title>` shows a countdown;
// without `t` it shows the creation form. Uses the synced clock, so it shows the accuracy badge.
import { engine } from '../engine/engine';
import { now, getStatus, subscribe, startSync } from './clock-source';
import { formatDate, formatHM, pill, wallParts } from './clock-format';
import { MAX_TITLE, buildQuery, parseCountdownParams, splitRemaining } from './countdown-format';

const pad2 = (n: number): string => String(n).padStart(2, '0');

class TmCountdown extends HTMLElement {
  #raf = 0;
  #unsub: (() => void) | null = null;
  #target = 0;
  #lastSec = -1;
  #lastState = '';
  #original = '';

  connectedCallback(): void {
    this.#original = document.title;
    const p = parseCountdownParams(location.search);
    if (p) this.#showCountdown(p.target * 1000, p.zone, p.title);
    else this.#showForm();
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    this.#unsub?.();
  }

  // ---- creation form ----
  #showForm(): void {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.innerHTML =
      '<form class="cd-form" novalidate>' +
      `<label>Title (optional)<input name="title" maxlength="${MAX_TITLE}" autocomplete="off" /></label>` +
      '<label>Date<input name="date" type="date" required /></label>' +
      '<label>Time<input name="time" type="time" value="00:00" required /></label>' +
      '<label>Time zone<input name="zone" list="cd-zones" autocomplete="off" required /></label>' +
      '<datalist id="cd-zones"></datalist>' +
      '<button type="submit" data-go>Start countdown</button>' +
      '<p class="tm-status" data-error role="alert"></p></form>';
    (this.querySelector('[name=zone]') as HTMLInputElement).value = zone;
    const list = this.querySelector('datalist') as HTMLDataListElement;
    const zones: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    for (const z of zones) list.append(new Option(z));
    this.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.#submit(e.currentTarget as HTMLFormElement);
    });
  }

  async #submit(form: HTMLFormElement): Promise<void> {
    const f = new FormData(form);
    const err = form.querySelector('[data-error]') as HTMLElement;
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f.get('date') ?? ''));
    const t = /^(\d{2}):(\d{2})/.exec(String(f.get('time') || '00:00'));
    const zone = String(f.get('zone') ?? '').trim();
    if (!d || !t) {
      err.textContent = 'Choose a date and time.';
      return;
    }
    try {
      const ms = await engine.wallToUnixMs(+d[1], +d[2], +d[3], +t[1], +t[2], 0, zone);
      if (ms <= now()) {
        err.textContent = 'Choose a time in the future.';
        return;
      }
      const q = buildQuery({ t: Math.floor(ms / 1000), z: zone, n: String(f.get('title') ?? '') });
      location.assign(`${location.pathname}?${q}`);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'Could not read that date.';
    }
  }

  // ---- countdown view ----
  #showCountdown(targetMs: number, zone: string, title: string): void {
    this.#target = targetMs;
    this.innerHTML =
      '<h2 class="cd-title" data-title></h2>' +
      '<div class="cd-grid" role="timer" aria-live="off">' +
      '<div><span data-v="days">0</span><small>days</small></div>' +
      '<div><span data-v="hours">00</span><small>hours</small></div>' +
      '<div><span data-v="minutes">00</span><small>minutes</small></div>' +
      '<div><span data-v="seconds">00</span><small>seconds</small></div></div>' +
      '<p class="cd-target" data-target></p>' +
      '<p class="tm-status" data-status role="status"></p>' +
      '<div data-pill class="tzc-pill" data-state="syncing"><span class="tzc-dot" aria-hidden="true"></span><span data-pill-text>Syncing…</span></div>' +
      '<p class="cd-actions"><button type="button" data-copy>Copy link</button> <a href="' + location.pathname + '">New countdown</a></p>';
    (this.querySelector('[data-title]') as HTMLElement).textContent = title || 'Countdown';
    document.title = `${title || 'Countdown'} — clocknow`;
    this.querySelector('[data-copy]')?.addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      navigator.clipboard.writeText(location.href).then(
        () => (b.textContent = 'Copied'),
        () => (b.textContent = 'Copy the address bar'),
      );
    });
    void this.#describeTarget(targetMs, zone);
    this.#unsub = subscribe(() => this.#updatePill());
    this.#raf = requestAnimationFrame(this.#tick);
    startSync();
  }

  async #describeTarget(targetMs: number, zone: string): Promise<void> {
    const el = this.querySelector('[data-target]') as HTMLElement;
    try {
      const z = await engine.zoneTime(targetMs, zone);
      const p = wallParts(targetMs, z.offset_seconds);
      el.textContent = `${formatDate(p)} · ${formatHM(p, false).hm} ${zone} (${z.abbreviation})`;
    } catch {
      el.textContent = new Date(targetMs).toUTCString();
    }
  }

  #tick = (): void => {
    const t = now();
    const sec = Math.floor(t / 1000);
    if (sec !== this.#lastSec) {
      this.#lastSec = sec;
      const r = splitRemaining(this.#target - t);
      this.#set('days', String(r.days));
      this.#set('hours', pad2(r.hours));
      this.#set('minutes', pad2(r.minutes));
      this.#set('seconds', pad2(r.seconds));
      this.#updatePill();
      if (r.done) {
        (this.querySelector('[data-status]') as HTMLElement).textContent = "It's time!";
        document.title = `It's time! — ${this.#original}`;
        this.dataset.state = 'done';
        return;
      }
    }
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #set(key: string, text: string): void {
    const el = this.querySelector<HTMLElement>(`[data-v=${key}]`);
    if (el && el.textContent !== text) el.textContent = text;
  }

  #updatePill(): void {
    const s = getStatus();
    const since = s.lastSyncAt === null ? 0 : performance.timeOrigin + performance.now() - s.lastSyncAt;
    const { state, text } = pill(s.phase, s.estimate, since);
    const pillEl = this.querySelector<HTMLElement>('[data-pill]');
    const textEl = this.querySelector<HTMLElement>('[data-pill-text]');
    if (!pillEl || !textEl) return;
    textEl.textContent = text;
    if (state !== this.#lastState) {
      this.#lastState = state;
      pillEl.dataset.state = state;
    }
  }
}

if (!customElements.get('tm-countdown')) customElements.define('tm-countdown', TmCountdown);
