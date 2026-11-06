import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRINT_DEFAULTS, parsePrintOptions, printQuery } from './print-options.ts';

test('defaults', () => {
  assert.deepEqual(parsePrintOptions(''), PRINT_DEFAULTS);
  assert.deepEqual(printQuery(PRINT_DEFAULTS), {});
});

test('round trip and junk', () => {
  const o = { paper: 'letter', start: 'sun', hijri: true, weeks: false } as const;
  assert.deepEqual(printQuery(o), { paper: 'letter', start: 'sun', hijri: '1', weeks: '0' });
  assert.deepEqual(parsePrintOptions(`?${new URLSearchParams(printQuery(o))}`), o);
  assert.deepEqual(parsePrintOptions('?paper=a3&start=wed&hijri=yes&weeks=maybe'), PRINT_DEFAULTS);
});
