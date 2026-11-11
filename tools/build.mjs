import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const data = JSON.parse(await readFile(path.join(root, 'collection.json'), 'utf8'));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>';
const cards = data.items.map((item, index) => {
  const tags = [item.uncertain ? '<span class="card-tag uncertain">Edition to confirm</span>' : '', item.custom ? '<span class="card-tag">Added outfit</span>' : '', item.multiple ? '<span class="card-tag">Multiple figures pictured</span>' : ''].join('');
  return `<article class="collection-card" id="entry-${esc(item.code)}" data-code="${esc(item.code)}"><button class="card-photo" type="button" data-open="${esc(item.code)}" aria-label="View ${esc(item.name)}, ${esc(item.code)}"><span class="photo-code">${esc(item.code)}</span><img src="./${esc(item.image)}" alt="${esc(item.name)} — photograph from the collection" width="${item.imageWidth}" height="${item.imageHeight}" loading="${index < 8 ? 'eager' : 'lazy'}" decoding="async"></button><button class="save-button" type="button" data-save="${esc(item.code)}" aria-label="Save ${esc(item.name)}" aria-pressed="false">${heart}</button><div class="card-content"><p class="card-series">${esc(item.family)}</p><h3 class="card-title"><a href="#${esc(item.code)}" data-open="${esc(item.code)}">${esc(item.name)}</a></h3><div class="card-tags">${tags}</div><a class="card-link" href="#${esc(item.code)}" data-open="${esc(item.code)}">View details <span aria-hidden="true"><span class="arrow-icon" aria-hidden="true"></span></span></a><p class="card-reference" data-reference="${esc(item.code)}" hidden></p></div></article>`;
}).join('\n');
const categories = ['All entries', 'Seasonal', 'Animals & nature', 'Fruits & sweets', 'Collaborations', 'Travel & special', 'Other editions'];
const filters = categories.map((category, index) => {
  const count = index === 0 ? data.items.length : data.items.filter(item => item.category === category).length;
  return `<button type="button" class="filter" data-filter="${index === 0 ? 'all' : esc(category)}" aria-pressed="${index === 0}">${esc(category)} <span>${count}</span></button>`;
}).join('');
const families = [...new Set(data.items.map(item => item.family))].sort((a, b) => a.localeCompare(b));
const options = families.map(family => `<option value="${esc(family)}">${esc(family)} (${data.items.filter(item => item.family === family).length})</option>`).join('');
let html = await readFile(path.join(root, 'tools/template.html'), 'utf8');
const replacements = {
  '__CATALOGUE_CARDS__': cards,
  '__CATALOGUE_DATA__': JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
  '__FILTER_BUTTONS__': filters,
  '__SERIES_OPTIONS__': options,
  '__SECRET_COUNT__': String(data.items.filter(item => item.secret).length),
  '__CUSTOM_COUNT__': String(data.items.filter(item => item.custom).length),
};
for (const [marker, value] of Object.entries(replacements)) html = html.replace(marker, value);
if (/__[A-Z_]+__/.test(html)) throw new Error('Unreplaced template marker.');
await writeFile(path.join(root, 'index.html'), html);
const csvCell = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const csv = [['Item code', 'Name', 'Series', 'Year / issue', 'Photographed packaging and contents', 'Identification confidence', 'Added outfit / accessories', 'Multiple figures pictured'], ...data.items.map(item => [item.code, item.name, item.series, item.year, item.packaging, item.confidence, item.custom ? 'Yes' : '', item.multiple ? 'Yes' : ''])].map(row => row.map(csvCell).join(',')).join('\r\n');
await writeFile(path.join(root, 'collection.csv'), '\ufeff' + csv + '\r\n');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'collection.json', 'collection.csv', 'favicon.svg', 'assets']) {
  await cp(path.join(root, file), path.join(dist, file), { recursive: true });
}
console.log(`Built ${data.items.length} photographed entries in dist/`);
