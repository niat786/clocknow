import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, FACE_KEY, chosenFace, isFaceId, saveFace } from './faces.ts';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

test('registry ids are unique and digital is first', () => {
  assert.equal(FACES[0].id, 'digital');
  assert.equal(new Set(FACES.map((f) => f.id)).size, FACES.length);
  assert.equal(isFaceId('flip'), true);
  assert.equal(isFaceId('toString'), false);
});

test('url beats storage, storage beats default', () => {
  const s = memory();
  assert.equal(chosenFace('', s), 'digital');
  saveFace('flip', s);
  assert.equal(s.m.get(FACE_KEY), 'flip');
  assert.equal(chosenFace('', s), 'flip');
  assert.equal(chosenFace('?face=digital', s), 'digital');
  assert.equal(chosenFace('?face=nope', s), 'flip');
  saveFace('digital', s);
  assert.equal(s.m.has(FACE_KEY), false);
});

test('broken storage falls back to digital', () => {
  const broken = { getItem: () => { throw new Error('blocked'); } };
  assert.equal(chosenFace('', broken), 'digital');
  assert.doesNotThrow(() => saveFace('flip', { setItem: () => { throw new Error('x'); }, removeItem: () => undefined }));
  assert.equal(chosenFace('', null), 'digital');
});
