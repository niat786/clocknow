// <print-world> — a printable 24-hour world-clock table for up to 8 places on one date.
// Uses the meeting planner's link format (?c=karachi,london,Asia/Tokyo&d=2026-11-06).
import { engine } from '../engine/engine';
import { dayKey, formatCivil, parseCivil } from './convert-params';
import { errorText, localZone, setQuery, today } from './cv-common';
import { isZoneToken, parsePlannerParams } from './planner-params';
import { formatHM } from '../lib/astro-format';
import { formatOffset } from '../lib/city-facts';
import type { CivilDate } from '../engine/types';

const MAX = 8;
interface Place { token: string; label: string; zone: string }

class PrintWorld extends HTMLElement {
  #places: Place[] = [];
  #bySlug = new Map<string, Place>();
  #byLabel = new Map<string, Place>();
  #date: CivilDate | null = null;
  #run = 0;

  connectedCallback(): void {
    this.innerHTML =
      '<form class="pw-form no-print" novalidate>' +
      '<label>Add a city or time zone<input name="add" list="pw-places" autocomplete="off" placeholder="Tokyo, Japan" /></label>' +
      '<button type="button" data-add>Add</button>' +
      '<label>Date<input name="d" type="date" /></label>' +
      '<datalist id="pw-places"></datalist><ul class="pl-people" data-people></ul>' +
      '<p class="tm-status" data-error role="alert"></p></form>';
    this.querySelector('[data-add]')?.addEventListener('click', () => this.#add());
    this.querySelector('[name=add]')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); this.#add(); }
    });
    this.querySelector('[name=d]')?.addEventListener('change', (e) => {
      const d = parseCivil((e.target as HTMLInputElement).value);
      if (d) { this.#date = d; void this.#render(); }
    });
    this.querySelector('[data-people]')?.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
      if (!b) return;
      this.#places.splice(Number(b.dataset.remove), 1);
      void this.#render();
    });
    void this.#load();
  }

  #error(m: string): void {
    (this.querySelector('[data-error]') as HTMLElement).textContent = m;
  }

  #resolve(t: string): Place | null {
    const s = t.trim();
    const hit = this.#bySlug.get(s) ?? this.#byLabel.get(s.toLowerCase());
    if (hit) return hit;
    return isZoneToken(s) && /^[A-Za-z0-9_+\-/]{1,64}$/.test(s) ? { token: s, label: s.replace(/_/g, ' '), zone: s } : null;
  }

  async #load(): Promise<void> {
    try {
      const rows = (await (await fetch('/data/city-index.json')).json()) as Array<[string, string, string]>;
      const list = this.querySelector('datalist') as HTMLDataListElement;
      for (const [slug, label, zone] of rows) {
        const p = { token: slug, label, zone };
        this.#bySlug.set(slug, p);
        this.#byLabel.set(label.toLowerCase(), p);
        list.append(new Option(label));
      }
    } catch {
      this.#error('City search could not load; you can still type time zones such as Asia/Karachi.');
    }
    const q = parsePlannerParams(location.search);
    const tokens = q.tokens.length ? q.tokens : [localZone(), 'london', 'new-york', 'tokyo'];
    for (const t of tokens.slice(0, MAX)) {
      const p = this.#resolve(t);
      if (p && !this.#places.some((x) => x.token === p.token)) this.#places.push(p);
    }
    this.#date = (q.date && parseCivil(q.date)) || (await today(this.#places[0]?.zone ?? localZone()));
    (this.querySelector('[name=d]') as HTMLInputElement).value = formatCivil(this.#date);
    await this.#render();
  }

  #add(): void {
    const input = this.querySelector('[name=add]') as HTMLInputElement;
    const p = this.#resolve(input.value);
    if (!p) return this.#error('Choose a city from the list, or type a time zone such as Asia/Karachi.');
    if (this.#places.length >= MAX) return this.#error(`A sheet fits up to ${MAX} places.`);
    if (!this.#places.some((x) => x.token === p.token)) this.#places.push(p);
    input.value = '';
    void this.#render();
  }

  async #render(): Promise<void> {
    const run = ++this.#run;
    const d = this.#date;
    const people = this.querySelector('[data-people]') as HTMLElement;
    people.replaceChildren(...this.#places.map((p, i) => {
      const li = document.createElement('li');
      const s = document.createElement('span');
      s.textContent = p.label;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.remove = String(i);
      b.setAttribute('aria-label', `Remove ${p.label}`);
      b.textContent = '×';
      li.append(s, b);
      return li;
    }));
    const out = document.querySelector<HTMLElement>('[data-world-out]');
    const sub = document.querySelector<HTMLElement>('[data-world-sub]');
    if (!out || !d || !this.#places.length) return;
    this.#error('');
    try {
      const first = this.#places[0];
      const instants: number[] = [];
      for (let h = 0; h < 24; h++) instants.push(await engine.wallToUnixMs(d.year, d.month, d.day, h, 0, 0, first.zone));
      const table = document.createElement('table');
      table.className = 'wc';
      const head = table.createTHead().insertRow();
      for (const p of this.#places) {
        const z = await engine.zoneTime(instants[12], p.zone);
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = p.label;
        const small = document.createElement('small');
        small.textContent = `${formatOffset(z.offset_seconds)}${/^[A-Z]{2,5}$/.test(z.abbreviation) ? ` ${z.abbreviation}` : ''}`;
        th.append(small);
        head.append(th);
      }
      const body = table.createTBody();
      for (const t of instants) {
        const tr = body.insertRow();
        for (const [i, p] of this.#places.entries()) {
          const z = await engine.zoneTime(t, p.zone);
          const cell = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) (cell as HTMLTableCellElement).scope = 'row';
          cell.textContent = formatHM(z);
          const k = dayKey(z) - dayKey(d);
          if (k !== 0) {
            const mark = document.createElement('small');
            mark.textContent = k > 0 ? '+1 day' : '−1 day';
            cell.append(mark);
          }
          if (i > 0 && z.hour >= 9 && z.hour < 17) cell.className = 'wc-work';
          tr.append(cell);
        }
      }
      if (run !== this.#run) return;
      out.replaceChildren(table);
      if (sub) sub.textContent = `${formatCivil(d)} · hours of ${first.label} down the left · bold = 09:00–17:00 local`;
      setQuery({ c: this.#places.map((p) => p.token).join(','), d: formatCivil(d), ...Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => k === 'paper')) });
    } catch (e) {
      this.#error(errorText(e));
    }
  }
}

if (!customElements.get('print-world')) customElements.define('print-world', PrintWorld);
