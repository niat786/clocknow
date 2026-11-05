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
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // ignore
  }
}

class ThemeSwitch extends HTMLElement {
  connectedCallback(): void {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Theme');
    for (const [value, label] of CHOICES) select.append(new Option(label, value));
    select.value = saved();
    select.addEventListener('change', () => {
      if (isChoice(select.value)) apply(select.value);
    });
    this.replaceChildren(select);
  }
}

if (!customElements.get('theme-switch')) customElements.define('theme-switch', ThemeSwitch);
