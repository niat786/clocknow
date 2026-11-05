// schema.org JSON-LD builders and head helpers. Pure functions so they can be tested.
export const SITE = 'https://clocknow.net';
export const MAX_DESCRIPTION = 160;

export interface Crumb {
  name: string;
  path: string;
}

export type Ld = Record<string, unknown>;

const url = (path: string): string => new URL(path, SITE).href;

export const websiteLd = (): Ld => ({
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  url: `${SITE}/`,
  name: 'clocknow',
  description: 'The exact time, synced to a precise server clock: clocks, timers, converters, calendars and more.',
  inLanguage: 'en',
});

export const organizationLd = (): Ld => ({
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'clocknow',
  url: `${SITE}/`,
  logo: `${SITE}/favicon.svg`,
});

/** Home is added first; the last crumb is the current page. */
export function breadcrumbLd(crumbs: readonly Crumb[]): Ld {
  const all: Crumb[] = [{ name: 'Home', path: '/' }, ...crumbs];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: url(c.path) })),
  };
}

export function webAppLd(app: { name: string; description: string; path: string }): Ld {
  return {
    '@type': 'WebApplication',
    name: app.name,
    description: app.description,
    url: url(app.path),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires a modern web browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isPartOf: { '@id': `${SITE}/#website` },
  };
}

export function placeLd(p: { name: string; lat: number; lon: number; country: string; path: string }): Ld {
  return {
    '@type': 'Place',
    name: p.name,
    url: url(p.path),
    geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lon },
    address: { '@type': 'PostalAddress', addressCountry: p.country },
  };
}

/** One `@graph` document. `<` is escaped so the text can never close the surrounding script tag. */
export function serializeLd(graph: readonly Ld[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/** Collapses whitespace and trims to `max` characters at a word boundary, adding an ellipsis. */
export function fitDescription(text: string, max = MAX_DESCRIPTION): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}
