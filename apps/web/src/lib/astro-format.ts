// Labels and formatting for sun, moon and prayer pages. The astronomy itself is in time-core.
import type { AsrRule, MoonPhase, MoonPhaseName, PrayerMethod } from '../engine/types';

export const formatHM = (z: { hour: number; minute: number }): string =>
  `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;

/** "10 h 32 min" (rounded to the minute). */
export function formatDuration(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** "+2 min 3 s", "−45 s", "same as yesterday". */
export function formatChange(seconds: number): string {
  const s = Math.round(seconds);
  if (s === 0) return 'same as yesterday';
  const a = Math.abs(s);
  const m = Math.floor(a / 60);
  const rest = a % 60;
  const body = m ? `${m} min${rest ? ` ${rest} s` : ''}` : `${rest} s`;
  return `${s > 0 ? '+' : '−'}${body}`;
}

const POINTS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'] as const;

/** Azimuth in degrees to a 16-point compass word. */
export const compass = (azimuth: number): string => POINTS[Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16];

export const PHASE_NAME: Record<MoonPhaseName, string> = {
  new_moon: 'New moon',
  waxing_crescent: 'Waxing crescent',
  first_quarter: 'First quarter',
  waxing_gibbous: 'Waxing gibbous',
  full_moon: 'Full moon',
  waning_gibbous: 'Waning gibbous',
  last_quarter: 'Last quarter',
  waning_crescent: 'Waning crescent',
};

export const PHASE_EVENT: Record<MoonPhase, string> = {
  new_moon: 'New moon',
  first_quarter: 'First quarter',
  full_moon: 'Full moon',
  last_quarter: 'Last quarter',
};

/**
 * SVG path of the lit part of the moon as seen from the northern hemisphere (lit on the right
 * while waxing). `elongation` is 0 at new moon and 180 at full. Empty string when nothing is lit.
 */
export function moonPath(elongation: number, r: number, cx: number, cy: number): string {
  const e = ((elongation % 360) + 360) % 360;
  const k = (1 - Math.cos((e * Math.PI) / 180)) / 2;
  if (k < 0.005) return '';
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  if (k > 0.995) return `M ${top} A ${r} ${r} 0 1 1 ${bottom} A ${r} ${r} 0 1 1 ${top} Z`;
  const rx = Math.abs(Math.cos((e * Math.PI) / 180)) * r;
  const waxing = e < 180;
  const gibbous = k > 0.5;
  // Outer limb: right half while waxing, left half while waning.
  const limbSweep = waxing ? 1 : 0;
  // Terminator from bottom back to top: bulges toward the lit side for a crescent, away for gibbous.
  const termSweep = waxing === gibbous ? 1 : 0;
  return `M ${top} A ${r} ${r} 0 0 ${limbSweep} ${bottom} A ${rx.toFixed(3)} ${r} 0 0 ${termSweep} ${top} Z`;
}

export const METHOD_LABEL: Record<PrayerMethod, string> = {
  karachi: 'University of Islamic Sciences, Karachi (18°, 18°)',
  mwl: 'Muslim World League (18°, 17°)',
  isna: 'Islamic Society of North America (15°, 15°)',
  egypt: 'Egyptian General Authority of Survey (19.5°, 17.5°)',
  umm_al_qura: 'Umm al-Qura, Makkah (18.5°, Isha 90 min)',
};

const SOUTH_ASIA = new Set(['PK', 'IN', 'BD', 'AF']);
const UMM_AL_QURA = new Set(['SA', 'YE', 'KW', 'QA', 'BH']);
const HANAFI = new Set(['PK', 'IN', 'BD', 'AF', 'TR', 'UZ', 'KZ', 'TJ', 'TM', 'KG', 'AZ']);

/** A sensible starting convention for a country; visitors can change it. */
export function defaultPrayer(countryCode: string): { method: PrayerMethod; asr: AsrRule } {
  const cc = countryCode.toUpperCase();
  const method: PrayerMethod = SOUTH_ASIA.has(cc) ? 'karachi'
    : UMM_AL_QURA.has(cc) ? 'umm_al_qura'
    : cc === 'US' || cc === 'CA' ? 'isna'
    : cc === 'EG' ? 'egypt'
    : 'mwl';
  return { method, asr: HANAFI.has(cc) ? 'hanafi' : 'standard' };
}

export const isPrayerMethod = (s: string): s is PrayerMethod => Object.hasOwn(METHOD_LABEL, s);

/** When the sun is inside an altitude band (blue hour, golden hour, a twilight) on one day. */
export type Band =
  | { kind: 'twice'; morning: [number, number]; evening: [number, number] }
  | { kind: 'midday'; from: number; to: number }
  | { kind: 'overnight'; until: number; from: number }
  | { kind: 'all_day' }
  | { kind: 'none' };

type T = number | null | undefined;
const isT = (t: T): t is number => typeof t === 'number';

/**
 * Crossings of the band's lower edge `lo` and upper edge `hi` (rising lo, rising hi, setting hi,
 * setting lo) plus the sun's noon altitude decide the shape. A missing crossing means the sun
 * stays on one side of that edge all day; the noon altitude says which side.
 */
export function band(riseLo: T, riseHi: T, setHi: T, setLo: T, lo: number, hi: number, noonAltitude: number): Band {
  if (isT(riseLo) && isT(riseHi) && isT(setHi) && isT(setLo)) return { kind: 'twice', morning: [riseLo, riseHi], evening: [setHi, setLo] };
  if (noonAltitude < hi) {
    // Never gets above the band: at most one period around midday.
    if (isT(riseLo) && isT(setLo)) return { kind: 'midday', from: riseLo, to: setLo };
    return noonAltitude >= lo && !isT(riseLo) && !isT(setLo) ? { kind: 'all_day' } : { kind: 'none' };
  }
  // Gets above the band at midday; if it never drops below it at night, the band spans the night.
  if (isT(riseHi) && isT(setHi) && !isT(riseLo) && !isT(setLo)) return { kind: 'overnight', until: riseHi, from: setHi };
  return { kind: 'none' };
}
