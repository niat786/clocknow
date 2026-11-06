// <epoch-card> — live Unix time with a copy button, and a countdown to the next New Year in your zone.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { formatIsoUtc } from './convert-params';
import { splitRemaining } from './countdown-format';
import { pad2 } from '../lib/world-format';

class EpochCard extends HTMLElement {
  async connectedCallback(): Promise<void> {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.innerHTML =
      '<div class="ep-box"><div class="ep-top"><span class="ep-k">Unix time (seconds)</span><button type="button" class="ep-copy">Copy</button></div>' +
      '<div class="ep-v" data-unix></div><div class="ep-iso" data-iso></div></div>' +
      '<div class="ep-box"><div class="ep-top"><span class="ep-k" data-ny-title></span><span class="ep-k" data-ny-date></span></div><div class="ep-cd" data-ny></div></div>';
    const unix = this.querySelector('[data-unix]') as HTMLElement;
    const iso = this.querySelector('[data-iso]') as HTMLElement;
    const ny = this.querySelector('[data-ny]') as HTMLElement;
    const z = await engine.zoneTime(now(), zone);
    const year = z.year + 1;
    const target = await engine.wallToUnixMs(year, 1, 1, 0, 0, 0, zone);
    (this.querySelector('[data-ny-title]') as HTMLElement).textContent = `New Year ${year}`;
    (this.querySelector('[data-ny-date]') as HTMLElement).textContent = `1 Jan, 00:00`;
    const paint = async (): Promise<void> => {
      const t = now();
      unix.textContent = String(Math.floor(t / 1000));
      iso.textContent = formatIsoUtc(await engine.zoneTime(t, 'UTC'));
      const r = splitRemaining(target - t);
      ny.textContent = r.done ? 'Happy New Year!' : `${r.days}d ${pad2(r.hours)}h ${pad2(r.minutes)}m ${pad2(r.seconds)}s`;
    };
    void paint();
    document.addEventListener('tzc:second', () => void paint().catch(() => undefined));
    this.querySelector('.ep-copy')?.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(unix.textContent ?? '');
        b.textContent = 'Copied';
      } catch {
        b.textContent = 'Copy failed';
      }
      setTimeout(() => (b.textContent = 'Copy'), 1500);
    });
  }
}

if (!customElements.get('epoch-card')) customElements.define('epoch-card', EpochCard);
