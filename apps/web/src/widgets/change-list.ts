// <change-list> — dims past clock changes and names the next one, from the synced clock.
import { now } from './clock-source';
import { daysBetween } from '../lib/day-count';

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

class ChangeList extends HTMLElement {
  connectedCallback(): void {
    const t = now();
    const rows = [...this.querySelectorAll<HTMLTableRowElement>('tr[data-at]')];
    const next = rows.find((r) => Number(r.dataset.at) > t);
    for (const r of rows) {
      r.classList.toggle('is-past', Number(r.dataset.at) <= t);
      r.classList.toggle('is-next', r === next);
    }
    const status = this.querySelector<HTMLElement>('[data-status]');
    if (status && next) {
      const n = daysBetween(day(t), day(Number(next.dataset.at)));
      const what = next.cells[1]?.textContent ?? '';
      const where = [...(next.cells[2]?.querySelectorAll('a') ?? [])].slice(0, 3).map((x) => x.textContent).join(', ');
      status.textContent = `Next change ${n <= 0 ? 'today' : `in ${n} ${n === 1 ? 'day' : 'days'}`}: ${what}${where ? ` (${where}${(next.cells[2]?.querySelectorAll('a').length ?? 0) > 3 ? ' and more' : ''})` : ''}.`;
    }
  }
}

if (!customElements.get('change-list')) customElements.define('change-list', ChangeList);
