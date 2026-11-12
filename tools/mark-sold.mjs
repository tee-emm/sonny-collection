import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSaleList, updateAvailability } from './availability.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const help = 'Usage: node tools/mark-sold.mjs <buyer-list.json|copied-list.txt> [--apply] [--restore]\nWithout --apply, this only previews the matching entries. --restore makes them available again.';
try {
  if (args.includes('--help')) { console.log(help); }
  else {
    const files = args.filter(arg => !arg.startsWith('--'));
    if (files.length !== 1 || args.some(arg => arg.startsWith('--') && !['--apply', '--restore'].includes(arg))) throw new Error(help);
    const [catalogue, availability, text] = await Promise.all([
      readFile(path.join(root, 'collection.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'availability.json'), 'utf8').then(JSON.parse),
      readFile(path.resolve(files[0]), 'utf8'),
    ]);
    const byCode = new Map(catalogue.items.map(item => [item.code, item]));
    const codes = parseSaleList(text, byCode);
    const restore = args.includes('--restore');
    const result = updateAvailability(availability, codes, byCode, restore);
    console.log(`${args.includes('--apply') ? 'Applying' : 'Preview only:'} ${restore ? 'restore as available' : 'mark as sold'} (${result.changed.length} changes, ${result.unchanged.length} already ${restore ? 'available' : 'sold'}).`);
    for (const code of codes) console.log(`${code} — ${byCode.get(code).name}${result.unchanged.includes(code) ? ' (unchanged)' : ''}`);
    if (args.includes('--apply') && result.changed.length) {
      const filename = path.join(root, 'availability.json');
      const temporary = filename + '.tmp';
      await writeFile(temporary, JSON.stringify(result.availability, null, 2) + '\n');
      await rename(temporary, filename);
      console.log('Availability saved. Run npm test, npm run check and npm run build, then publish the updated files.');
    } else if (!args.includes('--apply')) console.log('No files changed. Add --apply to save these availability changes.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
