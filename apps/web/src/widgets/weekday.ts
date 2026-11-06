// Weekday name of a civil date, from time-core's ISO week (Monday of that week) and date difference.
import { engine } from '../engine/engine';
import type { CivilDate } from '../engine/types';

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function weekdayName(d: CivilDate): Promise<string> {
  const w = await engine.isoWeek(d);
  const span = await engine.isoWeekSpan(w.year, w.week);
  return NAMES[(await engine.dateDiff(span.start, d)).total_days] ?? '';
}
