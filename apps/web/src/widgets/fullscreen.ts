// Fullscreen / kiosk mode for every clock page. Button [data-fs-toggle], key F, or ?fs=1.
// Layout flag: <html data-fs>. Real browser fullscreen: <html data-fs-real>.
import { parseFs, pixelShift, shouldAutoOled } from './fullscreen-logic';

const root = document.documentElement;
const IDLE_MS = 3000;
const kiosk = parseFs(location.search);
let wake: WakeLockSentinel | null = null;
let autoOled = false;
let idleTimer = 0;
let shiftTimer = 0;

const isFull = (): boolean => document.fullscreenElement !== null;
const active = (): boolean => root.hasAttribute('data-fs');
const localNow = (): number => performance.timeOrigin + performance.now();

async function acquireWake(): Promise<void> {
  if (!active() || wake || document.visibilityState !== 'visible') return;
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (!lock) return;
    wake = lock;
    lock.addEventListener('release', () => {
      if (wake === lock) wake = null;
    });
  } catch {
    // unsupported or denied: the screen may dim, nothing else breaks
  }
}

/** Burn-in protection: nudge the display a few pixels each minute, OLED theme only. */
function scheduleShift(): void {
  clearTimeout(shiftTimer);
  const on = active() && root.dataset.theme === 'oled';
  const { x, y } = on ? pixelShift(Math.floor(localNow() / 60_000)) : { x: 0, y: 0 };
  root.style.setProperty('--shift-x', `${x}px`);
  root.style.setProperty('--shift-y', `${y}px`);
  if (active()) shiftTimer = window.setTimeout(scheduleShift, 60_000 - (localNow() % 60_000) + 50);
}

/** Show the cursor and controls, then hide them again after a few idle seconds. */
function wakeUi(): void {
  root.removeAttribute('data-idle');
  clearTimeout(idleTimer);
  if (active()) idleTimer = window.setTimeout(() => root.setAttribute('data-idle', ''), IDLE_MS);
}

function syncButtons(): void {
  for (const b of document.querySelectorAll<HTMLElement>('[data-fs-toggle]')) {
    b.setAttribute('aria-pressed', String(active()));
    const label = active() ? 'Exit fullscreen' : 'Fullscreen';
    const text = b.querySelector('.fs-text');
    if (text) text.textContent = label;
    else b.textContent = label;
    b.setAttribute('aria-label', label);
  }
}

function enter(): void {
  root.setAttribute('data-fs', '');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && !matchMedia('(prefers-contrast: more)').matches;
  if (shouldAutoOled(root.dataset.theme ?? null, dark)) {
    root.dataset.theme = 'oled'; // this session only: never saved, so the person's choice stays Auto
    autoOled = true;
  }
  void acquireWake();
  scheduleShift();
  wakeUi();
  syncButtons();
}

function leave(): void {
  root.removeAttribute('data-fs');
  root.removeAttribute('data-idle');
  if (autoOled && root.dataset.theme === 'oled') delete root.dataset.theme;
  autoOled = false;
  clearTimeout(idleTimer);
  void wake?.release().catch(() => undefined);
  wake = null;
  scheduleShift();
  syncButtons();
}

function requestFull(): void {
  // iPhone Safari has no element fullscreen: the kiosk layout alone is the fallback.
  const p = root.requestFullscreen?.();
  p?.catch(() => undefined);
}

function toggle(): void {
  if (isFull()) {
    void document.exitFullscreen();
    return;
  }
  if (active() && !kiosk) {
    leave();
    return;
  }
  if (!active()) enter();
  requestFull();
}

document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('[data-fs-toggle]')) toggle();
});
document.addEventListener('keydown', (e) => {
  wakeUi();
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'f') return;
  const t = e.target;
  if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  toggle();
});
for (const ev of ['pointermove', 'pointerdown', 'touchstart'] as const)
  document.addEventListener(ev, wakeUi, { passive: true });
document.addEventListener('fullscreenchange', () => {
  root.toggleAttribute('data-fs-real', isFull());
  if (!isFull() && active() && !kiosk) leave();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void acquireWake();
    scheduleShift();
  }
});

if (kiosk) {
  enter(); // kiosk layout straight away; browsers need a tap before real fullscreen
  document.addEventListener('click', () => !isFull() && requestFull(), { once: true });
}
