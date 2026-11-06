// Shapes returned by time-wasm. Keep in sync with crates/time-core.

export type SyncState = 'Locked' | 'Drifting' | 'Offline';

export interface Sample {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
}

export interface Estimate {
  offset_ms: number;
  error_ms: number;
  drift_ppm: number;
  state: SyncState;
  samples_used: number;
}

export interface ZoneTime {
  zone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  weekday: number;
  offset_seconds: number;
  abbreviation: string;
  is_dst: boolean;
}

export interface Transition {
  at_unix_ms: number;
  offset_before_seconds: number;
  offset_after_seconds: number;
  abbreviation_after: string;
  is_dst_after: boolean;
}

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export type UnixUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

export interface UnixParsed {
  unix_ms: number;
  unit: UnixUnit;
}

export interface DateDiff {
  negative: boolean;
  years: number;
  months: number;
  days: number;
  total_days: number;
  total_weeks: number;
  extra_days: number;
}

/** serde-wasm-bindgen turns Rust `None` into `undefined`. */
export type Instant = number | null | undefined;

export type DayKind = 'normal' | 'polar_day' | 'polar_night';

export interface SunDay {
  kind: DayKind;
  solar_noon: number;
  noon_altitude: number;
  sunrise: Instant;
  sunset: Instant;
  day_length_s: number;
  day_length_change_s: number;
  civil_dawn: Instant;
  civil_dusk: Instant;
  nautical_dawn: Instant;
  nautical_dusk: Instant;
  astronomical_dawn: Instant;
  astronomical_dusk: Instant;
  golden_morning_end: Instant;
  golden_evening_start: Instant;
  blue_morning_end: Instant;
  blue_evening_start: Instant;
}

export interface SunPosition {
  altitude: number;
  azimuth: number;
}

export type MoonPhase = 'new_moon' | 'first_quarter' | 'full_moon' | 'last_quarter';
export type MoonPhaseName =
  | 'new_moon' | 'waxing_crescent' | 'first_quarter' | 'waxing_gibbous'
  | 'full_moon' | 'waning_gibbous' | 'last_quarter' | 'waning_crescent';

export interface MoonInfo {
  phase: MoonPhaseName;
  elongation: number;
  illumination: number;
  age_days: number;
  waxing: boolean;
  next: Array<{ phase: MoonPhase; at: number }>;
}

export interface Seasons {
  march_equinox: number;
  june_solstice: number;
  september_equinox: number;
  december_solstice: number;
}

export type PrayerMethod = 'karachi' | 'mwl' | 'isna' | 'egypt' | 'umm_al_qura';
export type AsrRule = 'standard' | 'hanafi';
export type HighLatRule = 'angle' | 'middle';

export interface PrayerTimes {
  fajr: Instant;
  sunrise: Instant;
  dhuhr: number;
  asr: Instant;
  maghrib: Instant;
  isha: Instant;
  adjusted: boolean;
}

export interface HijriDate {
  year: number;
  month: number;
  day: number;
}

export interface MonthGrid {
  year: number;
  month: number;
  days_in_month: number;
  /** Rows of seven cells; 0 marks a day outside the month. */
  weeks: number[][];
  iso_weeks: number[];
}

export type Comfort = 'night' | 'shoulder' | 'work';

export interface PlanLocal {
  hour: number;
  minute: number;
  day_offset: number;
  comfort: Comfort;
}

export interface PlanSlot {
  start_unix_ms: number;
  work: number;
  shoulder: number;
  night: number;
  people: PlanLocal[];
}

export interface PlanWindow {
  first: number;
  last: number;
  start_unix_ms: number;
  end_unix_ms: number;
  work: number;
  shoulder: number;
  night: number;
}

export interface DayPlan {
  start_unix_ms: number;
  end_unix_ms: number;
  slots: PlanSlot[];
  best: PlanWindow[];
}

export interface PlanPerson {
  zone: string;
  startMin: number;
  endMin: number;
}

export interface PlanOptions {
  stepMin: number;
  durationMin: number;
  shoulderMin: number;
}

export type EngineRequest =
  | { op: 'addSample'; sample: Sample }
  | { op: 'estimate'; nowMs: number }
  | { op: 'clearSamples' }
  | { op: 'zoneTime'; unixMs: number; zone: string }
  | { op: 'nextTransition'; unixMs: number; zone: string }
  | { op: 'wallToUnixMs'; year: number; month: number; day: number; hour: number; minute: number; second: number; zone: string }
  | { op: 'offsetDifference'; unixMs: number; a: string; b: string }
  | { op: 'parseUnix'; input: string }
  | { op: 'dateDiff'; a: CivilDate; b: CivilDate }
  | { op: 'businessDays'; a: CivilDate; b: CivilDate; weekendMask: number; holidays: CivilDate[] }
  | { op: 'addBusinessDays'; date: CivilDate; n: number; weekendMask: number; holidays: CivilDate[] }
  | { op: 'planDay'; date: CivilDate; anchor: string; people: PlanPerson[]; opts: PlanOptions }
  | { op: 'toHijri'; date: CivilDate }
  | { op: 'sunDay'; date: CivilDate; lat: number; lon: number; zone: string }
  | { op: 'sunPosition'; unixMs: number; lat: number; lon: number }
  | { op: 'moonInfo'; unixMs: number }
  | { op: 'seasons'; year: number }
  | { op: 'prayerTimes'; date: CivilDate; lat: number; lon: number; zone: string; method: PrayerMethod; asr: AsrRule; high: HighLatRule }
  | { op: 'isoWeek'; date: CivilDate }
  | { op: 'tzdataVersion' };

export interface EngineResults {
  addSample: boolean;
  estimate: Estimate;
  clearSamples: null;
  zoneTime: ZoneTime;
  nextTransition: Transition | null;
  wallToUnixMs: number;
  offsetDifference: number;
  parseUnix: UnixParsed;
  dateDiff: DateDiff;
  businessDays: number;
  addBusinessDays: CivilDate;
  planDay: DayPlan;
  toHijri: HijriDate;
  sunDay: SunDay;
  sunPosition: SunPosition;
  moonInfo: MoonInfo;
  seasons: Seasons;
  prayerTimes: PrayerTimes;
  isoWeek: { year: number; week: number };
  tzdataVersion: string | null;
}

export type EngineMessage = EngineRequest & { id: number };

export type EngineReply =
  | { id: number; ok: true; result: EngineResults[EngineRequest['op']] }
  | { id: number; ok: false; error: string };
