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
  try { const stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(code => byCode.has(code))); } catch { /* Browsing remains available when storage is disabled. */ }
  const state = { query: '', category: 'all', family: 'all', sort: 'code', savedOnly: false, references: false, limit: 48 };
  const searchText = new Map(items.map(item => [item.code, normalise([item.code, item.name, item.series, item.family, item.year, item.packaging, item.category].join(' '))]));
  const cards = new Map([...document.querySelectorAll('.collection-card')].map(card => [card.dataset.code, card]));
  const itemDialog = $('item-dialog');
  const enquiryDialog = $('enquiry-dialog');
  let filtered = items;
  let currentCode = null;
  let toastTimer;
  let returnToItem = null;

  const marketLabel = source => source.country === 'Canada' ? 'Canadian' : ['United States', 'United States of America'].includes(source.country) ? 'US' : source.country || 'Market unconfirmed';
  const typeLabel = source => source.type === 'sold' ? 'sold reference' : 'asking reference';
  const eventLabel = source => source.eventDate ? `${source.type === 'sold' ? 'Sold' : 'Listed'} ${date(source.eventDate)}${source.eventDate < '2026-08-10' ? ' · older than three months' : ''}` : `${source.type === 'sold' ? 'Sale' : 'Listing'} date unknown`;
  const syncBody = () => document.body.classList.toggle('modal-open', itemDialog.open || enquiryDialog.open);

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
    document.querySelectorAll('[data-save]').forEach(button => {
      const code = button.dataset.save;
      const isSaved = saved.has(code);
      button.setAttribute('aria-pressed', String(isSaved));
      button.setAttribute('aria-label', `${isSaved ? 'Remove' : 'Save'} ${byCode.get(code).name}${isSaved ? ' from saved items' : ''}`);
      const label = button.querySelector('[data-save-label]');
      if (label) label.textContent = isSaved ? 'Saved' : 'Save this piece';
    });
  }

  function toggleSaved(code) {
    if (!byCode.has(code)) return;
    const isSaved = saved.has(code);
    if (isSaved) saved.delete(code); else saved.add(code);
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch { notify('Saved for this visit. Browser storage is unavailable.'); }
    updateSaved();
    if (state.savedOnly) render();
    notify(isSaved ? `${code} removed from saved items` : `${code} saved to your favourites`);
  }

  function referenceMarkup(item) {
    const source = item.comparisons[0];
    if (!source) return '<span>No priced reference recorded</span>';
    const amount = source.cad !== null ? `C${money(source.cad)}` : `${esc(source.currency)} ${esc(source.price)}`;
    return `<strong>${amount} <span>reference</span></strong><span>${esc(marketLabel(source))} ${esc(typeLabel(source))}</span><span class="source-context">${esc(eventLabel(source))}${source.conditionMatch !== 'same' ? ' · condition differs / unconfirmed' : ''}</span>`;
  }

  function render() {
    const tokens = normalise(state.query).split(/\s+/).filter(Boolean);
    filtered = items.filter(item => {
      const categoryMatches = state.category === 'all' || (state.category === 'secret' ? item.secret : state.category === 'custom' ? item.custom : item.category === state.category);
      return categoryMatches && (state.family === 'all' || item.family === state.family) && (!state.savedOnly || saved.has(item.code)) && tokens.every(token => searchText.get(item.code).includes(token));
    }).sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name) : state.sort === 'series' ? a.family.localeCompare(b.family) || a.name.localeCompare(b.name) : a.code.localeCompare(b.code));
    const visible = filtered.slice(0, state.limit);
    const visibleCodes = new Set(visible.map(item => item.code));
    cards.forEach((card, code) => { card.hidden = !visibleCodes.has(code); });
    const fragment = document.createDocumentFragment();
    visible.forEach(item => fragment.append(cards.get(item.code)));
    $('collection-grid').append(fragment);
    const total = filtered.length;
    $('results-count').textContent = `${state.savedOnly ? 'Saved · ' : ''}${total} ${total === 1 ? 'entry' : 'entries'}${total && total > visible.length ? ` · showing ${visible.length}` : ''}`;
    $('empty-state').hidden = total !== 0;
    $('empty-title').textContent = state.savedOnly && !saved.size ? 'A little space for your favourites.' : 'No little angels found.';
    $('empty-text').textContent = state.savedOnly && !saved.size ? 'Tap a heart on any piece to save it here. Your list stays in this browser.' : 'Try another name or series, or clear the filters to see everyone.';
    $('load-more-wrap').hidden = !total;
    $('load-more').hidden = visible.length >= total;
    $('visible-summary').textContent = `${visible.length} of ${total} entries shown`;
    $('saved-view').setAttribute('aria-pressed', String(state.savedOnly));
    $('saved-actions').hidden = !state.savedOnly || !saved.size;
    $('reference-explainer').hidden = !state.references;
    $('reset').hidden = !state.query && state.category === 'all' && state.family === 'all' && !state.savedOnly;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.category)));
    document.querySelectorAll('[data-reference]').forEach(el => {
      el.hidden = !state.references;
      if (state.references && !el.dataset.ready) { el.innerHTML = referenceMarkup(byCode.get(el.dataset.reference)); el.dataset.ready = 'true'; }
    });
    updateSaved();
  }

  function resetFilters() {
    Object.assign(state, { query: '', category: 'all', family: 'all', savedOnly: false, limit: 48 });
    $('search').value = '';
    $('series-filter').value = 'all';
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
    currentCode = code;
    const tags = [item.uncertain ? '<span class="card-tag uncertain">Exact edition needs confirmation</span>' : '', item.custom ? '<span class="card-tag">Added outfit / accessories</span>' : '', item.multiple ? '<span class="card-tag">Multiple figures pictured</span>' : ''].join('');
    const relative = filtered.findIndex(entry => entry.code === code);
    const navigation = relative >= 0 ? filtered : items;
    const position = navigation.findIndex(entry => entry.code === code);
    $('item-detail').innerHTML = `<div class="detail-layout"><div class="detail-visual"><img src="./${esc(item.image)}" alt="${esc(item.name)} — collection photograph" width="${item.imageWidth}" height="${item.imageHeight}"><p class="detail-photo-label">${esc(item.code)} · Actual collection photo</p><div class="detail-image-tools"><a href="./${esc(item.image)}" target="_blank" rel="noopener">Open photograph <span class="arrow-icon" aria-hidden="true"></span></a><button class="text-button" type="button" id="copy-item-link">Copy item link <span class="arrow-icon" aria-hidden="true"></span></button></div></div><div class="detail-content"><p class="eyebrow">${esc(item.code)} · ${esc(item.series)}</p><h2 id="detail-title">${esc(item.name)}</h2><div class="detail-flags">${tags}</div><p class="detail-description">${esc(item.description)}</p><div class="packaging-note"><h3>Photographed contents &amp; packaging</h3><p>${esc(item.packaging)}</p></div>${item.uncertain ? '<p class="evidence-intro">The exact edition, generation or configuration needs confirmation. Please use the photograph and item code when asking about this entry.</p>' : ''}<div class="detail-enquire"><button class="saved-link" type="button" data-save="${esc(item.code)}" aria-pressed="false">${heart}<span data-save-label>Save this piece</span></button><button class="text-button" type="button" data-enquire="${esc(item.code)}">Ask about the lot <span class="arrow-icon" aria-hidden="true"></span></button></div><details class="evidence-panel" ${state.references ? 'open' : ''}><summary>Market references <span>(${item.comparisons.length})</span></summary><p class="evidence-intro">These are third-party asking prices or reported sales, not prices for buying individual pieces from this collection. This collection is offered as one complete lot. Condition, packaging and dates can differ from this piece.</p>${item.comparisons.length ? item.comparisons.map(sourceMarkup).join('') : '<p class="evidence-intro">No priced comparison is recorded for this entry. The catalogue includes it so the photographed piece remains visible.</p>'}</details></div></div>`;
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
  $('sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.filter; state.limit = 48; render(); }));
  $('show-references').addEventListener('change', event => { state.references = event.target.checked; render(); });
  $('reset').addEventListener('click', resetFilters);
  $('empty-reset').addEventListener('click', resetFilters);
  $('load-more').addEventListener('click', () => { state.limit += 48; render(); });
  $('saved-view').addEventListener('click', () => {
    const nextSaved = !state.savedOnly;
    resetFilters();
    state.savedOnly = nextSaved;
    render();
    $('collection').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  $('copy-saved').addEventListener('click', event => {
    const selected = items.filter(item => saved.has(item.code));
    const message = `Items I’d like to ask about within Thomass’s full-lot Sonny Angel collection:\n\n${selected.map(item => `${item.code} — ${item.name}`).join('\n')}\n\n${catalogueUrl()}\n\nI understand the collection is sold together as one lot; these item codes are for questions about its contents.`;
    copyText(message, event.currentTarget, 'Saved item list copied');
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
