// Build-time only: ISO weeks of a year from time-core, for the week-number pages.
import { isoWeekSpan } from 'time-wasm';
import { initWasmNode } from './wasm-node';
import type { CivilDate, IsoWeekSpan } from '../engine/types';
import { GREGORIAN_MONTHS } from './calendar-names';

export function weeksOf(year: number): IsoWeekSpan[] {
  initWasmNode();
  const n = (isoWeekSpan(year, 1) as IsoWeekSpan).weeks_in_year;
  return Array.from({ length: n }, (_, i) => isoWeekSpan(year, i + 1) as IsoWeekSpan);
}

/** "2 Nov 2026" (year shown only when asked). */
export const shortDate = (d: CivilDate, withYear = true): string =>
  `${d.day} ${GREGORIAN_MONTHS[d.month - 1]?.slice(0, 3) ?? ''}${withYear ? ` ${d.year}` : ''}`;

export const isoDate = (d: CivilDate): string =>
  `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
