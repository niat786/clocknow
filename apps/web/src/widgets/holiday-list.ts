// <holiday-list> — marks past and upcoming rows of a server-rendered holiday table, shows days to
// the next holiday, and exports the list as an all-day .ics file. Day-level only, so no sync is started.
import { now } from './clock-source';
import { icsEscape, icsFold } from './ics';
import { daysBetween, nextIndex } from '../lib/day-count';

const localDay = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

class HolidayList extends HTMLElement {
  connectedCallback(): void {
    const rows = [...this.querySelectorAll<HTMLTableRowElement>('tr[data-date]')];
    const status = this.querySelector<HTMLElement>('[data-status]');
    const paint = (): void => {
      const today = localDay(now());
      const dates = rows.map((r) => r.dataset.date ?? '');
      const next = nextIndex(dates, today);
      rows.forEach((r, i) => {
        const d = dates[i] ?? '';
        const n = daysBetween(today, d);
        r.classList.toggle('is-past', n < 0);
        r.classList.toggle('is-now', n === 0);
        r.classList.toggle('is-next', i === next && n > 0);
        const cell = r.querySelector<HTMLElement>('[data-until]');
        if (cell) cell.textContent = n === 0 ? 'Today' : n > 0 ? `in ${n}` : '';
      });
      if (!status) return;
      const row = next >= 0 ? rows[next] : undefined;
      if (!row) {
        status.textContent = '';
        return;
      }
      const n = daysBetween(today, row.dataset.date ?? '');
      status.textContent = n === 0 ? `Today: ${row.dataset.name}` : `Next: ${row.dataset.name}, in ${n} ${n === 1 ? 'day' : 'days'}`;
    };
    paint();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && paint());
    this.querySelector('[data-ics]')?.addEventListener('click', () => this.download(rows));
  }

  private download(rows: HTMLTableRowElement[]): void {
    const stamp = new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//clocknow.net//Public holidays//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    const name = this.dataset.name ?? '';
    for (const r of rows) {
      const d = (r.dataset.date ?? '').replace(/-/g, '');
      if (!/^\d{8}$/.test(d)) continue;
      const [y, m, day] = (r.dataset.date ?? '').split('-').map(Number);
      const end = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (day ?? 1) + 1)).toISOString().slice(0, 10).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${d}-${(r.dataset.name ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}@clocknow.net`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${icsEscape(`${r.dataset.name ?? ''} (${name})`)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([`${lines.map(icsFold).join('\r\n')}\r\n`], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `holidays-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${this.dataset.year ?? ''}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

if (!customElements.get('holiday-list')) customElements.define('holiday-list', HolidayList);
