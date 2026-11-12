export const BUYER_LIST_FORMAT = 'sonny-collection-buyer-list';
export const BUYER_LIST_COLLECTION = 'tee-emm/sonny-collection';

export function exportBuyerList(selectedItems, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    format: BUYER_LIST_FORMAT,
    version: 1,
    collection: BUYER_LIST_COLLECTION,
    exportedAt,
    items: selectedItems.map(({ code, name, series }) => ({ code, name, series })),
  }, null, 2) + '\n';
}

export function importBuyerList(text, knownCodes) {
  let input;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('This file could not be read. Choose a buyer-list JSON exported from this site.'); }
  if (!input || input.format !== BUYER_LIST_FORMAT || input.collection !== BUYER_LIST_COLLECTION) {
    throw new Error('This file is not a buyer list for this collection. Choose a list exported from this site.');
  }
  if (input.version !== 1) throw new Error('This buyer-list version is not supported. Please use a version 1 export.');
  if (!Array.isArray(input.items) || input.items.length > 10000 || input.items.some(item => !item || typeof item.code !== 'string')) {
    throw new Error('The buyer list contains invalid items. Your current list has not changed.');
  }
  const codes = new Set();
  const unknownCodes = new Set();
  let duplicates = 0;
  for (const { code } of input.items) {
    if (!knownCodes.has(code)) { unknownCodes.add(code); continue; }
    if (codes.has(code)) duplicates += 1;
    codes.add(code);
  }
  return { codes: [...codes], unknownCodes: [...unknownCodes], duplicates };
}

export function mergeBuyerLists(currentCodes, importedCodes) {
  const codes = new Set(currentCodes);
  let added = 0;
  let existing = 0;
  for (const code of new Set(importedCodes)) {
    if (codes.has(code)) existing += 1;
    else { codes.add(code); added += 1; }
  }
  return { codes: [...codes], added, existing };
}
