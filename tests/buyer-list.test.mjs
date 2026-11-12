import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBuyerList, importBuyerList, mergeBuyerLists, estimateBuyerList, createBuyerListLink, readBuyerListLink } from '../buyer-list.js';

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

test('selected prices add in cents and duplicates are counted only once', () => {
  const references = new Map([['SA-0117', { cad: '0.10' }], ['SA-0149', { cad: '0.20' }]]);
  const estimate = estimateBuyerList([...pieces, pieces[0]], references);
  assert.equal(estimate.totalCAD, 0.3);
  assert.equal(estimate.pricedCount, 2);
  assert.equal(estimate.unpricedCount, 0);
  assert.equal(estimateBuyerList([pieces[1]], references).totalCAD, 0.2);
});

test('a partially priced list reports a subtotal and its missing coverage', () => {
  const estimate = estimateBuyerList(pieces, new Map([['SA-0117', { cad: '375.00' }]]));
  assert.equal(estimate.totalCAD, 375);
  assert.equal(estimate.pricedCount, 1);
  assert.equal(estimate.unpricedCount, 1);
  assert.equal(estimate.entries[1].reason, 'missing-reference');
});

test('group photos are not charged a single-figure price without a confirmed quantity', () => {
  const estimate = estimateBuyerList([{ ...pieces[0], multiple: true }], new Map([['SA-0117', { cad: '100' }]]));
  assert.equal(estimate.totalCAD, null);
  assert.equal(estimate.unpricedCount, 1);
  assert.equal(estimate.entries[0].reason, 'group');
});

test('empty and wholly unpriced lists do not look free, while a recorded zero is valid', () => {
  assert.equal(estimateBuyerList([], new Map()).totalCAD, null);
  for (const cad of [null, undefined, '', ' ', false, 'invalid', Infinity, '-1']) {
    assert.equal(estimateBuyerList([pieces[0]], new Map([['SA-0117', { cad }]])).totalCAD, null);
  }
  assert.equal(estimateBuyerList([pieces[0]], new Map([['SA-0117', { cad: 0 }]])).totalCAD, 0);
});

test('exports include the estimate, while importing recalculates using current catalogue prices', () => {
  const estimate = estimateBuyerList(pieces, new Map([['SA-0117', { cad: '375' }]]));
  const output = JSON.parse(exportBuyerList(pieces, '2026-11-11T23:00:00Z', estimate));
  assert.equal(output.estimatedCost.amount, 375);
  assert.equal(output.estimatedCost.unpricedEntries, 1);
  assert.equal(output.items[0].estimatedCostCAD, 375);
  assert.equal(output.items[1].estimatedCostCAD, null);
  output.estimatedCost.amount = 1;
  output.items[0].estimatedCostCAD = 1;
  const imported = importBuyerList(JSON.stringify(output), known);
  const currentItems = imported.codes.map(code => pieces.find(item => item.code === code));
  const recalculated = estimateBuyerList(currentItems, new Map([['SA-0117', { cad: '400' }]]));
  assert.equal(recalculated.totalCAD, 400);
});

test('sold pieces stay identifiable in older lists but are excluded from totals and quote counts', () => {
  const selected = [{ ...pieces[0], availability: 'sold' }, pieces[1]];
  const estimate = estimateBuyerList(selected, new Map([['SA-0117', { cad: '375' }], ['SA-0149', { cad: '100' }]]));
  assert.equal(estimate.totalCAD, 100);
  assert.equal(estimate.pricedCount, 1);
  assert.equal(estimate.unpricedCount, 0);
  assert.equal(estimate.soldCount, 1);
  assert.equal(estimate.entries[0].reason, 'sold');
  const output = JSON.parse(exportBuyerList(selected, undefined, estimate));
  assert.equal(output.items[0].availability, 'sold');
  assert.equal(output.items[0].estimatedCostCAD, null);
  assert.equal(output.estimatedCost.soldEntries, 1);
  const imported = importBuyerList(JSON.stringify(output), known);
  assert.deepEqual(imported.codes, pieces.map(item => item.code));
});

test('a list of only sold pieces has no total and does not ask for quotes', () => {
  const estimate = estimateBuyerList(pieces.map(item => ({ ...item, availability: 'sold' })), new Map());
  assert.equal(estimate.totalCAD, null);
  assert.equal(estimate.unpricedCount, 0);
  assert.equal(estimate.soldCount, 2);
});

test('each selection has a portable share link with no browsing query or item hash', () => {
  const link = createBuyerListLink('https://tee-emm.github.io/sonny-collection/?tracking=old#SA-0117', ['SA-0149', 'SA-0117', 'SA-0117']);
  assert.equal(link, 'https://tee-emm.github.io/sonny-collection/#list=v1:SA-0117,SA-0149');
  assert.deepEqual(readBuyerListLink(link, known), { codes: ['SA-0117', 'SA-0149'], unknownCodes: [], duplicates: 0 });
  assert.equal(createBuyerListLink(link, ['SA-0117', 'SA-0149']), link);
  assert.notEqual(createBuyerListLink(link, ['SA-0117']), link);
});

test('ordinary catalogue and item links are not mistaken for shared lists', () => {
  for (const hash of ['', '#collection', '#SA-0117']) assert.equal(readBuyerListLink('https://tee-emm.github.io/sonny-collection/' + hash, known), null);
});

test('shared links report missing entries and deduplicate repeated choices', () => {
  const parsed = readBuyerListLink('https://tee-emm.github.io/sonny-collection/#list=v1:SA-0117,SA-9999,SA-0117', known);
  assert.deepEqual(parsed, { codes: ['SA-0117'], unknownCodes: ['SA-9999'], duplicates: 1 });
  const encoded = readBuyerListLink('https://tee-emm.github.io/sonny-collection/#list=v1%3ASA-0117%2CSA-0149', known);
  assert.deepEqual(encoded.codes, ['SA-0117', 'SA-0149']);
});

test('broken, oversized and unsupported share links fail without importing partial choices', () => {
  for (const hash of ['#list=', '#list=v2:SA-0117', '#list=v1:', '#list=v1:SA-0117,', '#list=v1:SA-0117,<script>', '#list=v1:%ZZ', '#list=v1:' + Array(1001).fill('SA-0117').join(',')]) {
    assert.throws(() => readBuyerListLink('https://tee-emm.github.io/sonny-collection/' + hash, known));
  }
  assert.throws(() => createBuyerListLink('https://tee-emm.github.io/sonny-collection/', []));
  assert.throws(() => createBuyerListLink('https://tee-emm.github.io/sonny-collection/', ['unexpected']));
  assert.throws(() => createBuyerListLink('javascript:alert(1)', ['SA-0117']));
});

test('a whole-catalogue share link fits every entry and uses current sale status for estimates', async () => {
  const { readFile } = await import('node:fs/promises');
  const catalogue = JSON.parse(await readFile(new URL('../collection.json', import.meta.url), 'utf8'));
  const codes = catalogue.items.map(item => item.code);
  const link = createBuyerListLink('https://tee-emm.github.io/sonny-collection/', codes);
  assert.ok(link.length < 2500);
  assert.equal(readBuyerListLink(link, new Set(codes)).codes.length, codes.length);
  const parsed = readBuyerListLink(createBuyerListLink(link, ['SA-0117']), known);
  const currentItems = parsed.codes.map(code => ({ ...pieces.find(item => item.code === code), availability: 'sold' }));
  assert.equal(estimateBuyerList(currentItems, new Map([['SA-0117', { cad: 375 }]])).totalCAD, null);
});
