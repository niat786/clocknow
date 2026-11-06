// Short labels for the world cards and overlap strip.
/** "+4h", "−5h", "+5:30h", "±0" from seconds that a zone is ahead of you. */
export function describeShortDiff(sec: number): string {
  if (sec === 0) return '±0';
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  return `${sec > 0 ? '+' : '−'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}h`;
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Working hours used for highlighting (local 09:00–17:00). */
export const isWorkHour = (h: number): boolean => h >= 9 && h < 17;
