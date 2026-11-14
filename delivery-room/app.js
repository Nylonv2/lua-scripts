/* Delivery Room Plan: photos of a shoe store's "Delivery Notifications" screen → a plan of what needs room.
   Claude reads the photos with your own API key. The list, ticks, photos and key stay on this phone. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const K = { data: 'drp-delivery', photos: 'drp-photos', cfg: 'drp-settings', auto: 'drp-photo-sources' };
  let D = Object.assign({ items: [], at: 0, done: {}, filter: 'All' }, store.get(K.data, {}));
  let photos = store.get(K.photos, {});
  let auto = store.get(K.auto, {});   // sku → the page an AI-found picture came from
  let cfg = Object.assign({ key: '', model: 'claude-opus-5-5' }, store.get(K.cfg, {}));
  const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
  const saveData = () => store.set(K.data, D);

  const sum = (list, k) => list.reduce((t, r) => t + (r[k] || 0), 0);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tc = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const num = (v) => { const n = typeof v === 'number' ? v : parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };

  /** What Claude (or a pasted list) gave → clean rows, one per SKU. */
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
    D = { items: rows, at: Date.now(), done: {}, filter: 'All' };
    findNote = '';
    saveData(); render();
  }
  function parseList(text) {
    return toRows(String(text || '').split(/\n+/).map((l) => l.split(/\s*\|\s*/)).filter((p) => p.length >= 8 && /\d/.test(p[1])).map((p) => ({
      dept: p[0], sku: p[1], brand: p[2], style: p[3], pattern: p[4], color: p[5], cat: p[6], arriving: p[7], onHand: p[8] == null || p[8] === '' ? 0 : p[8],
    })));
  }

  // ---------- shoe drawings ----------
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
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="up" fill="${hue(r.color)}" d="${UP[k]}"/>`
      + (k === 'clog' ? '<circle class="hole" cx="34" cy="33" r="2"/><circle class="hole" cx="42" cy="36" r="2"/><circle class="hole" cx="48" cy="41" r="2"/><circle class="hole" cx="26" cy="32" r="2"/>' : '')
      + `<path class="sole" d="M5 50h54v3q0 2-2 2H${heel ? '22v5H7' : '7'}q-2 0-2-2z"/></svg>`;
  }

  // ---------- the screen ----------
  function card(r) {
    const c = el('div', `card${D.done[r.sku] ? ' done' : ''}`);
    c.id = `card-${r.sku}`;
    const top = el('div', 'top');
    const sw = el('button', `sw${photos[r.sku] ? ' has' : ''}`);
    sw.type = 'button'; sw.dataset.photo = r.sku;
    sw.setAttribute('aria-label', `${photos[r.sku] ? 'View photo of' : 'Add a photo of'} ${r.brand} ${r.style}`);
    if (photos[r.sku]) { const im = el('img'); im.src = photos[r.sku]; im.alt = ''; sw.append(im); if (auto[r.sku]) sw.append(el('span', 'auto', 'AI')); }
    else sw.innerHTML = `${drawing(r)}<span class="plus" aria-hidden="true">+</span>`;
    const who = el('div', 'who');
    who.append(el('div', 'brand', r.brand), el('div', 'style', r.style), el('div', 'meta', `${r.color} · ${r.cat}`));
    const badge = el('div', `badge${r.arriving >= 6 ? ' big' : ''}`);
    badge.append(el('b', '', String(r.arriving)), el('span', '', 'coming'));
    top.append(sw, who, badge);
    const counts = el('div', 'counts');
    const have = el('span', '', 'Have '); have.append(el('b', '', String(r.onHand)));
    const after = el('span', '', 'After '); after.append(el('b', '', String(r.arriving + r.onHand)));
    counts.append(have, after);
    if (r.check) counts.append(el('span', 'new', 'Check count'));
    else if (r.onHand === 0) counts.append(el('span', 'new', 'New, needs a spot'));
    const bot = el('div', 'bot');
    const lab = el('label');
    const box = el('input'); box.type = 'checkbox'; box.dataset.sku = r.sku; box.checked = !!D.done[r.sku];
    lab.append(box, 'Room made');
    const link = el('a', 'photo', 'See photos ↗');
    link.target = '_blank'; link.rel = 'noopener';
    link.href = `https://www.google.com/search?udm=2&q=${encodeURIComponent(`${r.brand} ${r.style} ${r.color} shoe`.replace(/…/g, ''))}`;
    bot.append(lab, link);
    c.append(top, counts, el('div', 'meta', `Pattern ${r.pattern} · SKU ${r.sku}`), bot);
    return c;
  }
  function render() {
    const items = D.items || [];
    $('empty').hidden = !!items.length;
    $('plan').hidden = !items.length;
    $('totals').hidden = !items.length;
    $('scanbtn').textContent = items.length ? 'Scan a new delivery' : 'Scan a delivery';
    renderFind();
    if (!items.length) { $('sub').textContent = 'Scan a delivery to see what needs room.'; return; }
    const arr = sum(items, 'arriving'), have = sum(items, 'onHand');
    $('sub').textContent = `${D.at ? `Scanned ${new Date(D.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. ` : ''}Biggest arrivals first.`;
    const totals = $('totals');
    totals.textContent = '';
    for (const [n, label] of [[arr, 'units arriving'], [items.length, 'SKUs'], [have, 'already in store'], [arr + have, 'total after delivery']]) {
      const d = el('div'); d.append(el('b', '', String(n)), el('span', '', label)); totals.append(d);
    }
    const top = $('top');
    top.textContent = '';
    for (const r of items.slice().sort((a, b) => b.arriving - a.arriving).slice(0, 5)) {
      const li = el('li'), b = el('button', 'go'); b.type = 'button'; b.dataset.go = r.sku;
      const s = el('span'); const name = el('strong', '', `${r.brand} ${r.style}`);
      s.append(name, ` · ${r.color} · ${r.dept}`, el('br'), el('small', '', r.onHand === 0 ? 'None in store now, so it needs a new spot' : `${r.onHand} in store now, ${r.arriving + r.onHand} after delivery`));
      b.append(el('b', '', String(r.arriving)), s); li.append(b); top.append(li);
    }
    const groups = {};
    for (const r of items) (groups[r.dept] ||= []).push(r);
    const order = Object.keys(groups).sort((a, b) => sum(groups[b], 'arriving') - sum(groups[a], 'arriving'));
    if (D.filter !== 'All' && !groups[D.filter]) D.filter = 'All';
    const chips = $('chips');
    chips.textContent = '';
    for (const d of ['All', ...order]) {
      const b = el('button', 'chip'); b.type = 'button'; b.dataset.d = d; b.setAttribute('aria-pressed', String(d === D.filter));
      b.append(`${d} `, el('b', '', String(d === 'All' ? arr : sum(groups[d], 'arriving'))));
      chips.append(b);
    }
    const depts = $('depts');
    depts.textContent = '';
    for (const d of order) {
      if (D.filter !== 'All' && D.filter !== d) continue;
      const g = groups[d].slice().sort((a, b) => b.arriving - a.arriving);
      const sec = el('section', 'dept'), h = el('h2', '', `${d} `);
      h.append(el('small', '', `${sum(g, 'arriving')} arriving · ${g.length} SKU${g.length > 1 ? 's' : ''} · ${sum(g, 'onHand')} in store`));
      const grid = el('div', 'grid');
      for (const r of g) grid.append(card(r));
      sec.append(h, grid); depts.append(sec);
    }
  }

  // ---------- pictures ----------
  /** A picked file → a JPEG data URL no larger than `max` on its long side. */
  function shrink(file, max, q) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
        const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', q));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      im.src = url;
    });
  }
  const say = (m) => { $('pstat').textContent = m; $('pstat').hidden = !m; };
  let cur = null;
  const view = $('view'), fileIn = $('file');
  function openView() {
    const r = D.items.find((x) => x.sku === cur);
    $('vt').textContent = r ? `${r.brand} ${r.style} · ${r.color}` : 'Photo';
    $('vi').src = photos[cur];
    const src = $('vsrc');
    src.hidden = !auto[cur]; src.textContent = '';
    if (auto[cur]) {
      let host = ''; try { host = new URL(auto[cur]).hostname.replace(/^www\./, ''); } catch { host = 'the web'; }
      const a = el('a', '', host); a.href = auto[cur]; a.target = '_blank'; a.rel = 'noopener';
      src.append('Found by AI on ', a, '. Check it\'s the right shoe; replace or remove it if not.');
    }
    view.showModal();
  }
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    if (!f || !cur) return;
    try {
      photos[cur] = await shrink(f, 480, 0.8);
      delete auto[cur]; store.set(K.auto, auto);
      say(store.set(K.photos, photos) ? '' : 'Photo added, but this phone has no room left to remember it.');
      render();
    } catch { say('That file could not be read as a picture.'); }
  });
  $('vcl').addEventListener('click', () => view.close());
  $('vrp').addEventListener('click', () => { view.close(); fileIn.click(); });
  $('vrm').addEventListener('click', () => { delete photos[cur]; delete auto[cur]; store.set(K.photos, photos); store.set(K.auto, auto); view.close(); render(); });

  // ---------- reading the photos with Claude ----------
  const PROMPT = `These images are photos of a shoe store's "Delivery Notifications" screen, on its "SKU Summary" tab. They may be several photos of the same table scrolled to different places, so some rows appear in more than one photo.
The table columns, left to right, are: Department, SKU, Brand, Style, Pattern, Color, Cat., P..., a first Q... column (units arriving), a second Q... column (units already in the store), for Deliv., In Trans., Billed, Label.
Read every row of the table in every photo. A row with the same SKU in more than one photo is one row: include it once. Copy the text exactly as shown. Where text is cut off with "...", keep the visible part and end it with "…". Do not guess or complete cut-off text.
Reply with only a JSON array, one object per row, in this shape:
[{"dept":"WOMENS BOOTS","sku":"304691","brand":"BJORNDAL","style":"EMMETT","pattern":"JYW24-R58…","color":"BROWN","cat":"TALL","arriving":2,"onHand":19}]
"arriving" is the first Q column and "onHand" is the second, as whole numbers. If a number cannot be read, use null. If the images do not show this screen, reply with [].`;
  let client = null, clientKey = '';
  function api() {
    const key = cfg.key.trim();
    if (!window.Anthropic || !key) return null;
    // The key stays on this phone and goes only to Anthropic's API.
    if (!client || clientKey !== key) { client = new window.Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 }); clientKey = key; }
    return client;
  }
  const model = () => (MODELS.includes(cfg.model) ? cfg.model : MODELS[0]);
  const errText = (e) => {
    const s = e && e.status;
    if (e && (e.name === 'APIUserAbortError' || e.name === 'AbortError')) return '';
    return s === 401 ? 'Claude rejected that key. Check it in Settings.' : s === 429 ? 'Claude is busy or you\'ve hit a usage limit. Wait a bit, then try again.'
      : s === 413 ? 'Those photos are too large together. Try fewer photos.' : s === 400 ? 'Claude couldn\'t use one of those photos. Try different or fewer photos.'
        : s >= 500 ? 'Claude is having trouble right now. Try again in a minute.' : 'The photos couldn\'t be read just now. Check your internet and try again.';
  };
  /** JPEG data URLs → rows. Throws { message } to show the person. */
  async function readPhotos(images, signal) {
    const a = api();
    if (!a) throw { message: 'Add your Claude key in Settings first.', needKey: true };
    let res;
    try {
      // Streamed: a long table takes a while, and streaming keeps the connection from timing out.
      res = await a.messages.stream({
        model: model(), max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
        messages: [{ role: 'user', content: [
          ...images.map((d) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d.split(',')[1] } })),
          { type: 'text', text: PROMPT },
        ] }],
      }, { signal, timeout: 180000 }).finalMessage();
    } catch (e) { throw { message: errText(e), needKey: e && e.status === 401, stopped: !errText(e) }; }
    if (res.stop_reason === 'refusal') throw { message: 'Claude declined to read those photos. Try clearer photos of the delivery screen.' };
    if (res.stop_reason === 'max_tokens') throw { message: 'That delivery was too long to read in one go. Scan it in two halves.' };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/\[[\s\S]*\]/);
    let list = null;
    try { list = m ? JSON.parse(m[0]) : null; } catch { list = null; }
    if (!list) throw { message: 'The photos were read but the answer came back garbled. Try again.' };
    return toRows(list);
  }

  // ---------- finding shoe pictures on the web ----------
  // Claude searches the web for each shoe's product page; the app then takes the picture that page names for
  // link previews. In the Android app the phone fetches the page itself; in a browser, sites usually refuse.
  const FIND_PROMPT = (rows) => `Find a product page for each of these shoes, which a US shoe store is receiving on a delivery, so the store team can see what each one looks like.

${rows.map((r) => `- SKU ${r.sku}: brand "${r.brand}", style "${r.style}", color "${r.color}", type "${r.cat}", department "${r.dept}", pattern/vendor number "${r.pattern}"`).join('\n')}

Text ending in "…" was cut off on the store's screen, so the full name is longer; the pattern number is often the manufacturer's style code and is the most reliable thing to search for. Brands such as Lauren Blakwell, Bjorndal, Xappeal, Limelight, Michael by Michael Shannon and Restoration are sold by Rack Room Shoes and Off Broadway Shoes.

For each shoe, search the web and pick up to three pages that each show that exact shoe in that color: prefer rackroomshoes.com, then the brand's own site, then another large retailer. Use a single product's own page, never a search-results or category page. If you can't find a page for the right shoe and color, give an empty list for it rather than a near match.

Finish with only this, and nothing after it: <result>[{"sku":"114716","pages":["https://..."]}]</result> with one entry per SKU listed above.`;
  const searchTool = () => (model() === 'claude-haiku-5-5'
    ? { type: 'web_search_20250305', name: 'web_search', max_uses: 12 }
    : { type: 'web_search_20260209', name: 'web_search', max_uses: 12 });
  /** rows → { sku: [page urls] }. Throws { message } to show the person. */
  async function findPages(rows, signal) {
    const a = api();
    if (!a) throw { message: 'Add your Claude key in Settings first.', needKey: true };
    const messages = [{ role: 'user', content: FIND_PROMPT(rows) }];
    let res;
    try {
      // The search runs on Anthropic's side; a long one can pause, and sending the turn back resumes it.
      for (let i = 0; i < 4; i++) {
        res = await a.messages.stream({
          model: model(), max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
          tools: [searchTool()], messages,
        }, { signal, timeout: 180000 }).finalMessage();
        if (res.stop_reason !== 'pause_turn') break;
        messages.splice(1, messages.length - 1, { role: 'assistant', content: res.content });
      }
    } catch (e) { throw { message: errText(e), needKey: e && e.status === 401, stopped: !errText(e) }; }
    if (res.stop_reason === 'refusal') throw { message: 'Claude declined to look those up.' };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/<result>\s*(\[[\s\S]*?\])\s*<\/result>/);
    let list = null;
    try { list = m ? JSON.parse(m[1]) : null; } catch { list = null; }
    const out = {};
    if (!Array.isArray(list)) return out;
    for (const o of list) {
      if (!o || typeof o !== 'object' || !Array.isArray(o.pages)) continue;
      const sku = String(o.sku || '').replace(/[^0-9A-Za-z]/g, '');
      const pages = o.pages.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 3);
      if (sku && pages.length && rows.some((r) => r.sku === sku)) out[sku] = pages;
    }
    return out;
  }
  /** Product pages → { data, from } for the first page that yields a picture, or null. */
  const waiting = {};
  window.onShoePicture = (id, data, from) => { const done = waiting[id]; delete waiting[id]; if (done) done(data ? { data, from } : null); };
  async function pictureFromPage(url, signal) {
    const html = await (await fetch(url, { signal })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tag = doc.querySelector('meta[property="og:image:secure_url"], meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"], link[rel="image_src"]');
    const src = tag && (tag.getAttribute('content') || tag.getAttribute('href'));
    if (!src) return null;
    const blob = await (await fetch(new URL(src, url).href, { signal })).blob();
    return shrink(blob, 480, 0.8);
  }
  function grabPicture(sku, pages, signal) {
    const N = window.DeliveryNative;
    if (N && N.fetchPicture) {
      return new Promise((resolve) => {
        const id = `${sku}-${Date.now()}`;
        const t = setTimeout(() => { delete waiting[id]; resolve(null); }, 70000);
        waiting[id] = (v) => { clearTimeout(t); resolve(v); };
        N.fetchPicture(id, JSON.stringify(pages));
      });
    }
    return (async () => {
      for (const from of pages) {
        try { const data = await pictureFromPage(from, signal); if (data) return { data, from }; } catch { /* blocked or unreadable: try the next page */ }
      }
      return null;
    })();
  }
  const BATCH = 5;
  let findCtl = null, findNote = '';
  const missing = () => (D.items || []).filter((r) => !photos[r.sku]);
  function renderFind() {
    const box = $('find');
    if (!box) return;
    const left = missing().length, busy = !!findCtl;
    box.hidden = !D.items.length || (!left && !findNote && !busy);
    if (!busy) $('findm').textContent = findNote || `${left} shoe${left === 1 ? ' has' : 's have'} no photo yet. Claude can search the web for each one and save the product picture it finds.`;
    $('findgo').hidden = busy || !left;
    $('findgo').textContent = findNote && left ? 'Try the rest again' : 'Find shoe photos';
    $('findstop').hidden = !busy;
  }
  async function findPhotos() {
    if (findCtl) return;
    if (!cfg.key.trim()) { findNote = 'Finding photos uses your own Claude key. Add it in Settings (the gear, top right), then try again.'; renderFind(); return; }
    const todo = missing();
    if (!todo.length) return;
    findCtl = new AbortController(); findNote = '';
    let found = 0, tried = 0, failed = '';
    renderFind();
    try {
      for (let i = 0; i < todo.length && !findCtl.signal.aborted; i += BATCH) {
        const rows = todo.slice(i, i + BATCH);
        $('findm').textContent = `Looking up shoes ${i + 1}–${Math.min(i + BATCH, todo.length)} of ${todo.length}… found ${found} so far. This takes a while; you can keep using the list.`;
        const pages = await findPages(rows, findCtl.signal);
        const got = await Promise.all(rows.map((r) => (pages[r.sku] ? grabPicture(r.sku, pages[r.sku], findCtl.signal) : null)));
        rows.forEach((r, k) => {
          tried++;
          if (!got[k] || photos[r.sku]) return;   // nothing found, or you added your own meanwhile
          photos[r.sku] = got[k].data; auto[r.sku] = got[k].from; found++;
        });
        if (!store.set(K.photos, photos)) { failed = 'This phone has no room left to keep more photos.'; break; }
        store.set(K.auto, auto);
        render();
      }
    } catch (e) { failed = e && e.stopped ? '' : (e && e.message) || 'The lookup stopped unexpectedly.'; }
    const stopped = findCtl.signal.aborted;
    findCtl = null;
    const left = missing().length;
    findNote = `${stopped ? 'Stopped. ' : ''}Found photos for ${found} of ${tried || todo.length} shoe${(tried || todo.length) === 1 ? '' : 's'}.`
      + (failed ? ` ${failed}` : '')
      + (left && !failed ? ` ${left} still ${left === 1 ? 'has' : 'have'} no photo: the search found no page for the exact shoe, or the site wouldn't share its picture${window.DeliveryNative ? '' : ' (this works best in the Android app)'}. Add ${left === 1 ? 'that one' : 'those'} yourself with the “+”.` : '')
      + (found ? ' Photos marked “AI” came from the web, so check they match.' : '');
    render();
  }
  $('findgo').addEventListener('click', findPhotos);
  $('findstop').addEventListener('click', () => { if (findCtl) findCtl.abort(); });

  // ---------- scan flow ----------
  const MAX_PHOTOS = 8;
  let found = null, ctl = null;
  const scanFile = $('scanfile');
  function scanUI(msg, { use, again, stop, key } = {}) {
    $('scan').hidden = false; $('scanm').textContent = msg;
    $('scanuse').hidden = !use; $('scanagain').hidden = !again; $('scanstop').hidden = !stop; $('scankey').hidden = !key;
    $('scanbtn').disabled = !!stop;
    if (!stop) $('scan').scrollIntoView({ block: 'nearest' });
  }
  function startScan() {
    if (!cfg.key.trim()) { scanUI('Reading photos uses your own Claude key. Add it once in Settings and it stays on this phone.', { key: true }); return; }
    scanFile.click();
  }
  $('scanbtn').addEventListener('click', startScan);
  $('scanagain').addEventListener('click', startScan);
  $('scankey').addEventListener('click', openSettings);
  $('scanstop').addEventListener('click', () => { if (ctl) ctl.abort(); });
  $('scanx').addEventListener('click', () => { if (ctl) ctl.abort(); $('scan').hidden = true; $('scanbtn').disabled = false; });
  scanFile.addEventListener('change', async () => {
    const all = [...(scanFile.files || [])];
    scanFile.value = '';
    if (!all.length) return;
    const files = all.slice(0, MAX_PHOTOS);
    found = null; ctl = new AbortController();
    scanUI(`Reading ${files.length} photo${files.length > 1 ? 's' : ''}${all.length > files.length ? ` (only the first ${MAX_PHOTOS} are used)` : ''}… this can take a minute.`, { stop: true });
    try {
      const images = await Promise.all(files.map((f) => shrink(f, 2000, 0.85)));
      const rows = await readPhotos(images, ctl.signal);
      if (!rows.length) { scanUI('No delivery rows were found in those photos. Make sure the SKU Summary table is in the picture and readable.', { again: true }); return; }
      found = rows;
      const bad = rows.filter((r) => r.check).length;
      scanUI(`Found ${rows.length} SKUs and ${sum(rows, 'arriving')} units arriving.${bad ? ` ${bad} row${bad > 1 ? 's have' : ' has'} a count that couldn't be read and will be marked “Check count”.` : ''}`
        + (D.items.length ? ' Using it replaces the current list and clears the “Room made” ticks. Shoe photos you added stay.' : ''), { use: true, again: true });
    } catch (e) {
      if (e && e.stopped) scanUI('Stopped. Nothing was changed.', { again: true });
      else scanUI((e && e.message) || 'One of those files couldn\'t be read as a picture.', { again: !(e && e.needKey), key: !!(e && e.needKey) });
    }
  });
  $('scanuse').addEventListener('click', () => {
    if (!found) return;
    adopt(found); found = null;
    $('scan').hidden = true;
    window.scrollTo(0, 0);
  });

  // ---------- list interactions ----------
  $('depts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-photo]');
    if (!b) return;
    cur = b.dataset.photo;
    if (photos[cur]) openView(); else fileIn.click();
  });
  $('depts').addEventListener('change', (e) => {
    const sku = e.target.dataset && e.target.dataset.sku;
    if (!sku) return;
    if (e.target.checked) D.done[sku] = 1; else delete D.done[sku];
    e.target.closest('.card').classList.toggle('done', e.target.checked);
    saveData();
  });
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    D.filter = b.dataset.d; saveData(); render();
  });
  $('top').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (D.filter !== 'All') { D.filter = 'All'; saveData(); render(); }
    const c = $(`card-${b.dataset.go}`);
    if (!c) return;
    const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    c.classList.add('hit');
    setTimeout(() => c.classList.remove('hit'), 2500);
  });

  // ---------- settings ----------
  const settings = $('settings');
  function openSettings() {
    $('key').value = cfg.key; $('model').value = model();
    $('keymsg').textContent = '';
    $('wipe').hidden = !D.items.length;
    settings.showModal();
  }
  const keepSettings = () => { cfg.key = $('key').value.trim(); cfg.model = $('model').value; store.set(K.cfg, cfg); };
  $('setbtn').addEventListener('click', openSettings);
  $('setsave').addEventListener('click', () => settings.close());
  // Closing saves; the "add your key" prompt goes away once there is one.
  settings.addEventListener('close', () => { keepSettings(); if (cfg.key && !$('scankey').hidden) $('scan').hidden = true; });
  $('keytest').addEventListener('click', async () => {
    keepSettings();
    const a = api();
    if (!a) { $('keymsg').textContent = 'Paste your key first.'; return; }
    $('keymsg').textContent = 'Checking…';
    try {
      await a.messages.create({ model: model(), max_tokens: 16, messages: [{ role: 'user', content: 'Reply with OK.' }] });
      $('keymsg').textContent = 'The key works ✓';
    } catch (e) { $('keymsg').textContent = errText(e) || 'Stopped.'; }
  });
  // ---------- paste a list ----------
  const pasteDlg = $('pastedlg'), textFile = $('textfile');
  const pasteMsg = (m) => { $('pastemsg').textContent = m; $('pastemsg').hidden = !m; };
  function openPaste(text) {
    if (typeof text === 'string') $('paste').value = text;
    pasteMsg('');
    if (!pasteDlg.open) pasteDlg.showModal();
  }
  $('pastebtn').addEventListener('click', () => openPaste());
  $('pastex').addEventListener('click', () => pasteDlg.close());
  $('pasteclip').addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { $('paste').value = t; pasteMsg(''); } else pasteMsg('The clipboard is empty.'); }
    catch { pasteMsg('This phone won\'t let the app read the clipboard. Long-press in the box and choose Paste.'); }
  });
  $('pastefile').addEventListener('click', () => textFile.click());
  textFile.addEventListener('change', async () => {
    const f = textFile.files && textFile.files[0];
    textFile.value = '';
    if (!f) return;
    try { $('paste').value = await f.text(); pasteMsg(''); } catch { pasteMsg('That file couldn\'t be read.'); }
  });
  $('pastego').addEventListener('click', () => {
    const rows = parseList($('paste').value);
    if (!rows.length) { pasteMsg('No shoes found in that. Each line needs: Dept | SKU | Brand | Style | Pattern | Color | Type | arriving | in store.'); return; }
    if (D.items.length && !window.confirm(`Replace the current list with these ${rows.length} SKUs? This clears the “Room made” ticks; shoe photos stay.`)) return;
    adopt(rows); $('paste').value = ''; pasteDlg.close(); window.scrollTo(0, 0);
  });
  // A list shared to the app, or a text file opened with it (Android), lands in the paste box to check and load.
  window.receiveDeliveryText = (text) => openPaste(String(text || ''));
  $('wipe').addEventListener('click', () => {
    if (!window.confirm('Clear the delivery list and the “Room made” ticks? Your shoe photos and key stay.')) return;
    D = { items: [], at: 0, done: {}, filter: 'All' }; saveData(); render(); settings.close();
  });

  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.DeliveryRoom = { parseList, toRows };
  renderFind();
})();
