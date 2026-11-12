import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBuyerList, importBuyerList, mergeBuyerLists } from '../buyer-list.js';

const pieces = [
  { code: 'SA-0117', name: 'Yellow Daruma', series: 'Japanese Good Luck' },
  { code: 'SA-0149', name: 'Circus secret rabbit', series: 'Circus' },
];
const known = new Set(pieces.map(item => item.code));
const file = entries => JSON.stringify({ format: 'sonny-collection-buyer-list', version: 1, collection: 'tee-emm/sonny-collection', items: entries });

test('an export can restore the same selection on another visit or device', () => {
  const restored = importBuyerList(exportBuyerList(pieces), known);
  assert.deepEqual(restored.codes, pieces.map(item => item.code));
  assert.deepEqual(restored.unknownCodes, []);
});

test('imports merge without removing current choices or duplicating pieces', () => {
  const parsed = importBuyerList(file([pieces[1], pieces[1], pieces[0]]), known);
  const merged = mergeBuyerLists(['SA-0117'], parsed.codes);
  assert.deepEqual(merged, { codes: ['SA-0117', 'SA-0149'], added: 1, existing: 1 });
  assert.equal(parsed.duplicates, 1);
});

test('unknown catalogue codes are reported and never added', () => {
  const parsed = importBuyerList(file([pieces[0], { code: 'SA-9999' }, { code: 'SA-9999' }]), known);
  assert.deepEqual(parsed.codes, ['SA-0117']);
  assert.deepEqual(parsed.unknownCodes, ['SA-9999']);
});

test('malformed JSON, foreign collections and unsupported versions are rejected', () => {
  for (const input of ['{', 'null', '[]', '{}', JSON.stringify({ format: 'sonny-collection-buyer-list', version: 1, collection: 'other', items: [] }), file([]).replace('"version":1', '"version":2')]) {
    assert.throws(() => importBuyerList(input, known));
  }
});

test('invalid item records reject the whole import before merging', () => {
  for (const entry of [null, {}, { code: 117 }]) {
    assert.throws(() => importBuyerList(file([pieces[0], entry]), known), /invalid items/);
  }
});

test('imported display text is ignored and only known item codes are returned', () => {
  const parsed = importBuyerList(file([{ code: 'SA-0117', name: '<img src=x onerror=alert(1)>', image: 'https://example.invalid/track' }]), known);
  assert.deepEqual(parsed, { codes: ['SA-0117'], unknownCodes: [], duplicates: 0 });
});

test('UTF-8 BOM and an empty selection are valid portable exports', () => {
  assert.deepEqual(importBuyerList('\uFEFF' + exportBuyerList([]), known).codes, []);
});
