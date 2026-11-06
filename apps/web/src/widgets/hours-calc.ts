// <hours-calc> — time-card totals (start, end, break per day) and a running sum of durations.
import { decimalHours, formatHMS, shiftSeconds, sumLines } from '../lib/hours-calc';

class HoursCalc extends HTMLElement {
  connectedCallback(): void {
    const card = this.querySelector<HTMLFormElement>('[data-card]');
    const sum = this.querySelector<HTMLFormElement>('[data-sum]');
    if (card) this.wireCard(card);
    if (sum) this.wireSum(sum);
  }

  private wireCard(form: HTMLFormElement): void {
    const total = form.querySelector<HTMLElement>('[data-total]');
    const tbody = form.querySelector<HTMLElement>('tbody');
    const template = tbody?.querySelector('tr')?.cloneNode(true) as HTMLTableRowElement | undefined;
    const update = (): void => {
      let sec = 0;
      let bad = 0;
      for (const tr of form.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
        const v = (n: string) => tr.querySelector<HTMLInputElement>(`[name=${n}]`)?.value ?? '';
        const out = tr.querySelector<HTMLElement>('[data-row-total]');
        if (!v('start') && !v('end')) {
          if (out) out.textContent = '';
          continue;
        }
        const s = shiftSeconds(v('start'), v('end'), Number(v('break') || 0));
        if (out) out.textContent = s === null ? 'Check times' : formatHMS(s);
        if (s === null) bad++;
        else sec += s;
      }
      if (total) total.textContent = `Total ${formatHMS(sec)} (${decimalHours(sec)} hours)${bad ? ` · ${bad} ${bad === 1 ? 'row needs' : 'rows need'} fixing` : ''}`;
    };
    form.addEventListener('input', update);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.querySelector('[data-add]')?.addEventListener('click', () => {
      if (!template || !tbody) return;
      const row = template.cloneNode(true) as HTMLTableRowElement;
      for (const i of row.querySelectorAll('input')) i.value = '';
      const label = row.querySelector('th');
      if (label) label.textContent = `Day ${tbody.children.length + 1}`;
      tbody.append(row);
      row.querySelector('input')?.focus();
    });
    form.querySelector('[data-clear]')?.addEventListener('click', () => {
      for (const i of form.querySelectorAll<HTMLInputElement>('tbody input')) i.value = '';
      update();
    });
    update();
  }

  private wireSum(form: HTMLFormElement): void {
    const area = form.querySelector<HTMLTextAreaElement>('textarea');
    const total = form.querySelector<HTMLElement>('[data-total]');
    const update = (): void => {
      const r = sumLines(area?.value ?? '');
      if (!total) return;
      total.textContent = r.count
        ? `Total ${formatHMS(r.total)} (${decimalHours(r.total)} hours)${r.bad.length ? ` · not read: ${r.bad.join(', ')}` : ''}`
        : r.bad.length ? `Not read: ${r.bad.join(', ')}` : 'Total 0:00';
    };
    form.addEventListener('input', update);
    form.addEventListener('submit', (e) => e.preventDefault());
    update();
  }
}

if (!customElements.get('hours-calc')) customElements.define('hours-calc', HoursCalc);
