// Fills world-clock cards: offset from the visitor ("+4h"), zone abbreviation and a 24-hour day bar.
// Offsets come from time-core, so they are right on both sides of every daylight-saving change.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { describeShortDiff } from '../lib/world-format';

const local = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function fill(card: HTMLElement): Promise<void> {
  const zone = card.dataset.zone;
  if (!zone) return;
  const t = now();
  const [z, diff] = await Promise.all([engine.zoneTime(t, zone), engine.offsetDifference(t, local, zone)]);
  const abbr = card.querySelector<HTMLElement>('[data-wc-abbr]');
  if (abbr) abbr.textContent = /^[A-Z]{2,5}$/.test(z.abbreviation) ? z.abbreviation : '';
  const chip = card.querySelector<HTMLElement>('[data-wc-diff]');
  if (chip) chip.textContent = describeShortDiff(diff);
  card.querySelectorAll<HTMLElement>('[data-wc-bar] i').forEach((cell, h) => {
    cell.classList.toggle('now', h === z.hour);
    cell.classList.toggle('past', h < z.hour);
  });
}

export function initWorldCards(): void {
  const cards = [...document.querySelectorAll<HTMLElement>('.wcard')];
  const all = (): void => cards.forEach((c) => void fill(c).catch(() => undefined));
  all();
  let minute = -1;
  document.addEventListener('tzc:second', (e) => {
    const m = Math.floor((e as CustomEvent<number>).detail / 60000);
    if (m !== minute) {
      if (minute !== -1) all();
      minute = m;
    }
  });
}
