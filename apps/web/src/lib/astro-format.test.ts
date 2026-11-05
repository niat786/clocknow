import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compass, defaultPrayer, formatChange, formatDuration, formatHM, isPrayerMethod, moonPath } from './astro-format.ts';

test('durations and changes', () => {
  assert.equal(formatDuration(10 * 3600 + 32 * 60 + 20), '10 h 32 min');
  assert.equal(formatDuration(45 * 60), '45 min');
  assert.equal(formatDuration(86_400), '24 h 0 min');
  assert.equal(formatDuration(-5), '0 min');
  assert.equal(formatChange(123), '+2 min 3 s');
  assert.equal(formatChange(-45), '−45 s');
  assert.equal(formatChange(120), '+2 min');
  assert.equal(formatChange(0.2), 'same as yesterday');
  assert.equal(formatHM({ hour: 5, minute: 7 }), '05:07');
});

test('compass points', () => {
  assert.equal(compass(0), 'north');
  assert.equal(compass(359), 'north');
  assert.equal(compass(90), 'east');
  assert.equal(compass(225), 'south-west');
  assert.equal(compass(-90), 'west');
  assert.equal(compass(113), 'east-south-east');
  assert.equal(compass(101), 'east');
});

test('moon path shapes', () => {
  assert.equal(moonPath(0, 10, 50, 50), '');
  assert.equal(moonPath(359.9, 10, 50, 50), '');
  const full = moonPath(180, 10, 50, 50);
  assert.match(full, /^M 50 40 A 10 10 0 1 1 50 60 A 10 10 0 1 1 50 40 Z$/);
  // waxing crescent: right limb (sweep 1), terminator sweep 0
  assert.match(moonPath(45, 10, 50, 50), /^M 50 40 A 10 10 0 0 1 50 60 A 7\.071 10 0 0 0 50 40 Z$/);
  // waxing gibbous: terminator sweep 1
  assert.match(moonPath(135, 10, 50, 50), / 0 0 1 50 60 A 7\.071 10 0 0 1 50 40 Z$/);
  // waning crescent: left limb (sweep 0), terminator sweep 1
  assert.match(moonPath(315, 10, 50, 50), / 0 0 0 50 60 A 7\.071 10 0 0 1 50 40 Z$/);
  // quarter: straight terminator
  assert.match(moonPath(90, 10, 50, 50), /A 0\.000 10/);
});

test('default prayer convention by country', () => {
  assert.deepEqual(defaultPrayer('pk'), { method: 'karachi', asr: 'hanafi' });
  assert.deepEqual(defaultPrayer('SA'), { method: 'umm_al_qura', asr: 'standard' });
  assert.deepEqual(defaultPrayer('US'), { method: 'isna', asr: 'standard' });
  assert.deepEqual(defaultPrayer('TR'), { method: 'mwl', asr: 'hanafi' });
  assert.deepEqual(defaultPrayer('GB'), { method: 'mwl', asr: 'standard' });
  assert.equal(isPrayerMethod('egypt'), true);
  assert.equal(isPrayerMethod('constructor'), false);
});

test('band shapes', async () => {
  const { band } = await import('./astro-format.ts');
  assert.deepEqual(band(1, 2, 3, 4, -6, -4, 40), { kind: 'twice', morning: [1, 2], evening: [3, 4] });
  // Reykjavik in June for civil twilight: the sun never drops below -6, so twilight spans the night.
  assert.deepEqual(band(undefined, 2, 3, undefined, -6, -0.833, 49), { kind: 'overnight', until: 2, from: 3 });
  // Polar night with the sun peaking at -3: civil twilight is one period around midday.
  assert.deepEqual(band(10, undefined, undefined, 20, -6, -0.833, -3), { kind: 'midday', from: 10, to: 20 });
  // Peak inside the band and no crossings: in the band all day.
  assert.deepEqual(band(undefined, undefined, undefined, undefined, -6, -0.833, -3), { kind: 'all_day' });
  // Peak below the band: never in it.
  assert.deepEqual(band(undefined, undefined, undefined, undefined, -6, -0.833, -8), { kind: 'none' });
  // Midnight sun high above the band: never in it.
  assert.deepEqual(band(undefined, undefined, undefined, undefined, -6, -4, 45), { kind: 'none' });
});
