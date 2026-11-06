// <week-now> — today's ISO week (local date), plus a date ↔ week lookup. Maths in time-core.
import { engine } from '../engine/engine';
import { now, subscribe } from './clock-source';
import { field, input, localZone, onSubmit, setQuery, today } from './cv-common';
import { formatCivil, parseCivil } from './convert-params';
import { GREGORIAN_MONTHS } from '../lib/calendar-names';
import type { CivilDate } from '../engine/types';

const long = (d: CivilDate): string => `${d.day} ${GREGORIAN_MONTHS[d.month - 1] ?? ''} ${d.year}`;

class WeekNow extends HTMLElement {
  #day = '';

  connectedCallback(): void {
    const paint = (): void => void this.paint();
    paint();
    subscribe(paint);
    // Roll over at midnight: re-check when the tab comes back and at the start of each minute.
    document.addEventListener('visibilitychange', paint);
    const again = (): void => {
      paint();
      window.setTimeout(again, 60_000 - (now() % 60_000));
    };
    window.setTimeout(again, 60_000 - (now() % 60_000));
    const form = this.querySelector<HTMLFormElement>('form');
    if (form) this.wireForm(form);
  }

  private async paint(): Promise<void> {
    const d = await today(localZone());
    const key = formatCivil(d);
    if (key === this.#day) return;
    this.#day = key;
    const w = await engine.isoWeek(d);
    const span = await engine.isoWeekSpan(w.year, w.week);
    const n = this.querySelector<HTMLElement>('[data-n]');
    if (n) n.textContent = String(w.week);
    const range = this.querySelector<HTMLElement>('[data-range]');
    if (range) range.textContent = `Monday ${long(span.start)} to Sunday ${long(span.end)}${w.year !== d.year ? ` · week of ${w.year}` : ''} · ${span.weeks_in_year} weeks in ${w.year}`;
    for (const tr of document.querySelectorAll<HTMLTableRowElement>('.week-table tr[data-start]')) {
      const cur = (tr.dataset.start ?? '') <= key && key <= (tr.dataset.end ?? '');
      tr.classList.toggle('is-next', cur);
      tr.classList.toggle('is-past', (tr.dataset.end ?? '') < key);
      if (cur) tr.setAttribute('aria-current', 'date');
      else tr.removeAttribute('aria-current');
    }
  }

  private wireForm(form: HTMLFormElement): void {
    const result = form.querySelector<HTMLElement>('[data-result]');
    const q = new URLSearchParams(location.search);
    const qd = q.get('d') ?? '';
    if (parseCivil(qd)) input(form, 'd').value = qd;
    if (/^\d{1,2}$/.test(q.get('w') ?? '')) input(form, 'w').value = q.get('w') ?? '';
    if (/^\d{1,4}$/.test(q.get('y') ?? '')) input(form, 'y').value = q.get('y') ?? '';
    // Typing a week clears the date and the other way round, so it is clear which one is used.
    input(form, 'd').addEventListener('input', () => (input(form, 'w').value = ''));
    input(form, 'w').addEventListener('input', () => (input(form, 'd').value = ''));
    onSubmit(form, async () => {
      const f = new FormData(form);
      const d = parseCivil(field(f, 'd'));
      if (d) {
        const w = await engine.isoWeek(d);
        const s = await engine.isoWeekSpan(w.year, w.week);
        if (result) result.textContent = `${long(d)} is in week ${w.week} of ${w.year} (Monday ${long(s.start)} to Sunday ${long(s.end)}).`;
        setQuery({ d: formatCivil(d) });
        return;
      }
      const wk = Number(field(f, 'w'));
      const yr = Number(field(f, 'y')) || (await today(localZone())).year;
      if (!Number.isInteger(wk) || wk < 1) throw new Error('Choose a date, or enter a week number.');
      const s = await engine.isoWeekSpan(yr, wk).catch(() => {
        throw new Error(`${yr} does not have a week ${wk}.`);
      });
      if (result) result.textContent = `Week ${wk} of ${yr} runs from Monday ${long(s.start)} to Sunday ${long(s.end)}.`;
      setQuery({ w: String(wk), y: String(yr) });
    });
    if (qd || q.get('w')) form.requestSubmit();
  }
}

if (!customElements.get('week-now')) customElements.define('week-now', WeekNow);
