import { exportBuyerList, importBuyerList, mergeBuyerLists } from './buyer-list.js';

(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('catalogue-data').textContent);
  const items = data.items;
  const byCode = new Map(items.map(item => [item.code, item]));
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = value => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' }).format(Number(value));
  const date = value => value ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
  const normalise = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA').replace(/[’'!]/g, '');
  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>';
  const storageKey = 'thomass-sonny-collection-saved-v1';
  let saved = new Set();
  let storageAvailable = true;
  try {
    const raw = localStorage.getItem(storageKey);
    try { const stored = JSON.parse(raw || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(code => byCode.has(code))); } catch { /* A damaged old list does not stop browsing. */ }
  } catch { storageAvailable = false; }
  const state = { query: '', category: 'all', family: 'all', sort: 'code', priceMin: null, priceMax: null, reference: 'all', contents: 'all', savedOnly: false, references: false, limit: 48 };
  const priceReferences = new Map(items.map(item => [item.code, item.comparisons.find(source => source.access === 'observed' && source.basis === 'per-unit' && source.quantity === 1 && source.conditionMatch !== 'wrong' && source.cad !== null && source.cad !== '' && Number.isFinite(Number(source.cad)) && Number(source.cad) >= 0) || null]));
  const searchText = new Map(items.map(item => [item.code, normalise([item.code, item.name, item.series, item.family, item.year, item.packaging, item.category].join(' '))]));
  const cards = new Map([...document.querySelectorAll('.collection-card')].map(card => [card.dataset.code, card]));
  const itemDialog = $('item-dialog');
  const enquiryDialog = $('enquiry-dialog');
  const buyerListDialog = $('buyer-list-dialog');
  let filtered = items;
  let currentCode = null;
  let toastTimer;
  let returnToItem = null;

  const marketLabel = source => source.country === 'Canada' ? 'Canadian' : ['United States', 'United States of America'].includes(source.country) ? 'US' : source.country || 'Market unconfirmed';
  const typeLabel = source => source.type === 'sold' ? 'sold reference' : 'asking reference';
  const eventLabel = source => source.eventDate ? `${source.type === 'sold' ? 'Sold' : 'Listed'} ${date(source.eventDate)}${source.eventDate < '2026-08-10' ? ' · older than three months' : ''}` : `${source.type === 'sold' ? 'Sale' : 'Listing'} date unknown`;
  const syncBody = () => document.body.classList.toggle('modal-open', itemDialog.open || enquiryDialog.open || buyerListDialog.open);

  function notify(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
  }

  async function copyText(text, button, success) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      notify(success);
    } catch {
      const parent = button.parentElement;
      let fallback = parent.querySelector('.copy-fallback');
      if (!fallback) { fallback = document.createElement('textarea'); fallback.className = 'copy-fallback'; fallback.readOnly = true; fallback.setAttribute('aria-label', 'Text to select and copy'); parent.append(fallback); }
      fallback.value = text;
      fallback.focus();
      fallback.select();
      notify('Select and copy the text shown below.');
    }
  }

  function catalogueUrl(code) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = code || '';
    return url.href;
  }

  function updateSaved() {
    $('saved-count').textContent = saved.size;
    $('saved-view').setAttribute('aria-label', `My list, ${saved.size} ${saved.size === 1 ? 'entry' : 'entries'}`);
    document.querySelectorAll('[data-save]').forEach(button => {
      const code = button.dataset.save;
      const isSaved = saved.has(code);
      button.setAttribute('aria-pressed', String(isSaved));
      button.setAttribute('aria-label', `${isSaved ? 'Remove' : 'Add'} ${byCode.get(code).name}${isSaved ? ' from' : ' to'} my list`);
      button.title = isSaved ? 'Remove from my list' : 'Add to my list';
      const label = button.querySelector('[data-save-label]');
      if (label) label.textContent = isSaved ? 'In my list' : 'Add to my list';
    });
    renderBuyerList();
  }

  function persistSaved() {
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); storageAvailable = true; }
    catch { storageAvailable = false; }
  }

  function renderBuyerList() {
    $('buyer-list-count').textContent = `${saved.size} ${saved.size === 1 ? 'entry' : 'entries'}`;
    $('buyer-list-storage').textContent = storageAvailable ? 'Your list saves automatically in this browser. Export a copy to keep a backup or open it on another device.' : 'This browser cannot save your list between visits. Export a copy before leaving so you can import it next time.';
    $('buyer-list-storage').classList.toggle('storage-unavailable', !storageAvailable);
    $('buyer-list-empty').hidden = saved.size !== 0;
    for (const id of ['export-buyer-list', 'copy-saved', 'view-list-catalogue']) $(id).disabled = !saved.size;
    if (!buyerListDialog.open) return;
    $('buyer-list-items').innerHTML = [...saved].map(code => {
      const item = byCode.get(code);
      return `<li class="buyer-list-item"><img src="./${esc(item.image)}" width="66" height="82" alt="" loading="lazy"><div><span class="buyer-list-code">${esc(item.code)} · ${esc(item.family)}</span><a href="#${esc(item.code)}" data-open="${esc(item.code)}">${esc(item.name)}</a>${item.multiple ? '<small>Multiple figures pictured</small>' : ''}</div><button type="button" class="text-button list-remove" data-save="${esc(item.code)}" data-list-remove aria-label="Remove ${esc(item.name)} from my list">Remove</button></li>`;
    }).join('');
  }

  function openBuyerList() {
    $('list-transfer-status').hidden = true;
    buyerListDialog.showModal();
    $('saved-view').setAttribute('aria-expanded', 'true');
    renderBuyerList();
    syncBody();
  }

  function listTransferStatus(message, error = false) {
    $('list-transfer-status').textContent = message;
    $('list-transfer-status').classList.toggle('list-transfer-error', error);
    $('list-transfer-status').hidden = false;
  }

  function downloadBuyerList() {
    if (!saved.size) return;
    const selected = [...saved].map(code => byCode.get(code));
    const blob = new Blob([exportBuyerList(selected)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sonny-angel-buyer-list-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    listTransferStatus('Your list has been exported. Keep the JSON file and use Import list to restore it here or on another device.');
  }

  async function uploadBuyerList(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    $('import-buyer-list').disabled = true;
    listTransferStatus('Importing your list…');
    try {
      if (file.size > 512 * 1024) throw new Error('This file is too large for a buyer list. Choose the JSON file exported from My list.');
      const imported = importBuyerList(await file.text(), byCode);
      const merged = mergeBuyerLists(saved, imported.codes);
      saved = new Set(merged.codes);
      persistSaved();
      render();
      const result = [`${merged.added} ${merged.added === 1 ? 'entry' : 'entries'} added`];
      if (merged.existing) result.push(`${merged.existing} already in your list`);
      if (imported.duplicates) result.push(`${imported.duplicates} ${imported.duplicates === 1 ? 'duplicate' : 'duplicates'} skipped`);
      if (imported.unknownCodes.length) result.push(`${imported.unknownCodes.length} unknown ${imported.unknownCodes.length === 1 ? 'code' : 'codes'} skipped`);
      listTransferStatus(result.join(' · ') + '. Your existing choices are kept.');
    } catch (error) {
      listTransferStatus(error.message || 'The file could not be imported. Your current list has not changed.', true);
    } finally { $('import-buyer-list').disabled = false; }
  }

  function toggleSaved(code) {
    if (!byCode.has(code)) return;
    const isSaved = saved.has(code);
    const focusedInList = buyerListDialog.open && document.activeElement?.hasAttribute('data-list-remove');
    const oldCodes = [...saved];
    const nextFocus = oldCodes[oldCodes.indexOf(code) + 1] || oldCodes[oldCodes.indexOf(code) - 1];
    if (isSaved) saved.delete(code); else saved.add(code);
    persistSaved();
    updateSaved();
    if (state.savedOnly) render();
    if (focusedInList) ($('buyer-list-items').querySelector(`[data-save="${nextFocus}"]`) || $('import-buyer-list')).focus();
    notify((isSaved ? `${code} removed from your list.` : `${code} added to your list.`) + (storageAvailable ? '' : ' Export your list to keep it after this visit.'));
  }

  function referenceMarkup(item) {
    const source = priceReferences.get(item.code);
    if (!source) return `<span>No per-figure CAD reference</span>${item.comparisons.length ? '<span class="source-context">Other comparisons in details</span>' : ''}`;
    const amount = `C${money(source.cad)}`;
    return `<strong>${amount} <span>reference</span></strong><span>${esc(marketLabel(source))} ${esc(typeLabel(source))}</span><span class="source-context">${esc(eventLabel(source))}${source.conditionMatch !== 'same' ? ' · condition differs / unconfirmed' : ''}</span>`;
  }

  function compareItems(a, b) {
    if (state.sort.startsWith('price-')) {
      const aSource = priceReferences.get(a.code);
      const bSource = priceReferences.get(b.code);
      if (!aSource || !bSource) return Number(!aSource) - Number(!bSource) || a.code.localeCompare(b.code);
      return (Number(aSource.cad) - Number(bSource.cad)) * (state.sort === 'price-desc' ? -1 : 1) || a.code.localeCompare(b.code);
    }
    return state.sort === 'name' ? a.name.localeCompare(b.name) : state.sort === 'series' ? a.family.localeCompare(b.family) || a.name.localeCompare(b.name) : a.code.localeCompare(b.code);
  }

  function render() {
    const tokens = normalise(state.query).split(/\s+/).filter(Boolean);
    const priceActive = state.priceMin !== null || state.priceMax !== null;
    const negativePrice = (state.priceMin !== null && state.priceMin < 0) || (state.priceMax !== null && state.priceMax < 0);
    const priceRangeInvalid = negativePrice || (state.priceMin !== null && state.priceMax !== null && state.priceMin > state.priceMax);
    const priceControlsActive = state.sort.startsWith('price-') || priceActive || state.reference !== 'all';
    const showReferences = state.references || priceControlsActive;
    filtered = items.filter(item => {
      const categoryMatches = state.category === 'all' || (state.category === 'secret' ? item.secret : state.category === 'custom' ? item.custom : item.category === state.category);
      const source = priceReferences.get(item.code);
      const priceMatches = !priceActive || (source && (state.priceMin === null || Number(source.cad) >= state.priceMin) && (state.priceMax === null || Number(source.cad) <= state.priceMax));
      const referenceMatches = state.reference === 'all' || (state.reference === 'priced' ? !!source : state.reference === 'unpriced' ? !source : source?.type === state.reference);
      const contentsMatch = state.contents === 'all' || (state.contents === 'multiple' ? item.multiple : !item.multiple);
      return !priceRangeInvalid && priceMatches && referenceMatches && contentsMatch && categoryMatches && (state.family === 'all' || item.family === state.family) && (!state.savedOnly || saved.has(item.code)) && tokens.every(token => searchText.get(item.code).includes(token));
    }).sort(compareItems);
    const visible = filtered.slice(0, state.limit);
    const visibleCodes = new Set(visible.map(item => item.code));
    cards.forEach((card, code) => { card.hidden = !visibleCodes.has(code); });
    const fragment = document.createDocumentFragment();
    visible.forEach(item => fragment.append(cards.get(item.code)));
    $('collection-grid').append(fragment);
    const total = filtered.length;
    $('results-count').textContent = `${state.savedOnly ? 'My list · ' : ''}${total} ${total === 1 ? 'entry' : 'entries'}${total && total > visible.length ? ` · showing ${visible.length}` : ''}`;
    $('empty-state').hidden = total !== 0;
    $('empty-title').textContent = priceRangeInvalid ? 'Check the price range.' : state.savedOnly && !saved.size ? 'A little space for your favourites.' : 'No little angels found.';
    $('empty-text').textContent = priceRangeInvalid ? (negativePrice ? 'Prices need to be zero or greater.' : 'The minimum price needs to be no higher than the maximum price.') : state.savedOnly && !saved.size ? 'Tap a heart on any piece to add it to My list. You can export and import your list whenever you like.' : 'Try another name, series or price range, or clear the filters to see everyone.';
    $('load-more-wrap').hidden = !total;
    $('load-more').hidden = visible.length >= total;
    $('visible-summary').textContent = `${visible.length} of ${total} entries shown`;
    $('saved-actions').hidden = !state.savedOnly || !saved.size;
    $('reference-explainer').hidden = !state.references || priceControlsActive;
    $('price-filter-note').hidden = !priceControlsActive;
    $('show-references').checked = showReferences;
    $('show-references').disabled = priceControlsActive;
    $('price-range-error').hidden = !priceRangeInvalid;
    $('price-range-error').textContent = negativePrice ? 'Prices must be zero or greater.' : 'Minimum price must be no higher than maximum price.';
    $('price-min').setAttribute('aria-invalid', String(priceRangeInvalid));
    $('price-max').setAttribute('aria-invalid', String(priceRangeInvalid));
    const extraFilterCount = Number(priceActive) + Number(state.reference !== 'all') + Number(state.contents !== 'all');
    $('extra-filter-count').textContent = extraFilterCount;
    $('extra-filter-count').hidden = !extraFilterCount;
    $('reset').hidden = !state.query && state.category === 'all' && state.family === 'all' && state.sort === 'code' && !extraFilterCount && !state.savedOnly;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.category)));
    document.querySelectorAll('[data-reference]').forEach(el => {
      el.hidden = !showReferences;
      if (showReferences && !el.dataset.ready) { el.innerHTML = referenceMarkup(byCode.get(el.dataset.reference)); el.dataset.ready = 'true'; }
    });
    updateSaved();
  }

  function resetFilters() {
    Object.assign(state, { query: '', category: 'all', family: 'all', sort: 'code', priceMin: null, priceMax: null, reference: 'all', contents: 'all', savedOnly: false, references: false, limit: 48 });
    $('search').value = '';
    $('series-filter').value = 'all';
    $('sort').value = 'code';
    $('price-min').value = '';
    $('price-max').value = '';
    $('reference-filter').value = 'all';
    $('contents-filter').value = 'all';
    render();
  }

  function sourceMarkup(source) {
    const amount = source.cad !== null ? `C${money(source.cad)}` : `${esc(source.currency)} ${esc(source.price)}`;
    const access = source.access === 'observed' ? 'Source read during research' : source.access === 'snippet' ? 'Excerpt only' : 'Link unavailable at final research check';
    const basis = source.basis === 'per-unit' ? 'Per unit' : source.basis === 'entire-lot' ? `Lot of ${source.quantity ?? 'unconfirmed quantity'}` : 'Price basis unconfirmed';
    return `<article class="source-card"><div class="source-head"><span>${esc(marketLabel(source))}<br>${esc(typeLabel(source))}</span><strong>${amount}</strong></div><a class="source-title" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} <span class="arrow-icon" aria-hidden="true"></span></a><dl class="source-facts"><div><dt>Event date</dt><dd>${esc(eventLabel(source))}</dd></div><div><dt>Source market</dt><dd>${esc(source.market)}</dd></div><div><dt>Comparison’s condition</dt><dd>${esc(source.condition || 'Unconfirmed')}</dd></div><div><dt>Price basis</dt><dd>${esc(basis)} · ${esc(source.currency)} ${esc(source.price)}</dd></div><div><dt>Source access</dt><dd>${esc(access)} · ${esc(date(source.accessedAt))}</dd></div><div><dt>Additional costs</dt><dd>Shipping ${esc(source.shipping)} · tax ${esc(source.tax)} · buyer fees ${esc(source.fees)}</dd></div></dl>${source.notes ? `<p class="source-limit">${esc(source.notes)}</p>` : ''}${source.fx ? `<p class="source-fx">CAD conversion: ${esc(source.fx.rate)} on ${esc(date(source.fx.date))}. <a href="${esc(source.fx.url)}" target="_blank" rel="noopener noreferrer">Conversion source <span class="arrow-icon" aria-hidden="true"></span></a></p>` : ''}</article>`;
  }

  function displayItem(code) {
    const item = byCode.get(code);
    if (!item) return;
    if (buyerListDialog.open) buyerListDialog.close();
    currentCode = code;
    const tags = [item.uncertain ? '<span class="card-tag uncertain">Exact edition needs confirmation</span>' : '', item.custom ? '<span class="card-tag">Added outfit / accessories</span>' : '', item.multiple ? '<span class="card-tag">Multiple figures pictured</span>' : ''].join('');
    const relative = filtered.findIndex(entry => entry.code === code);
    const navigation = relative >= 0 ? filtered : items;
    const position = navigation.findIndex(entry => entry.code === code);
    $('item-detail').innerHTML = `<div class="detail-layout"><div class="detail-visual"><img src="./${esc(item.image)}" alt="${esc(item.name)} — collection photograph" width="${item.imageWidth}" height="${item.imageHeight}"><p class="detail-photo-label">${esc(item.code)} · Actual collection photo</p><div class="detail-image-tools"><a href="./${esc(item.image)}" target="_blank" rel="noopener">Open photograph <span class="arrow-icon" aria-hidden="true"></span></a><button class="text-button" type="button" id="copy-item-link">Copy item link <span class="arrow-icon" aria-hidden="true"></span></button></div></div><div class="detail-content"><p class="eyebrow">${esc(item.code)} · ${esc(item.series)}</p><h2 id="detail-title">${esc(item.name)}</h2><div class="detail-flags">${tags}</div><p class="detail-description">${esc(item.description)}</p><div class="packaging-note"><h3>Photographed contents &amp; packaging</h3><p>${esc(item.packaging)}</p></div>${item.uncertain ? '<p class="evidence-intro">The exact edition, generation or configuration needs confirmation. Please use the photograph and item code when asking about this entry.</p>' : ''}<div class="detail-enquire"><button class="saved-link" type="button" data-save="${esc(item.code)}" aria-pressed="false">${heart}<span data-save-label>Save this piece</span></button><button class="text-button" type="button" data-enquire="${esc(item.code)}">Ask about the lot <span class="arrow-icon" aria-hidden="true"></span></button></div><details class="evidence-panel" ${state.references ? 'open' : ''}><summary>Market references <span>(${item.comparisons.length})</span></summary><p class="evidence-intro">These third-party asking prices or reported sales provide research context when considering the collection as a lot. Condition, packaging and dates can differ from this piece.</p>${item.comparisons.length ? item.comparisons.map(sourceMarkup).join('') : '<p class="evidence-intro">No priced comparison is recorded for this entry. The catalogue includes it so the photographed piece remains visible.</p>'}</details></div></div>`;
    $('previous-item').disabled = position <= 0;
    $('next-item').disabled = position >= navigation.length - 1;
    $('detail-position').textContent = `${position + 1} of ${navigation.length}`;
    if (!itemDialog.open) itemDialog.showModal();
    itemDialog.scrollTop = 0;
    updateSaved();
    syncBody();
    $('copy-item-link').addEventListener('click', event => copyText(catalogueUrl(code), event.currentTarget, 'Item link copied'));
  }

  function openItem(code) {
    if (!byCode.has(code)) return;
    const url = new URL(window.location.href);
    url.hash = code;
    history.replaceState(null, '', url);
    displayItem(code);
  }

  function clearItemHash() {
    if (byCode.has(decodeURIComponent(window.location.hash.slice(1)))) {
      const url = new URL(window.location.href);
      url.hash = 'collection';
      history.replaceState(null, '', url);
    }
  }

  function closeItem() { itemDialog.close(); }

  function navigateItem(direction) {
    if (!currentCode) return;
    const navigation = filtered.some(item => item.code === currentCode) ? filtered : items;
    const index = navigation.findIndex(item => item.code === currentCode);
    const next = navigation[index + direction];
    if (next) openItem(next.code);
  }

  function openEnquiry(code) {
    if (data.contactUrl) { window.open(data.contactUrl, '_blank', 'noopener,noreferrer'); return; }
    returnToItem = itemDialog.open ? currentCode : null;
    if (itemDialog.open) itemDialog.close();
    const item = byCode.get(code);
    $('enquiry-text').value = data.enquiryMessage + (item ? `\n\nI’d also like to confirm the details of ${item.code}: ${item.name}.` : '');
    enquiryDialog.showModal();
    syncBody();
  }

  document.addEventListener('click', event => {
    const save = event.target.closest('[data-save]');
    if (save) { event.preventDefault(); toggleSaved(save.dataset.save); return; }
    const open = event.target.closest('[data-open]');
    if (open) { event.preventDefault(); openItem(open.dataset.open); return; }
    const enquire = event.target.closest('[data-enquire]');
    if (enquire) { event.preventDefault(); openEnquiry(enquire.dataset.enquire); }
  });

  $('search').addEventListener('input', event => { state.query = event.target.value; state.limit = 48; render(); });
  $('series-filter').addEventListener('change', event => { state.family = event.target.value; state.limit = 48; render(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; state.limit = 48; render(); });
  ['min', 'max'].forEach(bound => $('price-' + bound).addEventListener('input', event => {
    const value = event.target.valueAsNumber;
    state[bound === 'min' ? 'priceMin' : 'priceMax'] = Number.isFinite(value) ? value : null;
    state.limit = 48;
    render();
  }));
  $('reference-filter').addEventListener('change', event => { state.reference = event.target.value; state.limit = 48; render(); });
  $('contents-filter').addEventListener('change', event => { state.contents = event.target.value; state.limit = 48; render(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.filter; state.limit = 48; render(); }));
  $('show-references').addEventListener('change', event => { state.references = event.target.checked; render(); });
  $('reset').addEventListener('click', resetFilters);
  $('empty-reset').addEventListener('click', resetFilters);
  $('load-more').addEventListener('click', () => { state.limit += 48; render(); });
  $('saved-view').addEventListener('click', openBuyerList);
  $('manage-list').addEventListener('click', openBuyerList);
  $('view-list-catalogue').addEventListener('click', () => {
    buyerListDialog.close();
    resetFilters();
    state.savedOnly = true;
    render();
    $('collection').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  $('copy-saved').addEventListener('click', event => {
    const selected = [...saved].map(code => byCode.get(code));
    const message = `Hi! I’m interested in these pieces from Thomass’s Sonny Angel collection:\n\n${selected.map(item => `${item.code} — ${item.name}`).join('\n')}\n\n${catalogueUrl()}\n\nCould you confirm availability and discuss an offer?`;
    copyText(message, event.currentTarget, 'Buyer list copied — paste it in your message to the seller');
  });
  $('close-buyer-list').addEventListener('click', () => buyerListDialog.close());
  buyerListDialog.addEventListener('close', () => { $('saved-view').setAttribute('aria-expanded', 'false'); syncBody(); });
  $('export-buyer-list').addEventListener('click', downloadBuyerList);
  $('import-buyer-list').addEventListener('click', () => $('buyer-list-file').click());
  $('buyer-list-file').addEventListener('change', uploadBuyerList);
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const stored = JSON.parse(event.newValue || '[]');
      if (!Array.isArray(stored)) return;
      saved = new Set(stored.filter(code => byCode.has(code)));
      render();
    } catch { /* Ignore an invalid update from another tab. */ }
  });
  $('close-item').addEventListener('click', closeItem);
  $('previous-item').addEventListener('click', () => navigateItem(-1));
  $('next-item').addEventListener('click', () => navigateItem(1));
  itemDialog.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,details')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); navigateItem(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigateItem(-1); }
  });
  itemDialog.addEventListener('close', () => { currentCode = null; clearItemHash(); syncBody(); });
  itemDialog.addEventListener('click', event => { if (event.target === itemDialog) { const rect = itemDialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeItem(); } });
  $('close-enquiry').addEventListener('click', () => enquiryDialog.close());
  enquiryDialog.addEventListener('close', () => { syncBody(); if (returnToItem) { const code = returnToItem; returnToItem = null; openItem(code); } });
  $('copy-enquiry').addEventListener('click', event => copyText($('enquiry-text').value, event.currentTarget, 'Enquiry copied — paste it in your message to the seller'));
  $('share-catalogue').addEventListener('click', async event => {
    const button = event.currentTarget;
    if (navigator.share) {
      try { await navigator.share({ title: data.title, text: 'A personal Sonny Angel collection, photographed and catalogued.', url: catalogueUrl() }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    await copyText(catalogueUrl(), button, 'Catalogue link copied');
  });
  window.addEventListener('hashchange', () => {
    const code = decodeURIComponent(window.location.hash.slice(1));
    if (byCode.has(code)) displayItem(code); else if (itemDialog.open) itemDialog.close();
  });
  if (data.askingPriceCAD !== null) {
    const note = document.querySelector('.buying-intro');
    note.textContent = `The full collection is offered at C${money(data.askingPriceCAD)}. Get in touch to confirm the contents and discuss collection or shipping arrangements.`;
  }
  render();
  const initialCode = decodeURIComponent(window.location.hash.slice(1));
  if (byCode.has(initialCode)) displayItem(initialCode);
})();
