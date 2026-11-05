import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowBody, originAllowed, parseOrigins, pongFor } from './protocol.ts';

test('origins', () => {
  const list = parseOrigins(' https://clocknow.net/ ,https://www.clocknow.net,, ');
  assert.deepEqual(list, ['https://clocknow.net', 'https://www.clocknow.net']);
  assert.equal(originAllowed('https://clocknow.net', list), true);
  assert.equal(originAllowed(null, list), true);
  assert.equal(originAllowed('https://copycat.example', list), false);
  assert.equal(originAllowed('https://clocknow.net.evil.example', list), false);
});

test('pong echoes t0 and adds server times', () => {
  assert.equal(pongFor('{"t0":1793908923635.5}', 10, 11), '{"t0":1793908923635.5,"t1":10,"t2":11}');
});

test('pong ignores junk', () => {
  for (const s of ['', 'x', '[]', 'null', '{"t0":"1"}', '{"t0":null}', '{}', '{"t0":1e999}', `{"t0":1,"p":"${'x'.repeat(300)}"}`])
    assert.equal(pongFor(s, 1, 2), null, s);
});

test('now body matches the Fly API shape', () => {
  assert.deepEqual(Object.keys(nowBody(1, 2, 'cf-KHI')), ['t1', 't2', 'server_id', 'tzdata_version', 'zone']);
});
