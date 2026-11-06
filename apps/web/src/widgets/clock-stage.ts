// Enhances a .stage around <tz-clock stage>: the live zone line, date chips (ISO week, day of year,
// Hijri) and the 24h / :ss / .ms / sound toggles. Loaded after the clock has painted.
import './look-switch';
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { formatHijri } from '../lib/calendar-names';
import { offsetLabel, readPrefs, writePrefs, zoneCity, type StagePrefs } from '../lib/stage-prefs';

let audio: AudioContext | null = null;
function tick(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 1800;
    const t = audio.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  } catch {
    /* no audio: stay silent */
  }
}

const TOGGLES: Array<{ key: keyof StagePrefs; label: string; title: string }> = [
  { key: 'h12', label: '12h', title: '12-hour clock' },
  { key: 'seconds', label: 'Seconds', title: 'Show seconds' },
  { key: 'ms', label: 'Milliseconds', title: 'Show milliseconds' },
  { key: 'sound', label: 'Tick sound', title: 'Ticking sound' },
];

function setup(stage: HTMLElement): void {
  const clock = stage.querySelector('tz-clock');
  if (!clock) return;
  const zone = clock.getAttribute('zone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const place = stage.querySelector<HTMLElement>('[data-stage-place]');
  const zoneEl = stage.querySelector<HTMLElement>('[data-stage-zone]');
  const chips = stage.querySelector<HTMLElement>('[data-stage-chips]');
  const hijriEl = stage.querySelector<HTMLElement>('[data-stage-hijri]');
  const toggles = stage.querySelector<HTMLElement>('[data-stage-toggles]');
  if (place && place.dataset.auto !== undefined) place.textContent = zoneCity(zone);

  let prefs = readPrefs();
  const apply = (): void => {
    clock.toggleAttribute('hour12', prefs.h12);
    clock.toggleAttribute('no-seconds', !prefs.seconds);
    clock.toggleAttribute('ms', prefs.ms);
  };
  apply();
  if (toggles) {
    const buttons = TOGGLES.map((t) => {
      const b = toggles.querySelector<HTMLButtonElement>(`[data-key="${t.key}"]`) ?? document.createElement('button');
      b.type = 'button';
      b.className = 'stage-toggle';
      b.dataset.key = t.key;
      b.textContent = t.label;
      b.title = t.title;
      b.setAttribute('aria-label', t.title);
      b.setAttribute('aria-pressed', String(prefs[t.key]));
      b.addEventListener('click', () => {
        prefs = { ...prefs, [t.key]: !prefs[t.key] };
        if (t.key === 'sound' && prefs.sound) tick(); // created on a user gesture, so browsers allow it
        writePrefs(prefs);
        b.setAttribute('aria-pressed', String(prefs[t.key]));
        apply();
      });
      return b;
    });
    toggles.replaceChildren(...buttons);
  }
  clock.addEventListener('tzc:second', () => {
    if (prefs.sound && prefs.seconds) tick();
  });

  let day = '';
  const refresh = async (): Promise<void> => {
    const z = await engine.zoneTime(now(), zone);
    if (zoneEl) {
      zoneEl.textContent = `${/^[A-Z]{2,5}$/.test(z.abbreviation) ? `${z.abbreviation} · ` : ''}${offsetLabel(z.offset_seconds)}`;
      zoneEl.title = zone; // the exact time zone name, for anyone who wants it
    }
    const key = `${z.year}-${z.month}-${z.day}`;
    if (key === day || !chips) return;
    day = key;
    const date = { year: z.year, month: z.month, day: z.day };
    const [week, diff, hijri] = await Promise.all([
      engine.isoWeek(date),
      engine.dateDiff({ year: z.year, month: 1, day: 1 }, date),
      engine.toHijri(date).catch(() => null),
    ]);
    if (hijriEl) hijriEl.textContent = hijri ? formatHijri(hijri) : '\u00a0';
    const items = [`Week ${week.week}`, `Day ${diff.total_days + 1}`];
    chips.replaceChildren(...items.map((text) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = text;
      return c;
    }));
  };
  void refresh().catch(() => undefined);
  clock.addEventListener('tzc:second', (e) => {
    const t = (e as CustomEvent<number>).detail;
    if (Math.floor(t / 1000) % 60 === 0) void refresh().catch(() => undefined);
  });
}

for (const stage of document.querySelectorAll<HTMLElement>('.stage')) setup(stage);
