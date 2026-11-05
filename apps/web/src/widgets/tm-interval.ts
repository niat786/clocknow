// <tm-interval mode="pomodoro|interval"> — phase sequence timer (Pomodoro, work/rest rounds).
// Elapsed running time is the single source of truth, so a throttled background tab catches up exactly.
import { audioContext, playBeeps } from './beep';
import { formatMmSs } from './duration-format';
import {
  clamp, intervalPlan, phaseStart, pomodoroPlan, positionAt, roundOf, roundsTotal, totalMs, type Phase, type Position,
} from './interval-plan';

interface Field { key: string; label: string; min: number; max: number; value: number }
type Mode = 'pomodoro' | 'interval';

const FIELDS: Record<Mode, Field[]> = {
  pomodoro: [
    { key: 'focusMin', label: 'Focus (min)', min: 1, max: 180, value: 25 },
    { key: 'shortMin', label: 'Short break (min)', min: 1, max: 60, value: 5 },
    { key: 'longMin', label: 'Long break (min)', min: 1, max: 120, value: 15 },
    { key: 'rounds', label: 'Rounds', min: 1, max: 12, value: 4 },
  ],
  interval: [
    { key: 'workSec', label: 'Work (sec)', min: 1, max: 3600, value: 30 },
    { key: 'restSec', label: 'Rest (sec)', min: 0, max: 3600, value: 10 },
    { key: 'rounds', label: 'Rounds', min: 1, max: 99, value: 8 },
  ],
};

type State = 'idle' | 'running' | 'paused' | 'done';

class TmInterval extends HTMLElement {
  #mode: Mode = 'pomodoro';
  #state: State = 'idle';
  #plan: Phase[] = [];
  #base = 0;
  #startedAt = 0;
  #lastKey = '';
  #raf = 0;
  #poll = 0;
  #audio: AudioContext | null = null;
  #title = '';
  #inputs = new Map<string, HTMLInputElement>();
  #loop!: HTMLInputElement;
  #phase!: HTMLElement;
  #out!: HTMLElement;
  #meta!: HTMLElement;
  #status!: HTMLElement;
  #cfg!: HTMLElement;
  #toggle!: HTMLButtonElement;
  #skip!: HTMLButtonElement;
  #reset!: HTMLButtonElement;

  connectedCallback(): void {
    this.#mode = this.getAttribute('mode') === 'interval' ? 'interval' : 'pomodoro';
    this.#title = document.title;
    this.#build();
    this.#loadSaved();
    this.#rebuildPlan();
  }

  disconnectedCallback(): void {
    this.#stopClocks();
    document.title = this.#title;
  }

  #build(): void {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };
    this.#phase = el('p', 'sq-phase');
    this.#phase.setAttribute('aria-live', 'polite');
    this.#out = el('div', 'tm-display');
    this.#out.setAttribute('role', 'timer');
    this.#meta = el('p', 'sq-meta');
    this.#cfg = el('div', 'tm-inputs');
    for (const f of FIELDS[this.#mode]) {
      const label = el('label');
      label.append(f.label);
      const input = el('input');
      input.type = 'number';
      input.min = String(f.min);
      input.max = String(f.max);
      input.value = String(f.value);
      input.inputMode = 'numeric';
      this.#inputs.set(f.key, input);
      label.append(input);
      this.#cfg.append(label);
    }
    const rep = el('label', 'sq-check');
    this.#loop = el('input');
    this.#loop.type = 'checkbox';
    rep.append(this.#loop, ' Repeat forever');
    this.#cfg.append(rep);
    this.#cfg.addEventListener('input', this.#onConfig);

    const controls = el('div', 'tm-controls');
    this.#toggle = el('button');
    this.#toggle.type = 'button';
    this.#skip = el('button');
    this.#skip.type = 'button';
    this.#skip.textContent = 'Skip';
    this.#reset = el('button');
    this.#reset.type = 'button';
    this.#reset.textContent = 'Reset';
    this.#toggle.dataset.toggle = '';
    controls.append(this.#toggle, this.#skip, this.#reset);
    this.#toggle.addEventListener('click', this.#onToggle);
    this.#skip.addEventListener('click', this.#onSkip);
    this.#reset.addEventListener('click', this.#onReset);
    this.#status = el('p', 'tm-status');
    this.#status.setAttribute('role', 'status');
    this.replaceChildren(this.#phase, this.#out, this.#meta, this.#cfg, controls, this.#status);
    this.#setState('idle');
  }

  // ---- config ----
  #values(): Record<string, number> {
    const v: Record<string, number> = {};
    for (const f of FIELDS[this.#mode]) v[f.key] = clamp(Number(this.#inputs.get(f.key)?.value), f.min, f.max);
    return v;
  }

  #storeKey = (): string => `clocknow-seq-${this.#mode}`;

  #loadSaved(): void {
    try {
      const raw = localStorage.getItem(this.#storeKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      for (const f of FIELDS[this.#mode]) {
        const n = saved[f.key];
        const input = this.#inputs.get(f.key);
        if (input && typeof n === 'number') input.value = String(clamp(n, f.min, f.max));
      }
      this.#loop.checked = saved.loop === true;
    } catch {
      // storage blocked or corrupt: defaults are fine
    }
  }

  #save(): void {
    try {
      localStorage.setItem(this.#storeKey(), JSON.stringify({ ...this.#values(), loop: this.#loop.checked }));
    } catch {
      // ignore
    }
  }

  #rebuildPlan(): void {
    const v = this.#values();
    this.#plan =
      this.#mode === 'pomodoro'
        ? pomodoroPlan({ focusMin: v.focusMin ?? 25, shortMin: v.shortMin ?? 5, longMin: v.longMin ?? 15, rounds: v.rounds ?? 4 })
        : intervalPlan({ workSec: v.workSec ?? 30, restSec: v.restSec ?? 10, rounds: v.rounds ?? 8 });
    this.#paint(positionAt(this.#plan, this.#base, this.#loop.checked));
  }

  #onConfig = (): void => {
    if (this.#state !== 'idle') return;
    this.#rebuildPlan();
    this.#save();
  };

  // ---- running ----
  #elapsed(): number {
    return this.#state === 'running' ? this.#base + (performance.now() - this.#startedAt) : this.#base;
  }

  #setState(s: State): void {
    this.#state = s;
    this.dataset.state = s;
    this.#cfg.hidden = s !== 'idle';
    this.#reset.disabled = s === 'idle';
    this.#skip.disabled = s !== 'running' && s !== 'paused';
    this.#toggle.textContent = s === 'running' ? 'Pause' : s === 'paused' ? 'Resume' : s === 'done' ? 'Restart' : 'Start';
  }

