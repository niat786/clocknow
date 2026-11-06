import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaconBody, deviceClass, optedOut, routeGroup, wire } from './vitals-payload.ts';

test('paths collapse to the fixed groups', () => {
  assert.equal(routeGroup('/'), '/');
  assert.equal(routeGroup('/time/karachi'), '/time/*');
  assert.equal(routeGroup('/time/karachi/'), '/time/*');
  assert.equal(routeGroup('/timer'), '/timer');
  assert.equal(routeGroup('/developers/'), '/developers');
  assert.equal(routeGroup('/countdown'), '/countdown');
  assert.equal(routeGroup('/time/country/pk'), 'other');
  assert.equal(routeGroup('/anything/else'), 'other');
});

test('device class by viewport width', () => {
  assert.equal(deviceClass(390), 'phone');
  assert.equal(deviceClass(640), 'phone');
  assert.equal(deviceClass(641), 'desktop');
});

test('values are rounded to the collector units', () => {
  assert.equal(wire('LCP', 812.6), 813);
  assert.equal(wire('CLS', 0.0034), 3.4);
  assert.equal(wire('CLS', 0), 0);
});

test('the body has no URL or id and is null when there is nothing to send', () => {
  const b = beaconBody('/time/*', 'phone', { LCP: 800.2, CLS: 0.001, INP: NaN });
  assert.equal(b, '{"r":"/time/*","d":"phone","m":{"LCP":800,"CLS":1}}');
  assert.equal(beaconBody('/', 'desktop', {}), null);
});

test('Do Not Track and Global Privacy Control are respected', () => {
  assert.equal(optedOut({ doNotTrack: '1' }), true);
  assert.equal(optedOut({ globalPrivacyControl: true }), true);
  assert.equal(optedOut({ doNotTrack: '0' }), false);
  assert.equal(optedOut({}), false);
});
