// <moon-now> — today's moon phase and the next principal phases in the visitor's time zone.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { moonPath, PHASE_EVENT, PHASE_NAME } from '../lib/astro-format';
import { formatWhen, moonSvg, row } from './astro-common';
import { localZone } from './cv-common';

class MoonNow extends HTMLElement {
  connectedCallback(): void {
    void this.#render().catch(() => {
      this.textContent = 'The moon could not be calculated in this browser.';
    });
  }

  async #render(): Promise<void> {
    const zone = localZone();
    const m = await engine.moonInfo(now());
    const head = document.createElement('div');
    head.className = 'moon-hero';
    const text = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'moon-name';
    name.textContent = PHASE_NAME[m.phase];
    const sub = document.createElement('p');
    sub.textContent = `${(m.illumination * 100).toFixed(1)}% lit · ${m.waxing ? 'waxing' : 'waning'} · ${m.age_days.toFixed(1)} days since new moon`;
    text.append(name, sub);
    head.append(moonSvg(moonPath(m.elongation, 46, 50, 50), 160), text);
    const dl = document.createElement('dl');
    dl.className = 'cv-out';
    for (const ev of m.next) row(dl, PHASE_EVENT[ev.phase], formatWhen(await engine.zoneTime(ev.at, zone)));
    const note = document.createElement('p');
    note.className = 'cv-note-inline';
    note.textContent = `Times in your time zone (${zone}). The phase is the same everywhere on Earth; the picture shows the moon as seen from the northern hemisphere.`;
    this.replaceChildren(head, dl, note);
  }
}

if (!customElements.get('moon-now')) customElements.define('moon-now', MoonNow);
