// <sun-arc lat lon zone place> — the sun's height through today with "now" marked, plus sunrise,
// solar noon, sunset, day length and the moon. Without lat/lon it uses the largest city in your zone.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { moonSvg, timeIn } from './astro-common';
import { formatChange, formatDuration, moonPath, PHASE_NAME } from '../lib/astro-format';
import { HORIZON_Y, W, H, pathOf, xOf, yOf } from '../lib/sun-arc-math';

const NS = 'http://www.w3.org/2000/svg';
const node = (tag: string, attrs: Record<string, string>): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

class SunArc extends HTMLElement {
  async connectedCallback(): Promise<void> {
    try {
      const zone = this.getAttribute('zone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
      let lat = Number(this.getAttribute('lat'));
      let lon = Number(this.getAttribute('lon'));
      let place = this.getAttribute('place') ?? '';
      if (!this.hasAttribute('lat')) {
        const map = (await (await fetch('/data/zone-cities.json')).json()) as Record<string, [string, number, number]>;
        const hit = map[zone];
        if (!hit) { this.hidden = true; return; }
        [place, lat, lon] = hit;
      }
      const t = now();
      const z = await engine.zoneTime(t, zone);
      const day = { year: z.year, month: z.month, day: z.day };
      const start = await engine.wallToUnixMs(z.year, z.month, z.day, 0, 0, 0, zone);
      const sun = await engine.sunDay(day, lat, lon, zone);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 48; i++) {
        const at = start + (i / 48) * 86_400_000;
        pts.push([i / 48, (await engine.sunPosition(at, lat, lon)).altitude]);
      }
      const nowPos = await engine.sunPosition(t, lat, lon);
      const moon = await engine.moonInfo(t);

      const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sa-svg', 'aria-hidden': 'true' }) as SVGSVGElement;
      const clipId = `sa-up-${Math.random().toString(36).slice(2, 8)}`;
      const clip = node('clipPath', { id: clipId });
      clip.append(node('rect', { x: '0', y: '0', width: String(W), height: String(HORIZON_Y) }));
      svg.append(clip);
      svg.append(node('line', { x1: '0', x2: String(W), y1: String(HORIZON_Y), y2: String(HORIZON_Y), class: 'sa-horizon' }));
      const d = pathOf(pts);
      svg.append(node('path', { d, class: 'sa-night' }));
      svg.append(node('path', { d, class: 'sa-day', 'clip-path': `url(#${clipId})` }));
      svg.append(node('circle', { cx: xOf((t - start) / 86_400_000).toFixed(1), cy: yOf(nowPos.altitude).toFixed(1), r: '5', class: nowPos.altitude > 0 ? 'sa-sun' : 'sa-sun below' }));

      const label = (k: string, v: string) => `<div><span></span><strong></strong></div>`.replace('<span></span>', `<span>${k}</span>`).replace('<strong></strong>', `<strong>${v}</strong>`);
      const [rise, noon, set] = await Promise.all([timeIn(sun.sunrise, zone, day), timeIn(sun.solar_noon, zone, day), timeIn(sun.sunset, zone, day)]);
      const facts = document.createElement('div');
      facts.className = 'sa-facts';
      facts.innerHTML = label('Sunrise', '') + label('Solar noon', '') + label('Sunset', '');
      const strongs = facts.querySelectorAll('strong');
      strongs[0].textContent = rise;
      strongs[1].textContent = `${noon} (${Math.round(sun.noon_altitude)}°)`;
      strongs[2].textContent = set;

      const moonRow = document.createElement('div');
      moonRow.className = 'sa-moon';
      const text = document.createElement('div');
      const a = document.createElement('strong');
      a.textContent = `${PHASE_NAME[moon.phase]} · ${(moon.illumination * 100).toFixed(1)}%`;
      const b = document.createElement('span');
      b.textContent = `Day length ${formatDuration(sun.day_length_s)} · ${formatChange(sun.day_length_change_s)}`;
      text.append(a, b);
      moonRow.append(text, moonSvg(moonPath(moon.elongation, 46, 50, 50), 30));
      const where = document.createElement('p');
      where.className = 'sa-where';
      where.textContent = this.hasAttribute('lat') ? place : `Shown for ${place}, the largest city in your time zone.`;
      const box = document.createElement('div');
      box.className = 'sa-box';
      box.append(svg, facts);
      this.replaceChildren(box, moonRow, ...(place ? [where] : []));
    } catch {
      this.hidden = true;
    }
  }
}

if (!customElements.get('sun-arc')) customElements.define('sun-arc', SunArc);
