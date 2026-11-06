// <age-calc> — exact age, totals, next birthday and day-count milestones. Date maths in time-core.
import { engine } from '../engine/engine';
import { describeSpan, formatCivil, parseCivil } from './convert-params';
import { field, input, localZone, onSubmit, setQuery, showRows, today } from './cv-common';
import { weekdayName } from './weekday';
import { GREGORIAN_MONTHS } from '../lib/calendar-names';
import type { CivilDate } from '../engine/types';

const long = (d: CivilDate): string => `${d.day} ${GREGORIAN_MONTHS[d.month - 1] ?? ''} ${d.year}`;
const n = (v: number): string => v.toLocaleString('en');
const MILESTONES = [1000, 5000, 10_000, 15_000, 20_000, 25_000, 30_000];

class AgeCalc extends HTMLElement {
  connectedCallback(): void {
    const form = this.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const q = new URLSearchParams(location.search);
    const qb = q.get('b') ?? '';
    const qo = q.get('on') ?? '';
    if (parseCivil(qb)) input(form, 'b').value = qb;
    if (parseCivil(qo)) input(form, 'on').value = qo;
    else void today(localZone()).then((d) => (input(form, 'on').value = formatCivil(d)));
    const result = form.querySelector<HTMLElement>('[data-result]') as HTMLElement;
    const out = form.querySelector<HTMLElement>('[data-out]') as HTMLElement;
    const more = this.querySelector<HTMLElement>('[data-milestones]');

    onSubmit(form, async () => {
      const f = new FormData(form);
      const birth = parseCivil(field(f, 'b'));
      const on = parseCivil(field(f, 'on')) ?? (await today(localZone()));
      if (!birth) throw new Error('Enter a date of birth.');
      const age = await engine.dateDiff(birth, on);
      if (age.negative) throw new Error('The date of birth is after the date to measure on.');
      const birthday = age.months === 0 && age.days === 0;
      const next = await engine.addMonths(birth, 12 * (age.years + (birthday ? 0 : 1)));
      const until = (await engine.dateDiff(on, next)).total_days;
      result.textContent = `${describeSpan(age)}${birthday && age.years > 0 ? ' — happy birthday!' : ''}`;
      showRows(out, [
        ['Age', describeSpan(age)],
        ['In months', `${n(age.years * 12 + age.months)} months and ${age.days} days`],
        ['In weeks', `${n(age.total_weeks)} weeks and ${age.extra_days} days`],
        ['In days', n(age.total_days)],
        ['In hours (about)', n(age.total_days * 24)],
        ['Born on a', await weekdayName(birth)],
        ['Next birthday', birthday ? 'Today' : `${await weekdayName(next)} ${long(next)}, in ${n(until)} ${until === 1 ? 'day' : 'days'} (turning ${age.years + 1})`],
      ]);
      if (more) {
        const rows: Array<[string, string]> = [];
        for (const m of MILESTONES) {
          const d = await engine.addDays(birth, m).catch(() => null);
          if (!d) continue;
          const gap = await engine.dateDiff(on, d);
          const left = gap.negative ? -gap.total_days : gap.total_days;
          rows.push([`${n(m)} days old`, `${long(d)}${left > 0 ? ` (in ${n(left)} days)` : left === 0 ? ' (today)' : ''}`]);
        }
        showRows(more, rows);
      }
      setQuery({ b: formatCivil(birth), on: formatCivil(on) });
    });
    if (parseCivil(qb)) form.requestSubmit();
  }
}

if (!customElements.get('age-calc')) customElements.define('age-calc', AgeCalc);
