// Build-time only: runs the time-core Wasm engine inside Node so calendar pages are plain HTML.
// All date maths stays in Rust; this file only arranges the results.
import { monthGrid, toHijri } from 'time-wasm';
import { initWasmNode } from './wasm-node';
import type { HijriDate, MonthGrid } from '../engine/types';
import { GREGORIAN_MONTHS, hijriSpan } from './calendar-names';

export interface Cell {
  day: number;
  hijri: HijriDate;
}

export interface Row {
  iso: number;
  cells: Array<Cell | null>;
}

export interface MonthView {
  month: number;
  name: string;
  rows: Row[];
  span: string;
}

/** One month laid out by time-core; `sundayFirst` starts rows on Sunday instead of Monday. */
export function monthView(year: number, month: number, sundayFirst = false): MonthView {
  initWasmNode();
  const grid = monthGrid(year, month, sundayFirst) as MonthGrid;
  const rows: Row[] = grid.weeks.map((w, r) => ({
    iso: grid.iso_weeks[r] ?? 0,
    cells: w.map((day) => (day === 0 ? null : { day, hijri: toHijri(year, month, day) as HijriDate })),
  }));
  const days = rows.flatMap((r) => r.cells).filter((c): c is Cell => c !== null);
  return { month, name: GREGORIAN_MONTHS[month - 1], rows, span: hijriSpan(days[0].hijri, days[days.length - 1].hijri) };
}

export function yearView(year: number, sundayFirst = false): MonthView[] {
  return GREGORIAN_MONTHS.map((_, i) => monthView(year, i + 1, sundayFirst));
}
