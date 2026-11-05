// <sun-day lat lon zone cc> — sunrise, sunset, golden/blue hour, twilight, sun position, moon and
// (optional) prayer times for a place and date. All astronomy runs in time-core.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { formatCivil, parseCivil } from './convert-params';
import { setQuery, today } from './cv-common';
import { compass, defaultPrayer, formatChange, formatDuration, isPrayerMethod, METHOD_LABEL, moonPath, PHASE_EVENT, PHASE_NAME } from '../lib/astro-format';
import { formatWhen, moonSvg, rangeIn, row, section, timeIn } from './astro-common';
import type { AsrRule, CivilDate } from '../engine/types';

const PRAYER_KEY = 'cn-prayer';

function loadPrayer(cc: string): { method: string; asr: AsrRule } {
  try {
    const v = JSON.parse(localStorage.getItem(PRAYER_KEY) ?? 'null') as { method?: string; asr?: string } | null;
    if (v && typeof v.method === 'string' && isPrayerMethod(v.method) && (v.asr === 'standard' || v.asr === 'hanafi')) {
      return { method: v.method, asr: v.asr };
    }
  } catch {
    /* storage unavailable */
  }
  return defaultPrayer(cc);
}

function savePrayer(v: { method: string; asr: string }): void {
  try {
    localStorage.setItem(PRAYER_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

class SunDayEl extends HTMLElement {
  #lat = 0;
  #lon = 0;
  #zone = 'UTC';
  #cc = '';
  #today: CivilDate | null = null;

  connectedCallback(): void {
    this.#lat = Number(this.getAttribute('lat'));
    this.#lon = Number(this.getAttribute('lon'));
    this.#zone = this.getAttribute('zone') ?? 'UTC';
    this.#cc = this.getAttribute('cc') ?? '';
    this.innerHTML =
      '<form class="sun-date" novalidate><label>Date<input name="d" type="date" required /></label>' +
      '<button type="button" data-today>Today</button></form>' +
      '<p class="tm-status" data-error role="alert"></p><div data-out aria-live="polite"></div>';
    const input = this.querySelector<HTMLInputElement>('[name=d]') as HTMLInputElement;
    input.addEventListener('change', () => {
      const d = parseCivil(input.value);
      if (d) void this.#render(d, true);
    });
    this.querySelector('[data-today]')?.addEventListener('click', () => {
      if (this.#today) {
        input.value = formatCivil(this.#today);
        void this.#render(this.#today, true);
      }
    });
    void (async () => {
      this.#today = await today(this.#zone);
      const q = parseCivil(new URLSearchParams(location.search).get('d') ?? '');
      const d = q ?? this.#today;
      input.value = formatCivil(d);
      await this.#render(d, false);
    })().catch((e: unknown) => this.#error(e));
  }

  #error(e: unknown): void {
    (this.querySelector('[data-error]') as HTMLElement).textContent = e instanceof Error ? e.message : String(e);
  }

  async #render(d: CivilDate, share: boolean): Promise<void> {
    const z = this.#zone;
    const out = this.querySelector('[data-out]') as HTMLElement;
    try {
      const s = await engine.sunDay(d, this.#lat, this.#lon, z);
      const parts: HTMLElement[] = [];

      const main = section('Sun');
      if (s.kind === 'polar_day') row(main.dl, 'Sunrise and sunset', 'The sun does not set (midnight sun)');
      else if (s.kind === 'polar_night') row(main.dl, 'Sunrise and sunset', 'The sun does not rise (polar night)');
      else {
        row(main.dl, 'Sunrise', await timeIn(s.sunrise, z, d));
        row(main.dl, 'Sunset', await timeIn(s.sunset, z, d));
      }
      row(main.dl, 'Day length', `${formatDuration(s.day_length_s)} (${formatChange(s.day_length_change_s)})`);
      row(main.dl, 'Solar noon', `${await timeIn(s.solar_noon, z, d)} · sun ${Math.round(s.noon_altitude)}° high`);
      const isToday = this.#today !== null && formatCivil(this.#today) === formatCivil(d);
      if (isToday) {
        const p = await engine.sunPosition(now(), this.#lat, this.#lon);
        row(main.dl, 'Sun now', p.altitude > -0.833
          ? `${Math.round(p.altitude)}° above the horizon, ${compass(p.azimuth)} (${Math.round(p.azimuth)}°)`
          : `Below the horizon (${Math.round(p.altitude)}°)`);
      }
      parts.push(main.el);

      const photo = section('Golden hour and blue hour');
      row(photo.dl, 'Morning blue hour', await rangeIn(s.civil_dawn, s.blue_morning_end, z, d));
      row(photo.dl, 'Morning golden hour', await rangeIn(s.blue_morning_end, s.golden_morning_end, z, d));
      row(photo.dl, 'Evening golden hour', await rangeIn(s.golden_evening_start, s.blue_evening_start, z, d));
      row(photo.dl, 'Evening blue hour', await rangeIn(s.blue_evening_start, s.civil_dusk, z, d));
      parts.push(photo.el);

      const tw = section('Twilight and darkness');
      row(tw.dl, 'Civil twilight', await rangeIn(s.civil_dawn, s.sunrise, z, d) + ' · ' + await rangeIn(s.sunset, s.civil_dusk, z, d));
      row(tw.dl, 'Nautical dawn and dusk', `${await timeIn(s.nautical_dawn, z, d)} · ${await timeIn(s.nautical_dusk, z, d)}`);
      row(tw.dl, 'Astronomical dawn and dusk', `${await timeIn(s.astronomical_dawn, z, d)} · ${await timeIn(s.astronomical_dusk, z, d)}`);
      row(tw.dl, 'Fully dark sky', s.astronomical_dusk == null
        ? (s.kind === 'polar_night' ? 'Dark all day except twilight' : 'It does not get fully dark')
        : `After ${await timeIn(s.astronomical_dusk, z, d)}, and before ${await timeIn(s.astronomical_dawn, z, d)}`);
      parts.push(tw.el);

      const m = await engine.moonInfo(s.solar_noon);
      const moon = section('Moon');
      const head = document.createElement('div');
      head.className = 'moon-head';
      const label = document.createElement('p');
      label.textContent = `${PHASE_NAME[m.phase]} · ${Math.round(m.illumination * 100)}% lit`;
      head.append(moonSvg(moonPath(m.elongation, 46, 50, 50), 56), label);
      moon.el.insertBefore(head, moon.dl);
      for (const ev of m.next) row(moon.dl, PHASE_EVENT[ev.phase], formatWhen(await engine.zoneTime(ev.at, z)));
      parts.push(moon.el);

      parts.push(this.#prayerSection(d));
      out.replaceChildren(...parts);
      (this.querySelector('[data-error]') as HTMLElement).textContent = '';
      if (share) setQuery({ d: formatCivil(d) });
    } catch (e) {
      this.#error(e);
    }
  }

  #prayerSection(d: CivilDate): HTMLElement {
    const details = document.createElement('details');
    details.className = 'sun-sec prayer';
    const summary = document.createElement('summary');
    summary.textContent = 'Prayer times';
    const pref = loadPrayer(this.#cc);
    const form = document.createElement('form');
    form.className = 'prayer-opts';
    form.innerHTML =
      `<label>Method<select name="method">${Object.entries(METHOD_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>` +
      '<label>Asr<select name="asr"><option value="standard">Standard (Shafiʻi, Maliki, Hanbali)</option><option value="hanafi">Hanafi</option></select></label>';
    (form.elements.namedItem('method') as HTMLSelectElement).value = pref.method;
    (form.elements.namedItem('asr') as HTMLSelectElement).value = pref.asr;
    const dl = document.createElement('dl');
    dl.className = 'cv-out';
    const note = document.createElement('p');
    note.className = 'cv-note-inline';
    note.textContent = 'Calculated from the sun’s position. Local mosques may publish times that differ by a few minutes.';
    const run = async (): Promise<void> => {
      const method = (form.elements.namedItem('method') as HTMLSelectElement).value;
      const asr = (form.elements.namedItem('asr') as HTMLSelectElement).value;
      if (!isPrayerMethod(method) || (asr !== 'standard' && asr !== 'hanafi')) return;
      savePrayer({ method, asr });
      const p = await engine.prayerTimes(d, this.#lat, this.#lon, this.#zone, method, asr, 'angle');
      dl.replaceChildren();
      const z = this.#zone;
      for (const [k, t] of [['Fajr', p.fajr], ['Sunrise', p.sunrise], ['Dhuhr', p.dhuhr], ['Asr', p.asr], ['Maghrib', p.maghrib], ['Isha', p.isha]] as const) {
        row(dl, k, await timeIn(t, z, d));
      }
      if (p.adjusted) row(dl, 'Note', 'Fajr or Isha uses the high-latitude rule, because twilight does not reach the method’s angle today.');
    };
    form.addEventListener('change', () => void run().catch((e: unknown) => this.#error(e)));
    details.addEventListener('toggle', () => {
      if (details.open && !dl.childElementCount) void run().catch((e: unknown) => this.#error(e));
    });
    details.append(summary, form, dl, note);
    return details;
  }
}

if (!customElements.get('sun-day')) customElements.define('sun-day', SunDayEl);
