// <cv-zones> — convert a wall-clock time from one zone to another (DST-aware, via time-core).
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { dayKey, formatCivil, formatZoneTime, parseCivil, parseTime } from './convert-params';
import { field, input, localZone, onSubmit, setQuery, showRows, today, zoneDatalist } from './cv-common';
import { formatAmount, formatOffset } from '../lib/city-facts';

class CvZones extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML =
      '<form class="cv-form" novalidate>' +
      '<label>Date<input name="d" type="date" required /></label>' +
      '<label>Time<input name="t" type="time" value="09:00" required /></label>' +
      '<label>From time zone<input name="from" list="cv-zones-list" autocomplete="off" required /></label>' +
      '<label>To time zone<input name="to" list="cv-zones-list" autocomplete="off" required /></label>' +
      zoneDatalist('cv-zones-list') +
      '<div class="cv-actions"><button type="button" data-swap>Swap</button><button type="button" data-now>Now</button><button type="submit" data-act="go" class="cv-primary">Convert</button></div>' +
      '<p class="tm-status" data-error role="alert"></p><p class="cv-result" data-result aria-live="polite"></p><dl class="cv-out" data-out></dl></form>';
    const form = this.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const q = new URLSearchParams(location.search);
    const local = localZone();
    input(form, 'from').value = (q.get('from') ?? local).slice(0, 64);
    input(form, 'to').value = (q.get('to') ?? 'UTC').slice(0, 64);
    const qt = q.get('t');
    if (qt && parseTime(qt)) input(form, 't').value = qt;
    const qd = q.get('d');
    if (qd && parseCivil(qd)) input(form, 'd').value = qd;
    else void today(local).then((d) => (input(form, 'd').value = formatCivil(d)));

    onSubmit(form, async () => {
      const f = new FormData(form);
      const d = parseCivil(field(f, 'd'));
      const t = parseTime(field(f, 't'));
      const from = field(f, 'from');
      const to = field(f, 'to');
      if (!d || !t) throw new Error('Choose a date and time.');
      const ms = await engine.wallToUnixMs(d.year, d.month, d.day, t.hour, t.minute, t.second, from);
      const a = await engine.zoneTime(ms, from);
      const b = await engine.zoneTime(ms, to);
      const diff = b.offset_seconds - a.offset_seconds;
      const shift = dayKey(b) > dayKey(a) ? 'next day' : dayKey(b) < dayKey(a) ? 'previous day' : 'same day';
      const result = form.querySelector<HTMLElement>('[data-result]') as HTMLElement;
      result.textContent = `${formatZoneTime(a).slice(11, 16)} ${a.abbreviation} in ${from} is ${formatZoneTime(b).slice(11, 16)} ${b.abbreviation} in ${to} (${shift}).`;
      const rows: Array<readonly [string, string]> = [
        [from, `${formatZoneTime(a)} ${a.abbreviation} (${formatOffset(a.offset_seconds)})`],
        [to, `${formatZoneTime(b)} ${b.abbreviation} (${formatOffset(b.offset_seconds)})`],
        ['Difference', diff === 0 ? 'Same offset' : `${to} is ${formatAmount(Math.abs(diff))} ${diff > 0 ? 'ahead of' : 'behind'} ${from}`],
        ['Unix timestamp', String(Math.floor(ms / 1000))],
      ];
      if (a.hour !== t.hour || a.minute !== t.minute || a.day !== d.day) {
        rows.push(['Note', `That time does not exist in ${from} (clocks skip forward); ${formatZoneTime(a)} was used.`]);
      }
      showRows(form.querySelector<HTMLElement>('[data-out]') as HTMLElement, rows);
      setQuery({ d: formatCivil(d), t: field(f, 't'), from, to });
    });

    form.querySelector('[data-swap]')?.addEventListener('click', () => {
      const a = input(form, 'from');
      const b = input(form, 'to');
      [a.value, b.value] = [b.value, a.value];
      form.requestSubmit();
    });
    form.querySelector('[data-now]')?.addEventListener('click', () => {
      void (async () => {
        const z = await engine.zoneTime(now(), input(form, 'from').value || local).catch(() => null);
        if (!z) return;
        input(form, 'd').value = formatCivil(z);
        input(form, 't').value = formatZoneTime(z).slice(11, 16);
        form.requestSubmit();
      })();
    });
    if (qd && qt) form.requestSubmit();
  }
}

if (!customElements.get('cv-zones')) customElements.define('cv-zones', CvZones);
