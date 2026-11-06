// <embed-builder> — configure a clock or countdown widget, preview it live and copy the iframe code.
import { engine } from '../engine/engine';
import { CLOCK_DEFAULTS, SITE, SIZES, THEMES, clockEmbedQuery, isEmbedTheme, lookQuery, snippet, type ClockEmbed } from '../lib/embed-params';
import { FACES, isFaceId } from './faces';
import { buildQuery } from './countdown-format';
import { formatCivil, parseCivil, parseTime } from './convert-params';
import { errorText, localZone, today } from './cv-common';

const THEME_LABEL: Record<string, string> = { auto: 'Match the visitor (light or dark)', light: 'Light', night: 'Night', oled: 'OLED black', contrast: 'High contrast' };

class EmbedBuilder extends HTMLElement {
  #zones = new Map<string, string>();

  connectedCallback(): void {
    this.innerHTML =
      '<form class="eb-form cv-form" novalidate>' +
      '<fieldset class="eb-type"><legend>Widget</legend><label class="pc-check"><input type="radio" name="kind" value="clock" checked /> Clock</label><label class="pc-check"><input type="radio" name="kind" value="countdown" /> Countdown</label></fieldset>' +
      '<div data-for="clock">' +
      '<label>City or time zone (empty = the visitor’s own time)<input name="place" list="eb-places" autocomplete="off" placeholder="Karachi, Pakistan" /></label>' +
      '<label>Label (optional)<input name="label" maxlength="40" autocomplete="off" /></label>' +
      `<label>Clock style<select name="face">${FACES.map((f) => `<option value="${f.id}">${f.label}</option>`).join('')}</select></label>` +
      '<label class="pc-check"><input type="checkbox" name="seconds" checked /> Show seconds</label>' +
      '<label class="pc-check"><input type="checkbox" name="h12" /> 12-hour clock</label>' +
      '</div>' +
      '<div data-for="countdown" hidden>' +
      '<label>Title<input name="title" maxlength="80" autocomplete="off" placeholder="Launch day" /></label>' +
      '<label>Date<input name="date" type="date" /></label>' +
      '<label>Time<input name="time" type="time" value="00:00" /></label>' +
      '<label>Time zone<input name="zone" list="eb-zones" autocomplete="off" /></label>' +
      '</div>' +
      `<label>Theme<select name="theme">${THEMES.map((t) => `<option value="${t}">${THEME_LABEL[t]}</option>`).join('')}</select></label>` +
      '<label class="pc-check"><input type="checkbox" name="transparent" /> Transparent background</label>' +
      `<label>Size<select name="size">${SIZES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>` +
      '<datalist id="eb-places"></datalist><datalist id="eb-zones"></datalist>' +
      '<p class="tm-status" data-error role="alert"></p>' +
      '</form>' +
      '<section class="eb-out"><h2>Preview</h2><div class="eb-frame"><iframe title="Widget preview" loading="lazy"></iframe></div>' +
      '<h2>Code</h2><textarea readonly rows="4" spellcheck="false" aria-label="Embed code"></textarea>' +
      '<div class="cv-actions"><button type="button" class="cv-primary" data-copy>Copy code</button></div></section>';
    const form = this.querySelector('form') as HTMLFormElement;
    form.addEventListener('input', () => void this.#update());
    form.addEventListener('change', () => void this.#update());
    this.querySelector('[data-copy]')?.addEventListener('click', (e) => void this.#copy(e.currentTarget as HTMLButtonElement));
    (form.elements.namedItem('zone') as HTMLInputElement).value = localZone();
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    const zl = this.querySelector('#eb-zones') as HTMLDataListElement;
    for (const z of ['UTC', ...zones]) zl.append(new Option(z));
    void today(localZone()).then((d) => {
      (form.elements.namedItem('date') as HTMLInputElement).value = formatCivil({ ...d, year: d.year + 1, month: 1, day: 1 });
      void this.#update();
    });
    void this.#loadCities();
    void this.#update();
  }

  async #loadCities(): Promise<void> {
    try {
      const rows = (await (await fetch('/data/city-index.json')).json()) as Array<[string, string, string]>;
      const list = this.querySelector('#eb-places') as HTMLDataListElement;
      for (const [, label, zone] of rows) {
        this.#zones.set(label.toLowerCase(), zone);
        list.append(new Option(label));
      }
    } catch {
      /* typing a zone name still works */
    }
  }

  async #update(): Promise<void> {
    const form = this.querySelector('form') as HTMLFormElement;
    const f = new FormData(form);
    const get = (n: string) => String(f.get(n) ?? '').trim();
    const kind = get('kind') === 'countdown' ? 'countdown' : 'clock';
    for (const el of this.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = el.dataset.for !== kind;
    const err = this.querySelector('[data-error]') as HTMLElement;
    err.textContent = '';
    const theme = isEmbedTheme(get('theme')) ? (get('theme') as ClockEmbed['theme']) : 'auto';
    const transparent = f.get('transparent') === 'on';
    const size = SIZES.find((s) => s.id === get('size')) ?? SIZES[0];
    let path: string;
    let title: string;
    try {
      if (kind === 'clock') {
        const place = get('place');
        const zone = place ? (this.#zones.get(place.toLowerCase()) ?? place) : '';
        if (zone) await engine.zoneTime(Date.now(), zone); // validates the zone name only
        const face = get('face');
        const o: ClockEmbed = { ...CLOCK_DEFAULTS, zone, label: get('label') || (place && this.#zones.has(place.toLowerCase()) ? place.split(',')[0] : ''), theme, seconds: f.get('seconds') === 'on', h12: f.get('h12') === 'on', face: isFaceId(face) ? face : 'digital', transparent };
        const q = clockEmbedQuery(o);
        path = `/embed/clock${q ? `?${q}` : ''}`;
        title = o.label ? `Time in ${o.label}` : 'Current time';
      } else {
        const d = parseCivil(get('date'));
        const t = parseTime(get('time') || '00:00');
        const zone = get('zone') || 'UTC';
        if (!d || !t) throw new Error('Choose a date and time for the countdown.');
        const ms = await engine.wallToUnixMs(d.year, d.month, d.day, t.hour, t.minute, 0, zone);
        const q = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(buildQuery({ t: Math.floor(ms / 1000), z: zone, n: get('title') }))), ...lookQuery(theme, transparent) });
        path = `/embed/countdown?${q}`;
        title = get('title') ? `Countdown: ${get('title')}` : 'Countdown';
      }
    } catch (e) {
      err.textContent = errorText(e);
      return;
    }
    const frame = this.querySelector('iframe') as HTMLIFrameElement;
    frame.width = String(size.w);
    frame.height = String(size.h);
    if (frame.getAttribute('src') !== path) frame.src = path;
    (this.querySelector('textarea') as HTMLTextAreaElement).value = snippet(SITE + path, title, size.w, size.h);
  }

  async #copy(btn: HTMLButtonElement): Promise<void> {
    const text = (this.querySelector('textarea') as HTMLTextAreaElement).value;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch {
      (this.querySelector('textarea') as HTMLTextAreaElement).select();
      btn.textContent = 'Press Ctrl+C or ⌘C to copy';
    }
    setTimeout(() => (btn.textContent = 'Copy code'), 2000);
  }
}

if (!customElements.get('embed-builder')) customElements.define('embed-builder', EmbedBuilder);
