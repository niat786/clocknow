// <meeting-planner> — find a meeting time across up to 10 places. Ranking runs in time-core.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { buildIcs } from './ics';
import { formatCivil, parseCivil } from './convert-params';
import { errorText, localZone, setQuery, today } from './cv-common';
import {
  MAX_PEOPLE, buildPlannerQuery, formatMinutes, isZoneToken, parseMinutes, parsePlannerParams,
  type PlannerParams,
} from './planner-params';
import type { Comfort, DayPlan, PlanLocal } from '../engine/types';

interface Person {
  token: string;
  label: string;
  zone: string;
}

const COMFORT_TEXT: Record<Comfort, string> = { work: 'working hours', shoulder: 'early or late', night: 'night' };
const zoneLabel = (z: string): string => z.replace(/_/g, ' ');

class MeetingPlanner extends HTMLElement {
  #people: Person[] = [];
  #byLabel = new Map<string, Person>();
  #bySlug = new Map<string, Person>();
  #plan: DayPlan | null = null;
  #selected = 0;
  #params: PlannerParams = parsePlannerParams('');
  #run = 0;

  connectedCallback(): void {
    this.#params = parsePlannerParams(location.search);
    this.innerHTML =
      '<form class="pl-form" novalidate>' +
      '<div class="pl-add"><label>Add a city or time zone<input name="add" list="pl-places" autocomplete="off" placeholder="Karachi, Pakistan" /></label>' +
      '<button type="button" data-add>Add</button></div>' +
      '<datalist id="pl-places"></datalist>' +
      '<ul class="pl-people" data-people></ul>' +
      '<div class="pl-opts">' +
      '<label>Date<input name="d" type="date" required /></label>' +
      '<label>Length<select name="m"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option></select></label>' +
      '<label>Work starts<input name="ws" type="time" required /></label>' +
      '<label>Work ends<input name="we" type="time" required /></label>' +
      '</div>' +
      '<p class="tm-status" data-error role="alert"></p></form>' +
      '<section class="pl-result" data-result hidden aria-live="polite">' +
      '<h2>Best times</h2><ul class="pl-best" data-best></ul>' +
      '<h2>Pick a start time</h2>' +
      '<label class="pl-slider">Start time<input type="range" name="slot" min="0" max="0" value="0" /></label>' +
      '<div class="pl-pick" data-pick></div>' +
      '<div class="pl-actions"><label>Event title<input name="title" maxlength="80" value="Meeting" autocomplete="off" /></label>' +
      '<button type="button" data-ics class="cv-primary">Download .ics</button><button type="button" data-copy>Copy link</button><a class="pl-print" data-print href="/print/world-clock">Printable table</a></div>' +
      '<div class="pl-grid" data-grid aria-hidden="true"></div>' +
      '<p class="pl-legend"><span data-c="work">Working hours</span><span data-c="shoulder">Early or late</span><span data-c="night">Night</span></p>' +
      '</section>';

    const form = this.#form();
    const set = (name: string, v: string): void => {
      (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value = v;
    };
    set('m', String(this.#params.duration));
    set('ws', formatMinutes(this.#params.start));
    set('we', formatMinutes(this.#params.end));
    if (this.#params.date) set('d', this.#params.date);
    else void today(localZone()).then((d) => { set('d', formatCivil(d)); void this.#refresh(); });

    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', (e) => {
      if ((e.target as HTMLElement).getAttribute('name') !== 'add') void this.#refresh(true);
    });
    this.querySelector('[data-add]')?.addEventListener('click', () => this.#addFromInput());
    form.querySelector('[name=add]')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.#addFromInput();
    });
    form.querySelector('[data-people]')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
      if (!btn) return;
      this.#people.splice(Number(btn.dataset.remove), 1);
      this.#renderPeople();
      void this.#refresh(true);
    });
    this.querySelector<HTMLInputElement>('[name=slot]')?.addEventListener('input', (e) => {
      this.#select(Number((e.target as HTMLInputElement).value));
    });
    this.querySelector('[data-grid]')?.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (cell) this.#select(Number(cell.dataset.i));
    });
    this.querySelector('[data-best]')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-first]');
      if (btn) this.#select(Number(btn.dataset.first));
    });
    this.querySelector('[data-ics]')?.addEventListener('click', () => void this.#download());
    this.querySelector('[data-copy]')?.addEventListener('click', (e) => void this.#copy(e.currentTarget as HTMLButtonElement));

    void this.#load();
  }

  #form(): HTMLFormElement {
    return this.querySelector('form') as HTMLFormElement;
  }

  #error(msg: string): void {
    (this.querySelector('[data-error]') as HTMLElement).textContent = msg;
  }

