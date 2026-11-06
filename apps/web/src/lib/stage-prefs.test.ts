import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_DEFAULTS, STAGE_KEY, offsetLabel, readPrefs, writePrefs, zoneCity } from './stage-prefs.ts';

test('prefs round trip and tolerate junk', () => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.deepEqual(readPrefs(s), STAGE_DEFAULTS);
  writePrefs({ h12: true, seconds: false, ms: true, sound: true }, s);
  assert.deepEqual(readPrefs(s), { h12: true, seconds: false, ms: true, sound: true });
  m.set(STAGE_KEY, '{"h12":"yes","ms":1}');
  assert.deepEqual(readPrefs(s), STAGE_DEFAULTS);
  m.set(STAGE_KEY, 'not json');
  assert.deepEqual(readPrefs(s), STAGE_DEFAULTS);
  assert.deepEqual(readPrefs({ getItem: () => { throw new Error('blocked'); } }), STAGE_DEFAULTS);
});

test('labels', () => {
  assert.equal(offsetLabel(18000), 'UTC+5');
  assert.equal(offsetLabel(-12600), 'UTC−3:30');
  assert.equal(offsetLabel(0), 'UTC');
  assert.equal(offsetLabel(20700), 'UTC+5:45');
  assert.equal(zoneCity('America/Port_of_Spain'), 'Port of Spain');
  assert.equal(zoneCity('UTC'), 'UTC');
});
