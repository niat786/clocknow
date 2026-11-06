import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, effectiveLook, isLookId, lookForFace, readLook, saveLook } from './looks.ts';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

test('every face has a matching look, and dark pages keep light looks off', () => {
  assert.equal(lookForFace('flip', false), 'peach');
  assert.equal(lookForFace('led', false), 'midnight');
  assert.equal(lookForFace('matrix', false), 'plum');
  assert.equal(lookForFace('analog', false), 'sage');
  assert.equal(lookForFace('digital', false), 'classic');
  assert.equal(lookForFace('3d', false), 'classic');
  // a light card on a dark page would glare, so light looks fall back to the theme
  assert.equal(lookForFace('flip', true), 'classic');
  assert.equal(lookForFace('analog', true), 'classic');
  assert.equal(lookForFace('led', true), 'midnight');
});

test('a chosen look beats the face pairing', () => {
  assert.equal(effectiveLook('sky', 'flip', true), 'sky');
  assert.equal(effectiveLook(null, 'flip', false), 'peach');
});

test('saves and reads the choice safely', () => {
  const s = mem();
  assert.equal(readLook(s), null);
  saveLook('meadow', s);
  assert.equal(readLook(s), 'meadow');
  s.setItem('clocknow-look', 'nonsense');
  assert.equal(readLook(s), null);
  saveLook(null, s);
  assert.equal(readLook(s), null);
  assert.equal(readLook({ getItem: () => { throw new Error('blocked'); } }), null);
});

test('ids are validated', () => {
  assert.ok(isLookId('plum'));
  assert.ok(!isLookId('neon'));
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, LOOKS.length);
});