  async #load(): Promise<void> {
    try {
      const res = await fetch('/data/city-index.json');
      const rows = (await res.json()) as Array<[string, string, string]>;
      const list = this.querySelector('#pl-places') as HTMLDataListElement;
      const frag = document.createDocumentFragment();
      for (const [slug, label, zone] of rows) {
        const p: Person = { token: slug, label, zone };
        this.#bySlug.set(slug, p);
        this.#byLabel.set(label.toLowerCase(), p);
        frag.append(new Option(label));
      }
      list.append(frag);
    } catch {
      this.#error('City search could not load. You can still type a time zone such as Asia/Karachi.');
    }
    const tokens = this.#params.tokens.length ? this.#params.tokens : [localZone(), 'America/New_York', 'Europe/London'];
    for (const t of tokens) {
      const p = this.#resolve(t);
      if (p && !this.#people.some((x) => x.token === p.token)) this.#people.push(p);
    }
    this.#renderPeople();
    await this.#refresh();
  }

  #resolve(text: string): Person | null {
    const t = text.trim();
    if (!t) return null;
    const city = this.#bySlug.get(t) ?? this.#byLabel.get(t.toLowerCase());
    if (city) return city;
    if (isZoneToken(t) && /^[A-Za-z0-9_+\-/]{1,64}$/.test(t)) return { token: t, label: zoneLabel(t), zone: t };
    return null;
  }

  #addFromInput(): void {
    const input = this.#form().elements.namedItem('add') as HTMLInputElement;
    const p = this.#resolve(input.value);
    if (!p) {
      this.#error('Choose a city from the list, or type a time zone such as Asia/Karachi.');
      return;
    }
    if (this.#people.length >= MAX_PEOPLE) {
      this.#error(`You can compare up to ${MAX_PEOPLE} places.`);
      return;
    }
    if (!this.#people.some((x) => x.token === p.token)) this.#people.push(p);
    input.value = '';
    this.#renderPeople();
    void this.#refresh(true);
  }

  #renderPeople(): void {
    const ul = this.querySelector('[data-people]') as HTMLElement;
    ul.replaceChildren();
    this.#people.forEach((p, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = i === 0 ? `${p.label} (date is read here)` : p.label;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.remove = String(i);
      btn.setAttribute('aria-label', `Remove ${p.label}`);
      btn.textContent = '×';
      li.append(name, btn);
      ul.append(li);
    });
  }

  async #refresh(keepSelection = false): Promise<void> {
    const form = this.#form();
    const get = (n: string): string => (form.elements.namedItem(n) as HTMLInputElement).value;
    const date = parseCivil(get('d'));
    const start = parseMinutes(get('ws'));
    const end = parseMinutes(get('we'));
    const result = this.querySelector('[data-result]') as HTMLElement;
    this.#error('');
    if (!this.#people.length || !date || start === null || end === null) {
      result.hidden = true;
      return;
    }
    const run = ++this.#run;
    const params: PlannerParams = {
      tokens: this.#people.map((p) => p.token),
      date: formatCivil(date),
      duration: Number(get('m')),
      start,
      end,
    };
    try {
      const plan = await engine.planDay(
        date,
        this.#people[0].zone,
        this.#people.map((p) => ({ zone: p.zone, startMin: start, endMin: end })),
        { stepMin: 30, durationMin: params.duration, shoulderMin: 120 },
      );
      if (run !== this.#run) return;
      this.#plan = plan;
      this.#params = params;
      this.#selected = keepSelection && this.#selected < plan.slots.length ? this.#selected : (plan.best[0]?.first ?? 0);
      const slider = this.querySelector('[name=slot]') as HTMLInputElement;
      slider.max = String(plan.slots.length - 1);
      result.hidden = false;
      this.#renderBest();
      this.#renderGrid();
      this.#select(this.#selected);
      setQuery(Object.fromEntries(new URLSearchParams(buildPlannerQuery(params))));
      (this.querySelector('[data-print]') as HTMLAnchorElement | null)?.setAttribute('href', `/print/world-clock?${new URLSearchParams({ c: params.tokens.join(','), d: params.date ?? '' })}`);
    } catch (e) {
      if (run !== this.#run) return;
      result.hidden = true;
      this.#error(errorText(e));
    }
  }

  #fmt(l: PlanLocal): string {
    const day = l.day_offset > 0 ? ' (next day)' : l.day_offset < 0 ? ' (previous day)' : '';
    return `${formatMinutes(l.hour * 60 + l.minute)}${day}`;
  }

  #renderBest(): void {
    const plan = this.#plan;
    const ul = this.querySelector('[data-best]') as HTMLElement;
    ul.replaceChildren();
    if (!plan) return;
    for (const w of plan.best) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.first = String(w.first);
      const head = document.createElement('strong');
      const who = (idx: number): string => this.#people.map((p, i) => `${p.label}: ${this.#fmt(plan.slots[idx].people[i])}`).join(' · ');
      head.textContent = w.first === w.last ? `Start at ${formatMinutes(plan.slots[w.first].people[0].hour * 60 + plan.slots[w.first].people[0].minute)} (${this.#people[0].label})` : `Start between ${this.#fmt(plan.slots[w.first].people[0])} and ${this.#fmt(plan.slots[w.last].people[0])} (${this.#people[0].label})`;
      const sub = document.createElement('span');
      const total = this.#people.length;
      sub.textContent = `${w.work} of ${total} in working hours${w.night ? `, ${w.night} at night` : ''} · ${who(w.first)}`;
      btn.append(head, sub);
      li.append(btn);
      ul.append(li);
    }
  }

  #renderGrid(): void {
    const plan = this.#plan;
    const grid = this.querySelector('[data-grid]') as HTMLElement;
    grid.replaceChildren();
    if (!plan) return;
    grid.style.setProperty('--n', String(plan.slots.length));
    this.#people.forEach((p, row) => {
      const r = document.createElement('div');
      r.className = 'pl-row';
      const label = document.createElement('span');
      label.className = 'pl-label';
      label.textContent = p.label;
      r.append(label);
      plan.slots.forEach((s, i) => {
        const cell = document.createElement('i');
        cell.dataset.i = String(i);
        cell.dataset.c = s.people[row].comfort;
        r.append(cell);
      });
      grid.append(r);
    });
    this.#markSelected();
  }

  #markSelected(): void {
    for (const el of this.querySelectorAll<HTMLElement>('[data-grid] [data-i]')) {
      el.toggleAttribute('data-sel', Number(el.dataset.i) === this.#selected);
    }
  }

  #select(i: number): void {
    const plan = this.#plan;
    if (!plan || i < 0 || i >= plan.slots.length) return;
    this.#selected = i;
    (this.querySelector('[name=slot]') as HTMLInputElement).value = String(i);
    const slot = plan.slots[i];
    const pick = this.querySelector('[data-pick]') as HTMLElement;
    pick.replaceChildren();
    const dl = document.createElement('dl');
    dl.className = 'cv-out';
    this.#people.forEach((p, k) => {
      const dt = document.createElement('dt');
      dt.textContent = p.label;
      const dd = document.createElement('dd');
      const l = slot.people[k];
      dd.textContent = `${this.#fmt(l)} · ${COMFORT_TEXT[l.comfort]}`;
      dd.dataset.c = l.comfort;
      dl.append(dt, dd);
    });
    pick.append(dl);
    this.#markSelected();
  }

  async #download(): Promise<void> {
    const plan = this.#plan;
    if (!plan) return;
    try {
      const startMs = plan.slots[this.#selected].start_unix_ms;
      const endMs = startMs + this.#params.duration * 60_000;
      const [start, end, stamp] = await Promise.all([
        engine.zoneTime(startMs, 'UTC'),
        engine.zoneTime(endMs, 'UTC'),
        engine.zoneTime(now(), 'UTC'),
      ]);
      const title = ((this.querySelector('[name=title]') as HTMLInputElement).value.trim() || 'Meeting').slice(0, 80);
      const text = buildIcs({
        title,
        description: `Planned at clocknow.net/meeting-planner for: ${this.#people.map((p) => p.label).join(', ')}`,
        uid: `${startMs}-${crypto.randomUUID()}@clocknow.net`,
        start,
        end,
        stamp,
      });
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meeting.ics';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      this.#error(errorText(e));
    }
  }

  async #copy(btn: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 1500);
  }
}

if (!customElements.get('meeting-planner')) customElements.define('meeting-planner', MeetingPlanner);
