import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRPORTS, airportZone } from './airports.ts';

test('looks up codes in any case', () => {
  assert.equal(airportZone('lhr'), 'Europe/London');
  assert.equal(airportZone(' NRT '), 'Asia/Tokyo');
  assert.equal(airportZone('jfk'), 'America/New_York');
  assert.equal(airportZone('xyz'), null);
  assert.equal(airportZone('london'), null);
  assert.equal(airportZone('constructor'), null);
});

test('every zone is a real IANA zone', () => {
  for (const [code, zone] of Object.entries(AIRPORTS)) {
    assert.match(code, /^[A-Z]{3}$/);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: zone }), `${code} → ${zone}`);
  }
  assert.ok(Object.keys(AIRPORTS).length >= 150);
});
