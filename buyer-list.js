export const BUYER_LIST_FORMAT = 'sonny-collection-buyer-list';
export const BUYER_LIST_COLLECTION = 'tee-emm/sonny-collection';

const shareCode = /^SA-\d{4}$/;
const maximumSharedEntries = 1000;

export function createBuyerListLink(baseUrl, codes) {
  const unique = [...new Set(codes)].sort();
  if (!unique.length || unique.length > maximumSharedEntries || unique.some(code => !shareCode.test(code))) throw new Error('Choose at least one valid catalogue entry to share.');
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('A buyer list needs a website link.');
  url.search = '';
  url.hash = `list=v1:${unique.join(',')}`;
  return url.href;
}

export function readBuyerListLink(value, knownCodes) {
  const url = new URL(value);
  if (!url.hash.startsWith('#list=')) return null;
  if (url.hash.length > 20000) throw new Error('This shared list is too large to open. Ask the buyer to copy a new link.');
  let payload;
  try { payload = decodeURIComponent(url.hash.slice(6)); }
  catch { throw new Error('This shared list link is damaged. Ask the buyer to copy a new link.'); }
  if (!payload.startsWith('v1:')) throw new Error('This shared list link uses an unsupported version. Ask the buyer to copy a new link.');
  const codes = payload.slice(3).split(',');
  if (!codes.length || codes.length > maximumSharedEntries || codes.some(code => !shareCode.test(code))) throw new Error('This shared list link is incomplete or invalid. Ask the buyer to copy a new link.');
  const unique = [...new Set(codes)];
  return { codes: unique.filter(code => knownCodes.has(code)), unknownCodes: unique.filter(code => !knownCodes.has(code)), duplicates: codes.length - unique.length };
}

export function estimateBuyerList(selectedItems, references) {
  const uniqueItems = [...new Map(selectedItems.map(item => [item.code, item])).values()];
  const entries = uniqueItems.map(item => {
    const source = references.get(item.code);
    const raw = source?.cad;
    const amount = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
    const sold = item.availability === 'sold';
    const priced = !sold && !item.multiple && Number.isFinite(amount) && amount >= 0;
    return { code: item.code, cents: priced ? Math.round((amount + Number.EPSILON) * 100) : null, reason: sold ? 'sold' : item.multiple ? 'group' : priced ? null : 'missing-reference' };
  });
  const priced = entries.filter(entry => entry.cents !== null);
  return {
    currency: 'CAD',
    totalCAD: priced.length ? priced.reduce((total, entry) => total + entry.cents, 0) / 100 : null,
    pricedCount: priced.length,
    unpricedCount: entries.filter(entry => entry.cents === null && entry.reason !== 'sold').length,
    soldCount: entries.filter(entry => entry.reason === 'sold').length,
    entries,
  };
}

export function exportBuyerList(selectedItems, exportedAt = new Date().toISOString(), estimate = null) {
  const costs = new Map((estimate?.entries || []).map(entry => [entry.code, entry]));
  return JSON.stringify({
    format: BUYER_LIST_FORMAT,
    version: 1,
    collection: BUYER_LIST_COLLECTION,
    exportedAt,
    ...(estimate ? { estimatedCost: { currency: 'CAD', amount: estimate.totalCAD, pricedEntries: estimate.pricedCount, unpricedEntries: estimate.unpricedCount, soldEntries: estimate.soldCount, note: 'Recorded comparison-price estimate. Excludes sold and unpriced entries, shipping, tax and fees; final price to be agreed with the seller.' } } : {}),
    items: selectedItems.map(({ code, name, series, availability }) => ({ code, name, series, availability: availability === 'sold' ? 'sold' : 'available', ...(estimate ? { estimatedCostCAD: costs.get(code)?.cents === null || !costs.has(code) ? null : costs.get(code).cents / 100 } : {}) })),
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
