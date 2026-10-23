(() => {
  'use strict';

  const R = window.RIAS;
  const KEY = 'rias-companion-v1';
  const FIRE_WINDOW_MIN = 45;   // items older than this when first noticed are marked "missed" instead of pinging
  const SNOOZE_MIN = 10;
  const MAX_MESSAGES = 200;

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minToTime = (m) => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
  const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
  const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
  const fmtClock = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const CATEGORY_LABEL = {
    custom: 'Other', wake: 'Wake up', water: 'Water', meal: 'Meal', exercise: 'Exercise', work: 'Work / study',
    break: 'Break', hygiene: 'Hygiene', meds: 'Medication', social: 'Social', chores: 'Chores', wind: 'Wind down', sleep: 'Sleep',
  };

  function defaultItems(wake, sleep) {
    const w = toMin(wake), s = toMin(sleep);
    const mk = (m, title, category) => ({ id: uid(), time: minToTime(m), title, category, repeat: 'daily', enabled: true });
    return [
      mk(w, 'Wake up & open the curtains', 'wake'),
      mk(w + 10, 'Glass of water', 'water'),
      mk(w + 30, 'Shower & brush teeth', 'hygiene'),
      mk(w + 60, 'Breakfast', 'meal'),
      mk(w + 120, 'Focus block — most important task first', 'work'),
      mk(11 * 60, 'Water break', 'water'),
      mk(12 * 60 + 30, 'Lunch', 'meal'),
      mk(15 * 60, 'Stretch & rest your eyes', 'break'),
      mk(17 * 60 + 30, 'Walk or workout', 'exercise'),
      mk(19 * 60, 'Dinner', 'meal'),
      mk(20 * 60, 'Message someone you care about', 'social'),
      mk(s - 60, 'Wind down — screens off soon', 'wind'),
      mk(s - 30, 'Brush teeth & get ready for bed', 'hygiene'),
      mk(s, 'Lights out', 'sleep'),
    ];
  }

  // ---------- state ----------
  const blank = () => ({
    profile: null,
    items: [],
    log: {},        // { date: { itemId: 'done' | 'skipped' } }
    fired: {},      // { date: { itemId: true } }
    summary: {},    // { date: { done, total } } for streaks
    greeted: {},    // { date: true }
    snoozes: [],    // [{ id, at }]
    messages: [],   // [{ id, from, text, ts, itemId? }]
    settings: { checkins: true, checkinEvery: 120, notify: true, praise: 'neutral' },
    lastRias: 0,
  });

  let state;
  try { state = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { state = blank(); }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full / private mode */ }
    syncNative();
  };

  const say = (line, extra = {}) => line
    .replaceAll('{name}', state.profile ? state.profile.name : 'you')
    .replaceAll('{title}', extra.title || '');

  const praiseLines = (pool = R.praise) => pool[state.settings.praise] || pool.neutral;
  // Half the time a finished task gets her "good boy / good girl" praise.
  const doneLine = () => say(pick(Math.random() < 0.5 ? praiseLines() : R.done));
  const doneToday = () => Object.values(state.log[dateKey()] || {}).includes('done');
  // Once you've done something today, some check-ins turn into praise.
  const checkinLine = (p, praiseOk) => say(pick(praiseOk && Math.random() < 0.4 ? praiseLines(R.praiseCheckin) : R.checkin[p]));

  // ---------- schedule ----------
  function appliesOn(item, d) {
    if (!item.enabled) return false;
    const day = d.getDay();
    switch (item.repeat) {
      case 'weekdays': return day >= 1 && day <= 5;
      case 'weekends': return day === 0 || day === 6;
      case 'once': return item.date === dateKey(d);
      default: return true;
    }
  }
  const todaysItems = (d = new Date()) =>
    state.items.filter((it) => appliesOn(it, d)).sort((a, b) => toMin(a.time) - toMin(b.time));
  const statusOf = (id, day = dateKey()) => (state.log[day] || {})[id];

  function isAwake(nm = nowMin()) {
    const w = toMin(state.profile.wake), s = toMin(state.profile.sleep);
    return w < s ? nm >= w && nm < s : nm >= w || nm < s;
  }
  function period(nm = nowMin()) {
    if (!isAwake(nm)) return 'night';
    if (nm < 12 * 60 && nm >= 4 * 60) return 'morning';
    if (nm < 17 * 60 && nm >= 12 * 60) return 'afternoon';
    return 'evening';
  }

  function updateSummary(day = dateKey()) {
    const list = todaysItems();
    const log = state.log[day] || {};
    state.summary[day] = { done: list.filter((it) => log[it.id] === 'done').length, total: list.length };
  }
  function streak() {
    const good = (k) => { const s = state.summary[k]; return s && s.total && s.done / s.total >= 0.6; };
    const d = new Date();
    let n = good(dateKey(d)) ? 1 : 0;
    for (;;) {
      d.setDate(d.getDate() - 1);
      if (!good(dateKey(d))) return n;
      n++;
    }
  }
  function pruneOld() {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const ck = dateKey(cutoff);
    for (const bucket of [state.log, state.fired, state.summary, state.greeted]) {
      for (const k of Object.keys(bucket)) if (k < ck) delete bucket[k];
    }
    const today = dateKey();
    state.items = state.items.filter((it) => it.repeat !== 'once' || it.date >= today || !it.date);
  }

  // ---------- messages ----------
  function addMessage(from, text, extra = {}) {
    const m = { id: uid(), from, text, ts: Date.now(), ...extra };
    state.messages.push(m);
    if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    if (from === 'rias') state.lastRias = m.ts;
    save();
    renderFeed();
    return m;
  }

  async function notify(body, tag) {
    if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden && tag !== 'test') return; // she's already talking to you in-app
    const opts = { body, tag: tag || 'rias', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true };
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) return reg.showNotification('Rias', opts);
      new Notification('Rias', opts);
    } catch { /* some browsers only allow notifications from the service worker */ }
  }

  function riasSays(text, extra = {}) {
    addMessage('rias', text, extra);
    notify(text, extra.itemId);
  }

  function fireItem(item) {
    const line = say(pick(R.due[item.category] || R.due.custom), item);
    riasSays(line, { itemId: item.id, title: item.title, time: item.time });
  }

  // ---------- actions on a task ----------
  function resolve(itemId, status) {
    const today = dateKey();
    const item = state.items.find((it) => it.id === itemId);
    if (!item || statusOf(itemId)) return;
    (state.log[today] ||= {})[itemId] = status;
    state.snoozes = state.snoozes.filter((s) => s.id !== itemId);
    updateSummary();
    addMessage('me', status === 'done' ? `Done: ${item.title} ✓` : `Skipping ${item.title} today.`);
    setTimeout(() => {
      addMessage('rias', status === 'done' ? doneLine() : say(pick(R.skip)));
      const list = todaysItems();
      if (status === 'done' && list.length && list.every((it) => statusOf(it.id) === 'done')) {
        setTimeout(() => addMessage('rias', say(pick(R.allDone))), 900);
      }
    }, 500);
    renderToday();
    renderStatus();
  }

  function snooze(itemId) {
    const item = state.items.find((it) => it.id === itemId);
    if (!item || statusOf(itemId)) return;
    state.snoozes = state.snoozes.filter((s) => s.id !== itemId);
    state.snoozes.push({ id: itemId, at: Date.now() + SNOOZE_MIN * 60000 });
    addMessage('me', `${SNOOZE_MIN} more minutes…`);
    setTimeout(() => addMessage('rias', say(pick(R.snooze))), 500);
  }

  function undo(itemId) {
    const log = state.log[dateKey()];
    if (log) delete log[itemId];
    updateSummary(); save(); renderToday(); renderFeed(); renderStatus();
  }

  // ---------- the heartbeat ----------
  function tick() {
    if (!state.profile) return;
    const d = new Date();
    const today = dateKey(d);
    const nm = nowMin(d);

    // Morning hello with the plan for the day.
    if (!state.greeted[today] && isAwake(nm) && nm >= toMin(state.profile.wake)) {
      state.greeted[today] = true;
      pruneOld();
      updateSummary();
      riasSays(`${say(pick(R.greet[period(nm)] || R.greet.morning))}\n\n${planText()}`);
    }

    // Scheduled items.
    const fired = (state.fired[today] ||= {});
    for (const item of todaysItems(d)) {
      if (fired[item.id] || toMin(item.time) > nm) continue;
      const fresh = nm - toMin(item.time) <= FIRE_WINDOW_MIN && !statusOf(item.id);
      fired[item.id] = fresh ? 'ping' : 'silent';
      if (fresh) fireItem(item);
    }

    // Snoozed items coming back.
    const due = state.snoozes.filter((s) => s.at <= Date.now());
    if (due.length) {
      state.snoozes = state.snoozes.filter((s) => s.at > Date.now());
      for (const s of due) {
        const item = state.items.find((it) => it.id === s.id);
        if (item && !statusOf(item.id)) fireItem(item);
      }
    }

    // Idle check-ins while you're awake.
    const quietFor = Date.now() - state.lastRias;
    if (state.settings.checkins && isAwake(nm) && quietFor > state.settings.checkinEvery * 60000) {
      const p = period(nm);
      if (R.checkin[p]) riasSays(checkinLine(p, doneToday()));
    }

    save();
    renderStatus();
  }

  function planText() {
    const list = todaysItems();
    const nm = nowMin();
    const upcoming = list.filter((it) => toMin(it.time) >= nm && !statusOf(it.id)).slice(0, 4);
    if (!list.length) return "Your schedule is empty today. Let's add a few things in the Today tab.";
    if (!upcoming.length) return "That's everything scheduled for today. Relax a little — you've earned it.";
    return `Here's what's next:\n${upcoming.map((it) => `• ${fmtTime(it.time)} — ${it.title}`).join('\n')}`;
  }

  // ---------- chat replies ----------
  function pendingItem() {
    const fired = state.fired[dateKey()] || {};
    const nm = nowMin();
    // Only things she actually pinged you about in the last few hours count as "waiting on you".
    return todaysItems().filter((it) => fired[it.id] === 'ping' && !statusOf(it.id) && toMin(it.time) <= nm && nm - toMin(it.time) <= 180).pop();
  }

  function reply(raw) {
    const t = raw.toLowerCase();
    // Match at word starts so 'eat' doesn't fire on 'great'.
    const has = (...words) => words.some((w) => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t));

    if (has('kill myself', 'suicide', 'want to die', 'end my life', 'self harm', 'self-harm', 'hurt myself')) return say(pick(R.chat.crisis));

    if (/^(done|did it|finished|i did it|complete|ok done)\b/.test(t) || has("i'm done", 'im done', 'all done')) {
      const p = pendingItem();
      if (p) { resolve(p.id, 'done'); return null; }
      return doneLine();
    }
    if (has('what now', 'what should i do', "what's next", 'whats next', 'next')) {
      const p = pendingItem();
      if (p) return say(`You still haven't done this one: ${p.title}. Go on, I'll wait~`);
      const nm = nowMin();
      const next = todaysItems().find((it) => toMin(it.time) > nm && !statusOf(it.id));
      if (next) return say(`Next up at ${fmtTime(next.time)}: ${next.title}. Until then — drink some water and keep your posture nice, {name}.`);
      return say(isAwake() ? "Nothing left on today's list. Read something, relax, or tidy up a little." : pick(R.lateNight));
    }
    if (has('good boy', 'good girl', 'praise me', 'am i good', 'proud of me', 'did good', 'did well', 'i did it')) return say(pick(praiseLines()));
    if (has('plan', 'schedule', 'today', 'agenda')) return planText();
    if (has('depress', 'sad', 'lonely', 'cry', 'upset', 'down', 'awful', 'terrible')) return say(pick(R.chat.sad));
    if (has('stress', 'anxious', 'anxiety', 'overwhelm', 'panic', 'too much')) return say(pick(R.chat.stressed));
    if (has('tired', 'sleepy', 'exhausted', 'no energy')) return say(isAwake() ? pick(R.chat.tired) : pick(R.lateNight));
    if (has('hungry', 'starving', 'food', 'eat')) return say(pick(R.chat.hungry));
    if (has('bored', 'boring', 'nothing to do')) return say(pick(R.chat.bored));
    if (has('thank', 'thx', 'ty ', 'tysm')) return say(pick(R.chat.thanks));
    if (has('love you', 'like you', 'cute', 'beautiful', 'pretty', 'marry')) return say(pick(R.chat.affection));
    if (has('who are you', 'your name', 'about you')) return say(pick(R.chat.who));
    if (/^(hi|hey|hello|yo|good (morning|afternoon|evening)|morning)\b/.test(t)) return say(pick(R.chat.greet));
    if (has('good night', 'goodnight', 'night night', 'going to bed')) return say(pick(R.due.sleep));
    return say(pick(R.chat.fallback));
  }

  // ---------- rendering ----------
  const feed = $('#feed');
  function renderFeed() {
    const wasNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
    feed.textContent = '';
    for (const m of state.messages) {
      const el = document.createElement('div');
      el.className = `msg ${m.from}`;
      el.append(m.text);
      if (m.itemId) {
        const task = document.createElement('div');
        task.className = 'task';
        const b = document.createElement('b');
        b.textContent = fmtTime(m.time);
        task.append(b, ` · ${m.title}`);
        el.append(task);
        const st = new Date(m.ts).toDateString() === new Date().toDateString() ? statusOf(m.itemId) : 'old';
        if (!st && state.items.some((it) => it.id === m.itemId)) {
          const acts = document.createElement('div');
          acts.className = 'actions';
          acts.innerHTML = '<button class="done" data-act="done">Done ✓</button><button data-act="snooze">Snooze 10m</button><button data-act="skip">Skip</button>';
          acts.dataset.item = m.itemId;
          el.append(acts);
        } else if (st === 'done' || st === 'skipped') {
          const r = document.createElement('div');
          r.className = 'resolved';
          r.textContent = st === 'done' ? '✓ Done' : 'Skipped';
          el.append(r);
        }
      }
      const time = document.createElement('time');
      time.textContent = fmtClock(m.ts);
      el.append(time);
      feed.append(el);
    }
    if (wasNearBottom || feed.dataset.init !== '1') { feed.scrollTop = feed.scrollHeight; feed.dataset.init = '1'; }
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'msg rias typing';
    el.textContent = 'Rias is typing…';
    feed.append(el);
    feed.scrollTop = feed.scrollHeight;
    return el;
  }

  function renderStatus() {
    if (!state.profile) return;
    const p = pendingItem();
    const nm = nowMin();
    const next = todaysItems().find((it) => toMin(it.time) > nm && !statusOf(it.id));
    $('#status').textContent = p ? `Waiting on you: ${p.title}`
      : next ? `Next: ${next.title} · ${fmtTime(next.time)}`
      : isAwake() ? 'Occult Research Club · online' : 'Resting… goodnight';
  }

  function renderToday() {
    const list = todaysItems();
    const nm = nowMin();
    const fired = state.fired[dateKey()] || {};
    const done = list.filter((it) => statusOf(it.id) === 'done').length;
    $('#progress-text').textContent = `${done} / ${list.length} done`;
    $('#ring').style.strokeDasharray = `${list.length ? (done / list.length) * 100 : 0} 100`;
    const s = streak();
    $('#streak-text').textContent = `Streak: ${s} day${s === 1 ? '' : 's'} 🔥`;

    const ul = $('#items');
    ul.textContent = '';
    if (!list.length) {
      ul.innerHTML = '<li class="empty">Nothing scheduled today. Tap ＋ to add a reminder.</li>';
    }
    const nextId = (list.find((it) => toMin(it.time) >= nm && !statusOf(it.id)) || {}).id;
    for (const it of list) {
      const st = statusOf(it.id);
      const li = document.createElement('li');
      li.className = 'item';
      if (st) li.classList.add(st);
      else if (fired[it.id] && toMin(it.time) <= nm) li.classList.add(nm - toMin(it.time) <= FIRE_WINDOW_MIN ? 'now' : 'missed');
      else if (it.id === nextId) li.classList.add('now');
      li.dataset.id = it.id;
      li.innerHTML = `<span class="t"></span><span class="what"><span></span><br><span class="tag"></span></span><button class="check" aria-label="Mark done">${st === 'done' ? '✓' : ''}</button>`;
      li.querySelector('.t').textContent = fmtTime(it.time);
      li.querySelector('.what span').textContent = it.title;
      li.querySelector('.tag').textContent = `${CATEGORY_LABEL[it.category] || 'Other'} · ${{ daily: 'every day', weekdays: 'weekdays', weekends: 'weekends', once: 'once' }[it.repeat]}${st === 'skipped' ? ' · skipped' : ''}`;
      ul.append(li);
    }
  }

  // ---------- navigation ----------
  function show(view) {
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${view}`;
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.view === view);
    if (view === 'today') renderToday();
    if (view === 'settings') fillSettings();
    if (view === 'chat') feed.scrollTop = feed.scrollHeight;
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

  // ---------- chat events ----------
  function userSays(text) {
    text = text.trim();
    if (!text) return;
    addMessage('me', text);
    const typing = showTyping();
    setTimeout(() => {
      typing.remove();
      const r = reply(text);
      if (r) addMessage('rias', r);
      renderStatus();
    }, 600 + Math.random() * 700);
  }
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#say'); userSays(i.value); i.value = ''; });
  $('#quick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) userSays(b.dataset.say); });
  feed.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.parentElement.dataset.item;
    if (b.dataset.act === 'snooze') snooze(id); else resolve(id, b.dataset.act === 'done' ? 'done' : 'skipped');
  });

  // ---------- today events / editor ----------
  const editor = $('#editor');
  const ef = $('#edit-form');
  let editingId = null;

  function openEditor(item) {
    editingId = item ? item.id : null;
    $('#edit-title').textContent = item ? 'Edit reminder' : 'New reminder';
    ef.elements.title.value = item ? item.title : '';
    ef.elements.time.value = item ? item.time : minToTime(Math.ceil((nowMin() + 15) / 15) * 15);
    ef.elements.category.value = item ? item.category : 'custom';
    ef.elements.repeat.value = item ? item.repeat : 'once';
    ef.elements.date.value = (item && item.date) || dateKey();
    $('#edit-delete').hidden = !item;
    $('#date-wrap').hidden = ef.elements.repeat.value !== 'once';
    editor.showModal();
  }
  ef.elements.repeat.addEventListener('change', () => { $('#date-wrap').hidden = ef.elements.repeat.value !== 'once'; });
  $('#edit-cancel').addEventListener('click', () => editor.close());
  $('#edit-delete').addEventListener('click', () => {
    state.items = state.items.filter((it) => it.id !== editingId);
    updateSummary(); save(); editor.close(); renderToday(); renderFeed(); renderStatus();
  });
  ef.addEventListener('submit', () => {
    const data = {
      title: ef.elements.title.value.trim(), time: ef.elements.time.value, category: ef.elements.category.value,
      repeat: ef.elements.repeat.value, date: ef.elements.repeat.value === 'once' ? ef.elements.date.value : undefined, enabled: true,
    };
    const existing = state.items.find((it) => it.id === editingId);
    if (existing) {
      // Moving an item later in the day re-arms it.
      if (data.time !== existing.time && toMin(data.time) > nowMin()) delete (state.fired[dateKey()] || {})[existing.id];
      Object.assign(existing, data);
    } else {
      const item = { id: uid(), ...data };
      state.items.push(item);
      // Don't instantly ping for something created in the past today.
      if (toMin(item.time) <= nowMin()) (state.fired[dateKey()] ||= {})[item.id] = 'silent';
      addMessage('rias', say(`Noted. I'll remind you: ${item.title} at ${fmtTime(item.time)}.`));
    }
    updateSummary(); save(); renderToday(); renderStatus();
  });

  $('#add').addEventListener('click', () => openEditor(null));
  $('#items').addEventListener('click', (e) => {
    const li = e.target.closest('.item');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest('.check')) {
      if (statusOf(id)) undo(id); else resolve(id, 'done');
      return;
    }
    openEditor(state.items.find((it) => it.id === id));
  });

  // In-app yes/no prompt (window.confirm is blocked in some app views).
  function ask(text) {
    const dlg = $('#ask');
    $('#ask-text').textContent = text;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((done) => dlg.addEventListener('close', () => done(dlg.returnValue === 'yes'), { once: true }));
  }

  // ---------- Android app: hand reminders to the phone's alarm system ----------
  // window.RiasNative only exists inside the Android app. There, every reminder and
  // check-in for the next week is scheduled natively, so they fire with the app closed.
  const Native = window.RiasNative;
  let lastSync = '';
  function syncNative() {
    if (!Native || !state.profile) return;
    const today = dateKey();
    // Only reschedule when something that affects the schedule changed.
    const sig = JSON.stringify([state.items, state.settings, state.profile, state.log[today], state.snoozes, today]);
    if (sig === lastSync) return;
    lastSync = sig;
    try { Native.schedule(JSON.stringify(upcomingEvents())); } catch { /* bridge unavailable */ }
  }

  function upcomingEvents(days = 7) {
    if (!state.settings.notify) return [];
    const events = [];
    const now = Date.now();
    const at = (d, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m).getTime();
    const w = toMin(state.profile.wake), s = toMin(state.profile.sleep);
    const awakeEnd = s > w ? s : s + 1440;
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const log = state.log[dateKey(d)] || {};
      const items = state.items.filter((it) => appliesOn(it, d));
      for (const it of items) {
        const t = at(d, toMin(it.time));
        if (t <= now || log[it.id]) continue;
        events.push({ at: t, text: `${say(pick(R.due[it.category] || R.due.custom), it)}\n${fmtTime(it.time)} · ${it.title}` });
      }
      if (!state.settings.checkins) continue;
      const every = state.settings.checkinEvery;
      for (let m = w + every; m < awakeEnd - 30; m += every) {
        const t = at(d, m);
        if (t <= now) continue;
        if (items.some((it) => Math.abs(toMin(it.time) - (m % 1440)) < 25)) continue; // she's already pinging then
        const p = period(m % 1440);
        if (R.checkin[p]) events.push({ at: t, text: checkinLine(p, i > 0 || doneToday()) });
      }
    }
    for (const sn of state.snoozes) {
      const it = state.items.find((x) => x.id === sn.id);
      if (it && sn.at > now) events.push({ at: sn.at, text: `${say(pick(R.due[it.category] || R.due.custom), it)}\n${it.title}` });
    }
    // If the app isn't opened for a whole week, ask to be opened so the schedule can be refreshed.
    const last = new Date(); last.setDate(last.getDate() + days);
    events.push({ at: at(last, w + 60), text: say("I haven't seen you in days, {name}. Open the app so I can keep planning your days.") });
    return events.sort((a, b) => a.at - b.at);
  }

  // ---------- settings ----------
  const sf = $('#settings');
  function notifyHint() {
    const hint = $('#notify-hint');
    if (Native) {
      const on = Native.notificationsEnabled();
      $('#perm').hidden = false;
      $('#perm').textContent = 'Notification settings';
      hint.textContent = on
        ? 'Notifications are on. Rias will remind you even when the app is closed.'
        : 'Notifications are off for this app. Tap “Notification settings” and turn them on.';
      return;
    }
    if (!('Notification' in window)) {
      hint.textContent = 'This browser doesn’t support notifications. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).';
      $('#perm').hidden = true;
      return;
    }
    $('#perm').hidden = Notification.permission === 'granted';
    hint.textContent = {
      granted: 'Notifications are on. Rias can ping you while the app is open or in the background.',
      denied: 'Notifications are blocked — enable them for this site in your browser settings.',
      default: 'Tap “Allow notifications” so Rias can ping you.',
    }[Notification.permission];
  }
  function fillSettings() {
    sf.elements.name.value = state.profile.name;
    sf.elements.wake.value = state.profile.wake;
    sf.elements.sleep.value = state.profile.sleep;
    sf.elements.checkins.checked = state.settings.checkins;
    sf.elements.checkinEvery.value = String(state.settings.checkinEvery);
    sf.elements.notify.checked = state.settings.notify;
    sf.elements.praise.value = state.settings.praise || 'neutral';
    notifyHint();
  }
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(state.profile, { name: sf.elements.name.value.trim(), wake: sf.elements.wake.value, sleep: sf.elements.sleep.value });
    Object.assign(state.settings, { checkins: sf.elements.checkins.checked, checkinEvery: Number(sf.elements.checkinEvery.value), notify: sf.elements.notify.checked, praise: sf.elements.praise.value });
    save();
    addMessage('rias', say('Settings updated. I\'ll keep that in mind, {name}.'));
    show('chat');
  });
  $('#perm').addEventListener('click', async () => {
    if (Native) Native.openSettings();
    else if ('Notification' in window) await Notification.requestPermission();
    notifyHint();
  });
  $('#test').addEventListener('click', () => {
    if (Native) { Native.test(say("This is how I'll call for you, {name}. Don't ignore me~")); return; }
    if (!('Notification' in window) || Notification.permission !== 'granted') { notifyHint(); return; }
    notify(say("This is how I'll call for you, {name}. Don't ignore me~"), 'test');
  });
  $('#regen').addEventListener('click', async () => {
    if (!await ask('Replace your daily routine with the default one? Custom reminders set to "once" are kept.')) return;
    state.items = state.items.filter((it) => it.repeat === 'once').concat(defaultItems(state.profile.wake, state.profile.sleep));
    const fired = (state.fired[dateKey()] ||= {});
    for (const it of state.items) if (toMin(it.time) <= nowMin()) fired[it.id] = 'silent';
    updateSummary(); save();
    addMessage('rias', say('I\'ve rebuilt your routine around your wake-up and bed times.'));
    show('today');
  });
  $('#clear-chat').addEventListener('click', async () => {
    if (!await ask('Clear all chat messages?')) return;
    state.messages = []; save(); renderFeed();
  });
  $('#reset').addEventListener('click', async () => {
    if (!await ask('Delete everything and start over?')) return;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    location.reload();
  });

  // ---------- onboarding ----------
  $('#onboard-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    state.profile = { name: f.elements.name.value.trim(), wake: f.elements.wake.value, sleep: f.elements.sleep.value };
    state.settings.praise = f.elements.praise.value;
    state.items = defaultItems(state.profile.wake, state.profile.sleep);
    // Everything already in the past today is treated as handled so you aren't flooded on day one.
    const today = dateKey();
    const fired = (state.fired[today] = {});
    for (const it of state.items) if (toMin(it.time) <= nowMin()) fired[it.id] = 'silent';
    state.greeted[today] = true;
    updateSummary();
    $('#onboarding').hidden = true;
    addMessage('rias', say("Welcome to my household, {name}. I've set up a daily routine for you — you can change anything in the Today tab."));
    setTimeout(() => {
      addMessage('rias', planText());
      addMessage('rias', say("One more thing: go to Settings and allow notifications, so I can call for you when it's time. Talk to me whenever you like~"));
    }, 900);
    renderStatus();
  });

  // ---------- boot ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  renderFeed();
  if (!state.profile) {
    $('#onboarding').hidden = false;
  } else {
    // Short hello when you come back after a while (the morning greeting is handled by tick()).
    if (Date.now() - state.lastRias > 3 * 3600000 && (state.greeted[dateKey()] || !isAwake())) {
      addMessage('rias', say(pick(R.greet[period()])));
    }
    tick();
  }
  renderStatus();
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); renderFeed(); renderToday(); if (state.profile && !$('#view-settings').hidden) notifyHint(); } });
})();
