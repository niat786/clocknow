// <atomic-clock tai="37" gps="18"> — UTC with milliseconds plus TAI and GPS time scales.
import { now, getStatus, subscribe, startSync } from './clock-source';
import { pill } from './clock-format';

const p2 = (n: number): string => String(n).padStart(2, '0');
const hms = (ms: number): string => {
  const d = new Date(ms);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
};

class AtomicClock extends HTMLElement {
  #raf = 0;
  #unsub: (() => void) | null = null;
  #rows: Record<string, HTMLElement> = {};
  #pill!: HTMLElement;
  #pillText!: HTMLElement;
  #lastState = '';
  #tai = 37;
  #gps = 18;

  connectedCallback(): void {
    this.#tai = Number(this.getAttribute('tai') ?? 37);
    this.#gps = Number(this.getAttribute('gps') ?? 18);
    this.innerHTML =
      '<div class="ac-main"><span data-r="utc"></span> <span class="ac-lbl">UTC</span></div>' +
      '<dl class="ac-rows">' +
      `<div><dt>TAI <small>(UTC+${this.#tai} s)</small></dt><dd data-r="tai"></dd></div>` +
      `<div><dt>GPS <small>(UTC+${this.#gps} s)</small></dt><dd data-r="gps"></dd></div>` +
      '</dl>' +
      '<div data-pill class="tzc-pill" data-state="syncing"><span class="tzc-dot" aria-hidden="true"></span><span data-pill-text>Syncing…</span></div>';
    for (const el of this.querySelectorAll<HTMLElement>('[data-r]')) this.#rows[el.dataset.r as string] = el;
    this.#pill = this.querySelector('[data-pill]') as HTMLElement;
    this.#pillText = this.querySelector('[data-pill-text]') as HTMLElement;
    this.#unsub = subscribe(() => this.#updatePill());
    this.#tick(); // fill the digits before the first paint so nothing moves when the next frame runs
    startSync();
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    this.#unsub?.();
  }

  #tick = (): void => {
    const t = now();
    this.#rows.utc.textContent = hms(t);
    this.#rows.tai.textContent = hms(t + this.#tai * 1000);
    this.#rows.gps.textContent = hms(t + this.#gps * 1000);
    this.#updatePill();
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #updatePill(): void {
    const s = getStatus();
    const since = s.lastSyncAt === null ? 0 : performance.timeOrigin + performance.now() - s.lastSyncAt;
    const { state, text } = pill(s.phase, s.estimate, since);
    if (this.#pillText.textContent !== text) this.#pillText.textContent = text;
    if (state !== this.#lastState) {
      this.#lastState = state;
      this.#pill.dataset.state = state;
    }
  }
}

if (!customElements.get('atomic-clock')) customElements.define('atomic-clock', AtomicClock);
