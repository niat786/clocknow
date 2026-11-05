// <tm-stopwatch> — Essentials stopwatch. Monotonic clock (performance.now), rAF paint.
import { formatStopwatch } from './duration-format';

class TmStopwatch extends HTMLElement {
  #running = false;
  #startAt = 0;
  #base = 0;
  #lastLap = 0;
  #raf = 0;
  #out!: HTMLElement;
  #toggle!: HTMLButtonElement;
  #lap!: HTMLButtonElement;
  #reset!: HTMLButtonElement;
  #list!: HTMLOListElement;

  connectedCallback(): void {
    this.innerHTML =
      '<div class="tm-display" data-out role="timer" aria-live="off">00:00.00</div>' +
      '<div class="tm-controls"><button type="button" data-toggle>Start</button>' +
      '<button type="button" data-lap disabled>Lap</button>' +
      '<button type="button" data-reset disabled>Reset</button></div>' +
      '<ol class="tm-laps" data-list reversed></ol>' +
      '<p class="tm-hint">Space start/stop · L lap · R reset</p>';
    const q = <T extends HTMLElement>(s: string) => this.querySelector<T>(s) as T;
    this.#out = q('[data-out]');
    this.#toggle = q('[data-toggle]');
    this.#lap = q('[data-lap]');
    this.#reset = q('[data-reset]');
    this.#list = q('[data-list]');
    this.#toggle.addEventListener('click', this.#onToggle);
    this.#lap.addEventListener('click', this.#onLap);
    this.#reset.addEventListener('click', this.#onReset);
    document.addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    document.removeEventListener('keydown', this.#onKey);
  }

  #elapsed(): number {
    return this.#running ? this.#base + performance.now() - this.#startAt : this.#base;
  }

  #paint(): void {
    this.#out.textContent = formatStopwatch(this.#elapsed());
  }

  #tick = (): void => {
    this.#paint();
    if (this.#running) this.#raf = requestAnimationFrame(this.#tick);
  };

  #onToggle = (): void => {
    if (this.#running) {
      this.#base = this.#elapsed();
      this.#running = false;
      cancelAnimationFrame(this.#raf);
      this.#paint();
      this.#toggle.textContent = 'Resume';
      this.#lap.disabled = true;
    } else {
      this.#startAt = performance.now();
      this.#running = true;
      this.#toggle.textContent = 'Stop';
      this.#lap.disabled = false;
      this.#reset.disabled = false;
      this.#raf = requestAnimationFrame(this.#tick);
    }
  };

  #onLap = (): void => {
    if (!this.#running) return;
    const t = this.#elapsed();
    const li = document.createElement('li');
    li.innerHTML = `<div class="tm-lap"><span>${formatStopwatch(t - this.#lastLap)}</span><span>${formatStopwatch(t)}</span></div>`;
    this.#list.prepend(li);
    this.#lastLap = t;
  };

  #onReset = (): void => {
    cancelAnimationFrame(this.#raf);
    this.#running = false;
    this.#base = 0;
    this.#lastLap = 0;
    this.#list.replaceChildren();
    this.#toggle.textContent = 'Start';
    this.#lap.disabled = true;
    this.#reset.disabled = true;
    this.#paint();
  };

  #onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') { e.preventDefault(); this.#onToggle(); }
    else if (e.key === 'l' || e.key === 'L') this.#onLap();
    else if (e.key === 'r' || e.key === 'R') this.#onReset();
  };
}

if (!customElements.get('tm-stopwatch')) customElements.define('tm-stopwatch', TmStopwatch);
