// Build-time: equinox and solstice instants from time-core for the seasons page.
import { seasons, zoneTime } from 'time-wasm';
import type { Seasons, ZoneTime } from '../engine/types';
import { formatHM } from './astro-format';
import { GREGORIAN_MONTHS } from './calendar-names';
import { initWasmNode } from './wasm-node';

export interface SeasonEvent {
  ms: number;
  /** "20 March 2026, 14:46 UTC" */
  utc: string;
}

export interface SeasonRow {
  year: number;
  events: [SeasonEvent, SeasonEvent, SeasonEvent, SeasonEvent];
}

const fmt = (ms: number): SeasonEvent => {
  const z = zoneTime(ms, 'UTC') as ZoneTime;
  return { ms, utc: `${z.day} ${GREGORIAN_MONTHS[z.month - 1]} ${z.year}, ${formatHM(z)} UTC` };
};

export function seasonRows(from: number, to: number): SeasonRow[] {
  initWasmNode();
  const rows: SeasonRow[] = [];
  for (let year = from; year <= to; year++) {
    const s = seasons(year) as Seasons;
    rows.push({ year, events: [fmt(s.march_equinox), fmt(s.june_solstice), fmt(s.september_equinox), fmt(s.december_solstice)] });
  }
  return rows;
}
