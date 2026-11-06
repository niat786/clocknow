import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, goodShare, parseBeacon, percentile, ROUTES } from './rum.ts';

test('values land in the bucket whose lower edge they reach', () => {
  assert.equal(bucketOf('LCP', 0), 0);
  assert.equal(bucketOf('LCP', 49), 0);
  assert.equal(bucketOf('LCP', 50), 1);
  assert.equal(bucketOf('LCP', 2499), 14);
  assert.equal(bucketOf('LCP', 2500), 15);
  assert.equal(bucketOf('LCP', 99_999), 22); // open-ended top bucket
  assert.equal(bucketOf('CLS', 0), 0);
  assert.equal(bucketOf('CLS', 100), 9);
});

test('a beacon becomes one sample per valid metric', () => {
  const s = parseBeacon('{"r":"/time/*","d":"phone","m":{"LCP":812,"CLS":3,"INP":-5,"TTFB":"x","FCP":99999999}}');
  assert.deepEqual(s.map((x) => x.metric), ['LCP', 'CLS']);
  assert.equal(s[0].route, '/time/*');
  assert.equal(s[0].device, 'phone');
});

test('unknown routes collapse to "other" and bad shapes are dropped', () => {
  assert.equal(parseBeacon('{"r":"/secret/page?id=7","d":"desktop","m":{"LCP":100}}')[0].route, 'other');
  assert.deepEqual(parseBeacon('not json'), []);
  assert.deepEqual(parseBeacon('{"r":"/","d":"tablet","m":{"LCP":1}}'), []);
  assert.deepEqual(parseBeacon('{"r":"/","d":"phone"}'), []);
  assert.deepEqual(parseBeacon('null'), []);
  assert.ok(ROUTES.includes('other'));
});

test('p75 is interpolated within its bucket and hidden below the sample floor', () => {
  // 100 samples: 50 in [0,50), 50 in [100,150) -> rank 75 sits halfway through the second bucket
  const p = percentile('LCP', [{ bucket: 0, n: 50 }, { bucket: 2, n: 50 }]);
  assert.equal(p?.n, 100);
  assert.equal(p?.value, 125);
  assert.equal(percentile('LCP', [{ bucket: 0, n: 29 }]), null);
});

test('good share counts only buckets wholly under the threshold', () => {
  // LCP good <= 2500: bucket 14 is [2100,2500) (good), bucket 15 starts at 2500 (not good)
  assert.equal(goodShare('LCP', [{ bucket: 14, n: 3 }, { bucket: 15, n: 1 }]), 0.75);
  assert.equal(goodShare('LCP', []), 0);
});
