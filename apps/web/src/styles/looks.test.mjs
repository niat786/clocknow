// Contrast checks for looks.css. Run: node --test apps/web/src/styles/looks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./looks.css', import.meta.url), 'utf8');
const ok = (s) => /oklch\(/.test(s);
function lum([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (x) => Math.min(1, Math.max(0, x));
  return 0.2126 * c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) + 0.7152 * c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) + 0.0722 * c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}
const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
const looks = [];
for (const [, name, body] of css.matchAll(/^\.look-sw\[data-look='([a-z]+)'\][^{]*\{([^}]*)\}/gm)) {
  const t = {};
  for (const [, key, L, C, H] of body.matchAll(/--look-([a-z0-9]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) t[key] = [Number(L) / 100, Number(C), Number(H)];
  looks.push([name, t]);
}

test('there are six looks and each defines every colour', () => {
  assert.deepEqual(looks.map(([n]) => n), ['peach', 'sky', 'meadow', 'sage', 'midnight', 'plum']);
  for (const [n, t] of looks) assert.deepEqual(Object.keys(t).sort(), ['accent', 'bg', 'bg2', 'ink', 'line', 'muted'], n);
});

test('digits and text stay at 7:1 on both background stops', () => {
  for (const [n, t] of looks) for (const bg of ['bg', 'bg2']) {
    for (const k of ['ink', 'muted', 'accent']) assert.ok(ratio(t[k], t[bg]) >= 7, `${n} ${k} on ${bg}: ${ratio(t[k], t[bg]).toFixed(2)}`);
  }
});

test('looks never apply on OLED or high contrast', () => {
  assert.match(css, /prefers-contrast: no-preference/);
  assert.match(css, /not\(\[data-theme='oled'\], \[data-theme='contrast'\]\)/);
  assert.ok(ok(css));
});
