// Display preferences for the main clock (24-hour, seconds, milliseconds, tick sound). Pure + storage-safe.
export interface StagePrefs {
  h12: boolean;
  seconds: boolean;
  ms: boolean;
  sound: boolean;
}

export const STAGE_KEY = 'clocknow-stage';
export const STAGE_DEFAULTS: StagePrefs = { h12: false, seconds: true, ms: false, sound: false };

export function readPrefs(store?: Pick<Storage, 'getItem'> | null): StagePrefs {
  try {
    const raw = (store ?? globalThis.localStorage)?.getItem(STAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Record<keyof StagePrefs, unknown>>) : {};
    const b = (k: keyof StagePrefs) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : STAGE_DEFAULTS[k]);
    return { h12: b('h12'), seconds: b('seconds'), ms: b('ms'), sound: b('sound') };
  } catch {
    return { ...STAGE_DEFAULTS };
  }
}

export function writePrefs(p: StagePrefs, store?: Pick<Storage, 'setItem'> | null): void {
  try {
    (store ?? globalThis.localStorage)?.setItem(STAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: lasts for this page view */
  }
}

/** "UTC+5", "UTC−3:30", "UTC" */
export function offsetLabel(sec: number): string {
  if (sec === 0) return 'UTC';
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  return `UTC${sec > 0 ? '+' : '−'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** "Karachi" from "Asia/Karachi", "Port of Spain" from "America/Port_of_Spain". */
export const zoneCity = (zone: string): string => (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
