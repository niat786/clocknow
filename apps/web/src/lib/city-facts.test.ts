import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changesIn, describeChange, describeDiff, dupeNames, formatAmount, formatChangeDate, formatOffset,
  nextChange, offsetAt, otherCities, placeName, type CityRec, type ZoneTable,
} from './city-facts.ts';

const H = 3600;
const ms = (iso: string) => Date.parse(iso);
const NY: ZoneTable = {
  '2026': { start_offset: -5 * H, start_abbr: 'EST', changes: [
    { at: ms('2026-03-08T07:00:00Z'), before: -5 * H, after: -4 * H, abbr: 'EDT' },
    { at: ms('2026-11-01T06:00:00Z'), before: -4 * H, after: -5 * H, abbr: 'EST' },
  ] },
  '2027': { start_offset: -5 * H, start_abbr: 'EST', changes: [
    { at: ms('2027-03-14T07:00:00Z'), before: -5 * H, after: -4 * H, abbr: 'EDT' },
    { at: ms('2027-11-07T06:00:00Z'), before: -4 * H, after: -5 * H, abbr: 'EST' },
  ] },
};
const KHI: ZoneTable = { '2026': { start_offset: 5 * H, start_abbr: 'PKT', changes: [] }, '2027': { start_offset: 5 * H, start_abbr: 'PKT', changes: [] } };

test('formatOffset', () => {
  assert.equal(formatOffset(5 * H), 'UTC+5');
  assert.equal(formatOffset(5 * H + 45 * 60), 'UTC+5:45');
  assert.equal(formatOffset(-(3 * H + 30 * 60)), 'UTC-3:30');
  assert.equal(formatOffset(0), 'UTC+0');
});

test('formatAmount and describeChange', () => {
  assert.equal(formatAmount(H), '1 hour');
  assert.equal(formatAmount(2 * H), '2 hours');
  assert.equal(formatAmount(30 * 60), '30 minutes');
  assert.equal(formatAmount(H + 30 * 60), '1 hour 30 minutes');
  assert.equal(describeChange({ at: 0, before: -5 * H, after: -4 * H, abbr: 'EDT' }), 'Clocks go forward 1 hour');
  assert.equal(describeChange({ at: 0, before: 11 * H, after: 10 * H, abbr: 'AEST' }), 'Clocks go back 1 hour');
});

test('formatChangeDate uses local time just before the change', () => {
  const [, , mar27] = [NY['2026']!.changes[0], NY['2026']!.changes[1], NY['2027']!.changes[0]];
  assert.equal(formatChangeDate(mar27!), 'Sunday, 14 March 2027 at 02:00');
  // Sydney: 2027-04-03T16:00Z at UTC+11 is 03:00 on Sunday 4 April.
  assert.equal(formatChangeDate({ at: ms('2027-04-03T16:00:00Z'), before: 11 * H, after: 10 * H, abbr: 'AEST' }), 'Sunday, 4 April 2027 at 03:00');
});

test('offsetAt walks the changes', () => {
  assert.deepEqual(offsetAt(KHI, ms('2026-11-06T00:00:00Z')), { offset: 5 * H, abbr: 'PKT' });
  assert.deepEqual(offsetAt(NY, ms('2026-11-06T00:00:00Z')), { offset: -5 * H, abbr: 'EST' });
  assert.deepEqual(offsetAt(NY, ms('2027-06-01T00:00:00Z')), { offset: -4 * H, abbr: 'EDT' });
  assert.deepEqual(offsetAt(NY, ms('2026-03-08T07:00:00Z')), { offset: -4 * H, abbr: 'EDT' }, 'exact change instant');
  assert.equal(offsetAt({}, 0), null);
});

test('changesIn and nextChange', () => {
  assert.equal(changesIn(NY, 2027).length, 2);
  assert.equal(changesIn(NY, 2030).length, 0);
  assert.equal(nextChange(NY, ms('2026-11-06T00:00:00Z'))?.at, ms('2027-03-14T07:00:00Z'));
  assert.equal(nextChange(KHI, 0), null);
  assert.equal(nextChange(NY, ms('2028-01-01T00:00:00Z')), null);
});

const city = (slug: string, name: string, cc: string, pop: number, admin1: string | null = null): CityRec => ({
  slug, name, ascii: name, country_code: cc, admin1, lat: 0, lon: 0, population: pop, zone: 'UTC', capital: false,
});

test('placeName adds the region only for same-name cities in one country', () => {
  const all = [city('hyderabad-india', 'Hyderabad', 'IN', 3e6, 'Telangana'), city('hyderabad-pakistan', 'Hyderabad', 'PK', 1e6, 'Sindh'),
    city('springfield-illinois', 'Springfield', 'US', 1e5, 'Illinois'), city('springfield-missouri', 'Springfield', 'US', 1e5, 'Missouri'),
    city('singapore', 'Singapore', 'SG', 5e6)];
  const d = dupeNames(all);
  assert.equal(placeName(all[1]!, 'Pakistan', d), 'Hyderabad, Pakistan');
  assert.equal(placeName(all[2]!, 'United States', d), 'Springfield, Illinois, United States');
  assert.equal(placeName(all[4]!, 'Singapore', d), 'Singapore', 'city-state is not repeated');
});

test('otherCities: same country, largest first, not itself', () => {
  const list = [city('a', 'A', 'PK', 10), city('b', 'B', 'PK', 30), city('c', 'C', 'PK', 20), city('d', 'D', 'PK', 30)];
  assert.deepEqual(otherCities(list, list[0]!, 2).map((c) => c.slug), ['b', 'd']);
  assert.deepEqual(otherCities(list, list[1]!, 9).map((c) => c.slug), ['d', 'c', 'a']);
});

test('describeDiff', () => {
  assert.equal(describeDiff(0), 'has the same time as you');
  assert.equal(describeDiff(5 * H), 'is 5 hours ahead of you');
  assert.equal(describeDiff(-(9 * H + 30 * 60)), 'is 9 hours 30 minutes behind you');
  assert.equal(describeDiff(H), 'is 1 hour ahead of you');
});
