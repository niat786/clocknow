// <today-hijri> — today's date in your zone with its Hijri date, and marks today on a year calendar.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { formatHijri, GREGORIAN_MONTHS } from '../lib/calendar-names';
import { formatCivil } from './convert-params';

class TodayHijri extends HTMLElement {
  connectedCallback(): void {
    const run = async (): Promise<void> => {
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const t = await engine.zoneTime(now(), zone);
        const date = { year: t.year, month: t.month, day: t.day };
        document.querySelector(`[data-d="${formatCivil(date)}"]`)?.setAttribute('data-today', '');
        const h = await engine.toHijri(date);
        this.textContent = `Today: ${date.day} ${GREGORIAN_MONTHS[date.month - 1]} ${date.year} · ${formatHijri(h)}`;
      } catch {
        this.textContent = '';
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(() => void run(), { timeout: 2000 });
    else setTimeout(() => void run(), 300);
  }
}

if (!customElements.get('today-hijri')) customElements.define('today-hijri', TodayHijri);
