// <overlap-strip> — your day hour by hour against a few world cities. Hour columns are buttons;
// the chosen column is spelled out above. Every hour comes from time-core, so DST is handled.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { zoneCity } from '../lib/stage-prefs';
import { isWorkHour, pad2 } from '../lib/world-format';

interface Row { zone: string; label: string }

class OverlapStrip extends HTMLElement {
  async connectedCallback(): Promise<void> {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const extra = (this.getAttribute('zones') ?? '').split(',').filter(Boolean);
    const rows: Row[] = [{ zone: local, label: zoneCity(local) }];
    for (const z of extra) if (!rows.some((r) => r.zone === z)) rows.push({ zone: z, label: zoneCity(z) });
    try {
      const today = await engine.zoneTime(now(), local);
      const instants: number[] = [];
      for (let h = 0; h < 24; h++) instants.push(await engine.wallToUnixMs(today.year, today.month, today.day, h, 0, 0, local));
      const grid: number[][] = [];
      const abbr: string[] = [];
      for (const r of rows) {
        const hours: number[] = [];
        for (const t of instants) hours.push((await engine.zoneTime(t, r.zone)).hour);
        grid.push(hours);
        const z = await engine.zoneTime(now(), r.zone);
        abbr.push(/^[A-Z]{2,5}$/.test(z.abbreviation) ? z.abbreviation : '');
      }
      this.#render(rows, grid, abbr, today.hour);
    } catch {
      this.textContent = '';
    }
  }

  #render(rows: Row[], grid: number[][], abbr: string[], current: number): void {
    const label = document.createElement('p');
    label.className = 'ov-label';
    label.setAttribute('aria-live', 'polite');
    const table = document.createElement('div');
    table.className = 'ov-grid';
    table.style.setProperty('--cols', '24');
    const head = document.createElement('div');
    head.className = 'ov-row ov-head';
    head.append(Object.assign(document.createElement('span'), { className: 'ov-name', textContent: 'Your hour' }));
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < 24; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ov-pick';
      b.textContent = pad2(grid[0][i]);
      b.addEventListener('click', () => select(i));
      buttons.push(b);
      head.append(b);
    }
    table.append(head);
    const cells: HTMLElement[][] = rows.map((r, ri) => {
      const row = document.createElement('div');
      row.className = 'ov-row';
      const name = document.createElement('span');
      name.className = 'ov-name';
      name.innerHTML = '<strong></strong><small></small>';
      (name.firstChild as HTMLElement).textContent = r.label;
      (name.lastChild as HTMLElement).textContent = abbr[ri];
      row.append(name);
      const list = grid[ri].map((h) => {
        const c = document.createElement('span');
        c.className = `ov-cell${isWorkHour(h) ? ' work' : ''}`;
        c.textContent = pad2(h);
        c.setAttribute('aria-hidden', 'true');
        row.append(c);
        return c;
      });
      table.append(row);
      return list;
    });
    const select = (i: number): void => {
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      cells.forEach((row) => row.forEach((c, j) => c.classList.toggle('sel', j === i)));
      label.textContent = rows.map((r, ri) => `${pad2(grid[ri][i])}:00 ${r.label}`).join(' · ');
    };
    buttons.forEach((b, i) => b.setAttribute('aria-label', `Compare at ${pad2(grid[0][i])}:00 your time`));
    const wrap = document.createElement('div');
    wrap.className = 'ov-scroll';
    wrap.append(table);
    this.replaceChildren(label, wrap);
    select(current);
    // On narrow screens, start with the current hour in view.
    const btn = buttons[current];
    if (btn && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, btn.offsetLeft - wrap.clientWidth / 2);
  }
}

if (!customElements.get('overlap-strip')) customElements.define('overlap-strip', OverlapStrip);
