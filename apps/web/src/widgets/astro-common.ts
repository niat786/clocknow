// Shared bits for the sun and moon widgets: formatting instants in a zone via the engine.
import { engine } from '../engine/engine';
import type { CivilDate, Instant, ZoneTime } from '../engine/types';
import { formatHM, type Band } from '../lib/astro-format';
import { GREGORIAN_MONTHS, WEEKDAYS_MON } from '../lib/calendar-names';
import { dayKey } from './convert-params';

export const has = (t: Instant): t is number => typeof t === 'number';

/** "06:42", "00:12 (next day)" relative to `day`, or "—". */
export async function timeIn(t: Instant, zone: string, day: CivilDate): Promise<string> {
  if (!has(t)) return '—';
  const z = await engine.zoneTime(t, zone);
  const k = dayKey(z) - dayKey(day);
  return `${formatHM(z)}${k > 0 ? ' (next day)' : k < 0 ? ' (previous day)' : ''}`;
}

export async function bandIn(b: Band, zone: string, day: CivilDate): Promise<string> {
  const t = (x: number): Promise<string> => timeIn(x, zone, day);
  switch (b.kind) {
    case 'twice':
      return `Morning ${await t(b.morning[0])} – ${await t(b.morning[1])} · evening ${await t(b.evening[0])} – ${await t(b.evening[1])}`;
    case 'midday':
      return `${await t(b.from)} – ${await t(b.to)}, around midday`;
    case 'overnight':
      return `Until ${await t(b.until)}, then again from ${await t(b.from)}`;
    case 'all_day':
      return 'All day';
    case 'none':
      return 'Not today';
  }
}

/** "Fri 6 Nov 2026, 14:20". */
export const formatWhen = (z: ZoneTime): string =>
  `${WEEKDAYS_MON[z.weekday - 1]} ${z.day} ${GREGORIAN_MONTHS[z.month - 1].slice(0, 3)} ${z.year}, ${formatHM(z)}`;

export function section(title: string): { el: HTMLElement; dl: HTMLElement } {
  const el = document.createElement('section');
  el.className = 'sun-sec';
  const h = document.createElement('h2');
  h.textContent = title;
  const dl = document.createElement('dl');
  dl.className = 'cv-out';
  el.append(h, dl);
  return { el, dl };
}

export function row(dl: HTMLElement, k: string, v: string): void {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  dl.append(dt, dd);
}

const SVG = 'http://www.w3.org/2000/svg';

/** A moon disc showing the lit fraction. Decorative: the text next to it carries the meaning. */
export function moonSvg(path: string, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'moon-disc');
  const disc = document.createElementNS(SVG, 'circle');
  disc.setAttribute('cx', '50');
  disc.setAttribute('cy', '50');
  disc.setAttribute('r', '46');
  disc.setAttribute('class', 'moon-dark');
  svg.append(disc);
  if (path) {
    const lit = document.createElementNS(SVG, 'path');
    lit.setAttribute('d', path);
    lit.setAttribute('class', 'moon-lit');
    svg.append(lit);
  }
  return svg;
}
