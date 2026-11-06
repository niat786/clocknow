// <cal-convert> — one date in the Gregorian, Hijri, Hebrew, Chinese, Persian and Indian calendars,
// in either direction. The form markup is server-rendered; all conversions run in time-core.
import { engine } from '../engine/engine';
import { field, input, localZone, onSubmit, setQuery, today } from './cv-common';
import { formatCivil, parseCivil } from './convert-params';
import { GREGORIAN_MONTHS, formatHijri, hijriMonthName } from '../lib/calendar-names';
import { WORLD_CALENDARS, formatWorld, monthName } from '../lib/world-names';
import { weekdayName } from './weekday';
import type { CivilDate, WorldCalendar } from '../engine/types';

type CalId = 'gregorian' | 'hijri' | WorldCalendar;
const isWorld = (c: string): c is WorldCalendar => WORLD_CALENDARS.some((w) => w.id === c);
const isCal = (c: string): c is CalId => c === 'gregorian' || c === 'hijri' || isWorld(c);
const gregorianText = async (d: CivilDate): Promise<string> =>
  `${await weekdayName(d)} ${d.day} ${GREGORIAN_MONTHS[d.month - 1] ?? ''} ${d.year} · ISO week ${(await engine.isoWeek(d)).week}`;

class CalConvert extends HTMLElement {
  connectedCallback(): void {
    const from = this.querySelector<HTMLFormElement>('[data-from]');
    const to = this.querySelector<HTMLFormElement>('[data-to]');
    if (!from || !to) return;
    const q = new URLSearchParams(location.search);
    const qd = q.get('d') ?? '';
    if (parseCivil(qd)) input(from, 'd').value = qd;
    onSubmit(from, async () => {
      const d = parseCivil(field(new FormData(from), 'd'));
      if (!d) throw new Error('Choose a date.');
      await this.show(d);
      setQuery({ d: formatCivil(d) });
    });
    this.wireReverse(to, q);
    if (parseCivil(qd)) from.requestSubmit();
    else void today(localZone()).then((d) => {
      input(from, 'd').value = formatCivil(d);
      from.requestSubmit();
    });
  }

  private set(id: string, text: string): void {
    const el = this.querySelector<HTMLElement>(`[data-out="${id}"]`);
    if (el) el.textContent = text;
  }

  private async show(d: CivilDate): Promise<void> {
    this.set('gregorian', await gregorianText(d));
    this.set('hijri', await engine.toHijri(d).then(formatHijri, () => 'Outside 1300–1600 AH'));
    for (const w of WORLD_CALENDARS) {
      const text = await engine.toWorldDate(w.id, d).then(
        (x) => formatWorld(w.id, x),
        async () => {
          const r = await engine.worldYearRange(w.id);
          return `Outside the supported years (${r.first}–${r.last})`;
        },
      );
      this.set(w.id, text);
    }
  }

  private wireReverse(form: HTMLFormElement, q: URLSearchParams): void {
    const cal = form.querySelector<HTMLSelectElement>('[name=c]');
    const month = form.querySelector<HTMLSelectElement>('[name=m]');
    const year = input(form, 'y');
    if (!cal || !month) return;
    let gen = 0;
    const fillMonths = async (): Promise<void> => {
      const mine = ++gen;
      const c = cal.value;
      const y = Number(year.value);
      const keep = month.value;
      const opts: Array<[string, string]> = [];
      if (c === 'gregorian') GREGORIAN_MONTHS.forEach((n, i) => opts.push([String(i + 1), n]));
      else if (c === 'hijri') for (let m = 1; m <= 12; m++) opts.push([String(m), hijriMonthName(m)]);
      else if (isWorld(c) && Number.isInteger(y)) {
        // Month names depend on the year (leap months), so ask the engine for each ordinal month.
        for (let m = 1; m <= 13; m++) {
          const g = await engine.fromWorldDate(c, { year: y, month: m, day: 1 }).catch(() => null);
          if (!g) break;
          const w = await engine.toWorldDate(c, g);
          opts.push([String(m), monthName(c, w.number, w.leap, w.months_in_year)]);
        }
      }
      if (mine !== gen) return;
      month.replaceChildren(...opts.map(([v, t]) => new Option(t, v)));
      if (opts.some(([v]) => v === keep)) month.value = keep;
    };
    const setYearToday = async (): Promise<void> => {
      const d = await today(localZone());
      const c = cal.value;
      if (c === 'gregorian') year.value = String(d.year);
      else if (c === 'hijri') year.value = String((await engine.toHijri(d)).year);
      else if (isWorld(c)) year.value = String((await engine.toWorldDate(c, d)).year);
    };
    cal.addEventListener('change', () => void setYearToday().then(fillMonths));
    year.addEventListener('change', () => void fillMonths());
    const qc = q.get('c') ?? '';
    if (isCal(qc)) cal.value = qc;
    void (async () => {
      if (/^-?\d{1,4}$/.test(q.get('y') ?? '')) year.value = q.get('y') ?? '';
      else await setYearToday();
      await fillMonths();
      if (/^\d{1,2}$/.test(q.get('m') ?? '')) month.value = q.get('m') ?? '';
      if (/^\d{1,2}$/.test(q.get('day') ?? '')) {
        input(form, 'day').value = q.get('day') ?? '';
        form.requestSubmit();
      }
    })();
    onSubmit(form, async () => {
      const f = new FormData(form);
      const c = field(f, 'c');
      const parts = { year: Number(field(f, 'y')), month: Number(field(f, 'm')), day: Number(field(f, 'day')) };
      if (!Object.values(parts).every(Number.isInteger)) throw new Error('Enter a year, month and day.');
      let g: CivilDate;
      if (c === 'gregorian') g = parts;
      else if (c === 'hijri') g = await engine.fromHijri(parts);
      else if (isWorld(c)) g = await engine.fromWorldDate(c, parts);
      else throw new Error('Choose a calendar.');
      await engine.dateDiff(g, g); // validates the Gregorian date (throws on 30 February)
      const from = this.querySelector<HTMLFormElement>('[data-from]');
      if (from) input(from, 'd').value = formatCivil(g);
      await this.show(g);
      setQuery({ c, y: String(parts.year), m: String(parts.month), day: String(parts.day) });
    });
  }
}

if (!customElements.get('cal-convert')) customElements.define('cal-convert', CalConvert);
