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

export function yearView(year: number): MonthView[] {
  initWasmNode();
  return GREGORIAN_MONTHS.map((name, i) => {
    const month = i + 1;
    const grid = monthGrid(year, month, false) as MonthGrid;
    const rows: Row[] = grid.weeks.map((w, r) => ({
      iso: grid.iso_weeks[r] ?? 0,
      cells: w.map((day) => (day === 0 ? null : { day, hijri: toHijri(year, month, day) as HijriDate })),
    }));
    const days = rows.flatMap((r) => r.cells).filter((c): c is Cell => c !== null);
    return { month, name, rows, span: hijriSpan(days[0].hijri, days[days.length - 1].hijri) };
  });
}
