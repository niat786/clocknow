// <cv-diff> — calendar difference between two dates. Maths in time-core.
import { engine } from '../engine/engine';
import { describeSpan, formatCivil, parseCivil } from './convert-params';
import { field, input, localZone, onSubmit, setQuery, showRows, today } from './cv-common';

class CvDiff extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML =
      '<form class="cv-form" novalidate>' +
      '<label>From<input name="a" type="date" required /></label>' +
      '<label>To<input name="b" type="date" required /></label>' +
      '<div class="cv-actions"><button type="submit" data-act="go" class="cv-primary">Calculate</button></div>' +
      '<p class="tm-status" data-error role="alert"></p><p class="cv-result" data-result aria-live="polite"></p><dl class="cv-out" data-out></dl></form>';
    const form = this.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const q = new URLSearchParams(location.search);
    const qa = q.get('a') ?? '';
    const qb = q.get('b') ?? '';
    if (parseCivil(qa)) input(form, 'a').value = qa;
    else void today(localZone()).then((d) => (input(form, 'a').value = formatCivil(d)));
    if (parseCivil(qb)) input(form, 'b').value = qb;

    onSubmit(form, async () => {
      const f = new FormData(form);
      const a = parseCivil(field(f, 'a'));
      const b = parseCivil(field(f, 'b'));
      if (!a || !b) throw new Error('Choose both dates.');
      const r = await engine.dateDiff(a, b);
      const span = describeSpan(r);
      (form.querySelector('[data-result]') as HTMLElement).textContent = r.negative ? `${span} (the first date is after the second)` : span;
      showRows(form.querySelector<HTMLElement>('[data-out]') as HTMLElement, [
        ['Years, months, days', span],
        ['Total days', String(r.total_days)],
        ['Weeks and days', `${r.total_weeks} weeks, ${r.extra_days} days`],
        ['Total hours', String(r.total_days * 24)],
      ]);
      setQuery({ a: formatCivil(a), b: formatCivil(b) });
    });
    if (parseCivil(qa) && parseCivil(qb)) form.requestSubmit();
  }
}

if (!customElements.get('cv-diff')) customElements.define('cv-diff', CvDiff);
