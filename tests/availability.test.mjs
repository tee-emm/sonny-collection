import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSaleList, soldCodeSet, updateAvailability } from '../tools/availability.mjs';
import { exportBuyerList } from '../buyer-list.js';

const pieces = [
  { code: 'SA-0117', name: 'Yellow Daruma', series: 'Japanese Good Luck' },
  { code: 'SA-0118', name: 'White Daruma', series: 'Japanese Good Luck' },
  { code: 'SA-0120', name: 'White Daruma', series: 'Japanese Good Luck' },
];
const known = new Set(pieces.map(item => item.code));
const empty = { version: 1, soldCodes: [] };

test('exported and copied lists identify exact entries without confusing matching names', () => {
  assert.deepEqual(parseSaleList(exportBuyerList([pieces[1]]), known), ['SA-0118']);
  assert.deepEqual(parseSaleList('Hi!\nSA-0118 — White Daruma — C$90 estimated\nSA-0118 — White Daruma', known), ['SA-0118']);
  const changed = updateAvailability(empty, ['SA-0118'], known);
  assert.deepEqual(changed.availability.soldCodes, ['SA-0118']);
  assert.equal(soldCodeSet(changed.availability, known).has('SA-0120'), false);
  assert.deepEqual(empty.soldCodes, []);
});

test('unknown codes, incompatible files and names without codes reject the entire update', () => {
  for (const text of ['SA-0117\nSA-9999', 'SA-01170', 'White Daruma', '{invalid', exportBuyerList(pieces).replace('tee-emm/sonny-collection', 'other/collection')]) {
    assert.throws(() => parseSaleList(text, known));
  }
  assert.throws(() => soldCodeSet({ version: 1, soldCodes: ['SA-9999'] }, known));
  assert.throws(() => updateAvailability(empty, ['SA-0117', 'SA-9999'], known));
});

test('sale lists are idempotent and can restore specific entries without changing other sales', () => {
  const first = updateAvailability(empty, ['SA-0117', 'SA-0118', 'SA-0117'], known);
  assert.deepEqual(first.changed, ['SA-0117', 'SA-0118']);
  const repeated = updateAvailability(first.availability, ['SA-0117'], known);
  assert.deepEqual(repeated.changed, []);
  assert.deepEqual(repeated.unchanged, ['SA-0117']);
  const restored = updateAvailability(first.availability, ['SA-0118'], known, true);
  assert.deepEqual(restored.availability.soldCodes, ['SA-0117']);
});

test('a forwarded share link identifies the same exact pieces for a later confirmed sale', () => {
  assert.deepEqual(parseSaleList('Here is their list:\nhttps://tee-emm.github.io/sonny-collection/#list=v1:SA-0118,SA-0120', known), ['SA-0118', 'SA-0120']);
  for (const url of ['https://example.com/sonny-collection/#list=v1:SA-0118', 'https://tee-emm.github.io/cabinet-pages/#list=v1:SA-0118', 'https://tee-emm.github.io/sonny-collection/#list=v2:SA-0118', 'https://tee-emm.github.io/sonny-collection/#list=v1:SA-9999']) {
    assert.throws(() => parseSaleList(url, known));
  }
  const foreignFile = JSON.stringify({ format: 'other', items: [{ code: 'SA-0118', name: 'https://tee-emm.github.io/sonny-collection/#list=v1:SA-0118' }] });
  assert.throws(() => parseSaleList(foreignFile, known));
});

test('the owner command previews before writing, applies a received list and reverses it', async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const fixture = await mkdtemp(path.join(tmpdir(), 'sonny-sales-'));
  try {
    await mkdir(path.join(fixture, 'tools'));
    for (const file of ['buyer-list.js', 'tools/availability.mjs', 'tools/mark-sold.mjs']) await cp(path.join(root, file), path.join(fixture, file));
    await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(fixture, 'collection.json'), JSON.stringify({ items: pieces }));
    await writeFile(path.join(fixture, 'availability.json'), JSON.stringify(empty));
    await writeFile(path.join(fixture, 'received.json'), exportBuyerList([pieces[1]]));
    const run = (...args) => execFileSync(process.execPath, ['tools/mark-sold.mjs', 'received.json', ...args], { cwd: fixture, encoding: 'utf8' });
    assert.match(run(), /Preview only/);
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture, 'availability.json'), 'utf8')), empty);
    assert.match(run('--apply'), /1 changes/);
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture, 'availability.json'), 'utf8')).soldCodes, ['SA-0118']);
    assert.match(run('--apply'), /0 changes, 1 already sold/);
    run('--restore', '--apply');
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture, 'availability.json'), 'utf8')), empty);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
