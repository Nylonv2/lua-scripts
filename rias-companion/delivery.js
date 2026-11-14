/* Delivery room plan (More → Tools): what's arriving on a shoe delivery and how much room each style needs.
   Photos of the "Delivery Notifications" screen are read by the AI (your own key); the list, the "Room made"
   ticks and your own shoe photos stay on this phone. */
window.createDelivery = function createDelivery(ctx) {
  const { state, save, $ } = ctx;
  state.delivery ||= { items: [], at: 0, done: {}, filter: 'All' };
  const D = state.delivery;
  D.items ||= []; D.done ||= {};
  // Your own shoe photos: small JPEGs, kept apart from the main save so everyday saving stays quick.
  const PKEY = 'rias-delivery-photos';
  let photos = {};
  try { photos = JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch { photos = {}; }
  const keepPhotos = () => { try { localStorage.setItem(PKEY, JSON.stringify(photos)); return true; } catch { return false; } };

  const sum = (list, k) => list.reduce((t, r) => t + (r[k] || 0), 0);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tc = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const num = (v) => { const n = typeof v === 'number' ? v : parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };

  /** What the AI (or a pasted list) gave → clean rows, one per SKU. */
  function toRows(list) {
    const out = [], seen = {};
    if (!Array.isArray(list)) return out;
    for (const o of list) {
      if (!o || typeof o !== 'object') continue;
      const sku = String(o.sku == null ? '' : o.sku).replace(/[^0-9A-Za-z]/g, '').slice(0, 20);
      if (!sku || seen[sku]) continue;
      seen[sku] = 1;
      const a = num(o.arriving), h = num(o.onHand);
      out.push({
        dept: tc(o.dept).slice(0, 40) || 'Other', sku, brand: tc(o.brand).slice(0, 40) || 'Unknown brand', style: tc(o.style).slice(0, 60) || 'Unknown style',
        pattern: String(o.pattern == null ? '' : o.pattern).trim().slice(0, 40) || '—', color: tc(o.color).slice(0, 30) || '—', cat: tc(o.cat).slice(0, 40) || '—',
        arriving: a == null ? 0 : a, onHand: h == null ? 0 : h, check: a == null || h == null,
      });
    }
    return out;
  }
  function adopt(rows) {
    D.items = rows; D.at = Date.now(); D.done = {}; D.filter = 'All';
    save(); render();
  }
  /** A pasted or shared list: a first line "DELIVERY", then "Dept | SKU | Brand | Style | Pattern | Color | Type | arriving | in store". */
  const looksLikeList = (text) => /^\s*delivery\b[^\n|]*\n/i.test(String(text || '')) && /\|/.test(text);
  function importText(text) {
    const rows = toRows(String(text || '').split(/\n+/).slice(1).map((l) => l.split(/\s*\|\s*/)).filter((p) => p.length >= 8).map((p) => ({
      dept: p[0], sku: p[1], brand: p[2], style: p[3], pattern: p[4], color: p[5], cat: p[6], arriving: p[7], onHand: p[8] == null || p[8] === '' ? 0 : p[8],
    })));
    if (!rows.length) return 'I couldn\'t find any delivery rows in that.';
    adopt(rows);
    return `Loaded the delivery: ${rows.length} SKUs, ${sum(rows, 'arriving')} units arriving. It's under More → Delivery room plan.`;
  }

  // ---------- shoe drawings (when there's no photo) ----------
  const UP = {
    sneaker: 'M6 50V31q0-4 4-4h10q4 8 12 10l18 4q8 2 8 9z', low: 'M8 50V37q0-3 3-3h11q4 6 12 7l16 3q7 1 7 6z',
    ankle: 'M10 50V17q0-2 2-2h14q2 0 2 2v15q2 6 10 8l12 3q7 2 7 7z', tall: 'M12 50V6q0-2 2-2h14q2 0 2 2v30q2 4 10 6l10 2q6 2 6 6z',
    clog: 'M6 50V37q0-12 14-12h16q16 2 22 16v9z',
  };
  function shape(r) {
    const s = `${r.cat} ${r.dept} ${r.style}`.toLowerCase();
    if (/clog|sandal/.test(s)) return 'clog';
    if (/tall|over the|knee|western|riding/.test(s)) return 'tall';
    if (/boot|chukka|hiker|lace-up/.test(s)) return 'ankle';
    if (/athletic|perform|sneaker|running|court|slip on|low/.test(s)) return 'sneaker';
    return 'low';
  }
  const HUES = [['black', '#1d1d21'], ['brown', '#6b4226'], ['cognac', '#9a4f24'], ['chestnut', '#8a4a26'], ['tan', '#c9a273'], ['navy', '#1f2f55'], ['wheat', '#d9b36c'], ['grey', '#8f959b'], ['gray', '#8f959b'],
    ['charcoal', '#4a4d55'], ['white', '#f4f4f2'], ['pink', '#f6c6d4'], ['red', '#b3262e'], ['burgundy', '#6e1f2c'], ['blue', '#2f5fb3'], ['green', '#3f7a4d'], ['olive', '#6b6b3a'], ['taupe', '#a39583'],
    ['beige', '#d8c7a8'], ['natural', '#e3d6bd'], ['bone', '#e6dfd0'], ['cream', '#efe6d2'], ['silver', '#bfc3c9'], ['gold', '#c9a544'], ['purple', '#6a4a9c'], ['yellow', '#e3c23d'], ['orange', '#d9772b']];
  const hue = (name) => { const s = String(name).toLowerCase(); const h = HUES.find(([k]) => s.includes(k)); return h ? h[1] : '#999999'; };
  function drawing(r) {
    const k = shape(r), heel = k === 'tall' || k === 'ankle' || k === 'low';
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="dl-up" fill="${hue(r.color)}" d="${UP[k]}"/>`
      + (k === 'clog' ? '<circle class="dl-hole" cx="34" cy="33" r="2"/><circle class="dl-hole" cx="42" cy="36" r="2"/><circle class="dl-hole" cx="48" cy="41" r="2"/><circle class="dl-hole" cx="26" cy="32" r="2"/>' : '')
      + `<path class="dl-sole" d="M5 50h54v3q0 2-2 2H${heel ? '22v5H7' : '7'}q-2 0-2-2z"/></svg>`;
  }

  // ---------- the screen ----------
  function card(r) {
    const c = el('div', `card dl-card${D.done[r.sku] ? ' done' : ''}`);
    c.id = `dl-${r.sku}`;
    const top = el('div', 'dl-top');
    const sw = el('button', `dl-sw${photos[r.sku] ? ' has' : ''}`);
    sw.type = 'button'; sw.dataset.photo = r.sku;
    sw.setAttribute('aria-label', `${photos[r.sku] ? 'View photo of' : 'Add a photo of'} ${r.brand} ${r.style}`);
    if (photos[r.sku]) { const im = el('img'); im.src = photos[r.sku]; im.alt = ''; sw.append(im); }
    else { sw.innerHTML = `${drawing(r)}<span class="dl-plus" aria-hidden="true">+</span>`; }
    const who = el('div', 'dl-who');
    who.append(el('div', 'dl-brand', r.brand), el('div', 'dl-style', r.style), el('div', 'dl-meta', `${r.color} · ${r.cat}`));
    const badge = el('div', `dl-badge${r.arriving >= 6 ? ' big' : ''}`);
    badge.append(el('b', '', String(r.arriving)), el('span', '', 'coming'));
    top.append(sw, who, badge);
    const counts = el('div', 'dl-counts');
    const have = el('span', '', 'Have '); have.append(el('b', '', String(r.onHand)));
    const after = el('span', '', 'After '); after.append(el('b', '', String(r.arriving + r.onHand)));
    counts.append(have, after);
    if (r.check) counts.append(el('span', 'dl-flag', 'Check count'));
    else if (r.onHand === 0) counts.append(el('span', 'dl-flag', 'New, needs a spot'));
    const bot = el('div', 'dl-bot');
    const lab = el('label');
    const box = el('input'); box.type = 'checkbox'; box.dataset.sku = r.sku; box.checked = !!D.done[r.sku];
    lab.append(box, ' Room made');
    const link = el('button', 'btn-text dl-see', 'See photos ↗');
    link.type = 'button'; link.dataset.search = `${r.brand} ${r.style} ${r.color} shoe`.replace(/…/g, '');
    bot.append(lab, link);
    c.append(top, counts, el('div', 'dl-meta', `Pattern ${r.pattern} · SKU ${r.sku}`), bot);
    return c;
  }
  function render() {
    const root = $('#delivery-body');
    if (!root) return;
    const items = D.items;
    $('#delivery-empty').hidden = !!items.length;
    $('#delivery-main').hidden = !items.length;
    $('#delivery-scan').textContent = items.length ? 'Scan a new delivery' : 'Scan a delivery';
    if (!items.length) return;
    const arr = sum(items, 'arriving'), have = sum(items, 'onHand');
    $('#delivery-sub').textContent = `${D.at ? `Scanned ${new Date(D.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. ` : ''}Biggest arrivals first.`;
    const totals = $('#delivery-totals');
    totals.textContent = '';
    for (const [n, label] of [[arr, 'units arriving'], [items.length, 'SKUs'], [have, 'already in store'], [arr + have, 'total after']]) {
      const d = el('div'); d.append(el('b', '', String(n)), el('span', '', label)); totals.append(d);
    }
    // Needs the most room
    const top = $('#delivery-top');
    top.textContent = '';
    for (const r of items.slice().sort((a, b) => b.arriving - a.arriving).slice(0, 5)) {
      const b = el('button', 'row-item dl-go'); b.type = 'button'; b.dataset.go = r.sku;
      const main = el('div', 'ri-main');
      main.append(el('div', 'ri-title', `${r.brand} ${r.style}`), el('div', 'ri-meta', `${r.color} · ${r.dept} · ${r.onHand === 0 ? 'none in store now, needs a new spot' : `${r.onHand} in store, ${r.arriving + r.onHand} after`}`));
      b.append(el('b', 'dl-n', String(r.arriving)), main);
      top.append(b);
    }
    // Departments, biggest first
    const groups = {};
    for (const r of items) (groups[r.dept] ||= []).push(r);
    const order = Object.keys(groups).sort((a, b) => sum(groups[b], 'arriving') - sum(groups[a], 'arriving'));
    if (D.filter !== 'All' && !groups[D.filter]) D.filter = 'All';
    const chips = $('#delivery-chips');
    chips.textContent = '';
    for (const d of ['All', ...order]) {
      const b = el('button', `dl-chip${d === D.filter ? ' active' : ''}`); b.type = 'button'; b.dataset.d = d;
      b.append(`${d} `, el('b', '', String(d === 'All' ? arr : sum(groups[d], 'arriving'))));
      chips.append(b);
    }
    root.textContent = '';
    for (const d of order) {
      if (D.filter !== 'All' && D.filter !== d) continue;
      const g = groups[d].slice().sort((a, b) => b.arriving - a.arriving);
      const h = el('div', 'group-title'); h.append(el('span', '', d), el('span', 'dl-gmeta', `${sum(g, 'arriving')} arriving · ${g.length} SKU${g.length > 1 ? 's' : ''}`));
      const grid = el('div', 'dl-grid');
      for (const r of g) grid.append(card(r));
      root.append(h, grid);
    }
  }

  // ---------- scanning ----------
  const status = (msg, busy) => { const s = $('#delivery-status'); s.hidden = !msg; s.textContent = msg || ''; $('#delivery-scan').disabled = !!busy; };
  const scanFile = $('#delivery-file');
  $('#delivery-scan').addEventListener('click', () => {
    if (!ctx.aiOn()) { status('Reading photos needs her AI. Turn it on in Settings → Rias\'s mind and add your Claude key, then scan again.'); return; }
    scanFile.click();
  });
  scanFile.addEventListener('change', async () => {
    const files = [...(scanFile.files || [])].slice(0, 6);
    scanFile.value = '';
    if (!files.length) return;
    status(`Reading ${files.length} photo${files.length > 1 ? 's' : ''}… this can take a minute.`, true);
    let images;
    try { images = await Promise.all(files.map((f) => ctx.shrink(f, 2000))); } catch { status('One of those files couldn\'t be read as a picture. Try again.'); return; }
    const res = await ctx.readDelivery(images);
    if (res.error) { status(res.error); return; }
    const rows = toRows(res.rows);
    if (!rows.length) { status('No delivery rows were found in those photos. Make sure the SKU Summary table is in the picture and readable.'); return; }
    const bad = rows.filter((r) => r.check).length;
    const yes = !D.items.length || await ctx.ask(`Found ${rows.length} SKUs and ${sum(rows, 'arriving')} units arriving. Replace the current list? This clears the “Room made” ticks; your shoe photos stay.`);
    if (!yes) { status('Nothing was changed.'); return; }
    adopt(rows);
    status(bad ? `${bad} row${bad > 1 ? 's have' : ' has'} a count that couldn't be read. ${bad > 1 ? 'They\'re' : 'It\'s'} marked “Check count”.` : '');
  });

  // ---------- your own shoe photos ----------
  let cur = null;
  const photoFile = $('#delivery-photo-file'), view = $('#delivery-view');
  function openView() {
    const r = D.items.find((x) => x.sku === cur);
    $('#delivery-view-title').textContent = r ? `${r.brand} ${r.style} · ${r.color}` : 'Photo';
    $('#delivery-view-img').src = photos[cur];
    view.showModal();
  }
  photoFile.addEventListener('change', async () => {
    const f = photoFile.files && photoFile.files[0];
    photoFile.value = '';
    if (!f || !cur) return;
    try {
      const b64 = await ctx.shrink(f, 480);
      photos[cur] = `data:image/jpeg;base64,${b64}`;
      if (!keepPhotos()) status('Photo added, but this phone has no room left to remember it.');
      render();
    } catch { status('That file couldn\'t be read as a picture.'); }
  });
  $('#delivery-view-close').addEventListener('click', () => view.close());
  $('#delivery-view-replace').addEventListener('click', () => { view.close(); photoFile.click(); });
  $('#delivery-view-remove').addEventListener('click', () => { delete photos[cur]; keepPhotos(); view.close(); render(); });

  $('#delivery-body').addEventListener('click', (e) => {
    const p = e.target.closest('[data-photo]');
    if (p) { cur = p.dataset.photo; if (photos[cur]) openView(); else photoFile.click(); return; }
    const s = e.target.closest('[data-search]');
    if (s) ctx.openUrl(`https://www.google.com/search?udm=2&q=${encodeURIComponent(s.dataset.search)}`);
  });
  $('#delivery-body').addEventListener('change', (e) => {
    const sku = e.target.dataset && e.target.dataset.sku;
    if (!sku) return;
    if (e.target.checked) D.done[sku] = 1; else delete D.done[sku];
    e.target.closest('.dl-card').classList.toggle('done', e.target.checked);
    save();
  });
  $('#delivery-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.dl-chip');
    if (!b) return;
    D.filter = b.dataset.d; save(); render();
  });
  $('#delivery-top').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (D.filter !== 'All') { D.filter = 'All'; save(); render(); }
    const c = document.getElementById(`dl-${b.dataset.go}`);
    if (!c) return;
    c.scrollIntoView({ block: 'center', behavior: 'smooth' });
    c.classList.add('hit');
    setTimeout(() => c.classList.remove('hit'), 2500);
  });

  /** One line for her AI, so "what's coming on the truck?" works in chat. */
  function summary() {
    if (!D.items.length) return '';
    const big = D.items.slice().sort((a, b) => b.arriving - a.arriving).slice(0, 5);
    const left = D.items.filter((r) => !D.done[r.sku]).length;
    return `Work delivery (shoe store): ${sum(D.items, 'arriving')} units arriving across ${D.items.length} SKUs; room still to make for ${left}. Biggest: ${big.map((r) => `${r.brand} ${r.style} ${r.color} ×${r.arriving}`).join(', ')}.`;
  }

  return { render, looksLikeList, importText, summary, toRows };
};
