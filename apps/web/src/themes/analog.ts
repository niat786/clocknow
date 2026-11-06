// Analog face (SVG). Quartz-style: the second hand ticks once per second; hour and minute move smoothly.
import type { Face, FaceFrame, FaceOptions } from './face';
import { forward, handAngles } from './analog-math';

const NS = 'http://www.w3.org/2000/svg';
const node = (tag: string, attrs: Record<string, string>): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export function create(opts: FaceOptions): Face {
  const svg = node('svg', { viewBox: '0 0 200 200', class: 'an' }) as SVGSVGElement;
  svg.append(node('circle', { cx: '100', cy: '100', r: '97', class: 'an-dial' }), node('circle', { cx: '100', cy: '100', r: '97', class: 'an-rim' }));
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    svg.append(node('line', { x1: '100', y1: major ? '9' : '10', x2: '100', y2: major ? '22' : '15', class: major ? 'an-tick an-major' : 'an-tick', transform: `rotate(${i * 6} 100 100)` }));
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n * Math.PI) / 6;
    const t = node('text', { x: (100 + 62 * Math.sin(a)).toFixed(2), y: (100 - 62 * Math.cos(a)).toFixed(2), class: 'an-num' });
    t.textContent = String(n);
    svg.append(t);
  }
  const hand = (cls: string, len: number, tail: number) => {
    const g = node('g', { class: `an-hand ${cls}` });
    g.append(node('line', { x1: '100', y1: String(100 + tail), x2: '100', y2: String(100 - len) }));
    svg.append(g);
    return g;
  };
  const hour = hand('an-h', 46, 12);
  const minute = hand('an-m', 70, 14);
  const second = hand('an-s', 80, 24);
  svg.append(node('circle', { cx: '100', cy: '100', r: '4', class: 'an-pin' }));
  const ap = document.createElement('span');
  ap.className = 'an-ap';
  const root = document.createElement('div');
  root.className = 'an-wrap';
  if (opts.reducedMotion) root.classList.add('an-still');
  root.append(svg, ap);
  const last = { hour: 0, minute: 0, second: 0 };
  let first = true;

  const turn = (el: SVGElement, key: keyof typeof last, target: number) => {
    last[key] = first ? target : forward(last[key], target);
    (el as SVGGElement).style.setProperty('--a', `${last[key]}deg`);
  };

  return {
    mount: (host) => host.append(root),
    frame(f: FaceFrame) {
      const a = handAngles(f.h, f.m, f.s);
      turn(hour, 'hour', a.hour);
      turn(minute, 'minute', a.minute);
      turn(second, 'second', a.second);
      second.toggleAttribute('hidden', !f.showSeconds);
      ap.textContent = f.period;
      if (first) requestAnimationFrame(() => root.classList.add('an-ready'));
      first = false;
    },
    destroy: () => root.remove(),
  };
}
