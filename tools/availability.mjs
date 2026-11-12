import { importBuyerList } from '../buyer-list.js';

export function soldCodeSet(availability, knownCodes) {
  if (!availability || availability.version !== 1 || !Array.isArray(availability.soldCodes) || availability.soldCodes.some(code => typeof code !== 'string' || !knownCodes.has(code))) {
    throw new Error('Invalid availability record. Every sold code must match a catalogue entry.');
  }
  return new Set(availability.soldCodes);
}

export function parseSaleList(text, knownCodes) {
  const input = text.replace(/^\uFEFF/, '').trim();
  const parsed = (input.startsWith('{') || input.startsWith('['))
    ? importBuyerList(input, knownCodes)
    : (() => {
      const codes = [...new Set((input.match(/\bSA-\d+\b/gi) || []).map(code => code.toUpperCase()))];
      return { codes: codes.filter(code => knownCodes.has(code)), unknownCodes: codes.filter(code => !knownCodes.has(code)) };
    })();
  if (parsed.unknownCodes.length) throw new Error(`Unknown item codes: ${parsed.unknownCodes.join(', ')}. No entries changed.`);
  if (!parsed.codes.length) throw new Error('No catalogue item codes found. Send an exported buyer-list JSON or copied list containing SA- item codes.');
  return parsed.codes;
}

export function updateAvailability(availability, codes, knownCodes, restore = false) {
  const sold = soldCodeSet(availability, knownCodes);
  const uniqueCodes = [...new Set(codes)];
  if (uniqueCodes.some(code => !knownCodes.has(code))) throw new Error('Unknown item code. No entries changed.');
  const changed = [];
  const unchanged = [];
  for (const code of uniqueCodes) {
    if (sold.has(code) === !restore) unchanged.push(code);
    else {
      if (restore) sold.delete(code); else sold.add(code);
      changed.push(code);
    }
  }
  return { availability: { version: 1, soldCodes: [...sold].sort() }, changed, unchanged };
}
