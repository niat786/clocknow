// Build-time only: a month of prayer times for a city, from time-core.
import { monthGrid, prayerTimes, zoneTime } from 'time-wasm';
import { initWasmNode } from './wasm-node';
import type { MonthGrid, PrayerMethod, AsrRule, PrayerTimes, ZoneTime } from '../engine/types';
import { cellText, instantsOf } from './prayer-table';
import { WEEKDAYS_MON } from './calendar-names';

export interface PrayerRow {
  day: number;
  weekday: string;
  cells: string[];
}

export function monthRows(lat: number, lon: number, zone: string, year: number, month: number, method: PrayerMethod, asr: AsrRule): PrayerRow[] {
  initWasmNode();
  const grid = monthGrid(year, month, false) as MonthGrid;
  const rows: PrayerRow[] = [];
  for (let day = 1; day <= grid.days_in_month; day++) {
    const p = prayerTimes(year, month, day, lat, lon, zone, method, asr, 'angle') as PrayerTimes;
    let weekday = '';
    const cells = instantsOf(p).map((t) => {
      if (t === null) return cellText(null);
      const z = zoneTime(t, zone) as ZoneTime;
      weekday ||= WEEKDAYS_MON[z.weekday - 1] ?? '';
      return cellText(z, z.day !== day);
    });
    rows.push({ day, weekday, cells });
  }
  return rows;
}
