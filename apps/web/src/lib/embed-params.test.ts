import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK_DEFAULTS, cleanLabel, clockEmbedQuery, lookQuery, parseClockEmbed, snippet } from './embed-params.ts';

test('defaults and round trip', () => {
  assert.deepEqual(parseClockEmbed(''), CLOCK_DEFAULTS);
  assert.equal(clockEmbedQuery(CLOCK_DEFAULTS), '');
  const o = { zone: 'Asia/Karachi', label: 'Head office', theme: 'night', seconds: false, h12: true, face: 'flip', transparent: true } as const;
  assert.deepEqual(parseClockEmbed(`?${clockEmbedQuery(o)}`), o);
});

test('junk is ignored', () => {
  const o = parseClockEmbed('?zone=<script>&theme=pink&face=nope&seconds=maybe&h12=yes&bg=red');
  assert.deepEqual(o, CLOCK_DEFAULTS);
});

test('labels are cleaned and capped', () => {
  assert.equal(cleanLabel('  Lahore\n\toffice  '), 'Lahore office');
  assert.equal(cleanLabel('x'.repeat(60)).length, 40);
});

test('snippet escapes attributes', () => {
  const s = snippet('https://clocknow.net/embed/clock?label=a"b&zone=UTC', 'Time "now" <here>', 300, 140);
  assert.ok(s.startsWith('<iframe src="https://clocknow.net/embed/clock?label=a&quot;b&amp;zone=UTC"'));
  assert.ok(s.includes('title="Time &quot;now&quot; &lt;here&gt;"'));
  assert.ok(s.includes('width="300" height="140"'));
  assert.deepEqual(lookQuery('auto', false), {});
  assert.deepEqual(lookQuery('oled', true), { theme: 'oled', bg: 'transparent' });
});
