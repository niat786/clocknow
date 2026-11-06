// Seven-segment LED face. Unlit segments show faintly, like a real display.
import type { Face, FaceFrame } from './face';
import { DIGIT_SEGMENTS } from './segment-map';

const NS = 'http://www.w3.org/2000/svg';
// Segment outlines in a 60×100 box: a (top), b, c, d (bottom), e, f, g (middle).
const SEGMENTS: Record<string, string> = {
  a: '7,1 53,1 45,9 15,9',
  b: '59,7 59,44 55,48 51,44 51,15',
  c: '51,56 55,52 59,56 59,93 51,85',
  d: '15,91 45,91 53,99 7,99',
  e: '1,56 5,52 9,56 9,85 1,93',
  f: '1,7 9,15 9,44 5,48 1,44',
  g: '8,50 15,45 45,45 52,50 45,55 15,55',
};

function svg(w: number, cls: string): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} 100`);
  s.setAttribute('class', cls);
  return s;
}

class Digit {
  readonly root = svg(60, 'sg-d');
  #segs = new Map<string, SVGPolygonElement>();
  #value = '';
  constructor() {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'skewX(-6) translate(5 0)');
    for (const [k, pts] of Object.entries(SEGMENTS)) {
      const p = document.createElementNS(NS, 'polygon');
      p.setAttribute('points', pts);
      p.setAttribute('class', 'sg-s');
      g.append(p);
      this.#segs.set(k, p);
    }
    this.root.append(g);
  }
  set(v: string): void {
    if (v === this.#value) return;
    this.#value = v;
    const on = DIGIT_SEGMENTS[v] ?? '';
    for (const [k, p] of this.#segs) p.classList.toggle('on', on.includes(k));
  }
}

/** Two small lit squares, like the colon of a real seven-segment display. */
function colon(): SVGSVGElement {
  const s = svg(20, 'sg-c');
  for (const y of [27, 63]) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', '5');
    r.setAttribute('y', String(y));
    r.setAttribute('width', '10');
    r.setAttribute('height', '10');
    r.setAttribute('rx', '2');
    r.setAttribute('class', 'sg-s on');
    s.append(r);
  }
  return s;
}

const pair = (a: Digit, b: Digit): HTMLElement => {
  const g = document.createElement('span');
  g.className = 'sg-g';
  g.append(a.root, b.root);
  return g;
};

export function create(): Face {
  const root = document.createElement('div');
  root.className = 'sg';
  const digits = Array.from({ length: 6 }, () => new Digit());
  const sec = document.createElement('span');
  sec.className = 'sg-sec';
  sec.append(colon(), pair(digits[4], digits[5]));
  const ap = document.createElement('span');
  ap.className = 'sg-ap';
  root.append(pair(digits[0], digits[1]), colon(), pair(digits[2], digits[3]), sec, ap);
  return {
    mount: (host) => host.append(root),
    frame(f: FaceFrame) {
      const d = f.hm.replace(':', '') + f.ss;
      digits.forEach((g, i) => g.set(d[i] ?? '0'));
      sec.hidden = !f.showSeconds;
      ap.textContent = f.period;
    },
    destroy: () => root.remove(),
  };
}
