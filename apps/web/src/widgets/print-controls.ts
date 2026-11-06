// <print-controls> — paper size, week start, Hijri dates and week numbers for print sheets.
// Options live on <html data-…> (CSS does the rest; without JS the defaults apply) and in the URL so a sheet can be shared.
import { parsePrintOptions, printQuery, type PrintOptions } from '../lib/print-options';
import { setQuery } from './cv-common';

function apply(o: PrintOptions): void {
  const d = document.documentElement.dataset;
  d.paper = o.paper;
  d.start = o.start;
  if (o.hijri) d.hijri = ''; else delete d.hijri;
  if (o.weeks) delete d.noweeks; else d.noweeks = '';
}

class PrintControls extends HTMLElement {
  connectedCallback(): void {
    const o = parsePrintOptions(location.search);
    apply(o);
    const hijri = this.hasAttribute('no-hijri') ? '' : '<label class="pc-check"><input type="checkbox" name="hijri" /> Hijri dates</label>';
    const weeks = this.hasAttribute('no-weeks') ? '' : '<label class="pc-check"><input type="checkbox" name="weeks" /> Week numbers</label>';
    const start = this.hasAttribute('no-start') ? '' : '<label>Week starts<select name="start"><option value="mon">Monday</option><option value="sun">Sunday</option></select></label>';
    this.innerHTML =
      '<form class="pc" novalidate>' +
      '<label>Paper<select name="paper"><option value="a4">A4</option><option value="letter">US Letter</option></select></label>' +
      start + hijri + weeks +
      '<button type="button" data-print class="cv-primary">Print or save as PDF</button>' +
      '</form>';
    const form = this.querySelector('form') as HTMLFormElement;
    const field = <T extends HTMLInputElement | HTMLSelectElement>(n: string) => form.elements.namedItem(n) as T | null;
    field<HTMLSelectElement>('paper')!.value = o.paper;
    const st = field<HTMLSelectElement>('start');
    if (st) st.value = o.start;
    const hj = field<HTMLInputElement>('hijri');
    if (hj) hj.checked = o.hijri;
    const wk = field<HTMLInputElement>('weeks');
    if (wk) wk.checked = o.weeks;
    form.addEventListener('change', () => {
      const next: PrintOptions = {
        paper: field<HTMLSelectElement>('paper')!.value === 'letter' ? 'letter' : 'a4',
        start: st?.value === 'sun' ? 'sun' : 'mon',
        hijri: hj?.checked ?? false,
        weeks: wk?.checked ?? true,
      };
      apply(next);
      const keep = Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => !['paper', 'start', 'hijri', 'weeks'].includes(k)));
      setQuery({ ...keep, ...printQuery(next) });
    });
    this.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  }
}

if (!customElements.get('print-controls')) customElements.define('print-controls', PrintControls);
