import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewFor } from './link-preview.ts';

test('countdown links name the event and the moment', () => {
  const p = previewFor('/countdown', '?t=1795000000&z=Europe%2FLondon&n=Launch%20day');
  assert.ok(p);
  assert.match(p.title, /^Launch day · /);
  assert.match(p.title, /2026/);
  assert.match(p.description, /Live countdown to /);
  assert.ok(p.title.length <= 90);
});

test('countdown without a title or with a bad zone still works', () => {
  const p = previewFor('/countdown', '?t=1795000000&z=Not/AZone');
  assert.ok(p);
  assert.match(p.title, /^Countdown · /);
  assert.match(p.title, /UTC/);
});

test('countdown keeps markup out of the text', () => {
  const p = previewFor('/countdown', '?t=1795000000&n=%3Cb%3Ebig%3C%2Fb%3E%20%22x%22');
  assert.ok(p);
  assert.equal(p.title.includes('\n'), false);
});

test('no preview without a usable link', () => {
  assert.equal(previewFor('/countdown', ''), null);
  assert.equal(previewFor('/countdown', '?t=abc'), null);
  assert.equal(previewFor('/about', '?t=1795000000'), null);
});

test('meeting planner links list the places', () => {
  const p = previewFor('/meeting-planner', '?c=karachi,london,America%2FNew_York&m=45&ws=09:00&we=17:00');
  assert.ok(p);
  assert.equal(p.title, 'Meeting time: Karachi, London, New York');
  assert.match(p.description, /45 min/);
  assert.equal(previewFor('/meeting-planner', '?c=karachi'), null);
});

test('converter links name both places', () => {
  const p = previewFor('/time-zone-converter', '?from=Europe%2FLondon&to=Asia%2FTokyo&t=15:30');
  assert.ok(p);
  assert.equal(p.title, '15:30 London to Tokyo time');
  assert.equal(previewFor('/time-zone-converter', '?from=%3Cx%3E&to=UTC'), null);
});
