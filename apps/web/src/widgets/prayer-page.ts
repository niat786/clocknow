// <prayer-page lat lon zone cc> — today's prayer times, a countdown to the next one and the month's
// table, for the visitor's chosen method. The build already rendered a table; this keeps it current.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { today } from './cv-common';
import { isPrayerMethod } from '../lib/astro-format';
import { PRAYERS, PRAYER_LABEL, cellText, countdown, instantsOf, nextPrayer } from '../lib/prayer-table';
import { GREGORIAN_MONTHS, WEEKDAYS_MON } from '../lib/calendar-names';
import type { AsrRule, CivilDate, PrayerMethod } from '../engine/types';

const KEY = 'cn-prayer';

function saved(): { method: PrayerMethod; asr: AsrRule } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { method?: string; asr?: string } | null;
    if (v && typeof v.method === 'string' && isPrayerMethod(v.method) && (v.asr === 'standard' || v.asr === 'hanafi')) return { method: v.method, asr: v.asr };
  } catch {
    /* storage unavailable */
  }
  return null;
}

class PrayerPage extends HTMLElement {
  #lat = 0;
  #lon = 0;
  #zone = 'UTC';
  #method: PrayerMethod = 'mwl';
  #asr: AsrRule = 'standard';
  #day: CivilDate | null = null;
  #instants: Array<number | null> = [];
  #built = '';

  connectedCallback(): void {
    this.#lat = Number(this.getAttribute('lat'));
    this.#lon = Number(this.getAttribute('lon'));
    this.#zone = this.getAttribute('zone') ?? 'UTC';
    const m = this.dataset.method ?? '';
    if (isPrayerMethod(m)) this.#method = m;
    if (this.dataset.asr === 'hanafi') this.#asr = 'hanafi';
    this.#built = `${this.dataset.year}-${this.dataset.month}-${this.#method}-${this.#asr}`;
    const pref = saved();
    const form = this.querySelector<HTMLFormElement>('form');
    const sel = (n: string) => form?.querySelector<HTMLSelectElement>(`[name=${n}]`);
    if (pref) {
      this.#method = pref.method;
      this.#asr = pref.asr;
      const ms = sel('method');
      const as = sel('asr');
      if (ms) ms.value = pref.method;
      if (as) as.value = pref.asr;
    }
    form?.addEventListener('change', () => {
      const ms = sel('method')?.value ?? '';
      if (isPrayerMethod(ms)) this.#method = ms;
      this.#asr = sel('asr')?.value === 'hanafi' ? 'hanafi' : 'standard';
      try {
        localStorage.setItem(KEY, JSON.stringify({ method: this.#method, asr: this.#asr }));
      } catch {
        /* storage unavailable */
      }
      this.#day = null;
      void this.#refresh();
    });
    this.addEventListener('tzc:second', () => void this.#refresh());
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = await today(this.#zone);
    const same = this.#day && this.#day.year === d.year && this.#day.month === d.month && this.#day.day === d.day;
    if (!same) {
      this.#day = d;
      const p = await engine.prayerTimes(d, this.#lat, this.#lon, this.#zone, this.#method, this.#asr, 'angle');
      this.#instants = instantsOf(p);
      const cells = this.querySelectorAll<HTMLElement>('[data-today] dd');
      for (let i = 0; i < PRAYERS.length; i++) {
        const t = this.#instants[i];
        const el = cells[i];
        if (el) el.textContent = t == null ? cellText(null) : cellText(await engine.zoneTime(t, this.#zone));
      }
      const key = `${d.year}-${d.month}-${this.#method}-${this.#asr}`;
      if (key !== this.#built) await this.#month(d);
    }
    this.#tick();
  }

  #tick(): void {
    const t = now();
    const next = nextPrayer(this.#instants, t);
    const boxes = this.querySelectorAll<HTMLElement>('[data-today] > div');
    boxes.forEach((b, i) => {
      const at = this.#instants[i];
      b.classList.toggle('is-next', i === next);
      b.classList.toggle('is-past', at != null && at <= t);
    });
    const line = this.querySelector<HTMLElement>('[data-next]');
    if (!line) return;
    const k = PRAYERS[next];
    const at = this.#instants[next];
    line.textContent = k && at != null ? `${PRAYER_LABEL[k]} in ${countdown(at - t)}` : 'All prayers for today have passed';
  }

  async #month(d: CivilDate): Promise<void> {
    this.#built = `${d.year}-${d.month}-${this.#method}-${this.#asr}`;
    const body = this.querySelector<HTMLElement>('[data-rows]');
    const title = this.querySelector<HTMLElement>('[data-month-title]');
    if (!body) return;
    const rows: HTMLTableRowElement[] = [];
    for (let day = 1; day <= 31; day++) {
      const date = { year: d.year, month: d.month, day };
      const p = await engine.prayerTimes(date, this.#lat, this.#lon, this.#zone, this.#method, this.#asr, 'angle').catch(() => null);
      if (!p) break; // past the end of the month
      const tr = document.createElement('tr');
      const first = document.createElement('td');
      const cells: string[] = [];
      let weekday = '';
      for (const t of instantsOf(p)) {
        if (t == null) {
          cells.push(cellText(null));
          continue;
        }
        const z = await engine.zoneTime(t, this.#zone);
        weekday ||= WEEKDAYS_MON[z.weekday - 1] ?? '';
        cells.push(cellText(z, z.day !== day));
      }
      const small = document.createElement('small');
      small.textContent = weekday;
      first.append(`${day} `, small);
      tr.append(first);
      cells.forEach((c, i) => {
        const td = document.createElement('td');
        td.textContent = c;
        if (PRAYERS[i] === 'sunrise') td.className = 'hide-sm';
        tr.append(td);
      });
      rows.push(tr);
    }
    body.replaceChildren(...rows);
    if (title) title.textContent = `${GREGORIAN_MONTHS[d.month - 1] ?? ''} ${d.year}`;
  }
}

if (!customElements.get('prayer-page')) customElements.define('prayer-page', PrayerPage);
