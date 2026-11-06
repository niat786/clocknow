// <tm-timer> — Essentials countdown timer. Monotonic clock (performance.now), rAF paint,
// setTimeout chain (not setInterval) so it still finishes and updates the tab title in background tabs.
import { clampInt, formatTimer, toMs } from './duration-format';
import { buildQuery } from './countdown-format';

type State = 'idle' | 'running' | 'paused' | 'done';

class TmTimer extends HTMLElement {
  #state: State = 'idle';
  #total = 0;
  #remaining = 0;
  #endAt = 0;
  #raf = 0;
  #check = 0;
  #audio: AudioContext | null = null;
  #title = '';
  #out!: HTMLElement;
  #inputs!: HTMLElement;
  #presets!: HTMLElement;
  #toggle!: HTMLButtonElement;
  #reset!: HTMLButtonElement;
  #share!: HTMLButtonElement;
  #status!: HTMLElement;
  #h!: HTMLInputElement;
  #m!: HTMLInputElement;
  #s!: HTMLInputElement;

  connectedCallback(): void {
    this.#title = document.title;
    this.innerHTML =
      '<div class="tm-display" data-out role="timer" aria-live="off">00:05:00</div>' +
      '<div class="tm-inputs" data-inputs>' +
      '<label>hours<input type="number" min="0" max="99" value="0" inputmode="numeric" data-h /></label>' +
      '<label>minutes<input type="number" min="0" max="999" value="5" inputmode="numeric" data-m /></label>' +
      '<label>seconds<input type="number" min="0" max="999" value="0" inputmode="numeric" data-s /></label></div>' +
      '<div class="tm-presets" data-presets>' +
      '<button type="button" data-preset="60">1 min</button><button type="button" data-preset="300">5 min</button>' +
      '<button type="button" data-preset="600">10 min</button><button type="button" data-preset="1800">30 min</button></div>' +
      '<div class="tm-controls"><button type="button" data-toggle>Start</button>' +
      '<button type="button" data-reset disabled>Reset</button>' +
      '<button type="button" data-share hidden>Share with everyone</button></div>' +
      '<p class="tm-status" data-status role="status"></p>';
    const q = <T extends HTMLElement>(s: string) => this.querySelector<T>(s) as T;
    this.#out = q('[data-out]');
    this.#inputs = q('[data-inputs]');
    this.#presets = q('[data-presets]');
    this.#toggle = q('[data-toggle]');
    this.#reset = q('[data-reset]');
    this.#share = q('[data-share]');
    this.#status = q('[data-status]');
    this.#h = q('[data-h]');
    this.#m = q('[data-m]');
    this.#s = q('[data-s]');
    this.#inputs.addEventListener('input', this.#onInput);
    this.#presets.addEventListener('click', this.#onPreset);
    this.#toggle.addEventListener('click', this.#onToggle);
    this.#reset.addEventListener('click', this.#onReset);
    this.#share.addEventListener('click', () => void this.#onShare());
    // ?s=900 prefills the duration (used by the search box: "timer 15m"). Start stays a click,
    // so the browser allows the alarm sound.
    const pre = Number(new URLSearchParams(location.search).get('s'));
    if (Number.isInteger(pre) && pre > 0) {
      const sec = clampInt(pre, 359_999);
      this.#h.value = String(Math.floor(sec / 3600));
      this.#m.value = String(Math.floor(sec / 60) % 60);
      this.#s.value = String(sec % 60);
      this.#paint(sec * 1000);
    }
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#check);
    document.title = this.#title;
  }

  #read(): number {
    return toMs(Number(this.#h.value), Number(this.#m.value), Number(this.#s.value));
  }

  #setState(s: State): void {
    this.#state = s;
    this.dataset.state = s;
    const idle = s === 'idle';
    this.#inputs.hidden = !idle;
    this.#presets.hidden = !idle;
    this.#reset.disabled = idle;
    this.#share.hidden = s !== 'running';
    this.#toggle.textContent = s === 'running' ? 'Pause' : s === 'paused' ? 'Resume' : s === 'done' ? 'Restart' : 'Start';
  }

