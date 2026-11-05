// Flip clock face. Split-flap cards; each digit flips only when it changes.
// With reduced motion the digits change instantly (no rotation).
import './flip.css';
import type { Face, FaceFrame, FaceOptions } from './face';

const el = (tag: string, cls: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
};

class Card {
  readonly root = el('span', 'fl-d');
  #top = el('span', '');
  #bot = el('span', '');
  #flapTop = el('span', '');
  #flapBot = el('span', '');
  #value = '';

  constructor() {
    const half = (cls: string, inner: HTMLElement) => {
      const h = el('span', `fl-h ${cls}`);
      h.append(inner);
      return h;
    };
    const flapBot = half('fl-bot fl-flap fl-flap-bot', this.#flapBot);
    this.root.append(half('fl-top', this.#top), half('fl-bot', this.#bot), half('fl-top fl-flap fl-flap-top', this.#flapTop), flapBot);
    flapBot.addEventListener('animationend', () => {
      this.#bot.textContent = this.#value;
      this.root.classList.remove('fl-go');
    });
  }

  set(v: string, animate: boolean): void {
    if (v === this.#value) return;
    const old = this.#value || v;
    this.#value = v;
    this.#top.textContent = v;
    this.#flapBot.textContent = v;
    if (!animate || old === v) {
      this.#bot.textContent = v;
      this.#flapTop.textContent = v;
      this.root.classList.remove('fl-go');
      return;
    }
    this.#flapTop.textContent = old;
    this.#bot.textContent = old;
    this.root.classList.remove('fl-go');
    void this.root.offsetWidth; // restart the animation
    this.root.classList.add('fl-go');
  }
}

export function create(opts: FaceOptions): Face {
  const root = el('div', 'fl');
  const cards = Array.from({ length: 6 }, () => new Card());
  const sec = el('span', 'fl-group fl-sec');
  const ap = el('span', 'fl-ap');
  const colon = () => {
    const c = el('span', 'fl-colon');
    c.textContent = ':';
    return c;
  };
  const group = (a: Card, b: Card, cls = 'fl-group') => {
    const g = el('span', cls);
    g.append(a.root, b.root);
    return g;
  };
  root.append(group(cards[0], cards[1]), colon(), group(cards[2], cards[3]), sec, ap);
  sec.append(colon(), cards[4].root, cards[5].root);
  let first = true;

  return {
    mount(host) {
      host.append(root);
    },
    frame(f: FaceFrame) {
      const digits = f.hm.replace(':', '') + f.ss;
      const animate = !first && !opts.reducedMotion;
      for (let i = 0; i < 6; i++) cards[i].set(digits[i] ?? '0', animate);
      sec.hidden = !f.showSeconds;
      ap.textContent = f.period;
      first = false;
    },
    destroy() {
      root.remove();
    },
  };
}
