import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbrName, directory, etcZone, offsetLabel, offsetSlug, periods } from './zone-dir.ts';
import type { ZoneTable } from './city-facts.ts';

const H = 3600;
const lon: ZoneTable = {
  '2026': { start_offset: 0, start_abbr: 'GMT', changes: [{ at: Date.UTC(2026, 2, 29, 1), before: 0, after: H, abbr: 'BST' }, { at: Date.UTC(2026, 9, 25, 1), before: H, after: 0, abbr: 'GMT' }] },
  '2027': { start_offset: 0, start_abbr: 'GMT', changes: [] },
};
const pk: ZoneTable = { '2026': { start_offset: 5 * H, start_abbr: 'PKT', changes: [] } };

test('periods of a year', () => {
  const p = periods(lon, 2026);
  assert.deepEqual(p.map((x) => [x.abbr, x.offset]), [['GMT', 0], ['BST', H], ['GMT', 0]]);
  assert.equal(p[0]?.start, Date.UTC(2026, 0, 1));
  assert.equal(p[2]?.end, Date.UTC(2027, 0, 1));
  assert.equal(periods(pk, 2026).length, 1);
  assert.deepEqual(periods(pk, 2030), []);
});

test('slugs and labels', () => {
  assert.equal(offsetSlug(5.5 * H), 'utc+5-30');
  assert.equal(offsetSlug(-3.5 * H), 'utc-3-30');
  assert.equal(offsetSlug(0), 'utc+0');
  assert.equal(offsetLabel(-3.5 * H), 'UTC−3:30');
  assert.equal(etcZone(5 * H), 'Etc/GMT-5');
  assert.equal(etcZone(-8 * H), 'Etc/GMT+8');
  assert.equal(etcZone(5.5 * H), null);
});

test('directory groups by offset and abbreviation', () => {
  const d = directory({ 'Europe/London': lon, 'Asia/Karachi': pk }, 2026);
  assert.deepEqual(d.offsets.get(0)?.map((u) => [u.zone, u.allYear, u.periods.length]), [['Europe/London', false, 2]]);
  assert.deepEqual(d.offsets.get(5 * H)?.map((u) => [u.zone, u.allYear]), [['Asia/Karachi', true]]);
  assert.deepEqual([...d.abbrs.keys()].sort(), ['BST', 'GMT', 'PKT']);
  assert.equal(abbrName('IST', 19800), 'India Standard Time');
  assert.equal(abbrName('IST', 3600), 'Irish Standard Time');
  assert.equal(abbrName('XYZ', 0), '');
});