  #paint(ms: number): void {
    this.#out.textContent = formatTimer(ms);
  }

  #stopClocks(): void {
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#check);
  }

  #onInput = (): void => {
    if (this.#state === 'idle') this.#paint(this.#read());
  };

  #onPreset = (e: Event): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
    if (!b || this.#state !== 'idle') return;
    const sec = clampInt(Number(b.dataset.preset), 359_999);
    this.#h.value = String(Math.floor(sec / 3600));
    this.#m.value = String(Math.floor(sec / 60) % 60);
    this.#s.value = String(sec % 60);
    this.#paint(sec * 1000);
  };

  #onToggle = (): void => {
    if (this.#state === 'running') {
      this.#remaining = Math.max(0, this.#endAt - performance.now());
      this.#stopClocks();
      this.#setState('paused');
      this.#paint(this.#remaining);
      return;
    }
    if (this.#state === 'idle' || this.#state === 'done') {
      this.#total = this.#state === 'done' ? this.#total : this.#read();
      if (this.#total <= 0) return;
      this.#remaining = this.#total;
      document.title = this.#title;
      this.#status.textContent = '';
    }
    try {
      this.#audio ??= new AudioContext(); // created inside the click so the alarm can sound later
      void this.#audio.resume();
    } catch {
      // no audio: visual alarm only
    }
    this.#endAt = performance.now() + this.#remaining;
    this.#setState('running');
    this.#raf = requestAnimationFrame(this.#tick);
    this.#check = window.setTimeout(this.#poll, Math.min(1000, this.#remaining));
  };

  #tick = (): void => {
    const rem = this.#endAt - performance.now();
    if (rem <= 0) return this.#finish();
    this.#paint(rem);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  /** Background-safe: finishes on time and keeps the tab title current while rAF is paused. */
  #poll = (): void => {
    if (this.#state !== 'running') return;
    const rem = this.#endAt - performance.now();
    if (rem <= 0) return this.#finish();
    if (document.hidden) document.title = `${formatTimer(rem)} — ${this.#title}`;
    this.#check = window.setTimeout(this.#poll, Math.min(1000, rem));
  };

  #finish(): void {
    this.#stopClocks();
    this.#remaining = 0;
    this.#setState('done');
    this.#paint(0);
    this.#status.textContent = "Time's up";
    document.title = `Time's up — ${this.#title}`;
    this.#beep();
  }

  /** Links to a countdown that ends at the same UTC instant on every screen that opens it. */
  async #onShare(): Promise<void> {
    if (this.#state !== 'running') return;
    this.#status.textContent = 'Checking the clock…';
    const cs = await import('./clock-source');
    cs.startSync();
    await new Promise<void>((resolve) => {
      const ready = (): boolean => cs.getStatus().estimate !== null || cs.getStatus().phase === 'failed';
      if (ready()) return resolve();
      const off = cs.subscribe(() => ready() && (off(), resolve()));
      window.setTimeout(() => (off(), resolve()), 4000);
    });
    if (this.#state !== 'running') return;
    const synced = cs.getStatus().estimate !== null;
    const rem = Math.max(0, this.#endAt - performance.now());
    const target = Math.ceil((cs.now() + rem) / 1000);
    const url = `${location.origin}/countdown?${buildQuery({ t: target, z: 'UTC', n: '' })}`;
    const note = synced ? '' : ' This device could not sync, so other screens may differ slightly.';
    try {
      await navigator.clipboard.writeText(url);
      this.#status.textContent = `Link copied. Every screen that opens it ends together.${note}`;
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      this.#status.replaceChildren('Copy this link: ', a, note);
    }
  }

  #beep(): void {
    const ctx = this.#audio;
    if (!ctx) return;
    try {
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.2;
        o.connect(g).connect(ctx.destination);
        const t = ctx.currentTime + i * 0.4;
        o.start(t);
        o.stop(t + 0.2);
      }
    } catch {
      // ignore audio errors
    }
  }

  #onReset = (): void => {
    this.#stopClocks();
    this.#setState('idle');
    this.#status.textContent = '';
    document.title = this.#title;
    this.#paint(this.#read());
  };
}

if (!customElements.get('tm-timer')) customElements.define('tm-timer', TmTimer);