  #stopClocks(): void {
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#poll);
  }

  #onToggle = (): void => {
    if (this.#state === 'running') {
      this.#base = this.#elapsed();
      this.#stopClocks();
      this.#setState('paused');
      return;
    }
    if (this.#state === 'done') this.#base = 0;
    if (this.#state === 'idle' || this.#state === 'done') {
      this.#rebuildPlan();
      this.#audio ??= audioContext();
      this.#status.textContent = '';
    }
    if (totalMs(this.#plan) <= 0) return;
    this.#startedAt = performance.now();
    this.#setState('running');
    const pos = positionAt(this.#plan, this.#base, this.#loop.checked);
    this.#lastKey = pos ? `${pos.cycle}:${pos.index}` : '';
    this.#frame();
    this.#schedulePoll();
  };

  #onSkip = (): void => {
    const pos = positionAt(this.#plan, this.#elapsed(), this.#loop.checked);
    if (!pos) return;
    const cycleStart = pos.cycle * totalMs(this.#plan);
    this.#base = cycleStart + phaseStart(this.#plan, pos.index) + pos.phase.ms;
    this.#startedAt = performance.now();
    const next = positionAt(this.#plan, this.#base, this.#loop.checked);
    this.#lastKey = next && !next.done ? `${next.cycle}:${next.index}` : this.#lastKey;
    if (this.#state === 'paused') {
      // Run one update so the display (or "Done") reflects the skip, then stay paused.
      this.#state = 'running';
      this.#update();
      if (this.#state === 'running') this.#state = 'paused';
    } else {
      this.#update();
    }
  };

  #onReset = (): void => {
    this.#stopClocks();
    this.#base = 0;
    this.#setState('idle');
    this.#status.textContent = '';
    document.title = this.#title;
    this.#rebuildPlan();
  };

  #frame = (): void => {
    this.#update();
    if (this.#state === 'running') this.#raf = requestAnimationFrame(this.#frame);
  };

  /** Keeps going in background tabs where animation frames stop. */
  #schedulePoll(): void {
    clearTimeout(this.#poll);
    this.#poll = window.setTimeout(() => {
      if (this.#state !== 'running') return;
      this.#update();
      this.#schedulePoll();
    }, 500);
  }

  #update(): void {
    if (this.#state !== 'running') return;
    const pos = positionAt(this.#plan, this.#elapsed(), this.#loop.checked);
    if (!pos) return;
    if (pos.done) {
      this.#stopClocks();
      this.#base = totalMs(this.#plan);
      this.#setState('done');
      this.#paint(pos);
      this.#phase.textContent = 'Done';
      this.#status.textContent = 'All rounds complete';
      document.title = `Done — ${this.#title}`;
      playBeeps(this.#audio, 880, 3);
      return;
    }
    const key = `${pos.cycle}:${pos.index}`;
    if (key !== this.#lastKey) {
      this.#lastKey = key;
      playBeeps(this.#audio, pos.phase.kind === 'work' ? 880 : 520, pos.phase.kind === 'work' ? 2 : 1);
    }
    this.#paint(pos);
  }

  #paint(pos: Position | null): void {
    if (!pos) {
      this.#out.textContent = '00:00';
      return;
    }
    // An idle plan shows its first phase; a finished one is handled by #update.
    this.#out.textContent = formatMmSs(pos.remainingMs);
    this.#phase.textContent = this.#state === 'idle' ? 'Ready' : pos.phase.label;
    this.dataset.kind = pos.phase.kind;
    const next = this.#plan[pos.index + 1] ?? (this.#loop.checked ? this.#plan[0] : undefined);
    const round = `Round ${roundOf(this.#plan, pos.index)} of ${roundsTotal(this.#plan)}`;
    this.#meta.textContent = next ? `${round} · Next: ${next.label} ${formatMmSs(next.ms)}` : `${round} · Last phase`;
    if (this.#state === 'running' && document.hidden) document.title = `${formatMmSs(pos.remainingMs)} ${pos.phase.label} — ${this.#title}`;
    else if (this.#state === 'running' && document.title !== this.#title) document.title = this.#title;
  }
}

if (!customElements.get('tm-interval')) customElements.define('tm-interval', TmInterval);
