// <look-switch> — colour look for the main clock card. By default the look follows the clock style
// (flip → peach, LED → midnight …); a chosen look wins and is remembered. Colours are in looks.css.
import { FACE_EVENT, chosenFace, isFaceId, type FaceId } from './faces';
import { LOOKS, effectiveLook, isLookId, lookForFace, readLook, saveLook, type LookId } from '../lib/looks';

const pageIsDark = (): boolean => {
  const t = document.documentElement.dataset.theme;
  return t ? t !== 'light' : matchMedia('(prefers-color-scheme: dark)').matches;
};

class LookSwitch extends HTMLElement {
  #face: FaceId = 'digital';
  #btn!: HTMLButtonElement;
  #menu: HTMLElement | null = null;

  connectedCallback(): void {
    const stage = this.closest<HTMLElement>('.stage');
    const btn = this.querySelector<HTMLButtonElement>('.look-btn');
    if (!stage || !btn) return;
    this.#btn = btn;
    this.#face = chosenFace(location.search);
    btn.addEventListener('click', () => (this.#menu ? this.#close(false) : this.#open()));
    window.addEventListener(FACE_EVENT, this.#onFace);
    window.addEventListener('clocknow:theme', this.#apply);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.#apply);
    this.#apply();
  }

  disconnectedCallback(): void {
    window.removeEventListener(FACE_EVENT, this.#onFace);
    window.removeEventListener('clocknow:theme', this.#apply);
    matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this.#apply);
    document.removeEventListener('pointerdown', this.#outside, true);
  }

  #onFace = (e: Event): void => {
    const id = (e as CustomEvent<unknown>).detail;
    if (isFaceId(id)) {
      this.#face = id;
      this.#apply();
    }
  };

  #apply = (): void => {
    const saved = readLook();
    const id = effectiveLook(saved, this.#face, pageIsDark());
    this.#btn.querySelector<HTMLElement>('.look-sw')?.setAttribute('data-look', id);
    // The colours hang off <html> so theme-init.js can set them before first paint (no flash).
    const root = document.documentElement;
    if (saved) root.dataset.look = saved;
    else delete root.dataset.look;
    if (!saved && id !== 'classic') root.dataset.autolook = id;
    else delete root.dataset.autolook;
    if (this.#face === 'digital') delete root.dataset.face;
    else root.dataset.face = this.#face;
    this.#menu?.querySelectorAll<HTMLElement>('[role=radio]').forEach((o) => o.setAttribute('aria-checked', String((o.dataset.choice ?? 'auto') === (saved ?? 'auto'))));
  };

  #open(): void {
    const menu = document.createElement('div');
    menu.className = 'look-menu';
    menu.setAttribute('role', 'radiogroup');
    menu.setAttribute('aria-label', 'Colour');
    const saved = readLook() ?? 'auto';
    const rows: Array<[string, string, LookId]> = [['auto', 'Match clock style', lookForFace(this.#face, pageIsDark())], ...LOOKS.map((l): [string, string, LookId] => [l.id, l.label, l.id])];
    for (const [choice, label, swatch] of rows) {
      const o = document.createElement('button');
      o.type = 'button';
      o.setAttribute('role', 'radio');
      o.dataset.choice = choice;
      o.setAttribute('aria-checked', String(choice === saved));
      o.tabIndex = choice === saved ? 0 : -1;
      const sw = document.createElement('span');
      sw.className = 'look-sw';
      sw.dataset.look = swatch;
      sw.setAttribute('aria-hidden', 'true');
      o.append(sw, label);
      o.addEventListener('click', () => {
        saveLook(isLookId(choice) ? choice : null);
        this.#apply();
        this.#close(true);
      });
      menu.append(o);
    }
    menu.addEventListener('keydown', (e) => {
      const opts = [...menu.querySelectorAll<HTMLButtonElement>('[role=radio]')];
      const i = opts.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.#close(true);
      } else if (step) {
        e.preventDefault();
        const next = opts[(i + step + opts.length) % opts.length];
        for (const o of opts) o.tabIndex = o === next ? 0 : -1;
        next?.focus();
      }
    });
    this.append(menu);
    this.#menu = menu;
    this.#btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', this.#outside, true);
    (menu.querySelector<HTMLElement>('[aria-checked=true]') ?? menu.querySelector<HTMLElement>('button'))?.focus();
  }

  #outside = (e: Event): void => {
    if (e.target instanceof Node && !this.contains(e.target)) this.#close(false);
  };

  #close(refocus: boolean): void {
    this.#menu?.remove();
    this.#menu = null;
    this.#btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.#outside, true);
    if (refocus) this.#btn.focus();
  }
}

if (!customElements.get('look-switch')) customElements.define('look-switch', LookSwitch);
