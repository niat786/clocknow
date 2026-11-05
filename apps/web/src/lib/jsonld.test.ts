import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breadcrumbLd, fitDescription, organizationLd, placeLd, serializeLd, webAppLd, websiteLd } from './jsonld.ts';

test('breadcrumbs start at Home and number from 1', () => {
  const b = breadcrumbLd([{ name: 'World time', path: '/time' }, { name: 'Karachi', path: '/time/karachi' }]) as {
    itemListElement: Array<{ position: number; name: string; item: string }>;
  };
  assert.deepEqual(b.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', 'https://clocknow.net/'],
    [2, 'World time', 'https://clocknow.net/time'],
    [3, 'Karachi', 'https://clocknow.net/time/karachi'],
  ]);
});

test('web application and place', () => {
  const app = webAppLd({ name: 'Timer', description: 'A timer', path: '/timer' });
  assert.equal(app['@type'], 'WebApplication');
  assert.equal(app.url, 'https://clocknow.net/timer');
  const place = placeLd({ name: 'Karachi, Pakistan', lat: 24.86, lon: 67.01, country: 'Pakistan', path: '/time/karachi' }) as { geo: { latitude: number } };
  assert.equal(place.geo.latitude, 24.86);
  assert.equal(websiteLd()['@type'], 'WebSite');
  assert.equal(organizationLd()['@type'], 'Organization');
});

test('serialised graph is valid JSON and cannot close the script tag', () => {
  const text = serializeLd([websiteLd(), { '@type': 'Thing', name: '</script><script>alert(1)</script>' }]);
  assert.ok(!text.includes('</script'));
  assert.ok(!text.includes('<'));
  const parsed = JSON.parse(text) as { '@context': string; '@graph': Array<{ name: string }> };
  assert.equal(parsed['@context'], 'https://schema.org');
  assert.equal(parsed['@graph'][1].name, '</script><script>alert(1)</script>');
});

test('fitDescription trims long text at a word boundary', () => {
  assert.equal(fitDescription('  short   text  '), 'short text');
  const long = 'word '.repeat(60);
  const out = fitDescription(long);
  assert.ok(out.length <= 160);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('wor…'));
  assert.equal(fitDescription('x'.repeat(200)).length, 160);
});
