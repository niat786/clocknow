// Ranking for the search palette. Pure, so it is tested without a browser.
export interface Entry {
  title: string;
  hint: string;
  href: string;
  kind: 'page' | 'city';
}

/** Lower-case, accents removed ("Zürich" matches "zurich"). */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Pages before cities; within each, title-prefix matches before word-prefix before substring. */
export function rank(entries: readonly Entry[], query: string, limit = 8): Entry[] {
  const q = fold(query.trim());
  if (!q) return entries.filter((e) => e.kind === 'page').slice(0, limit);
  const scored: Array<[number, number, Entry]> = [];
  entries.forEach((e, i) => {
    const t = fold(e.title);
    let s = -1;
    if (t.startsWith(q)) s = 0;
    else if (t.split(/[\s,()/-]+/).some((w) => w.startsWith(q))) s = 1;
    else if (t.includes(q)) s = 2;
    else if (fold(e.hint).includes(q)) s = 3;
    if (s >= 0) scored.push([s + (e.kind === 'city' ? 0.5 : 0), i, e]);
  });
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map((x) => x[2]);
}
