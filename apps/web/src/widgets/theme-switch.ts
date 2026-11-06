// <theme-switch> — Auto / Light / Night / OLED / High contrast. Auto follows the system.
// The saved choice is applied before first paint by theme-init.js (inline, allowed by CSP hash).
const KEY = 'clocknow-theme';
const CHOICES = [
  ['auto', 'Auto'],
  ['light', 'Light'],
  ['night', 'Night'],
  ['oled', 'OLED'],
  ['contrast', 'High contrast'],
] as const;
type Choice = (typeof CHOICES)[number][0];

const isChoice = (v: string | null): v is Choice => CHOICES.some(([k]) => k === v);

function saved(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return isChoice(v) ? v : 'auto';
  } catch {
    return 'auto'; // storage blocked: still works for this page view
  }
}

function apply(choice: Choice): void {
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
  window.dispatchEvent(new Event('clocknow:theme')); // the clock card re-checks its look
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // ignore
  }
}

const SHORT: Record<Choice, string> = { auto: 'Auto', light: 'Light', night: 'Night', oled: 'OLED', contrast: 'AAA' };

/** A row of theme buttons on wide screens and a compact select on narrow ones; both stay in sync. */
class ThemeSwitch extends HTMLElement {
  connectedCallback(): void {
    const current = saved();
    // The HTML already holds identical controls, so replacing them below moves nothing (no layout shift).
    const group = document.createElement('div');
    group.className = 'ts-group';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Theme');
    const select = document.createElement('select');
    select.className = 'ts-select';
    select.setAttribute('aria-label', 'Theme');
    const buttons: HTMLButtonElement[] = [];
    const set = (choice: Choice, focus = false): void => {
      apply(choice);
      select.value = choice;
      for (const b of buttons) {
        const on = b.value === choice;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      }
    };
    for (const [value, label] of CHOICES) {
      select.append(new Option(label, value));
      const b = document.createElement('button');
      b.type = 'button';
      b.value = value;
      b.setAttribute('role', 'radio');
      b.title = label;
      b.textContent = SHORT[value];
      if (SHORT[value] !== label) b.setAttribute('aria-label', label);
      b.addEventListener('click', () => set(value));
      buttons.push(b);
    }
    group.append(...buttons);
    group.addEventListener('keydown', (e) => {
      const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      set(CHOICES[(i + step + CHOICES.length) % CHOICES.length][0], true);
    });
    select.addEventListener('change', () => {
      if (isChoice(select.value)) set(select.value);
    });
    this.replaceChildren(group, select);
    set(current);
  }
}

if (!customElements.get('theme-switch')) customElements.define('theme-switch', ThemeSwitch);
