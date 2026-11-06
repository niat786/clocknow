import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayText, passkeysSupported, usageText } from './account-view.ts';

test('usage text', () => {
  assert.equal(usageText(1234, 'free'), '1,234 of 10,000 this month');
  assert.equal(usageText(5, 'enterprise'), '5 this month');
});
test('dates are UTC and absent means never', () => {
  assert.equal(dayText(Date.UTC(2026, 10, 7, 23) / 1000), '7 Nov 2026');
  assert.equal(dayText(null), 'never');
});
test('passkey support needs both JSON helpers', () => {
  assert.equal(passkeysSupported({}), false);
  assert.equal(passkeysSupported({ PublicKeyCredential: { parseCreationOptionsFromJSON() {} } }), false);
  assert.equal(passkeysSupported({ PublicKeyCredential: { parseCreationOptionsFromJSON() {}, parseRequestOptionsFromJSON() {} } }), true);
});
