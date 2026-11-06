// Pure helpers for the real-user performance beacon. The beacon carries a route group, a device class and
// a few numbers; no URL, no query string, no identifier.
const GROUPS: Array<[RegExp, string]> = [
  [/^\/$/, '/'],
  [/^\/time\/[^/]+\/?$/, '/time/*'],
  [/^\/(timer|stopwatch|countdown|atomic|developers)\/?$/, '$1'],
];

/** Collapses a path into one of the fixed groups the collector accepts (everything else is "other"). */
export function routeGroup(pathname: string): string {
  for (const [re, out] of GROUPS) {
    const m = re.exec(pathname);
    if (m) return out === '$1' ? `/${m[1]}` : out;
  }
  return 'other';
}

export const deviceClass = (viewportWidth: number): 'phone' | 'desktop' => (viewportWidth <= 640 ? 'phone' : 'desktop');

export type Name = 'LCP' | 'INP' | 'CLS' | 'TTFB' | 'FCP';

/** Milliseconds as whole numbers; CLS (unitless) times 1000 with one decimal, matching the collector. */
export const wire = (name: Name, value: number): number => (name === 'CLS' ? Math.round(value * 10_000) / 10 : Math.round(value));

export function beaconBody(route: string, device: string, values: Partial<Record<Name, number>>): string | null {
  const m: Record<string, number> = {};
  for (const [k, v] of Object.entries(values) as Array<[Name, number]>) if (Number.isFinite(v) && v >= 0) m[k] = wire(k, v);
  return Object.keys(m).length ? JSON.stringify({ r: route, d: device, m }) : null;
}

/** People who ask not to be measured are not measured. */
export function optedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}
