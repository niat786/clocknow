// Types and formatting for the public /performance page (the collector's /rum/summary answer).
export interface Cell { p75: string; n: number; good_share: number; target: string; meets_target: boolean }
export interface Summary { days: number; metrics: Record<'phone' | 'desktop', Record<string, Cell | null>> }

export function isSummary(v: unknown): v is Summary {
  if (typeof v !== 'object' || v === null) return false;
  const m = (v as { metrics?: unknown }).metrics;
  return typeof m === 'object' && m !== null && 'phone' in m && 'desktop' in m;
}

/** What a table cell says. Below the collector's sample floor there is no number: we never show a guess. */
export function cellText(c: Cell | null | undefined): { text: string; state: 'ok' | 'over' | 'none' } {
  if (!c) return { text: 'Not enough data yet', state: 'none' };
  return { text: `${c.p75} (${c.n.toLocaleString('en-US')} visits)`, state: c.meets_target ? 'ok' : 'over' };
}
