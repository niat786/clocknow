// <cv-business> — count or add working days. Weekend and holidays are the user's; maths in time-core.
import { engine } from '../engine/engine';
import { WEEKENDS, formatCivil, isWeekendKey, parseCivil, parseHolidays, type WeekendKey } from './convert-params';
import { field, input, localZone, onSubmit, setQuery, showRows, today } from './cv-common';

class CvBusiness extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML =
      '<form class="cv-form" novalidate>' +
      '<label>Start date<input name="s" type="date" required /></label>' +
      '<label>End date (to count working days)<input name="e" type="date" /></label>' +
      '<label>Working days to add (to find a date)<input name="n" type="number" inputmode="numeric" step="1" min="-36500" max="36500" placeholder="10" /></label>' +
      '<label>Weekend<select name="w"><option value="sat-sun">Saturday and Sunday</option><option value="fri-sat">Friday and Saturday</option><option value="fri">Friday only</option><option value="sun">Sunday only</option><option value="none">No weekend</option></select></label>' +
      '<label>Holidays (optional, YYYY-MM-DD, separated by spaces or commas)<textarea name="h" rows="3" spellcheck="false"></textarea></label>' +
      '<div class="cv-actions"><button type="submit" data-act="count" class="cv-primary">Count working days</button><button type="submit" data-act="add">Add working days</button></div>' +
      '<p class="tm-status" data-error role="alert"></p><p class="cv-result" data-result aria-live="polite"></p><dl class="cv-out" data-out></dl></form>';
    const form = this.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const q = new URLSearchParams(location.search);
    const qs = q.get('s') ?? '';
    if (parseCivil(qs)) input(form, 's').value = qs;
    else void today(localZone()).then((d) => (input(form, 's').value = formatCivil(d)));
    const qe = q.get('e') ?? '';
    if (parseCivil(qe)) input(form, 'e').value = qe;
    const qn = q.get('n') ?? '';
    if (/^-?\d{1,5}$/.test(qn)) input(form, 'n').value = qn;
    const qw = q.get('w') ?? '';
    if (isWeekendKey(qw)) form.querySelector<HTMLSelectElement>('[name=w]')!.value = qw;
    input(form, 'h').value = (q.get('h') ?? '').replace(/,/g, '\n').slice(0, 6000);

    onSubmit(form, async (act) => {
      const f = new FormData(form);
      const start = parseCivil(field(f, 's'));
      if (!start) throw new Error('Choose a start date.');
      const wk = field(f, 'w');
      const key: WeekendKey = isWeekendKey(wk) ? wk : 'sat-sun';
      const mask = WEEKENDS[key];
      const hol = parseHolidays(field(f, 'h'));
      if (hol.bad.length) throw new Error(`Not a date (use YYYY-MM-DD): ${hol.bad.join(', ')}`);
      if (hol.tooMany) throw new Error('Too many holidays (maximum 400).');
      const result = form.querySelector<HTMLElement>('[data-result]') as HTMLElement;
      const out = form.querySelector<HTMLElement>('[data-out]') as HTMLElement;
      const share: Record<string, string> = { s: formatCivil(start), w: key, h: hol.dates.map(formatCivil).join(',') };
      if (act === 'add') {
        const n = Number(field(f, 'n'));
        if (!Number.isInteger(n) || field(f, 'n') === '') throw new Error('Enter a whole number of working days.');
        const d = await engine.addBusinessDays(start, n, mask, hol.dates);
        result.textContent = `${n} working ${Math.abs(n) === 1 ? 'day' : 'days'} from ${formatCivil(start)} is ${formatCivil(d)}.`;
        showRows(out, [['Date', formatCivil(d)]]);
        share.n = String(n);
      } else {
        const end = parseCivil(field(f, 'e'));
        if (!end) throw new Error('Choose an end date.');
        const days = await engine.businessDays(start, end, mask, hol.dates);
        const total = Math.abs(days);
        result.textContent = `${total} working ${total === 1 ? 'day' : 'days'}, counting both the start and end dates.`;
        showRows(out, [['Working days', String(days)], ['Holidays used', String(hol.dates.length)]]);
        share.e = formatCivil(end);
      }
      setQuery(share);
    });
    if (parseCivil(qs) && parseCivil(qe)) form.requestSubmit(form.querySelector<HTMLElement>('[data-act=count]'));
    else if (parseCivil(qs) && qn) form.requestSubmit(form.querySelector<HTMLElement>('[data-act=add]'));
  }
}

if (!customElements.get('cv-business')) customElements.define('cv-business', CvBusiness);
