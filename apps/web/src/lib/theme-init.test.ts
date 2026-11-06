import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookForFace } from './looks.ts';

// theme-init.js runs before first paint and repeats the face → look pairing, so keep the two in step.
const code = readFileSync(new URL('../theme-init.js', import.meta.url), 'utf8');

function run(store: Record<string, string>, systemDark: boolean): Record<string, string | undefined> {
  const dataset: Record<string, string | undefined> = {};
  const doc = { documentElement: { dataset } };
  const ls = { getItem: (k: string) => store[k] ?? null };
  new Function('document', 'localStorage', 'matchMedia', code)(doc, ls, () => ({ matches: systemDark }));
  return dataset;
}

test('first-paint attributes match lookForFace for every face, theme and system setting', () => {
  for (const face of ['flip', 'led', 'matrix', 'analog', '3d']) {
    for (const [theme, sysDark] of [[undefined, false], [undefined, true], ['light', true], ['night', false], ['oled', false]] as const) {
      const d = run({ 'clocknow-face': face, ...(theme ? { 'clocknow-theme': theme } : {}) }, sysDark);
      const dark = theme ? theme !== 'light' : sysDark;
      const want = lookForFace(face, dark);
      assert.equal(d.autolook ?? 'classic', want, `${face} ${theme ?? 'auto'} dark=${dark}`);
      assert.equal(d.face, face);
    }
  }
});

test('a saved look wins and suppresses the automatic one', () => {
  const d = run({ 'clocknow-face': 'flip', 'clocknow-look': 'sky' }, false);
  assert.equal(d.look, 'sky');
  assert.equal(d.autolook, undefined);
});

test('nothing is set for the default face, and bad values are ignored', () => {
  assert.deepEqual(run({}, false), {});
  assert.deepEqual(run({ 'clocknow-face': 'bogus', 'clocknow-look': 'neon' }, false), {});
});
