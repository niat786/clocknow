// Whole-day arithmetic on YYYY-MM-DD strings (no time zones involved).
const ord = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000;
};

/** Days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: string, b: string): number => Math.round(ord(b) - ord(a));

/** Index of the first date on or after `today`, or -1. Dates must be sorted. */
export const nextIndex = (dates: readonly string[], today: string): number => dates.findIndex((d) => d >= today);
