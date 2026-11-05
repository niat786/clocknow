// Contrast and consistency checks for theme.css. Run: node --test packages/ui/theme.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const THEMES = ['light', 'night', 'oled', 'contrast'];
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function block(selector) {
  const i = css.indexOf(selector);
  assert.notEqual(i, -1, `missing ${selector}`);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}

function tokens(body) {
  const out = {};
  for (const [, name, L, C, H] of body.matchAll(/--color-([a-z-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g))
    out[name] = [Number(L) / 100, Number(C), Number(H)];
  return out;
}

// OKLCH -> linear sRGB -> relative luminance (Ottosson's matrices; out-of-gamut channels are clipped).
function luminance([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x) => Math.min(1, Math.max(0, x));
  const r = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const ratio = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

test('contrast maths matches known values', () => {
  assert.ok(Math.abs(ratio([1, 0, 0], [0, 0, 0]) - 21) < 0.05, 'white on black is 21:1');
  assert.ok(Math.abs(ratio([0.5, 0, 0], [0.5, 0, 0]) - 1) < 1e-9, 'same colour is 1:1');
  // oklch(56.584% 0 0) is mid-grey #767676, the classic 4.54:1 on white.
  assert.ok(Math.abs(ratio([0.56584, 0, 0], [1, 0, 0]) - 4.54) < 0.05);
});

const get = (t) => tokens(block(`[data-theme='${t}']`));

for (const t of THEMES) {
  test(`${t}: contrast`, () => {
    const c = get(t);
    const r = (k) => ratio(c[k], c.bg);
    assert.ok(r('ink') >= 7, `digits ${r('ink').toFixed(2)} < 7`);
    assert.ok(r('ink-muted') >= 4.5, `muted text ${r('ink-muted').toFixed(2)} < 4.5`);
    // Accent is used for large digits (seconds) and the button fill: AAA large-text / button text 4.5.
    assert.ok(r('accent') >= 4.5, `accent ${r('accent').toFixed(2)} < 4.5`);
    for (const k of ['locked', 'drifting', 'offline']) assert.ok(r(k) >= 3, `${k} ${r(k).toFixed(2)} < 3 (non-text)`);
    assert.ok(r('line') >= 1.2, `line ${r('line').toFixed(2)} invisible`);
  });
}

test('OLED background is true black and digits are dimmed', () => {
  const c = get('oled');
  assert.equal(c.bg[0], 0);
  assert.ok(c.ink[0] < 0.9, 'OLED digits should be dimmer than full white');
});

test('system fallbacks match the explicit themes', () => {
  // The first :root:not block is the dark one, the second the contrast one.
  const first = css.indexOf(':root:not([data-theme])');
  const second = css.indexOf(':root:not([data-theme])', first + 1);
  const body = (from) => css.slice(css.indexOf('{', from) + 1, css.indexOf('}', from));
  assert.equal(norm(body(first)), norm(block("[data-theme='night']")));
  assert.equal(norm(body(second)), norm(block("[data-theme='contrast']")));
});
