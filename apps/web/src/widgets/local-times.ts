// <local-times> — rewrites each <time data-local datetime="…Z"> inside it into the visitor's zone.
// The static text (UTC) stays if anything fails.
import { engine } from '../engine/engine';
import { formatWhen } from './astro-common';
import { localZone } from './cv-common';

class LocalTimes extends HTMLElement {
  connectedCallback(): void {
    const run = async (): Promise<void> => {
      const zone = localZone();
      for (const el of this.querySelectorAll<HTMLTimeElement>('time[data-local]')) {
        const ms = Number(el.dataset.local);
        if (!Number.isFinite(ms)) continue;
        const z = await engine.zoneTime(ms, zone);
        el.textContent = `${formatWhen(z)} ${z.abbreviation}`;
      }
      const label = this.querySelector('[data-zone-label]');
      if (label) label.textContent = `Times in your time zone (${zone}).`;
    };
    if ('requestIdleCallback' in window) requestIdleCallback(() => void run().catch(() => undefined), { timeout: 2000 });
    else setTimeout(() => void run().catch(() => undefined), 300);
  }
}

if (!customElements.get('local-times')) customElements.define('local-times', LocalTimes);
