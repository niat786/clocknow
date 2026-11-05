// <tz-clock zone="Asia/Karachi" hour12 no-seconds> — Essentials clock.
// Paints immediately from the device clock, then corrects once synced.
import { engine } from '../engine/engine';
import { now, getStatus, subscribe, startSync } from './clock-source';
import { formatDate, formatHM, formatSS, intlOffsetSeconds, pill, wallParts } from './clock-format';

const idle = (fn: () => void): void => {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 200);
};

class TzClock extends HTMLElement {
  #zone = 'UTC';
  #offsetSec = 0;
  #nextChangeAt = Number.POSITIVE_INFINITY;
  #raf = 0;
  #lastSec = -1;
  #lastDay = -1;
  #lastState = '';
  #unsub: (() => void) | null = null;
  #hm!: HTMLElement;
  #ss!: HTMLElement;
  #ap!: HTMLElement;
  #date!: HTMLElement;
  #pill!: HTMLElement;
  #pillText!: HTMLElement;

  connectedCallback(): void {
    this.#zone = this.getAttribute('zone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!this.querySelector('[data-hm]')) {
      this.innerHTML =
        '<div class="tzc-time"><span data-hm></span><span data-ss class="tzc-ss"></span><span data-ap class="tzc-ap"></span></div>' +
        '<div data-date class="tzc-date"></div>' +
        '<div data-pill class="tzc-pill" data-state="syncing"><span class="tzc-dot" aria-hidden="true"></span><span data-pill-text>Syncing…</span></div>';
    }
    const q = (s: string) => this.querySelector<HTMLElement>(s) as HTMLElement;
    this.#hm = q('[data-hm]');
    this.#ss = q('[data-ss]');
    this.#ap = q('[data-ap]');
    this.#date = q('[data-date]');
    this.#pill = q('[data-pill]');
    this.#pillText = q('[data-pill-text]');
    this.#ss.hidden = this.hasAttribute('no-seconds');

    this.#offsetSec = intlOffsetSeconds(this.#zone, now());
    this.#paint(now());
    this.#raf = requestAnimationFrame(this.#tick);
    this.#unsub = subscribe(() => this.#updatePill());
    idle(() => {
      startSync();
      void this.#refreshZone();
    });
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    this.#unsub?.();
  }

  async #refreshZone(): Promise<void> {
    try {
      const t = now();
      const [z, next] = await Promise.all([engine.zoneTime(t, this.#zone), engine.nextTransition(t, this.#zone)]);
      this.#offsetSec = z.offset_seconds;
      this.#nextChangeAt = next ? next.at_unix_ms : Number.POSITIVE_INFINITY;
      this.#lastSec = -1;
      this.#lastDay = -1;
    } catch {
      // keep the Intl fallback offset
    }
  }

  #tick = (): void => {
    const t = now();
    if (t >= this.#nextChangeAt) {
      this.#offsetSec = intlOffsetSeconds(this.#zone, t);
      this.#nextChangeAt = Number.POSITIVE_INFINITY;
      void this.#refreshZone();
    }
    const sec = Math.floor(t / 1000);
    if (sec !== this.#lastSec) {
      this.#lastSec = sec;
      this.#paint(t);
      this.#updatePill();
    }
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #paint(t: number): void {
    const p = wallParts(t, this.#offsetSec);
    const { hm, period } = formatHM(p, this.hasAttribute('hour12'));
    this.#hm.textContent = hm;
    this.#ss.textContent = formatSS(p);
    this.#ap.textContent = period;
    if (p.d !== this.#lastDay) {
      this.#lastDay = p.d;
      this.#date.textContent = formatDate(p, this.getAttribute('locale') ?? undefined);
    }
  }

  #updatePill(): void {
    const s = getStatus();
    const since = s.lastSyncAt === null ? 0 : performance.timeOrigin + performance.now() - s.lastSyncAt;
    const { state, text } = pill(s.phase, s.estimate, since);
    this.#pillText.textContent = text;
    if (state !== this.#lastState) {
      this.#lastState = state;
      this.#pill.dataset.state = state;
      this.setAttribute('aria-label', `Time in ${this.#zone}. Clock ${state}.`);
    }
  }
}

if (!customElements.get('tz-clock')) customElements.define('tz-clock', TzClock);
