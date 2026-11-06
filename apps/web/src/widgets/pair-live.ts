// <pair-live za zb na nb data-diff> — keeps the difference line and hour table right when daylight
// saving has changed since the page was built. Offsets from time-core.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { hm, hourTable, relation } from '../lib/pair-diff';
import { formatOffset } from '../lib/city-facts';

class PairLive extends HTMLElement {
  connectedCallback(): void {
    const run = async (): Promise<void> => {
      const za = this.getAttribute('za') ?? 'UTC';
      const zb = this.getAttribute('zb') ?? 'UTC';
      const t = now();
      const [a, b] = await Promise.all([engine.zoneTime(t, za), engine.zoneTime(t, zb)]);
      const diff = b.offset_seconds - a.offset_seconds;
      const offA = this.querySelector('[data-off-a]');
      const offB = this.querySelector('[data-off-b]');
      if (offA) offA.textContent = formatOffset(a.offset_seconds);
      if (offB) offB.textContent = formatOffset(b.offset_seconds);
      if (String(diff) === this.dataset.diff) return;
      this.dataset.diff = String(diff);
      const line = this.querySelector('[data-line]');
      if (line) {
        const sa = document.createElement('strong');
        sa.textContent = this.getAttribute('na') ?? za;
        const sb = document.createElement('strong');
        sb.textContent = this.getAttribute('nb') ?? zb;
        line.replaceChildren(sb, ` is ${relation(diff)} `, sa, '.');
      }
      const body = this.querySelector('[data-rows]');
      if (!body) return;
      body.replaceChildren(...hourTable(diff).map((r) => {
        const tr = document.createElement('tr');
        if (r.work) tr.className = 'is-next';
        const cells = [hm(r.a), `${hm(r.b)}${r.day > 0 ? ' (next day)' : r.day < 0 ? ' (previous day)' : ''}`, r.work ? 'Yes' : ''];
        cells.forEach((c, i) => {
          const td = document.createElement('td');
          td.textContent = c;
          if (i === 2) td.className = 'hide-sm';
          tr.append(td);
        });
        return tr;
      }));
    };
    void run();
  }
}

if (!customElements.get('pair-live')) customElements.define('pair-live', PairLive);
