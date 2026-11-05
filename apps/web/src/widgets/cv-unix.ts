// <cv-unix> — Unix timestamp <-> date. Unit detection and parsing run in time-core.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { formatCivil, formatIsoUtc, formatZoneTime, parseCivil, parseTime } from './convert-params';
import { field, input, localZone, onSubmit, setQuery, showRows, today, zoneDatalist } from './cv-common';
import { formatOffset } from '../lib/city-facts';

class CvUnix extends HTMLElement {
  connectedCallback(): void {
    const zone = localZone();
    this.innerHTML =
      '<form class="cv-form" data-ts novalidate><h2>Timestamp to date</h2>' +
      '<label>Unix timestamp<input name="ts" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="1700000000" /></label>' +
      '<div class="cv-actions"><button type="button" data-now>Use current time</button><button type="submit" data-act="go" class="cv-primary">Convert</button></div>' +
      '<p class="tm-status" data-error role="alert"></p><dl class="cv-out" data-out aria-live="polite"></dl></form>' +
      '<form class="cv-form" data-date novalidate><h2>Date to timestamp</h2>' +
      '<label>Date<input name="date" type="date" required /></label>' +
      '<label>Time<input name="time" type="time" step="1" value="00:00:00" required /></label>' +
      '<label>Time zone<input name="zone" list="cv-unix-zones" autocomplete="off" required /></label>' +
      zoneDatalist('cv-unix-zones') +
      '<div class="cv-actions"><button type="submit" data-act="go" class="cv-primary">Convert</button></div>' +
      '<p class="tm-status" data-error role="alert"></p><dl class="cv-out" data-out aria-live="polite"></dl></form>';

    const tsForm = this.querySelector<HTMLFormElement>('form[data-ts]');
    const dateForm = this.querySelector<HTMLFormElement>('form[data-date]');
    if (!tsForm || !dateForm) return;
    input(dateForm, 'zone').value = zone;
    void today(zone).then((d) => (input(dateForm, 'date').value = formatCivil(d)));

    const fromTs = async (): Promise<void> => {
      const raw = field(new FormData(tsForm), 'ts');
      const p = await engine.parseUnix(raw);
      const utc = await engine.zoneTime(p.unix_ms, 'UTC');
      const loc = await engine.zoneTime(p.unix_ms, zone);
      showRows(tsForm.querySelector<HTMLElement>('[data-out]') as HTMLElement, [
        ['Detected unit', p.unit],
        ['Seconds', String(Math.floor(p.unix_ms / 1000))],
        ['Milliseconds', String(p.unix_ms)],
        ['UTC (ISO 8601)', formatIsoUtc(utc)],
        [`Your time zone (${zone})`, `${formatZoneTime(loc)} ${loc.abbreviation} (${formatOffset(loc.offset_seconds)})`],
      ]);
      setQuery({ ts: raw });
    };
    onSubmit(tsForm, fromTs);
    tsForm.querySelector('[data-now]')?.addEventListener('click', () => {
      input(tsForm, 'ts').value = String(Math.floor(now() / 1000));
      tsForm.requestSubmit();
    });

    onSubmit(dateForm, async () => {
      const f = new FormData(dateForm);
      const d = parseCivil(field(f, 'date'));
      const t = parseTime(field(f, 'time'));
      const z = field(f, 'zone');
      if (!d || !t) throw new Error('Choose a date and time.');
      const ms = await engine.wallToUnixMs(d.year, d.month, d.day, t.hour, t.minute, t.second, z);
      const utc = await engine.zoneTime(ms, 'UTC');
      const back = await engine.zoneTime(ms, z);
      const rows: Array<readonly [string, string]> = [
        ['Seconds', String(Math.floor(ms / 1000))],
        ['Milliseconds', String(ms)],
        ['UTC (ISO 8601)', formatIsoUtc(utc)],
      ];
      if (back.hour !== t.hour || back.minute !== t.minute || back.day !== d.day) {
        rows.push(['Note', `That time does not exist in ${z} (clocks skip forward); ${formatZoneTime(back)} was used.`]);
      }
      showRows(dateForm.querySelector<HTMLElement>('[data-out]') as HTMLElement, rows);
    });

    const initial = new URLSearchParams(location.search).get('ts');
    if (initial) {
      input(tsForm, 'ts').value = initial.slice(0, 24);
      tsForm.requestSubmit();
    }
  }
}

if (!customElements.get('cv-unix')) customElements.define('cv-unix', CvUnix);
