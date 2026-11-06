// Build-time access to apps/web/src/data/holidays.json (made by scripts/holidays-gen.py).
import raw from '../data/holidays.json';
import type { HolidayData } from './holiday-format';

export * from './holiday-format';
export const HOLIDAYS = raw as unknown as HolidayData;

export const holidayYears = (): number[] =>
  Array.from({ length: HOLIDAYS.last_year - HOLIDAYS.first_year + 1 }, (_, i) => HOLIDAYS.first_year + i);
