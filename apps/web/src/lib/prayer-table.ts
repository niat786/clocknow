// Prayer-time table labels and cell text. Shared by the build (Node) and the page widget.
import type { PrayerTimes } from '../engine/types';

export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerKey = (typeof PRAYERS)[number];
export const PRAYER_LABEL: Record<PrayerKey, string> = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

/** Instants of one day in table order (null when the sun never reaches the angle). */
export const instantsOf = (p: PrayerTimes): Array<number | null> => PRAYERS.map((k) => (typeof p[k] === 'number' ? (p[k] as number) : null));

const pad = (n: number): string => String(n).padStart(2, '0');

/** "05:12", or "—" when there is no time. `nextDay` adds a marker for times after midnight. */
export const cellText = (z: { hour: number; minute: number } | null, nextDay = false): string =>
  z ? `${pad(z.hour)}:${pad(z.minute)}${nextDay ? '*' : ''}` : '—';

/** Index of the next prayer (sunrise excluded) after `nowMs`, or -1 when all have passed. */
export function nextPrayer(instants: ReadonlyArray<number | null>, nowMs: number): number {
  return instants.findIndex((t, i) => PRAYERS[i] !== 'sunrise' && t !== null && t > nowMs);
}

/** "1:05:09" or "12:30" (minutes:seconds under an hour). */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
