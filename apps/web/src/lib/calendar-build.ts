// Build-time only: runs the time-core Wasm engine inside Node so calendar pages are plain HTML.
// All date maths stays in Rust; this file only arranges the results.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSync, monthGrid, toHijri } from 'time-wasm';
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

let ready = false;
function init(): void {
  if (ready) return;
  const candidates = ['../../packages/time-wasm-pkg', 'packages/time-wasm-pkg'].map((p) => resolve(process.cwd(), p, 'time_wasm_bg.wasm'));
  const file = candidates.find(existsSync);
  if (!file) throw new Error('time_wasm_bg.wasm not found: run `pnpm wasm` first');
  initSync({ module: readFileSync(file) });
  ready = true;
}

export function yearView(year: number): MonthView[] {
  init();
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
