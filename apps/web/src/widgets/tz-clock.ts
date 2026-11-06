// <tz-clock zone="Asia/Karachi" hour12 no-seconds> — Essentials clock.
// Paints immediately from the device clock, then corrects once synced.
// With the `faces` attribute, a visual face (flip, …) can be drawn over the digits; the plain
// digits stay in the page for screen readers and as the fallback if a face fails to load.
import { engine } from '../engine/engine';
import { now, getStatus, subscribe, startSync } from './clock-source';
import { formatDate, formatHM, formatSS, intlOffsetSeconds, pill, wallParts } from './clock-format';
import { FACE_EVENT, chosenFace, isFaceId, loadFace, type FaceId } from './faces';
import type { Face } from '../themes/face';

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
  #ms: HTMLElement | null = null;
  #lastMs = '';
  #face: Face | null = null;
  #faceBox: HTMLElement | null = null;
  #faceToken = 0;

  connectedCallback(): void {
    this.#zone = this.getAttribute('zone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!this.querySelector('[data-hm]')) {
      this.innerHTML =
        '<div class="tzc-time"><span data-hm></span><span data-ss class="tzc-ss"></span><span data-ms class="tzc-ms" aria-hidden="true"></span><span data-ap class="tzc-ap"></span></div>' +
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
    this.#ms = this.querySelector<HTMLElement>('[data-ms]');
    this.#applyFlags();

    this.#offsetSec = intlOffsetSeconds(this.#zone, now());
    this.#paint(now());
    this.setAttribute('data-ready', '');
    this.#raf = requestAnimationFrame(this.#tick);
    this.#unsub = subscribe(() => this.#updatePill());
    idle(() => {
      startSync();
      void this.#refreshZone();
      if (this.hasAttribute('faces')) {
        window.addEventListener(FACE_EVENT, this.#onFace);
        void this.#useFace(chosenFace(location.search));
      }
    });
  }

  static observedAttributes = ['no-seconds', 'ms', 'hour12'];

  attributeChangedCallback(): void {
    if (!this.#hm) return; // not connected yet; connectedCallback applies the flags
    this.#applyFlags();
    this.#lastSec = -1; // repaint on the next frame
  }

  #applyFlags(): void {
    this.#ss.hidden = this.hasAttribute('no-seconds');
    if (this.#ms) this.#ms.hidden = !this.hasAttribute('ms') || this.#ss.hidden;
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    this.#unsub?.();
    window.removeEventListener(FACE_EVENT, this.#onFace);
    this.#face?.destroy();
  }

  #onFace = (e: Event): void => {
    const id = (e as CustomEvent<unknown>).detail;
    if (isFaceId(id)) void this.#useFace(id);
  };

  async #useFace(id: FaceId): Promise<void> {
    const token = ++this.#faceToken;
    let next: Face | null = null;
    if (id !== 'digital') {
      try {
        const mod = await loadFace(id);
        if (token !== this.#faceToken) return;
        next = mod.create({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
      } catch {
        if (token !== this.#faceToken) return;
        next = null; // keep the plain digits
      }
    }
    this.#face?.destroy();
    this.#face = next;
    if (!next) {
      this.#faceBox?.remove();
      this.#faceBox = null;
      this.removeAttribute('data-face');
      return;
    }
    if (!this.#faceBox) {
      this.#faceBox = document.createElement('div');
      this.#faceBox.className = 'tzc-face';
      this.#faceBox.setAttribute('aria-hidden', 'true');
      this.prepend(this.#faceBox);
    }
    next.mount(this.#faceBox);
    this.setAttribute('data-face', id);
    this.#paint(now());
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
      const ticked = this.#lastSec !== -1;
      this.#lastSec = sec;
      this.#paint(t);
      this.#updatePill();
      if (ticked) this.dispatchEvent(new CustomEvent('tzc:second', { bubbles: true, detail: t }));
    }
    if (this.#ms && !this.#ms.hidden) {
      const ms = `.${String(Math.floor(t) % 1000).padStart(3, '0')}`;
      if (ms !== this.#lastMs) {
        this.#lastMs = ms;
        this.#ms.textContent = ms;
      }
    }
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #paint(t: number): void {
    const p = wallParts(t, this.#offsetSec);
    const { hm, period } = formatHM(p, this.hasAttribute('hour12'));
    this.#hm.textContent = hm;
    this.#ss.textContent = formatSS(p);
    this.#ap.textContent = period;
    this.#face?.frame({ t, h: p.h, m: p.m, s: p.s, hm, ss: formatSS(p).slice(1), period, showSeconds: !this.#ss.hidden });
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
