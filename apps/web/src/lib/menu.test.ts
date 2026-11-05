import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT, isCurrent, menu } from './menu.ts';

test('menu has unique, absolute links', () => {
  const all = [...menu(2026).flatMap((g) => g.items), ...ABOUT].map((i) => i.href);
  assert.ok(all.every((h) => h.startsWith('/') && !h.endsWith('/') || h === '/'));
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.includes('/calendar/2026'));
});

test('every group is non-empty and short enough for a menu', () => {
  for (const g of menu(2026)) assert.ok(g.items.length > 0 && g.items.length <= 8, g.name);
});

test('current page', () => {
  assert.equal(isCurrent('/', '/'), true);
  assert.equal(isCurrent('/', '/timer'), false);
  assert.equal(isCurrent('/timer', '/timer'), true);
});
