// <cron-tool> — explains a cron expression and lists its next runs in a time zone and in UTC,
// flagging runs moved or merged by a clock change. Parsing and scheduling run in time-core.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { field, input, localZone, onSubmit, setQuery } from './cv-common';
import { describeCron } from '../lib/cron-describe';
import { formatWhen } from './astro-common';

const NOTE = { normal: '', skipped: 'Clock jumps forward: runs at the jump', repeated: 'Clock goes back: runs the first time only' } as const;

class CronTool extends HTMLElement {
  connectedCallback(): void {
    const form = this.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const q = new URLSearchParams(location.search);
    const qe = (q.get('e') ?? '').slice(0, 120);
    const qz = (q.get('z') ?? '').slice(0, 64);
    if (qe) input(form, 'e').value = qe;
    input(form, 'z').value = /^[A-Za-z0-9_+\-/]+$/.test(qz) ? qz : localZone();
    const desc = this.querySelector<HTMLElement>('[data-result]');
    const body = this.querySelector<HTMLElement>('[data-rows]');
    const zoneHead = this.querySelector<HTMLElement>('[data-zone-head]');
    onSubmit(form, async () => {
      const f = new FormData(form);
      const expr = field(f, 'e');
      const zone = field(f, 'z') || 'UTC';
      const fields = await engine.cronFields(expr);
      if (desc) desc.textContent = describeCron(fields);
      const runs = await engine.cronNext(expr, now(), zone, 10);
      if (zoneHead) zoneHead.textContent = zone;
      const rows: HTMLTableRowElement[] = [];
      for (const r of runs) {
        const [z, u] = await Promise.all([engine.zoneTime(r.unix_ms, zone), engine.zoneTime(r.unix_ms, 'UTC')]);
        const tr = document.createElement('tr');
        if (r.note !== 'normal') tr.className = 'is-next';
        for (const [text, sub] of [[formatWhen(z), z.abbreviation], [formatWhen(u), ''], [NOTE[r.note], '']] as const) {
          const td = document.createElement('td');
          td.textContent = text;
          if (sub) {
            const s = document.createElement('small');
            s.textContent = sub;
            td.append(s);
          }
          tr.append(td);
        }
        rows.push(tr);
      }
      if (!runs.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.textContent = 'This schedule never runs (for example, 30 February).';
        tr.append(td);
        rows.push(tr);
      }
      body?.replaceChildren(...rows);
      setQuery({ e: expr, z: zone });
    });
    for (const b of this.querySelectorAll<HTMLButtonElement>('[data-example]')) {
      b.addEventListener('click', () => {
        input(form, 'e').value = b.dataset.example ?? '';
        form.requestSubmit();
      });
    }
    form.requestSubmit();
  }
}

if (!customElements.get('cron-tool')) customElements.define('cron-tool', CronTool);
