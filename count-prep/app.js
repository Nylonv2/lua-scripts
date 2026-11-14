/* Count Prep: a checklist to get a shoe store ready for physical inventory, and a Jibbitz counter.
   Jibbitz can be counted by tapping + or from photos, which Claude reads with your own API key.
   Everything stays on this phone. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const K = { prep: 'cp-prep', jib: 'cp-jib', cfg: 'cp-settings', tab: 'cp-tab' };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const num = (v) => { const n = typeof v === 'number' ? v : parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(99999, Math.round(n)) : null; };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;

  // ---------- prep checklist ----------
  const STARTER = [
    ['Sales floor', ['Size runs in order on every wall', 'Each display shoe matches the boxes under it', 'Mixed pairs and shoes in the wrong box fixed',
      'Try-on shoes and boxes from the fitting area put back', 'Tables, endcaps and clearance racks straightened']],
    ['Backroom', ['Boxes faced with labels out', 'Every SKU in one spot (no strays on the wrong row)', 'Damaged and defective pairs pulled and set aside',
      'Open delivery cartons worked or set aside and labeled', 'Empty boxes, tissue and trash cleared out']],
    ['Accessories', ['Socks, insoles and shoe care straightened on their pegs', 'Jibbitz sorted so each peg holds one design', 'Loose Jibbitz bagged or set aside', 'Jibbitz counted (Jibbitz tab)']],
    ['Paperwork', ['Transfers out and returns to vendor finished', 'Customer holds and online orders set aside and labeled', 'Recounts from last time looked at']],
  ];
  const starter = () => ({ areas: STARTER.map(([name, tasks]) => ({ id: uid(), name, tasks: tasks.map((text) => ({ id: uid(), text, done: false })) })) });
  let P = store.get(K.prep, null);
  if (!P || !Array.isArray(P.areas)) P = starter();
  const saveP = () => store.set(K.prep, P);

  function renderPrep() {
    const all = P.areas.flatMap((a) => a.tasks), done = all.filter((t) => t.done).length;
    $('prepn').textContent = `${done} of ${all.length} done`;
    $('prepbar').style.width = all.length ? `${Math.round((done / all.length) * 100)}%` : '0';
    const box = $('areas');
    box.textContent = '';
    for (const a of P.areas) {
      const p = el('section', 'panel'); p.dataset.area = a.id;
      const h = el('div', 'sec-h'), h2 = el('h2', '', a.name);
      h2.append(el('small', '', `${a.tasks.filter((t) => t.done).length}/${a.tasks.length}`));
      const rm = el('button', 'x', '×'); rm.type = 'button'; rm.dataset.rmarea = a.id; rm.setAttribute('aria-label', `Remove the ${a.name} area`);
      h.append(h2, rm); p.append(h);
      const ul = el('ul', 'tasks');
      for (const t of a.tasks) {
        const li = el('li', t.done ? 'done' : ''), lab = el('label'), cb = el('input');
        cb.type = 'checkbox'; cb.checked = t.done; cb.dataset.task = t.id;
        lab.append(cb, el('span', '', t.text));
        const x = el('button', 'x', '×'); x.type = 'button'; x.dataset.rmtask = t.id; x.setAttribute('aria-label', `Remove “${t.text}”`);
        li.append(lab, x); ul.append(li);
      }
      p.append(ul);
      const add = el('div', 'add'), inp = el('input'), b = el('button', 'btn', 'Add');
      inp.placeholder = 'Add a job…'; inp.dataset.addto = a.id; inp.enterKeyHint = 'done'; b.type = 'button'; b.dataset.addbtn = a.id;
      add.append(inp, b); p.append(add);
      box.append(p);
    }
  }
  const findTask = (id) => { for (const a of P.areas) { const t = a.tasks.find((x) => x.id === id); if (t) return [a, t]; } return []; };
  function addTask(areaId) {
    const inp = document.querySelector(`input[data-addto="${areaId}"]`), a = P.areas.find((x) => x.id === areaId);
    const text = inp && inp.value.trim();
    if (!a || !text) return;
    a.tasks.push({ id: uid(), text: text.slice(0, 160), done: false }); saveP(); render();
    const again = document.querySelector(`input[data-addto="${areaId}"]`); if (again) again.focus();
  }
  $('areas').addEventListener('change', (e) => {
    const id = e.target.dataset.task; if (!id) return;
    const [, t] = findTask(id); if (!t) return;
    t.done = e.target.checked; saveP(); render();
  });
  $('areas').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.addbtn) addTask(b.dataset.addbtn);
    if (b.dataset.rmtask) { const [a, t] = findTask(b.dataset.rmtask); if (a) { a.tasks = a.tasks.filter((x) => x !== t); saveP(); render(); } }
    if (b.dataset.rmarea) {
      const a = P.areas.find((x) => x.id === b.dataset.rmarea);
      if (a && (!a.tasks.length || window.confirm(`Remove the “${a.name}” area and its ${plural(a.tasks.length, 'job')}?`))) { P.areas = P.areas.filter((x) => x !== a); saveP(); render(); }
    }
  });
  $('areas').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.addto) addTask(e.target.dataset.addto); });
  function addArea() {
    const name = $('newarea').value.trim(); if (!name) return;
    P.areas.push({ id: uid(), name: name.slice(0, 60), tasks: [] }); $('newarea').value = ''; saveP(); render();
    const inp = document.querySelector(`input[data-addto="${P.areas[P.areas.length - 1].id}"]`); if (inp) inp.focus();
  }
  $('addarea').addEventListener('click', addArea);
  $('newarea').addEventListener('keydown', (e) => { if (e.key === 'Enter') addArea(); });
  $('untick').addEventListener('click', () => {
    if (!window.confirm('Untick every job, ready for the next inventory? Your list stays as it is.')) return;
    for (const a of P.areas) for (const t of a.tasks) t.done = false; saveP(); render();
  });
  $('restore').addEventListener('click', () => {
    if (!window.confirm('Put the starter list back? Jobs you added and ticks are lost.')) return;
    P = starter(); saveP(); render();
  });

  // ---------- jibbitz count ----------
  // J.secs: [{ id, name, done, items: [{ name, n, unsure }] }]. Same design within a section = one line.
  let J = Object.assign({ secs: [], expect: null }, store.get(K.jib, {}));
  if (!Array.isArray(J.secs)) J.secs = [];
  const saveJ = () => store.set(K.jib, J);
  const secTotal = (s) => s.items.reduce((t, i) => t + i.n, 0);
  const jibTotal = () => J.secs.reduce((t, s) => t + secTotal(s), 0);
  function designs() {
    const m = new Map();
    for (const s of J.secs) for (const i of s.items) {
      const k = norm(i.name), d = m.get(k) || { name: i.name, n: 0 };
      d.n += i.n; m.set(k, d);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Adds counts into a section, joining lines for the same design. */
  function addItems(sec, list) {
    for (const f of list) {
      const name = String(f.name || '').trim().slice(0, 80), n = num(f.n);
      if (!name || n == null) continue;
      const have = sec.items.find((i) => norm(i.name) === norm(name));
      if (have) { have.n += n; have.unsure = have.unsure || !!f.unsure; } else sec.items.push({ name, n, unsure: !!f.unsure });
    }
  }
  function renderJib() {
    const secs = $('secs');
    secs.textContent = '';
    $('jibempty').hidden = !!J.secs.length;
    for (const s of J.secs) {
      const p = el('section', `panel sec${s.done ? ' counted' : ''}`); p.dataset.sec = s.id; p.id = `sec-${s.id}`;
      const h = el('div', 'sec-h'), h2 = el('h2', '', s.name);
      h2.append(el('small', '', plural(s.items.length, 'design')));
      h.append(h2, el('span', 'big', String(secTotal(s))));
      p.append(h);
      if (s.items.length) {
        const ul = el('ul', 'items');
        s.items.forEach((i, k) => {
          const li = el('li'), nm = el('span', 'nm', i.name);
          if (i.unsure) { const u = el('button', 'unsure', 'check'); u.type = 'button'; u.title = 'Claude wasn\'t sure of this count. Tap once you\'ve checked it.'; u.dataset.sure = k; nm.append(u); }
          const st = el('div', 'step'), dn = el('button', '', '−'), inp = el('input'), up = el('button', 'up', '+');
          dn.type = 'button'; dn.dataset.dn = k; dn.setAttribute('aria-label', `One less ${i.name}`);
          up.type = 'button'; up.dataset.up = k; up.setAttribute('aria-label', `One more ${i.name}`);
          inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '0'; inp.value = String(i.n); inp.dataset.set = k; inp.setAttribute('aria-label', `${i.name} count`);
          st.append(dn, inp, up); li.append(nm, st); ul.append(li);
        });
        p.append(ul);
      }
      const add = el('div', 'add'), inp = el('input'), b = el('button', 'btn', 'Add');
      inp.placeholder = 'Add a design by name…'; inp.dataset.newitem = s.id; inp.setAttribute('list', 'names'); inp.enterKeyHint = 'done';
      b.type = 'button'; b.dataset.additem = s.id;
      add.append(inp, b); p.append(add);
      const acts = el('div', 'acts'), ph = el('button', 'btn pri', 'Count with photos'), rm = el('button', 'btn danger', 'Remove');
      ph.type = 'button'; ph.dataset.photo = s.id; rm.type = 'button'; rm.dataset.rmsec = s.id;
      const lab = el('label', 'donebox'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!s.done; cb.dataset.done = s.id;
      lab.append(cb, 'Counted');
      acts.append(lab, ph, rm); acts.style.alignItems = 'center'; p.append(acts);
      secs.append(p);
    }
    const ds = designs(), list = $('names');
    list.textContent = '';
    for (const d of ds) { const o = el('option'); o.value = d.name; list.append(o); }
    $('all').hidden = !ds.length;
    $('allt').textContent = `All designs across sections (${ds.length})`;
    const al = $('alllist'); al.textContent = '';
    for (const d of ds) { const li = el('li'); li.append(el('span', '', d.name), el('b', '', String(d.n))); al.append(li); }
    $('expect').value = J.expect == null ? '' : String(J.expect);
    const diff = $('diff'), tot = jibTotal();
    diff.className = 'foot';
    if (J.expect == null) diff.textContent = 'Enter the on-hand number from the store\'s report to see how far off the count is.';
    else {
      const d = tot - J.expect;
      diff.className = `diff ${d < 0 ? 'short' : d > 0 ? 'over' : 'even'}`;
      diff.textContent = d === 0 ? `Counted ${tot}: matches the system.` : `Counted ${tot}, system says ${J.expect}: ${Math.abs(d)} ${d < 0 ? 'short' : 'over'}.`
        + (J.secs.some((s) => !s.done) ? ' Some sections aren\'t ticked as counted yet.' : '');
    }
    $('share').disabled = !tot; $('clearjib').disabled = !J.secs.length;
  }
  const secOf = (id) => J.secs.find((s) => s.id === id);
  const secFor = (e) => secOf((e.target.closest('[data-sec]') || {}).dataset?.sec);
  function addNamed(secId) {
    const s = secOf(secId), inp = document.querySelector(`input[data-newitem="${secId}"]`);
    const name = inp && inp.value.trim();
    if (!s || !name) return;
    addItems(s, [{ name, n: 1 }]); saveJ(); render();
    const again = document.querySelector(`input[data-newitem="${secId}"]`); if (again) again.focus();
  }
  $('secs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const s = secFor(e); if (!s) return;
    if (b.dataset.up != null) { s.items[b.dataset.up].n++; }
    else if (b.dataset.dn != null) { const i = s.items[b.dataset.dn]; if (i.n > 0) i.n--; else if (window.confirm(`Take “${i.name}” off this section?`)) s.items.splice(+b.dataset.dn, 1); }
    else if (b.dataset.sure != null) { s.items[b.dataset.sure].unsure = false; }
    else if (b.dataset.additem) { addNamed(s.id); return; }
    else if (b.dataset.photo) { openPC(s.id); return; }
    else if (b.dataset.rmsec) { if (!s.items.length || window.confirm(`Remove “${s.name}” and its count of ${secTotal(s)}?`)) J.secs = J.secs.filter((x) => x !== s); }
    else return;
    if (navigator.vibrate && (b.dataset.up != null)) navigator.vibrate(12);
    saveJ(); render();
  });
  $('secs').addEventListener('change', (e) => {
    const s = secFor(e); if (!s) return;
    if (e.target.dataset.set != null) { const n = num(e.target.value); if (n != null) s.items[e.target.dataset.set].n = n; }
    else if (e.target.dataset.done) s.done = e.target.checked;
    else return;
    saveJ(); render();
  });
  $('secs').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.newitem) addNamed(e.target.dataset.newitem); });
  function addSec() {
    const name = $('newsec').value.trim(); if (!name) return;
    J.secs.push({ id: uid(), name: name.slice(0, 60), done: false, items: [] }); $('newsec').value = ''; saveJ(); render();
  }
  $('addsec').addEventListener('click', addSec);
  $('newsec').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSec(); });
  $('expect').addEventListener('change', () => { J.expect = $('expect').value.trim() === '' ? null : num($('expect').value); saveJ(); render(); });
  $('clearjib').addEventListener('click', () => {
    if (!window.confirm(`Clear the whole Jibbitz count (${jibTotal()} counted in ${plural(J.secs.length, 'section')})?`)) return;
    J.secs.forEach((s) => { s.items = []; s.done = false; });
    if (window.confirm('Remove the sections too? Choose Cancel to keep them, empty, for the next count.')) J.secs = [];
    J.expect = null; saveJ(); render();
  });
  // Share: the count as plain text to copy into a text or email (nothing is sent by the app).
  function countText() {
    const day = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const lines = [`Jibbitz count, ${day}`, ''];
    for (const s of J.secs) {
      lines.push(`${s.name}: ${secTotal(s)}${s.done ? '' : ' (not finished)'}`);
      for (const i of s.items) lines.push(`  ${i.name}: ${i.n}${i.unsure ? ' (check)' : ''}`);
    }
    lines.push('', `Total: ${jibTotal()}`);
    if (J.expect != null) { const d = jibTotal() - J.expect; lines.push(`System: ${J.expect} (${d === 0 ? 'matches' : `${Math.abs(d)} ${d < 0 ? 'short' : 'over'}`})`); }
    return lines.join('\n');
  }
  const shareDlg = $('sharedlg');
  $('share').addEventListener('click', () => { $('sharetext').value = countText(); $('sharemsg').textContent = ''; shareDlg.showModal(); });
  $('sharex').addEventListener('click', () => shareDlg.close());
  $('sharecopy').addEventListener('click', async () => {
    const t = $('sharetext');
    try { await navigator.clipboard.writeText(t.value); $('sharemsg').textContent = 'Copied.'; }
    catch { t.focus(); t.select(); try { document.execCommand('copy'); $('sharemsg').textContent = 'Copied.'; } catch { $('sharemsg').textContent = 'Select the text and copy it.'; } }
  });

  // ---------- counting from photos ----------
  let cfg = Object.assign({ key: '', model: 'claude-opus-5-5' }, store.get(K.cfg, {}));
  const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
  const model = () => (MODELS.includes(cfg.model) ? cfg.model : MODELS[0]);
  let client = null, clientKey = '';
  function api() {
    const key = cfg.key.trim();
    if (!window.Anthropic || !key) return null;
    // The key stays on this phone and goes only to Anthropic's API.
    if (!client || clientKey !== key) { client = new window.Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 }); clientKey = key; }
    return client;
  }
  const errText = (e) => {
    const s = e && e.status;
    if (e && (e.name === 'APIUserAbortError' || e.name === 'AbortError')) return '';
    return s === 401 ? 'Claude rejected that key. Check it in Settings.' : s === 429 ? 'Claude is busy or you\'ve hit a usage limit. Wait a bit, then try again.'
      : s === 413 ? 'Those photos are too large together. Try fewer photos.' : s === 400 ? 'Claude couldn\'t use one of those photos. Try different or fewer photos.'
        : s >= 500 ? 'Claude is having trouble right now. Try again in a minute.' : 'The photos couldn\'t be counted just now. Check your internet and try again.';
  };
  const PROMPT = (known) => `These photos show Crocs Jibbitz shoe charms in a shoe store, set out to be counted for inventory. Count them.

Count packages: each sealed Jibbitz package (a single charm or a multi-pack on its card) counts as 1. A charm that is not in a package counts as 1 loose charm.
Group identical packages together: same charm or charms in the same packaging. Name each group by the name printed on the package when you can read it; otherwise describe it in a few words people would recognise (for example "Pink frosted donut" or "Mario 5-pack"). Add "(loose)" to the name of loose charms.
${known.length ? `Designs already counted in this store, for matching names (use the same name when it is the same design): ${known.slice(0, 150).map((n) => `"${n}"`).join(', ')}.\n` : ''}If the photos overlap and the same package clearly shows in more than one photo, count it once. Count only what you can see; don't guess at packages hidden behind others.
Mark a group "sure": false when its packages overlap, are cut off at the edge of the photo, or are hard to tell apart from another design.

Answer with only a JSON array, nothing else: [{"name": "Pink frosted donut", "count": 4, "pack": 1, "sure": true}] where "pack" is the number of charms in one package if you can tell, else null.`;
  async function countPhotos(images, signal) {
    const a = api();
    if (!a) throw { message: 'Add your Claude key in Settings first.', needKey: true };
    let res;
    try {
      res = await a.messages.stream({
        model: model(), max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'high' },
        messages: [{ role: 'user', content: [
          ...images.map((d) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d.split(',')[1] } })),
          { type: 'text', text: PROMPT(designs().map((d) => d.name)) },
        ] }],
      }, { signal, timeout: 180000 }).finalMessage();
    } catch (e) { throw { message: errText(e), needKey: e && e.status === 401, stopped: !errText(e) }; }
    if (res.stop_reason === 'refusal') throw { message: 'Claude declined to count those photos. Try clearer photos of the charms.' };
    if (res.stop_reason === 'max_tokens') throw { message: 'That was too much to count in one go. Try fewer photos at a time.' };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/\[[\s\S]*\]/);
    let list = null;
    try { list = m ? JSON.parse(m[0]) : null; } catch { list = null; }
    if (!Array.isArray(list)) throw { message: 'The photos were read but the answer came back garbled. Try again.' };
    const out = [];
    for (const o of list) {
      if (!o || typeof o !== 'object') continue;
      let name = String(o.name || '').trim().slice(0, 70);
      const n = num(o.count), pack = num(o.pack);
      if (!name || !n) continue;
      if (pack > 1 && !/pack/i.test(name)) name += ` (${pack}-pack)`;
      out.push({ name, n, unsure: o.sure === false });
    }
    // Claude may list the same design twice; join them.
    const joined = [];
    for (const f of out) { const h = joined.find((x) => norm(x.name) === norm(f.name)); if (h) { h.n += f.n; h.unsure = h.unsure || f.unsure; } else joined.push(f); }
    return joined;
  }
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
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i += 7) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return `${s.length}:${h}`; };
  const MAXPICS = 8;
  // pc: the photo count in progress, for one section.
  let pc = null;
  function openPC(secId) {
    if (pc && pc.ctl) return;
    pc = { sec: secId, imgs: [], found: null, msg: '', ctl: null, err: false };
    renderPC();
    $('pc').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closePC() { if (pc && pc.ctl) pc.ctl.abort(); pc = null; renderPC(); }
  function renderPC() {
    const box = $('pc');
    box.hidden = !pc;
    if (!pc) return;
    const s = secOf(pc.sec);
    if (!s) { pc = null; box.hidden = true; return; }
    const busy = !!pc.ctl, n = pc.imgs.length, found = pc.found;
    $('pct').textContent = `Count ${s.name} with photos`;
    $('pctip').hidden = !!found;
    const m = $('pcm');
    m.className = pc.err ? 'err' : '';
    m.textContent = pc.msg || (found ? (found.length ? `Found ${found.reduce((t, f) => t + f.n, 0)} in ${plural(found.length, 'design')}. Fix any names or numbers, then add them to ${s.name}.` : 'No Jibbitz found in those photos.')
      : n ? `${plural(n, 'photo')} ready. Add more of the same section if it didn't fit in one, or count them now.` : 'Take a photo, or choose ones you already took. Up to 8 at a time.');
    const th = $('pcthumbs'); th.textContent = ''; th.hidden = !n || !!found;
    pc.imgs.forEach((d, k) => {
      const b = el('button', 'thumb'); b.type = 'button'; b.dataset.k = k; b.setAttribute('aria-label', `Take out photo ${k + 1}`);
      const im = el('img'); im.src = d; im.alt = ''; b.append(im, el('span', '', '×')); th.append(b);
    });
    $('pcpick').hidden = busy || !!found || n >= MAXPICS;
    $('pccam').textContent = n ? 'Take another' : 'Take a photo';
    $('pcgo').hidden = busy || !!found || !n;
    $('pcstop').hidden = !busy;
    $('pcagain').hidden = busy || !found;
    $('pcadd').hidden = busy || !found || !found.length;
    $('pcadd').textContent = `Add to ${s.name}`;
    $('pckey').hidden = !pc.needKey;
    const ul = $('pcfound'); ul.textContent = ''; ul.hidden = !found || !found.length;
    (found || []).forEach((f, k) => {
      const li = el('li', f.unsure ? 'unsure-row' : ''), nm = el('input'), c = el('input');
      nm.type = 'text'; nm.value = f.name; nm.dataset.fname = k; nm.setAttribute('list', 'names'); nm.setAttribute('aria-label', 'Design name');
      c.type = 'number'; c.inputMode = 'numeric'; c.min = '0'; c.value = String(f.n); c.dataset.fn = k; c.setAttribute('aria-label', 'How many');
      li.append(nm, c);
      if (f.unsure) li.append(el('span', 'unsure', 'check'));
      ul.append(li);
    });
  }
  async function takeFiles(files) {
    if (!pc) return;
    let dup = 0, bad = 0;
    for (const f of files) {
      if (pc.imgs.length >= MAXPICS) break;
      try {
        const d = await shrink(f, 1600, 0.85), h = hash(d);
        if (pc.imgs.some((x) => hash(x) === h)) { dup++; continue; }
        pc.imgs.push(d);
      } catch { bad++; }
    }
    pc.err = !!bad; pc.msg = bad ? `${plural(bad, 'file')} couldn't be read as a picture.` : dup ? `That photo was already added, so it was left out.` : '';
    renderPC();
  }
  $('pccam').addEventListener('click', () => $('camin').click());
  $('pcfiles').addEventListener('click', () => $('filein').click());
  for (const id of ['camin', 'filein']) $(id).addEventListener('change', async (e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) await takeFiles(fs); });
  $('pcthumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b || !pc) return; pc.imgs.splice(+b.dataset.k, 1); pc.msg = ''; renderPC(); });
  $('pcgo').addEventListener('click', async () => {
    if (!pc || !pc.imgs.length || pc.ctl) return;
    if (!cfg.key.trim()) { pc.msg = 'Counting from photos uses your own Claude key. Add it in Settings, then try again. (Tapping + works without one.)'; pc.err = true; pc.needKey = true; renderPC(); return; }
    const me = pc;
    me.ctl = new AbortController(); me.msg = `Counting ${plural(me.imgs.length, 'photo')}… this can take a minute.`; me.err = false; me.needKey = false;
    renderPC();
    try { me.found = await countPhotos(me.imgs, me.ctl.signal); me.msg = ''; }
    catch (e) { me.msg = e.stopped ? 'Stopped.' : e.message; me.err = !e.stopped; me.needKey = !!e.needKey; }
    me.ctl = null;
    if (pc === me) renderPC();
  });
  $('pcstop').addEventListener('click', () => { if (pc && pc.ctl) pc.ctl.abort(); });
  $('pcagain').addEventListener('click', () => { if (!pc) return; pc.found = null; pc.msg = ''; renderPC(); });
  $('pcx').addEventListener('click', closePC);
  $('pckey').addEventListener('click', openSettings);
  $('pcfound').addEventListener('change', (e) => {
    if (!pc || !pc.found) return;
    if (e.target.dataset.fname != null) pc.found[e.target.dataset.fname].name = e.target.value;
    if (e.target.dataset.fn != null) { const n = num(e.target.value); pc.found[e.target.dataset.fn].n = n == null ? 0 : n; }
  });
  $('pcadd').addEventListener('click', () => {
    if (!pc || !pc.found) return;
    const s = secOf(pc.sec); if (!s) return;
    const add = pc.found.filter((f) => f.name.trim() && f.n > 0), n = add.reduce((t, f) => t + f.n, 0);
    addItems(s, add); saveJ();
    pc = null; render();
    const card = $(`sec-${s.id}`); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    say(`Added ${n} to ${s.name}.`);
  });
  let sayT = 0;
  function say(m) { $('sub').textContent = m; clearTimeout(sayT); sayT = setTimeout(() => { renderTop(); }, 4000); }

  // ---------- settings ----------
  const settings = $('settings');
  function openSettings() { $('key').value = cfg.key; $('model').value = model(); $('keymsg').textContent = ''; settings.showModal(); }
  const keepSettings = () => { cfg.key = $('key').value.trim(); cfg.model = $('model').value; store.set(K.cfg, cfg); };
  $('setbtn').addEventListener('click', openSettings);
  const settingsDone = () => { keepSettings(); if (pc && pc.needKey && cfg.key) { pc.needKey = false; pc.msg = ''; pc.err = false; } renderPC(); };
  $('setsave').addEventListener('click', () => { settingsDone(); settings.close(); });
  settings.addEventListener('close', settingsDone);   // also when closed with the back button
  $('keytest').addEventListener('click', async () => {
    keepSettings();
    const a = api();
    if (!a) { $('keymsg').textContent = 'Paste a key first.'; return; }
    $('keymsg').textContent = 'Checking…';
    try {
      await a.messages.create({ model: model(), max_tokens: 16, messages: [{ role: 'user', content: 'Reply with OK.' }] });
      $('keymsg').textContent = 'The key works.';
    } catch (e) { $('keymsg').textContent = errText(e) || 'Stopped.'; }
  });

  // ---------- the screen ----------
  let tab = store.get(K.tab, 'prep') === 'jib' ? 'jib' : 'prep';
  function renderTop() {
    const t = $('totals'); t.textContent = '';
    const put = (n, label) => { const d = el('div'); d.append(el('b', '', String(n)), el('span', '', label)); t.append(d); };
    if (tab === 'prep') {
      const all = P.areas.flatMap((a) => a.tasks), done = all.filter((x) => x.done).length;
      put(done, 'jobs done'); put(all.length - done, 'to go');
      $('sub').textContent = all.length && done === all.length ? 'Prep is done. Ready to count.' : 'Get the store ready for the count.';
    } else {
      put(jibTotal(), 'Jibbitz counted'); put(designs().length, 'designs'); put(`${J.secs.filter((s) => s.done).length}/${J.secs.length}`, 'sections done');
      $('sub').textContent = 'Count one section at a time.';
    }
  }
  function render() {
    $('v-prep').hidden = tab !== 'prep'; $('v-jib').hidden = tab !== 'jib';
    $('tab-prep').setAttribute('aria-selected', String(tab === 'prep')); $('tab-jib').setAttribute('aria-selected', String(tab === 'jib'));
    renderTop();
    if (tab === 'prep') renderPrep(); else { renderJib(); renderPC(); }
  }
  for (const [id, t] of [['tab-prep', 'prep'], ['tab-jib', 'jib']]) $(id).addEventListener('click', () => { tab = t; store.set(K.tab, t); render(); window.scrollTo(0, 0); });

  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
