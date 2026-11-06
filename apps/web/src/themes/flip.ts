// Flip clock face. Paper cards for hours and minutes, each flipping only when its digit changes;
// seconds are large plain digits in the accent colour. With reduced motion the digits change instantly.
import type { Face, FaceFrame, FaceOptions } from './face';

const el = (tag: string, cls: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** One split-flap card: the top half already shows the new digit, the old one folds away over it. */
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
  const cards = Array.from({ length: 4 }, () => new Card());
  const group = (a: Card, b: Card) => {
    const g = el('span', 'fl-group');
    g.append(a.root, b.root);
    return g;
  };
  const secDigits = el('span', 'fl-s');
  const sec = el('span', 'fl-sec');
  sec.append(el('span', 'fl-colon fl-colon-s'), secDigits);
  const ap = el('span', 'fl-ap');
  root.append(group(cards[0], cards[1]), el('span', 'fl-colon'), group(cards[2], cards[3]), sec, ap);
  let first = true;

  return {
    mount(host) {
      host.append(root);
    },
    frame(f: FaceFrame) {
      const digits = f.hm.replace(':', '');
      const animate = !first && !opts.reducedMotion;
      for (let i = 0; i < 4; i++) cards[i].set(digits[i] ?? '0', animate);
      sec.hidden = !f.showSeconds;
      if (secDigits.textContent !== f.ss) secDigits.textContent = f.ss;
      if (ap.textContent !== f.period) ap.textContent = f.period;
      first = false;
    },
    destroy() {
      root.remove();
    },
  };
}
