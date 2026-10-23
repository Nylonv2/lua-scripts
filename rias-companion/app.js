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
    workLeave: '💼 Work', workStart: '💼 Work', workEnd: '💼 Work', calendar: '📅 Phone calendar',
  };
  const mealFor = (nm) => (nm < 11 * 60 ? 'breakfast' : nm < 16 * 60 ? 'lunch' : nm < 21 * 60 ? 'dinner' : 'snack');

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
    settings: {
      checkins: true, checkinEvery: 120, notify: true, praise: 'neutral', voice: true, voiceName: '', voicePitch: 0.95, voiceRate: 0.9,
      commute: 30, workReminders: true, foodReminders: true, waterGoal: 8, phoneCalendar: false, alarmPopup: true,
    },
    lastRias: 0,
    chat: {},        // what Rias remembers from conversations (chat.js)
    shifts: [],      // [{ id, label, days: [0-6] | null, date: 'YYYY-MM-DD' | null, start, end }]
    food: {},        // { date: [{ id, meal, text, kind, ts }] }
    water: {},       // { date: glasses }
    nudged: {},      // { date: { food, water } }
    phoneEvents: [], // from the phone's calendar (Android app)
    ai: { on: false, provider: 'gemini', key: '', model: 'claude-opus-5-5', geminiKey: '', geminiModel: '', geminiModelKey: '' },
  });

  let state;
  try { state = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { state = blank(); }
  // Fill in settings added in newer versions.
  state.settings = { ...blank().settings, ...state.settings };
  state.ai = { ...blank().ai, ...state.ai };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full / private mode */ }
    syncNative();
  };

  const say = (line, extra = {}) => line
    .replaceAll('{name}', state.profile ? state.profile.name : 'you')
    .replaceAll('{praise}', praiseWord())
    .replaceAll('{count}', String(extra.count ?? ''))
    .replaceAll('{title}', extra.title || '');

  const praiseLines = (pool = R.praise) => pool[state.settings.praise] || pool.neutral;
  // Half the time a finished task gets her "good boy / good girl" praise.
  const doneLine = () => say(pick(Math.random() < 0.5 ? praiseLines() : R.done));
  const doneToday = () => Object.values(state.log[dateKey()] || {}).includes('done');
  // Once you've done something today, some check-ins turn into praise.
  const checkinLine = (p, praiseOk) => say(pick(praiseOk && Math.random() < 0.4 ? praiseLines(R.praiseCheckin) : R.checkin[p]));

  const praiseWord = () => ({ boy: 'good boy', girl: 'good girl' }[state.settings.praise] || 'cute servant');
  const Chat = window.createRiasChat({ memory: () => (state.chat ||= {}), say, period: () => period(), praiseWord });

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
  // Work shifts and phone-calendar events show up as read-only items on their day.
  function shiftsOn(d) {
    const day = d.getDay(), k = dateKey(d);
    return state.shifts.filter((sh) => (sh.date ? sh.date === k : (sh.days || []).includes(day)));
  }
  const overnight = (sh) => toMin(sh.end) <= toMin(sh.start);
  function virtualItems(d) {
    const out = [];
    const st = state.settings;
    for (const sh of shiftsOn(d)) {
      const label = sh.label || 'Work';
      if (st.workReminders && st.commute > 0) {
        out.push({ id: `w:${sh.id}:leave`, time: minToTime(toMin(sh.start) - st.commute), title: `Leave for ${label}`, category: 'workLeave', source: 'work' });
      }
      out.push({ id: `w:${sh.id}:start`, time: sh.start, title: `${label} starts (until ${fmtTime(sh.end)})`, category: 'workStart', source: 'work' });
      if (!overnight(sh)) out.push({ id: `w:${sh.id}:end`, time: sh.end, title: `${label} ends`, category: 'workEnd', source: 'work' });
    }
    // An overnight shift that started yesterday ends today.
    const y = new Date(d); y.setDate(y.getDate() - 1);
    for (const sh of shiftsOn(y)) {
      if (overnight(sh)) out.push({ id: `w:${sh.id}:end`, time: sh.end, title: `${sh.label || 'Work'} ends`, category: 'workEnd', source: 'work' });
    }
    if (st.phoneCalendar) {
      const k = dateKey(d);
      for (const ev of state.phoneEvents) {
        if (ev.allDay || evDateKey(ev) !== k) continue;
        const b = new Date(ev.begin);
        out.push({ id: `c:${ev.id}:${ev.begin}`, time: `${pad(b.getHours())}:${pad(b.getMinutes())}`, title: ev.title || 'Calendar event', category: 'calendar', source: 'calendar', cal: ev.cal });
      }
    }
    return out;
  }
  // All-day calendar events are stored at UTC midnight; timed ones in local time.
  const evDateKey = (ev) => {
    if (!ev.allDay) return dateKey(new Date(ev.begin));
    const u = new Date(ev.begin);
    return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`;
  };
  const itemsOn = (d) => state.items.filter((it) => appliesOn(it, d)).concat(virtualItems(d))
    .sort((a, b) => toMin(a.time) - toMin(b.time));
  const todaysItems = (d = new Date()) => itemsOn(d);
  const findItem = (id) => state.items.find((it) => it.id === id) || virtualItems(new Date()).find((it) => it.id === id);
  const allDayEvents = (d = new Date()) => (state.settings.phoneCalendar ? state.phoneEvents.filter((ev) => ev.allDay && evDateKey(ev) === dateKey(d)) : []);
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
    for (const bucket of [state.log, state.fired, state.summary, state.greeted, state.nudged, state.water, state.food]) {
      for (const k of Object.keys(bucket)) if (k < ck) delete bucket[k];
    }
    const today = dateKey();
    state.items = state.items.filter((it) => it.repeat !== 'once' || it.date >= today || !it.date);
    state.shifts = state.shifts.filter((sh) => !sh.date || sh.date >= today);
  }

  // ---------- messages ----------
  function addMessage(from, text, extra = {}) {
    const m = { id: uid(), from, text, ts: Date.now(), ...extra };
    state.messages.push(m);
    if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    if (from === 'rias') state.lastRias = m.ts;
    save();
    renderFeed();
    if (from === 'rias') { speak(text); Chat.noteRias(text); showToast(m); }
    return m;
  }

  // ---------- voice ----------
  // Out loud: Android's text-to-speech inside the app, the Web Speech API in browsers.
  // Listening: Android's voice typing inside the app, SpeechRecognition where the browser has it.
  const WebRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let spokeLast = false; // you talked by voice, so she answers out loud even if voice is off

  // Her default sound: a touch lower and slower than normal, calm and confident.
  const RIAS_PITCH = 0.95, RIAS_RATE = 0.9;
  const voiceOpts = () => ({
    name: state.settings.voiceName || '',
    pitch: state.settings.voicePitch ?? RIAS_PITCH,
    rate: state.settings.voiceRate ?? RIAS_RATE,
  });
  // Voices on this device: [{ name, label }], English first.
  function listVoices() {
    const N = window.RiasNative;
    let list = [];
    if (N && N.voices) { try { list = JSON.parse(N.voices()); } catch { list = []; } }
    else if ('speechSynthesis' in window) list = speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang, label: `${v.name} (${v.lang})` }));
    const en = (v) => (/^en/i.test(v.lang) ? 0 : 1);
    return list.sort((a, b) => en(a) - en(b) || a.label.localeCompare(b.label));
  }
  // Best guess at a mature female English voice when none is chosen (browsers only;
  // Android's names don't say, so the phone's default is used there).
  const autoWebVoice = (voices) => {
    const en = voices.filter((v) => v.lang.startsWith('en'));
    return en.find((v) => /uk english female|serena|victoria|karen|samantha|sonia|libby|aria|jenny|zira|female/i.test(v.name)) || en[0] || null;
  };
  function applyNativeVoice() {
    const N = window.RiasNative;
    if (!N || !N.configure) return;
    const o = voiceOpts();
    try { N.configure(o.name, o.pitch, o.rate); } catch { /* older app */ }
  }
  function speak(text, force) {
    if (!force && (document.hidden || !(state.settings.voice !== false || spokeLast))) return;
    const clean = text.replace(/[~•]/g, '').replace(/…/g, '...').replace(/:?\n+/g, '. ');
    const N = window.RiasNative;
    if (N && N.speak) { try { N.speak(clean); } catch { /* no TTS engine */ } return; }
    if (!('speechSynthesis' in window)) return;
    const o = voiceOpts();
    const u = new SpeechSynthesisUtterance(clean);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.name === o.name) || autoWebVoice(voices);
    u.pitch = o.pitch;
    u.rate = o.rate;
    speechSynthesis.speak(u);
  }
  function stopSpeaking() {
    const N = window.RiasNative;
    if (N && N.stopSpeaking) { try { N.stopSpeaking(); } catch { /* ignore */ } }
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  const canListen = () => {
    const N = window.RiasNative;
    if (N && N.canListen) { try { return N.canListen(); } catch { return false; } }
    return !!WebRecognition;
  };
  function listen() {
    stopSpeaking();
    const N = window.RiasNative;
    if (N && N.listen) { N.listen(); return; }
    if (!WebRecognition) return;
    const rec = new WebRecognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    $('#mic').classList.add('on');
    rec.onresult = (e) => window.riasHeard(e.results[0][0].transcript);
    rec.onend = () => $('#mic').classList.remove('on');
    rec.onerror = () => $('#mic').classList.remove('on');
    rec.start();
  }
  // Called by the Android app (and the web recognizer) with what you said.
  window.riasHeard = (text) => { spokeLast = true; userSays(text); };

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
    showAlarm(item, line);
  }

  // ---------- alarm-style reminder pop-up (app open) ----------
  const alarmDlg = $('#alarm');
  const alarmQueue = [];
  let alarmItem = null;
  const alarmOn = () => state.settings.alarmPopup !== false;
  function showAlarm(item, text) {
    if (!alarmOn() || document.hidden) return;
    if (alarmDlg.open) { alarmQueue.push([item, text]); return; }
    alarmItem = item;
    $('#alarm-time').textContent = fmtClock(Date.now());
    $('#alarm-title').textContent = item.title;
    $('#alarm-text').textContent = text;
    alarmDlg.showModal();
    const N = window.RiasNative;
    if (N && N.buzz) { try { N.buzz(); } catch { /* older app */ } }
    else if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
  }
  function closeAlarm() {
    if (alarmDlg.open) alarmDlg.close();
    alarmItem = null;
    const next = alarmQueue.shift();
    if (next) setTimeout(() => showAlarm(...next), 300);
  }
  $('#alarm-done').addEventListener('click', () => { const it = alarmItem; closeAlarm(); if (it) resolve(it.id, 'done'); });
  $('#alarm-snooze').addEventListener('click', () => { const it = alarmItem; closeAlarm(); if (it) snooze(it.id); });
  $('#alarm-dismiss').addEventListener('click', closeAlarm);
  alarmDlg.addEventListener('cancel', (e) => { e.preventDefault(); closeAlarm(); });

  // Done / Snooze tapped on the Android pop-up while the app was closed.
  function applyNativeActions() {
    const N = window.RiasNative;
    if (!N || !N.takeActions || !state.profile) return;
    let list = [];
    try { list = JSON.parse(N.takeActions()); } catch { return; }
    const today = dateKey();
    for (const a of list) {
      if (dateKey(new Date(a.at)) !== today) continue;
      const it = findItem(a.itemId);
      if (!it || statusOf(it.id)) continue;
      (state.fired[today] ||= {})[it.id] = 'ping';
      if (a.action === 'done') {
        (state.log[today] ||= {})[it.id] = 'done';
        state.snoozes = state.snoozes.filter((sn) => sn.id !== it.id);
        addMessage('rias', say(`You marked “${it.title}” done from my pop-up. ${pick(praiseLines())}`));
      } else if (a.action === 'snooze' && a.until > Date.now()) {
        state.snoozes = state.snoozes.filter((sn) => sn.id !== it.id).concat({ id: it.id, at: a.until });
      }
    }
    if (list.length) { updateSummary(); save(); renderToday(); renderStatus(); }
  }

  // ---------- actions on a task ----------
  function resolve(itemId, status) {
    const today = dateKey();
    const item = findItem(itemId);
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
      } else if (status === 'done' && item.category === 'meal') {
        // Finished a meal reminder: ask what it was, with a button into the food diary.
        setTimeout(() => addMessage('rias', say(pick(R.food.ask)), { action: 'food', meal: mealFor(toMin(item.time)) }), 900);
      }
    }, 500);
    renderToday();
    renderStatus();
  }

  function snooze(itemId) {
    const item = findItem(itemId);
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
        const item = findItem(s.id);
        if (item && !statusOf(item.id)) fireItem(item);
      }
    }

    // Food diary and water nudges, once a day each.
    const nudged = (state.nudged[today] ||= {});
    const foodToday = state.food[today] || [];
    if (state.settings.foodReminders && !nudged.food && nm >= 21 * 60 && isAwake(nm) && !foodToday.some((f) => f.meal === 'dinner')) {
      nudged.food = true;
      riasSays(say(pick(R.food.nudge)), { action: 'food', meal: 'dinner' });
    }
    const glasses = state.water[today] || 0;
    if (state.settings.foodReminders && !nudged.water && nm >= 15 * 60 && isAwake(nm) && glasses < state.settings.waterGoal / 2) {
      nudged.water = true;
      riasSays(say(pick(R.water.nudge), { count: glasses }));
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
    const upcoming = list.filter((it) => toMin(it.time) >= nm && !statusOf(it.id)).slice(0, 5);
    const shifts = shiftsOn(new Date());
    const extra = [];
    if (shifts.length) extra.push(`You're working today: ${shifts.map((sh) => `${fmtTime(sh.start)}–${fmtTime(sh.end)}`).join(', ')}.`);
    const allDay = allDayEvents();
    if (allDay.length) extra.push(`All day: ${allDay.map((ev) => ev.title).join(', ')}.`);
    const tail = extra.length ? `\n\n${extra.join(' ')}` : '';
    if (!list.length) return `Your schedule is empty today. Let's add a few things in the Today tab.${tail}`;
    if (!upcoming.length) return `That's everything scheduled for today. Relax a little — you've earned it.${tail}`;
    return `Here's what's next:\n${upcoming.map((it) => `• ${fmtTime(it.time)} — ${it.title}`).join('\n')}${tail}`;
  }

  // ---------- chat replies ----------
  function pendingItem() {
    const fired = state.fired[dateKey()] || {};
    const nm = nowMin();
    // Only things she actually pinged you about in the last few hours count as "waiting on you".
    return todaysItems().filter((it) => fired[it.id] === 'ping' && !statusOf(it.id) && toMin(it.time) <= nm && nm - toMin(it.time) <= 180).pop();
  }

  // With AI on, only safety lines and "done" stay local; everything else goes to her AI.
  function reply(raw, aiOn = false) {
    const t = raw.toLowerCase();
    // Match at word starts so 'eat' doesn't fire on 'great'.
    const has = (...words) => words.some((w) => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t));

    if (has('kill myself', 'suicide', 'want to die', 'end my life', 'self harm', 'self-harm', 'hurt myself')) return say(pick(R.chat.crisis));

    if (/^(done|did it|finished|i did it|complete|ok done)\b/.test(t) || has("i'm done", 'im done', 'all done')) {
      const p = pendingItem();
      if (p) { resolve(p.id, 'done'); return null; }
      if (!aiOn) return doneLine();
    }
    if (aiOn) return undefined;
    if (has('what now', 'what should i do', "what's next", 'whats next', 'what do i do')) {
      const p = pendingItem();
      if (p) return say(`You still haven't done this one: ${p.title}. Go on, I'll wait~`);
      const nm = nowMin();
      const next = todaysItems().find((it) => toMin(it.time) > nm && !statusOf(it.id));
      if (next) return say(`Next up at ${fmtTime(next.time)}: ${next.title}. Until then — drink some water and keep your posture nice, {name}.`);
      return say(isAwake() ? "Nothing left on today's list. Read something, relax, or tidy up a little." : pick(R.lateNight));
    }
    if (has('good boy', 'good girl', 'praise me', 'am i good', 'proud of me', 'did good', 'did well')) return say(pick(praiseLines()));
    if (has('my plan', "today's plan", 'todays plan', 'plan for today', 'schedule', 'agenda')) return planText();
    return Chat.reply(raw);
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
        if (!st && findItem(m.itemId)) {
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
      if (m.action === 'food') {
        const acts = document.createElement('div');
        acts.className = 'actions';
        acts.innerHTML = '<button class="done" data-food="1">🍽️ Log food</button>';
        acts.dataset.meal = m.meal || '';
        el.append(acts);
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

    const allDay = allDayEvents();
    $('#allday').hidden = !allDay.length;
    $('#allday').textContent = allDay.length ? `📅 All day: ${allDay.map((ev) => ev.title).join(' · ')}` : '';
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
      const when = it.source === 'calendar' ? (it.cal || 'calendar') : it.source === 'work' ? 'shift' : { daily: 'every day', weekdays: 'weekdays', weekends: 'weekends', once: 'once' }[it.repeat];
      li.querySelector('.tag').textContent = `${CATEGORY_LABEL[it.category] || 'Other'} · ${when}${st === 'skipped' ? ' · skipped' : ''}`;
      if (it.source) li.classList.add(`src-${it.source}`);
      ul.append(li);
    }
  }

  // ---------- navigation ----------
  // ---------- pop-up banner ----------
  let currentView = 'chat';
  let toastTimer = 0, toastMsg = null;
  const toast = $('#toast');
  function showToast(m) {
    // Only when you'd otherwise miss it: app open, set up, and on a tab other than Chat.
    if (currentView === 'chat' || document.hidden || !state.profile) return;
    if (m.itemId && alarmOn()) return; // reminders get the big pop-up instead
    toastMsg = m;
    $('#toast-text').textContent = m.text;
    $('#toast-done').hidden = !(m.itemId && !statusOf(m.itemId) && findItem(m.itemId));
    toast.classList.remove('out');
    toast.hidden = false;
    // Restart the slide-in animation for back-to-back messages.
    toast.style.animation = 'none'; void toast.offsetWidth; toast.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, m.itemId ? 9000 : 6000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    if (toast.hidden) return;
    toast.classList.add('out');
    setTimeout(() => { toast.hidden = true; toast.classList.remove('out'); }, 250);
  }
  toast.addEventListener('click', (e) => {
    if (e.target.closest('#toast-done')) {
      if (toastMsg && toastMsg.itemId) resolve(toastMsg.itemId, 'done');
      hideToast();
      return;
    }
    hideToast();
    show('chat');
  });
  // Swipe up to dismiss.
  let touchY = null;
  toast.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  toast.addEventListener('touchend', (e) => {
    if (touchY !== null && e.changedTouches[0].clientY - touchY < -25) { e.preventDefault(); hideToast(); }
    touchY = null;
  });

  function show(view) {
    currentView = view;
    if (view === 'chat') hideToast();
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${view}`;
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.view === view);
    if (view === 'today') renderToday();
    if (view === 'settings') fillSettings();
    if (view === 'food') Food.render();
    if (view === 'work') Work.render();
    if (view === 'chat') feed.scrollTop = feed.scrollHeight;
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

  // ---------- chat events ----------
  async function userSays(text) {
    text = text.trim();
    if (!text) return;
    addMessage('me', text);
    let r = reply(text, AI.enabled());
    let aiTyped = false;
    if (r === undefined) {
      // Her AI is thinking: show typing until it answers, then fall back to written lines if needed.
      const typing = showTyping();
      const res = await AI.reply(text);
      typing.remove();
      aiTyped = true;
      if (res && res.lines) r = res.lines;
      else {
        if (res && res.error) addMessage('rias', res.error);
        r = reply(text);
      }
      renderToday();
    }
    // She "types" each message for a time that fits its length.
    const lines = r == null ? [] : [].concat(r);
    const typeTime = (line) => Math.min(2600, 500 + line.length * 18 + Math.random() * 400);
    const next = (i) => {
      if (i >= lines.length) { renderStatus(); save(); return; }
      if (i === 0 && aiTyped) { addMessage('rias', lines[0]); next(1); return; }
      const typing = showTyping();
      setTimeout(() => { typing.remove(); addMessage('rias', lines[i]); next(i + 1); }, typeTime(lines[i]));
    };
    next(0);
  }
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#say'); spokeLast = false; userSays(i.value); i.value = ''; });
  $('#mic').hidden = !canListen();
  $('#mic').addEventListener('click', listen);
  $('#quick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { spokeLast = false; userSays(b.dataset.say); } });
  feed.addEventListener('click', (e) => {
    const fb = e.target.closest('[data-food]');
    if (fb) { show('food'); Food.openAdd(fb.parentElement.dataset.meal || mealFor(nowMin())); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.parentElement.dataset.item;
    if (b.dataset.act === 'snooze') snooze(id); else resolve(id, b.dataset.act === 'done' ? 'done' : 'skipped');
  });

  // ---------- food, work, phone calendar, AI ----------
  function silencePast() {
    const f = (state.fired[dateKey()] ||= {});
    for (const it of todaysItems()) if (toMin(it.time) <= nowMin() && !f[it.id]) f[it.id] = 'silent';
  }
  function refresh() { updateSummary(); renderToday(); renderStatus(); }
  const modCtx = {
    state, save, $, R, dateKey, uid, fmtClock, fmtTime, toMin, shiftsOn, silencePast, refresh,
    mealNow: () => mealFor(nowMin()),
    riasLine: (pool) => addMessage('rias', say(pick(pool))),
  };
  const Food = window.createFoodDiary(modCtx);
  const Work = window.createWorkSchedule(modCtx);

  // What Rias's AI knows about right now. Rebuilt for every message.
  function contextText() {
    const now = new Date();
    const nm = nowMin();
    const items = todaysItems().map((it) => {
      const st = statusOf(it.id);
      const state_ = st || (toMin(it.time) <= nm ? 'not done' : 'upcoming');
      return `${fmtTime(it.time)} ${it.title} (${state_})`;
    });
    const allDay = allDayEvents().map((ev) => ev.title);
    const likes = (state.chat && state.chat.likes) || [];
    return [
      'App context for this message (from the app, not written by the user):',
      `Now: ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${fmtClock(now)} (date ${dateKey(now)}, time ${minToTime(nm)}).`,
      `User: ${state.profile.name}. Praise word: "${praiseWord()}". Wakes ${fmtTime(state.profile.wake)}, bedtime ${fmtTime(state.profile.sleep)}. Right now it is ${period(nm)}.`,
      `Today's schedule: ${items.length ? items.join('; ') : 'nothing scheduled'}.`,
      allDay.length ? `All-day calendar events today: ${allDay.join(', ')}.` : '',
      `Work shifts, next 7 days: ${Work.summary()}.`,
      `Food diary today: ${Food.summary()}`,
      likes.length ? `Things the user has said they like: ${likes.join(', ')}.` : '',
    ].filter(Boolean).join('\n');
  }

  const AI = window.createRiasAI({
    state, contextText,
    tools: {
      addReminder({ title, time, repeat, date }) {
        if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'time must be HH:MM' };
        const item = { id: uid(), title, time, category: 'custom', repeat, enabled: true, date: repeat === 'once' ? (date || dateKey()) : undefined };
        state.items.push(item);
        if (item.repeat !== 'once' || item.date === dateKey()) { if (toMin(time) <= nowMin()) (state.fired[dateKey()] ||= {})[item.id] = 'silent'; }
        refresh(); save();
        return { ok: true, added: `${title} at ${time}${item.date ? ` on ${item.date}` : ` (${repeat})`}` };
      },
      addShift({ label, date, weekdays, start, end }) {
        if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return { error: 'start/end must be HH:MM' };
        if (!date && !(weekdays && weekdays.length)) return { error: 'give a date or weekdays' };
        Work.addShift({ label, date: date || null, days: date ? null : weekdays, start, end });
        refresh();
        return { ok: true };
      },
      logFood({ meal, food, kind }) { Food.logFood(meal, food, kind); return { ok: true, today: Food.summary() }; },
      logWater({ glasses }) { return { ok: true, glassesToday: Food.addWater(Math.max(1, Math.min(10, glasses)), false, dateKey()) }; },
      completeTask({ title }) {
        const q = title.toLowerCase();
        const it = todaysItems().find((x) => !statusOf(x.id) && x.title.toLowerCase().includes(q));
        if (!it) return { error: `No open task today matching "${title}"` };
        (state.log[dateKey()] ||= {})[it.id] = 'done';
        state.snoozes = state.snoozes.filter((sn) => sn.id !== it.id);
        refresh(); save();
        return { ok: true, completed: it.title };
      },
    },
  });

  // Phone calendar (Android app only): events from Samsung/Google Calendar.
  function syncCalendar() {
    const N = window.RiasNative;
    if (!N || !N.calendarEvents || !state.settings.phoneCalendar) return;
    try {
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 8);
      const res = JSON.parse(N.calendarEvents(from.getTime(), to.getTime()));
      if (!res.permission) return;
      state.phoneEvents = res.events || [];
      save();
      renderStatus();
    } catch { /* calendar unavailable */ }
  }
  // Called by the Android app after a permission prompt.
  window.riasPermission = (what, granted) => {
    if (what !== 'calendar') return;
    if (granted) { syncCalendar(); refresh(); addMessage('rias', say("I can see your calendar now, {name}. I'll remind you about those events too.")); }
    else { state.settings.phoneCalendar = false; save(); }
    if (!$('#view-settings').hidden) fillSettings();
  };
  function enableCalendar() {
    const N = window.RiasNative;
    if (!N || !N.calendarEvents) return;
    if (N.hasCalendarPermission()) { syncCalendar(); refresh(); }
    else N.requestCalendarPermission();
  }

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
    const item = findItem(id);
    if (item && item.source === 'work') { show('work'); return; }
    if (item && item.source === 'calendar') return; // edit it in your phone's calendar
    openEditor(item);
  });

  // In-app yes/no prompt (window.confirm is blocked in some app views).
  function ask(text) {
    const dlg = $('#ask');
    $('#ask-text').textContent = text;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((done) => dlg.addEventListener('close', () => done(dlg.returnValue === 'yes'), { once: true }));
  }

  // ---------- Rias's picture (chosen from your photos, kept on this phone) ----------
  const PIC_KEY = 'rias-companion-picture';
  const DEFAULT_PIC = 'icons/icon.svg';
  function loadPicture() { try { return localStorage.getItem(PIC_KEY) || ''; } catch { return ''; } }
  function applyPicture(dataUrl) {
    for (const img of document.querySelectorAll('img.avatar')) img.src = dataUrl || DEFAULT_PIC;
  }
  function setPicture(dataUrl) {
    try { if (dataUrl) localStorage.setItem(PIC_KEY, dataUrl); else localStorage.removeItem(PIC_KEY); }
    catch { $('#pic-hint').textContent = 'Couldn’t save the picture on this device (storage is full or blocked).'; return; }
    applyPicture(dataUrl);
    // The Android app keeps its own copy for notifications.
    const N = window.RiasNative;
    if (N && N.setPicture) { try { N.setPicture(dataUrl ? dataUrl.split(',')[1] : ''); } catch { /* older app */ } }
  }
  // Crop to a centered square and shrink to 512px so it's small enough to store.
  function shrinkPicture(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const size = Math.min(512, side);
        const c = document.createElement('canvas');
        c.width = c.height = size;
        // Faces are usually in the upper part of a portrait photo, so crop from a bit above center.
        const sx = (img.naturalWidth - side) / 2;
        const sy = img.naturalHeight > img.naturalWidth ? (img.naturalHeight - side) * 0.25 : (img.naturalHeight - side) / 2;
        c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  $('#pic-choose').addEventListener('click', () => $('#pic-file').click());
  $('#pic-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPicture(await shrinkPicture(file));
      $('#pic-hint').textContent = 'Picture updated. It stays on this phone and is never uploaded.';
    } catch {
      $('#pic-hint').textContent = 'That file couldn’t be opened as a picture. Try a JPG or PNG.';
    }
  });
  $('#pic-reset').addEventListener('click', () => {
    setPicture('');
    $('#pic-hint').textContent = 'Back to the default picture.';
  });

  // ---------- Android app: hand reminders to the phone's alarm system ----------
  // window.RiasNative only exists inside the Android app. There, every reminder and
  // check-in for the next week is scheduled natively, so they fire with the app closed.
  const Native = window.RiasNative;
  let lastSync = '';
  function syncNative() {
    if (!Native || !state.profile) return;
    const today = dateKey();
    // Only reschedule when something that affects the schedule changed.
    const sig = JSON.stringify([state.items, state.settings, state.profile, state.log[today], state.snoozes, today,
      state.shifts, state.phoneEvents, (state.food[today] || []).length, state.water[today] || 0]);
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
      const items = itemsOn(d);
      for (const it of items) {
        const t = at(d, toMin(it.time));
        if (t <= now || log[it.id]) continue;
        events.push({
          at: t, text: `${say(pick(R.due[it.category] || R.due.custom), it)}${alarmOn() ? '' : `\n${fmtTime(it.time)} · ${it.title}`}`,
          itemId: it.id, title: `${fmtTime(it.time)} · ${it.title}`, alarm: alarmOn(),
        });
      }
      if (state.settings.foodReminders) {
        const k = dateKey(d);
        const t = at(d, 21 * 60);
        if (t > now && !(state.food[k] || []).some((f) => f.meal === 'dinner')) events.push({ at: t, text: say(pick(R.food.nudge)) });
        const tw = at(d, 15 * 60);
        if (tw > now && (state.water[k] || 0) < state.settings.waterGoal / 2) events.push({ at: tw, text: say(pick(R.water.nudge), { count: state.water[k] || 0 }) });
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
      const it = findItem(sn.id);
      if (it && sn.at > now) events.push({ at: sn.at, text: say(pick(R.due[it.category] || R.due.custom), it), itemId: it.id, title: it.title, alarm: alarmOn() });
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
    sf.elements.alarmPopup.checked = alarmOn();
    fullScreenHint();
    sf.elements.praise.value = state.settings.praise || 'neutral';
    sf.elements.voice.checked = state.settings.voice !== false;
    fillVoices();
    voiceHint();
    const o = voiceOpts();
    sf.elements.voicePitch.value = o.pitch;
    sf.elements.voiceRate.value = o.rate;
    notifyHint();
    sf.elements.aiOn.checked = state.ai.on;
    sf.elements.aiProvider.value = state.ai.provider;
    sf.elements.aiKey.value = state.ai.key;
    sf.elements.geminiKey.value = state.ai.geminiKey;
    sf.elements.aiModel.value = state.ai.model;
    showProvider();
    sf.elements.phoneCalendar.checked = state.settings.phoneCalendar;
    sf.elements.foodReminders.checked = state.settings.foodReminders;
    sf.elements.waterGoal.value = String(state.settings.waterGoal);
    const N = window.RiasNative;
    $('#calendar-hint').textContent = !(N && N.calendarEvents)
      ? 'Phone calendar sync works in the Android app.'
      : state.settings.phoneCalendar
        ? `Showing ${state.phoneEvents.length} event${state.phoneEvents.length === 1 ? '' : 's'} from your phone's calendar for the next week.`
        : 'Shows events from Samsung Calendar and Google Calendar in Today, and Rias reminds you about them.';
  }
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(state.profile, { name: sf.elements.name.value.trim(), wake: sf.elements.wake.value, sleep: sf.elements.sleep.value });
    Object.assign(state.settings, { checkins: sf.elements.checkins.checked, checkinEvery: Number(sf.elements.checkinEvery.value), notify: sf.elements.notify.checked, praise: sf.elements.praise.value, voice: sf.elements.voice.checked,
      voiceName: sf.elements.voiceName.value, voicePitch: Number(sf.elements.voicePitch.value), voiceRate: Number(sf.elements.voiceRate.value) });
    const calWas = state.settings.phoneCalendar;
    Object.assign(state.settings, {
      phoneCalendar: sf.elements.phoneCalendar.checked,
      foodReminders: sf.elements.foodReminders.checked,
      alarmPopup: sf.elements.alarmPopup.checked,
      waterGoal: Number(sf.elements.waterGoal.value),
    });
    Object.assign(state.ai, {
      on: sf.elements.aiOn.checked, provider: sf.elements.aiProvider.value,
      key: sf.elements.aiKey.value.trim(), model: sf.elements.aiModel.value, geminiKey: sf.elements.geminiKey.value.trim(),
    });
    if (state.settings.phoneCalendar && !calWas) enableCalendar();
    if (!state.settings.phoneCalendar) state.phoneEvents = [];
    applyNativeVoice();
    save();
    addMessage('rias', say('Settings updated. I\'ll keep that in mind, {name}.'));
    show('chat');
  });
  function fillVoices() {
    const sel = sf.elements.voiceName;
    const voices = listVoices();
    sel.textContent = '';
    sel.append(new Option('Automatic', ''));
    for (const v of voices) sel.append(new Option(v.label, v.name));
    sel.value = voices.some((v) => v.name === state.settings.voiceName) ? state.settings.voiceName : '';
  }
  if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => { if (!$('#view-settings').hidden) fillVoices(); });
  // Try the voice settings on the form before saving them.
  $('#hear').addEventListener('click', () => {
    const saved = { ...state.settings };
    Object.assign(state.settings, { voiceName: sf.elements.voiceName.value, voicePitch: Number(sf.elements.voicePitch.value), voiceRate: Number(sf.elements.voiceRate.value) });
    stopSpeaking();
    applyNativeVoice();
    speak(say(pick(praiseLines())), true);
    state.settings = saved;
    setTimeout(voiceHint, 1200);
  });
  // Explains why she might be silent: no speech engine, missing voice data, volume at zero…
  function voiceHint() {
    const hint = $('#voice-hint'), btn = $('#tts-settings');
    const N = window.RiasNative;
    let msg = '', needsSettings = false;
    if (N && N.voiceStatus) {
      let st = {};
      try { st = JSON.parse(N.voiceStatus()); } catch { /* older app */ }
      if (st.status === 'starting') msg = 'Her voice is still loading. Try again in a few seconds.';
      else if (st.status === 'failed') { msg = 'Rias couldn’t connect to your phone’s voice engine. Install “Speech Recognition and Synthesis from Google” from the Play Store, set it as the preferred engine under Settings → Accessibility → Text-to-speech, then reopen the app.'; needsSettings = true; }
      else if (st.status === 'no-language') { msg = 'Your phone is missing voice data for your language. Tap below and download an English voice.'; needsSettings = true; }
      else if (st.status === 'error') { msg = 'That voice couldn’t play. Pick “Automatic” or another voice, or check your phone’s voice settings.'; needsSettings = true; }
      else if (st.volume === 0) msg = 'Your media volume is at zero. Press volume up while the app is open.';
    } else if (!('speechSynthesis' in window) || !speechSynthesis.getVoices().length) {
      msg = 'This browser can’t speak. Use the Android app, or open the page in Chrome.';
    }
    hint.textContent = msg;
    hint.hidden = !msg;
    btn.hidden = !needsSettings && !(N && N.openTtsSettings && msg);
  }
  function showProvider() {
    const g = sf.elements.aiProvider.value === 'gemini';
    $('#ai-gemini').hidden = !g;
    $('#ai-claude').hidden = g;
    $('#ai-hint').textContent = '';
  }
  sf.elements.aiProvider.addEventListener('change', showProvider);
  $('#ai-test').addEventListener('click', async () => {
    const saved = { ...state.ai };
    Object.assign(state.ai, {
      provider: sf.elements.aiProvider.value, key: sf.elements.aiKey.value.trim(),
      model: sf.elements.aiModel.value, geminiKey: sf.elements.geminiKey.value.trim(),
    });
    $('#ai-hint').textContent = 'Testing…';
    $('#ai-hint').textContent = await AI.test();
    // Keep the Gemini model the test picked; restore everything else until you tap Save.
    state.ai = { ...saved, geminiModel: state.ai.geminiModel, geminiModelKey: state.ai.geminiModelKey };
    save();
  });
  $('#tts-settings').addEventListener('click', () => {
    const N = window.RiasNative;
    if (N && N.openTtsSettings) N.openTtsSettings();
  });

  $('#voice-reset').addEventListener('click', () => {
    sf.elements.voicePitch.value = RIAS_PITCH;
    sf.elements.voiceRate.value = RIAS_RATE;
  });

  // Android 14+ asks you to allow pop-ups over the lock screen once.
  function fullScreenHint() {
    const N = window.RiasNative;
    const need = !!(N && N.canFullScreen && alarmOn() && !N.canFullScreen());
    $('#fullscreen-hint').hidden = !need;
    $('#fullscreen-btn').hidden = !need;
    if (need) $('#fullscreen-hint').textContent = 'To pop up over your lock screen like an alarm, Android needs your OK. Tap below and turn on “Allow full screen notifications” for Rias.';
  }
  $('#fullscreen-btn').addEventListener('click', () => { const N = window.RiasNative; if (N && N.openFullScreenSettings) N.openFullScreenSettings(); });

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
  applyNativeVoice();
  applyPicture(loadPicture());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  renderFeed();
  if (!state.profile) {
    $('#onboarding').hidden = false;
  } else {
    // Short hello when you come back after a while (the morning greeting is handled by tick()).
    if (Date.now() - state.lastRias > 3 * 3600000 && (state.greeted[dateKey()] || !isAwake())) {
      addMessage('rias', say(pick(R.greet[period()])));
    }
    syncCalendar();
    applyNativeActions();
    tick();
  }
  renderStatus();
  setInterval(tick, 20000);
  setInterval(syncCalendar, 15 * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    syncCalendar(); applyNativeActions(); tick(); renderFeed(); renderToday();
    if (state.profile && !$('#view-settings').hidden) { notifyHint(); fullScreenHint(); }
  });
})();
