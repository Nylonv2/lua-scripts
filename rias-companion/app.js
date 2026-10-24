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
      alarmCats: ['wake', 'meds', 'shift', 'calendar', 'custom', 'sleep'],
      homeChar: 'animated',
      calorieGoal: 2000, proteinGoal: 120, carbGoal: 225, fatGoal: 65,
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
    // A one-off shift replaces the same job's weekly shift that day, and weekly shifts
    // can be skipped on single dates (both come from the week planner).
    const oneOffs = state.shifts.filter((sh) => sh.date === k);
    const job = (sh) => sh.label || 'Work';
    return oneOffs.concat(state.shifts.filter((sh) => !sh.date && (sh.days || []).includes(day) && !(sh.from && k < sh.from) && !(sh.until && k > sh.until)
      && !(sh.skip || []).includes(k) && !oneOffs.some((o) => job(o) === job(sh))));
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
    state.shifts = state.shifts.filter((sh) => !sh.until || sh.until >= today);
    for (const sh of state.shifts) if (sh.skip) sh.skip = sh.skip.filter((k) => k >= today);
  }

  // ---------- messages ----------
  let Avatar = null; // the animated Rias: on Home, and standing in the chat scene while you talk
  let chatMoodTimer = 0;
  function addMessage(from, text, extra = {}) {
    const m = { id: uid(), from, text, ts: Date.now(), ...extra };
    state.messages.push(m);
    if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    if (from === 'rias') state.lastRias = m.ts;
    save();
    renderFeed();
    if (from === 'rias') { speak(text); Chat.noteRias(text); showToast(m); chatEffects(text); }
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
  // Reminder types you can pick for the alarm pop-up; work-shift items share one switch.
  const ALARM_CATS = [
    ['wake', '⏰ Wake up'], ['meds', '💊 Medication'], ['meal', '🍽️ Meals'], ['water', '💧 Water'],
    ['shift', '💼 Work shifts'], ['calendar', '📅 Phone calendar'], ['work', '📚 Work / study'], ['exercise', '🏃 Exercise'],
    ['hygiene', '🪥 Hygiene'], ['break', '☕ Breaks'], ['social', '💬 Social'], ['chores', '🧹 Chores'],
    ['wind', '🌙 Wind down'], ['sleep', '😴 Sleep'], ['custom', '📌 Other reminders'],
  ];
  const catGroup = (cat) => (/^work(Leave|Start|End)$/.test(cat) ? 'shift' : cat);
  // Per-reminder choice wins; otherwise the type's setting.
  function alarmFor(item) {
    if (!alarmOn() || !item) return false;
    if (item.popup === 'alarm') return true;
    if (item.popup === 'normal') return false;
    return (state.settings.alarmCats || []).includes(catGroup(item.category));
  }
  function showAlarm(item, text) {
    if (!alarmFor(item) || document.hidden) return;
    showAlarmCard(item, text);
  }
  function showAlarmCard(item, text) {
    if (alarmDlg.open) { alarmQueue.push([item, text]); return; }
    alarmItem = item;
    $('#alarm-time').textContent = fmtClock(Date.now());
    $('#alarm-title').textContent = item.title;
    $('#alarm-text').textContent = text;
    $('#alarm-done').hidden = $('#alarm-snooze').hidden = !item.id; // tests only get Dismiss
    alarmDlg.showModal();
    const N = window.RiasNative;
    if (N && N.buzz) { try { N.buzz(); } catch { /* older app */ } }
    else if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
  }
  function closeAlarm() {
    if (alarmDlg.open) alarmDlg.close();
    alarmItem = null;
    const next = alarmQueue.shift();
    if (next) setTimeout(() => showAlarmCard(...next), 300);
  }
  $('#alarm-done').addEventListener('click', () => { const it = alarmItem; closeAlarm(); if (it && it.id) resolve(it.id, 'done'); });
  $('#alarm-snooze').addEventListener('click', () => { const it = alarmItem; closeAlarm(); if (it && it.id) snooze(it.id); });
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
  // What Rias is up to right now (same all through each 2-hour block, so it feels real).
  const ACTIVITIES = {
    morning: ['Having morning tea', 'Reviewing club reports', 'On her way to Kuoh Academy', 'Brushing her hair (it takes a while)'],
    afternoon: ['In the Occult Research Club room', 'Playing chess with Kiba', 'Sharing sweets with Koneko', 'Reading reports from the Underworld'],
    evening: ['Having tea with Akeno', 'Reading manga in the club room', 'Planning tomorrow\'s club activities', 'Video-calling her brother (he won\'t stop talking)'],
    night: ['Fast asleep… shh', 'Stargazing on the club room roof', 'Reading in bed'],
  };
  function riasActivity() {
    const p = state.profile ? period() : 'afternoon';
    const list = ACTIVITIES[p];
    const d = new Date();
    const seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate() + Math.floor(d.getHours() / 2) * 7;
    return list[seed % list.length];
  }
  function renderChatHead() {
    const act = riasActivity();
    $('#chat-activity').textContent = act;
    $('.chat-head').classList.toggle('asleep', /asleep/i.test(act));
    // The room's light follows the time of day.
    const v = $('#view-chat');
    v.dataset.period = period();
    v.classList.toggle('asleep', /asleep/i.test(act));
  }

  const seenMsgs = new Set();
  let feedPrimed = false;
  function dayLabel(ts) {
    const d = new Date(ts), t = new Date();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function renderFeed() {
    const wasNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
    feed.textContent = '';
    const pic = loadPicture() || DEFAULT_PIC;
    const msgs = state.messages;
    msgs.forEach((m, i) => {
      const prev = msgs[i - 1], next = msgs[i + 1];
      if (!prev || dayLabel(prev.ts) !== dayLabel(m.ts)) {
        const sep = document.createElement('div');
        sep.className = 'day-sep';
        sep.innerHTML = '<span></span>';
        sep.firstChild.textContent = dayLabel(m.ts);
        feed.append(sep);
      }
      // Rias's messages in a row form a group: name on the first, her picture on the last.
      const sameAsPrev = prev && prev.from === m.from && m.ts - prev.ts < 5 * 60000 && dayLabel(prev.ts) === dayLabel(m.ts);
      const sameAsNext = next && next.from === m.from && next.ts - m.ts < 5 * 60000 && dayLabel(next.ts) === dayLabel(m.ts);
      const el = document.createElement('div');
      el.className = `msg ${m.from}${sameAsPrev ? '' : ' first'}`;
      if (feedPrimed && !seenMsgs.has(m.id)) el.classList.add('fresh');
      seenMsgs.add(m.id);
      if (m.photo) {
        const img = document.createElement('img');
        img.className = 'msg-photo';
        img.src = m.photo;
        img.alt = 'Photo you sent';
        el.append(img);
      }
      if (m.from === 'rias' && el.classList.contains('fresh')) {
        // Her newest words drift in one at a time, as if she's saying them.
        let n = 0;
        for (const w of m.text.split(/(\s+)/)) {
          if (!w.trim()) { el.append(w); continue; }
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = w;
          span.style.animationDelay = `${Math.min(n++ * 55, 3000)}ms`;
          el.append(span);
        }
      } else el.append(m.text);
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
      if (!sameAsNext) {
        const time = document.createElement('time');
        time.textContent = fmtClock(m.ts);
        el.append(time);
      }
      if (m.from === 'rias') {
        const row = document.createElement('div');
        row.className = `msg-row${sameAsNext ? ' grouped' : ''}${sameAsPrev ? '' : ' first'}`;
        const av = document.createElement('img');
        av.className = 'avatar msg-av';
        av.src = pic;
        av.alt = '';
        if (sameAsNext) av.style.visibility = 'hidden';
        row.append(av, el);
        feed.append(row);
      } else {
        if (sameAsNext) el.classList.add('grouped');
        feed.append(el);
      }
    });
    feedPrimed = true;
    if (wasNearBottom || feed.dataset.init !== '1') { feed.scrollTop = feed.scrollHeight; feed.dataset.init = '1'; }
  }

  // Little moments: hearts when she praises you, a crimson flash for the Power of Destruction.
  function chatEffects(text) {
    const fx = $('#feed-fx');
    if (!fx || currentView !== 'chat') return;
    if (Avatar) {
      Avatar.talk(text.length * 55);
      const mood = /good (boy|girl)|proud of you|ufufu|love|happy|well done|perfect/i.test(text) ? 'happy'
        : /worried|haven't|still|don't keep me waiting|missed/i.test(text) ? 'worried' : null;
      clearTimeout(chatMoodTimer);
      if (mood) { Avatar.setMood(mood); chatMoodTimer = setTimeout(() => Avatar.setMood(baseMood()), 5000); }
    }
    if (/power of destruction|destroy|obliterat/i.test(text)) {
      fx.classList.remove('flash'); void fx.offsetWidth; fx.classList.add('flash');
    }
    if (/good (boy|girl)|proud of you|that's my|i love|treasure|ufufu/i.test(text)) {
      for (let i = 0; i < 9; i++) {
        const h = document.createElement('span');
        h.className = 'fx-heart';
        h.textContent = i % 3 === 0 ? '✦' : '♥';
        h.style.left = `${10 + Math.random() * 80}%`;
        h.style.animationDelay = `${i * 70}ms`;
        h.style.fontSize = `${14 + Math.random() * 14}px`;
        fx.append(h);
        setTimeout(() => h.remove(), 2200);
      }
    }
  }

  // While she "types", she thinks in the scene: dots beside her head.
  function showTyping() {
    const view = $('#view-chat');
    view.classList.add('thinking');
    return { remove() { view.classList.remove('thinking'); } };
  }

  function renderStatus() {
    if (!state.profile) return;
    const p = pendingItem();
    const nm = nowMin();
    const next = todaysItems().find((it) => toMin(it.time) > nm && !statusOf(it.id));
    $('#status').textContent = p ? `Waiting on you: ${p.title}`
      : next ? `Next: ${next.title} · ${fmtTime(next.time)}`
      : isAwake() ? 'Occult Research Club · online' : 'Resting… goodnight';
    if (currentView === 'home') renderHome();
    if (currentView === 'chat') renderChatHead();
  }

  // ---------- Reminders page ----------
  let todayFilter = 'all';
  const ICON = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const PARTS = [['Morning', 4 * 60, 12 * 60], ['Afternoon', 12 * 60, 17 * 60], ['Evening', 17 * 60, 21 * 60], ['Night', 21 * 60, 28 * 60]];
  const partOf = (m) => { const x = m < 4 * 60 ? m + 1440 : m; return PARTS.find(([, a, b]) => x >= a && x < b)[0]; };

  function renderToday() {
    const list = todaysItems();
    const nm = nowMin();
    const fired = state.fired[dateKey()] || {};
    const done = list.filter((it) => statusOf(it.id) === 'done').length;
    const now = new Date();
    $('#today-weekday').textContent = now.toLocaleDateString([], { weekday: 'long' });
    $('#today-date').textContent = now.toLocaleDateString([], { month: 'long', day: 'numeric' });
    $('#progress-text').textContent = `${done} of ${list.length}`;
    $('#ring').style.strokeDasharray = `${list.length ? (done / list.length) * 100 : 0} 100`;
    const s = streak();
    $('#streak-text').textContent = s ? `done · 🔥 ${s}-day streak` : 'done today';

    const allDay = allDayEvents();
    $('#allday').hidden = !allDay.length;
    $('#allday').textContent = allDay.length ? `📅 All day · ${allDay.map((ev) => ev.title).join(' · ')}` : '';

    for (const b of document.querySelectorAll('#today-filter button')) b.classList.toggle('active', b.dataset.f === todayFilter);
    const shown = list.filter((it) => {
      const st = statusOf(it.id);
      return todayFilter === 'all' || (todayFilter === 'todo' ? !st : !!st);
    });
    const nextId = (list.find((it) => toMin(it.time) >= nm && !statusOf(it.id)) || {}).id;
    const box = $('#items-groups');
    box.textContent = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="empty-ic">${ICON(todayFilter === 'done' ? 'check' : 'list')}</div><b></b><p></p>`;
      empty.querySelector('b').textContent = !list.length ? 'Nothing planned today' : todayFilter === 'done' ? 'Nothing done yet' : 'All done for today';
      empty.querySelector('p').textContent = !list.length ? 'Tap “New reminder”, or just tell Rias what to remind you about.' : todayFilter === 'done' ? 'Finished reminders show up here.' : 'Ufufu — that\'s my ' + praiseWord() + '.';
      box.append(empty);
      return;
    }
    for (const [part] of PARTS) {
      const items = shown.filter((it) => partOf(toMin(it.time)) === part);
      if (!items.length) continue;
      const sec = document.createElement('section');
      sec.className = 'group';
      const h = document.createElement('h3');
      h.className = 'group-title';
      h.innerHTML = '<span></span><span class="count"></span>';
      h.firstChild.textContent = part;
      h.lastChild.textContent = `${items.filter((it) => statusOf(it.id) === 'done').length}/${items.length}`;
      const card = document.createElement('div');
      card.className = 'list-card';
      for (const it of items) {
        const st = statusOf(it.id);
        const row = document.createElement('div');
        row.className = 'row-item';
        row.dataset.id = it.id;
        let flag = '';
        if (st === 'done') row.classList.add('done');
        else if (st === 'skipped') { row.classList.add('skipped'); flag = 'Skipped'; }
        else if (fired[it.id] && toMin(it.time) <= nm && nm - toMin(it.time) > FIRE_WINDOW_MIN) { row.classList.add('missed'); flag = 'Missed'; }
        else if (fired[it.id] && toMin(it.time) <= nm) { row.classList.add('now'); flag = 'Now'; }
        else if (it.id === nextId) { row.classList.add('next'); flag = 'Up next'; }
        row.innerHTML = `<button type="button" class="check" aria-label="Mark done">${ICON('check')}</button>`
          + '<div class="ri-main"><div class="ri-title"></div><div class="ri-meta"></div></div>'
          + (it.source === 'calendar' ? '' : `<span class="ri-chev">${ICON('chevron')}</span>`);
        row.querySelector('.check').setAttribute('aria-label', st === 'done' ? `Undo ${it.title}` : `Mark ${it.title} done`);
        row.querySelector('.ri-title').textContent = it.title;
        const meta = row.querySelector('.ri-meta');
        const add = (text, cls) => { const sp = document.createElement('span'); sp.className = cls || ''; sp.textContent = text; meta.append(sp); };
        add(fmtTime(it.time), 'ri-time');
        if (it.source === 'calendar') add(it.cal || 'Calendar', 'tag-chip cal');
        else if (it.source === 'work') add('Work shift', 'tag-chip work');
        else add(`${CATEGORY_LABEL[it.category] || 'Other'}${it.repeat && it.repeat !== 'daily' ? ` · ${{ weekdays: 'weekdays', weekends: 'weekends', once: 'once' }[it.repeat]}` : ''}`, 'ri-sub');
        if (alarmFor(it)) add('⏰ Alarm', 'tag-chip alm');
        if (flag) add(flag, `tag-chip flag ${flag === 'Missed' ? 'warn' : ''}`);
        card.append(row);
      }
      sec.append(h, card);
      box.append(sec);
    }
  }
  $('#today-filter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    todayFilter = b.dataset.f;
    renderToday();
  });
  // Settings > "Phone calendar & other apps": phone calendar status + the share-to-Rias tip.
  function renderSync() {
    const N = window.RiasNative;
    const status = $('#cal-status'), btn = $('#cal-action');
    $('#cal-app-settings').hidden = true;
    $('#cal-disconnect').hidden = !state.settings.phoneCalendar;
    if (!(N && N.calendarEvents)) {
      status.textContent = 'Available in the Android app.';
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    if (!state.settings.phoneCalendar) {
      status.textContent = 'Not connected. Shows Samsung & Google Calendar events in Reminders.';
      btn.textContent = 'Connect';
      btn.classList.remove('tonal');
    } else if (!N.hasCalendarPermission()) {
      status.textContent = 'Rias needs permission to read your calendar.';
      btn.textContent = 'Allow';
      btn.classList.remove('tonal');
      $('#cal-app-settings').hidden = !N.openAppSettings;
    } else {
      const week = state.phoneEvents.length;
      const when = state.calSyncedAt ? ` · synced ${fmtClock(state.calSyncedAt)}` : '';
      status.textContent = `Connected · ${week} event${week === 1 ? '' : 's'} this week${when}`;
      btn.textContent = 'Sync now';
      btn.classList.add('tonal');
    }
  }
  $('#cal-action').addEventListener('click', () => {
    const N = window.RiasNative;
    if (!N) return;
    if (!state.settings.phoneCalendar || !N.hasCalendarPermission()) {
      state.settings.phoneCalendar = true;
      save();
      enableCalendar();
    } else {
      syncCalendar();
      refresh();
    }
    renderSync();
  });
  $('#cal-disconnect').addEventListener('click', () => {
    state.settings.phoneCalendar = false;
    state.phoneEvents = [];
    state.calSyncedAt = 0;
    save();
    refresh();
    renderSync();
  });
  $('#cal-app-settings').addEventListener('click', () => { const N = window.RiasNative; if (N && N.openAppSettings) N.openAppSettings(); });

  // ---------- navigation ----------
  // ---------- pop-up banner ----------
  let currentView = 'home';
  let toastTimer = 0, toastMsg = null;
  const toast = $('#toast');
  function showToast(m) {
    // Only when you'd otherwise miss it: app open, set up, and on a tab other than Chat.
    if (currentView === 'chat' || document.hidden || !state.profile) return;
    if (m.itemId && alarmFor(findItem(m.itemId))) return; // these get the big pop-up instead
    if (currentView === 'home') { homeSay(m.text); return; } // she says it herself on Home
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

  // Phone back button / browser back: close a pop-up first, then go Home.
  window.riasBack = () => {
    const open = document.querySelector('dialog[open]');
    if (open) { if (open.id === 'alarm') closeAlarm(); else open.close(); return true; }
    if (currentView !== 'home' && state.profile) { show('home'); return true; }
    return false;
  };
  window.addEventListener('popstate', () => { window.riasBack(); });
  $('.top .who').addEventListener('click', () => show('home'));
  $('.top .avatar').addEventListener('click', () => show('home'));

  $('#chat-settings').addEventListener('click', () => show('settings'));
  function show(view) {
    document.querySelector('.app').dataset.view = view;
    // Leaving Home adds a history entry so browser back returns there.
    if (view !== 'home' && currentView === 'home' && !window.RiasNative) { try { history.pushState({ rias: view }, ''); } catch { /* ignore */ } }
    currentView = view;
    if (view === 'chat') hideToast();
    if (view === 'chat' || view === 'home') placeRias(view);
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${view}`;
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.view === view);
    if (view === 'today') renderToday();
    if (view === 'settings') fillSettings();
    if (view === 'food') Food.render();
    if (view === 'home') renderHome();
    if (view === 'work') Work.render();
    if (view === 'chat') { renderChatHead(); feed.scrollTop = feed.scrollHeight; }
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

  // ---------- chat events ----------
  // `photo` = { full: base64 JPEG for the AI, thumb: small data URL kept in the chat }.
  async function userSays(text, photo) {
    text = text.trim();
    if (!text && !photo) return;
    if (photo && !text) text = 'Here’s a photo of my work schedule. Can you add my shifts?';
    addMessage('me', text, photo ? { photo: photo.thumb } : {});
    if (photo && !AI.enabled()) {
      addMessage('rias', say('I need my AI turned on to read photos, {name}. Set it up in Settings → Rias’s mind (a free Gemini key works). Or use Work → Plan my week and paste the schedule as text.'));
      return;
    }
    let r = photo ? undefined : reply(text, AI.enabled());
    let aiTyped = false;
    if (r === undefined) {
      // Her AI is thinking: show typing until it answers, then fall back to written lines if needed.
      const typing = showTyping();
      const res = await AI.reply(text, photo && photo.full);
      typing.remove();
      aiTyped = true;
      if (res && res.lines) r = res.lines;
      else {
        if (res && res.error) addMessage('rias', res.error);
        r = photo ? say('I couldn’t read that photo just now, {name}. Check your internet and try again, or paste the schedule as text in Work → Plan my week.') : reply(text);
      }
      renderToday();
      if (photo && !$('#view-work').hidden) Work.render();
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
  // 📷 Send Rias a photo (her AI reads it, e.g. a work schedule).
  function shrinkPhoto(file, max) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const out = (limit, q) => {
          const k = Math.min(1, limit / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k);
          c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', q);
        };
        // Big enough to read small print, small enough to send quickly.
        const full = out(max, 0.85).split(',')[1];
        const thumb = out(360, 0.7);
        URL.revokeObjectURL(url);
        resolve({ full, thumb });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  const pickPhoto = () => $('#photo-file').click();
  $('#attach').addEventListener('click', pickPhoto);
  $('#work-photo').addEventListener('click', () => { show('chat'); pickPhoto(); });
  $('#photo-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const photo = await shrinkPhoto(file, 1800);
      const i = $('#say');
      const text = i.value;
      i.value = '';
      spokeLast = false;
      userSays(text, photo);
    } catch {
      addMessage('rias', say('That file didn’t open as a picture, {name}. Try a screenshot or a JPG.'));
    }
  });
  $('#mic').hidden = !canListen();
  $('#mic').addEventListener('click', listen);
  $('#quick').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.photo) { pickPhoto(); return; }
    spokeLast = false;
    userSays(b.dataset.say);
  });
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
    // Food dialog's "Ask Rias to estimate" (AI is created further down; used only on tap).
    canEstimate: () => AI.enabled(),
    estimate: (text) => AI.estimate(text),
    riasLine: (pool) => addMessage('rias', say(pick(pool))),
  };
  // ---------- time picker sheet: hour / minute / AM-PM taps ----------
  const tp = { dlg: $('#time-picker'), min: 9 * 60, cb: null };
  for (let h = 1; h <= 12; h++) $('#tp-hours').insertAdjacentHTML('beforeend', `<button type="button" data-h="${h}">${h}</button>`);
  for (const m of [0, 15, 30, 45]) $('#tp-mins').insertAdjacentHTML('beforeend', `<button type="button" data-m="${m}">:${String(m).padStart(2, '0')}</button>`);
  function tpRender() {
    const h24 = Math.floor(tp.min / 60), m = tp.min % 60, h12 = h24 % 12 || 12, pm = h24 >= 12;
    $('#tp-preview').textContent = `${h12}:${String(m).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
    for (const b of $('#tp-hours').children) b.classList.toggle('on', Number(b.dataset.h) === h12);
    for (const b of $('#tp-mins').children) b.classList.toggle('on', Number(b.dataset.m) === m);
    for (const b of $('#tp-ampm').children) b.classList.toggle('on', (b.dataset.ap === 'pm') === pm);
  }
  modCtx.pickTime = (label, value, cb) => {
    const [h, m] = (value || '09:00').split(':').map(Number);
    tp.min = h * 60 + m;
    tp.cb = cb;
    $('#tp-label').textContent = label;
    tpRender();
    tp.dlg.showModal();
  };
  $('#tp-form').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const h24 = Math.floor(tp.min / 60), m = tp.min % 60, pm = h24 >= 12;
    if (b.dataset.h) tp.min = ((Number(b.dataset.h) % 12) + (pm ? 12 : 0)) * 60 + m;
    else if (b.dataset.m) tp.min = h24 * 60 + Number(b.dataset.m);
    else if (b.dataset.ap) tp.min = ((h24 % 12) + (b.dataset.ap === 'pm' ? 12 : 0)) * 60 + m;
    else if (b.dataset.step) tp.min = (tp.min + Number(b.dataset.step) + 1440) % 1440;
    else if (b.id === 'tp-done') { tp.dlg.close(); if (tp.cb) tp.cb(minToTime(tp.min)); return; }
    else if (b.id === 'tp-clear') { tp.dlg.close(); if (tp.cb) tp.cb(''); return; }
    else if (b.id === 'tp-cancel') { tp.dlg.close(); return; }
    tpRender();
  });

  // Every other time box in the app uses the same picker instead of the phone's own.
  for (const el of document.querySelectorAll('input[type=time]')) el.readOnly = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest('input[type=time]');
    if (!el || el.closest('#time-picker')) return;
    e.preventDefault();
    const label = el.getAttribute('aria-label') || (el.closest('label') ? el.closest('label').firstChild.textContent.trim() : 'Time');
    modCtx.pickTime(label, el.value, (value) => {
      if (!value) return; // these boxes always need a time
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

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
      `What you (Rias) are doing right now, shown in the app; stay consistent if it comes up: ${riasActivity()}.`,
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
        // Re-sending a schedule shouldn't double it: replace that day's shift for the same job.
        if (date) state.shifts = state.shifts.filter((sh) => !(sh.date === date && (sh.label || 'Work') === (label || 'Work')));
        Work.addShift({ label, date: date || null, days: date ? null : weekdays, start, end });
        refresh();
        return { ok: true };
      },
      logFood({ meal, food, kind, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g }) {
        const r = (v) => (typeof v === 'number' && v >= 0 ? Math.round(v) : undefined);
        const n = r(calories) == null ? undefined : { kcal: r(calories), p: r(protein_g), c: r(carbs_g), f: r(fat_g), fiber: r(fiber_g), sugar: r(sugar_g) };
        Food.logFood(meal, food, kind, new Date(), n);
        if (!$('#view-food').hidden) Food.render();
        return { ok: true, today: Food.summary() };
      },
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
      state.calSyncedAt = Date.now();
      save();
      renderStatus();
    } catch { /* calendar unavailable */ }
  }
  // Called by the Android app after a permission prompt.
  window.riasPermission = (what, granted) => {
    if (what !== 'calendar') return;
    if (granted) { syncCalendar(); refresh(); addMessage('rias', say("I can see your calendar now, {name}. I'll remind you about those events too.")); }
    // Denied: keep it switched on so Settings shows "Allow" and the Android settings link.
    renderSync();
  };
  function enableCalendar() {
    const N = window.RiasNative;
    if (!N || !N.calendarEvents) return;
    if (N.hasCalendarPermission()) { syncCalendar(); refresh(); }
    else N.requestCalendarPermission();
  }

  // ---------- Home screen ----------
  Avatar = window.createRiasAvatar($('#stage'));
  let moodTimer = 0;
  const baseMood = () => (!state.profile ? 'neutral' : !isAwake() ? 'sleepy' : pendingItem() ? 'worried' : 'neutral');
  function homeSay(text, mood) {
    const b = $('#home-bubble');
    b.textContent = text;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(moodTimer);
    if (mood) { Avatar.setMood(mood); moodTimer = setTimeout(() => Avatar.setMood(baseMood()), 4500); }
    Avatar.talk(text.length * 55);
    const pic = $('#stage-pic');
    pic.classList.add('talking');
    setTimeout(() => pic.classList.remove('talking'), Math.min(text.length * 55, 8000));
  }
  // What she says when you tap her: whatever is most useful right now.
  function homeLine() {
    const p = pendingItem();
    if (p) return [say(`You still haven't done “${p.title}”, {name}. Go on — I'll wait~`), 'worried'];
    if (!isAwake()) return [say(pick(R.lateNight)), 'sleepy'];
    const glasses = state.water[dateKey()] || 0;
    if (glasses < state.settings.waterGoal / 2 && nowMin() > 12 * 60 && Math.random() < 0.5) return [say(pick(R.water.nudge), { count: glasses }), 'worried'];
    const nm = nowMin();
    const next = todaysItems().find((it) => toMin(it.time) > nm && !statusOf(it.id));
    const T = window.RIAS_TALK;
    const options = [];
    if (next) options.push([say(`Next up at ${fmtTime(next.time)}: ${next.title}. I'll remind you~`), 'neutral']);
    if (doneToday()) options.push([say(pick(praiseLines())), 'happy']);
    options.push([say(pick([].concat(T.whatDoing))), 'happy']);
    if (R.checkin[period()]) options.push([checkinLine(period(), doneToday()), 'neutral']);
    const o = pick(options);
    return [[].concat(o[0]).join(' '), o[1]];
  }
  // One Rias: she stands on Home, and walks into the chat scene when you talk to her.
  function placeRias(view) {
    const host = view === 'chat' ? $('#scene-rias') : $('.home-hero');
    for (const el of [$('#stage'), $('#stage-pic')]) if (el.parentElement !== host) host.append(el);
    if (Avatar && Avatar.mood !== 'happy') Avatar.setMood(baseMood());
  }
  function onRiasTap() {
    Avatar.react();
    if (currentView === 'chat') { addMessage('rias', homeLine()[0]); return; }
    const [text, mood] = homeLine();
    homeSay(text, mood === 'neutral' ? 'happy' : mood);
    speak(text);
  }
  $('#stage').addEventListener('click', onRiasTap);
  $('#stage-pic').addEventListener('click', onRiasTap);

  function renderHome() {
    if (!state.profile) return;
    const animated = state.settings.homeChar !== 'picture' || !loadPicture();
    $('#stage').hidden = !animated;
    $('#stage-pic').hidden = animated;
    const nm = nowMin();
    const hello = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Still up' }[period(nm)];
    $('#home-hello').textContent = `${hello}, ${state.profile.name}${period(nm) === 'night' ? '?' : ''}`;
    $('#home-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    if (!$('#home-bubble').textContent) $('#home-bubble').textContent = say(pick(R.greet[period(nm)] || R.greet.evening));
    if (Avatar.mood !== 'happy') Avatar.setMood(baseMood());

    // Next up / waiting on you.
    const card = $('#next-card');
    const p = pendingItem();
    const next = p || todaysItems().find((it) => toMin(it.time) > nm && !statusOf(it.id));
    card.classList.toggle('waiting', !!p);
    card.textContent = '';
    const info = document.createElement('div');
    info.className = 'next-info';
    info.innerHTML = '<div class="next-label"></div><div class="next-title"></div><div class="next-time"></div>';
    if (next) {
      info.querySelector('.next-label').textContent = p ? 'Waiting on you' : 'Up next';
      info.querySelector('.next-title').textContent = next.title;
      info.querySelector('.next-time').textContent = `${fmtTime(next.time)}${alarmFor(next) ? ' · ⏰ alarm' : ''}`;
      const acts = document.createElement('div');
      acts.className = 'next-actions';
      acts.innerHTML = '<button type="button" class="done" data-next="done">Done ✓</button>';
      if (p) acts.insertAdjacentHTML('beforeend', '<button type="button" data-next="snooze">Snooze</button>');
      acts.dataset.item = next.id;
      card.append(info, acts);
    } else {
      info.querySelector('.next-label').textContent = 'All caught up';
      info.querySelector('.next-title').textContent = todaysItems().length ? 'Nothing left on today\'s list 🎉' : 'Nothing scheduled today';
      info.querySelector('.next-time').textContent = 'Tap Rias to chat, or add a reminder below.';
      card.append(info);
    }

    // Tiles
    const list = todaysItems();
    const done = list.filter((it) => statusOf(it.id) === 'done').length;
    $('#tile-today').textContent = `${done} / ${list.length}`;
    $('#tile-today-sub').textContent = `done · streak ${streak()} 🔥`;
    $('#tile-water').textContent = `${state.water[dateKey()] || 0} / ${state.settings.waterGoal} 💧`;
    const meals = state.food[dateKey()] || [];
    const t = Food.totals(dateKey());
    $('#tile-food').textContent = t.counted ? `${Math.round(t.kcal).toLocaleString()} kcal` : `${meals.length} logged`;
    $('#tile-food-sub').textContent = t.counted ? `of ${Food.goals().kcal.toLocaleString()} · P ${Math.round(t.p)}g` : meals.length ? meals[meals.length - 1].text : 'Tap to log a meal';
    const shifts = shiftsOn(new Date());
    if (shifts.length) {
      $('#tile-work').textContent = `${fmtTime(shifts[0].start)}`;
      $('#tile-work-sub').textContent = `${shifts[0].label || 'Work'} until ${fmtTime(shifts[0].end)}`;
    } else {
      let nextShift = '';
      for (let i = 1; i < 8 && !nextShift; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const sh = shiftsOn(d)[0];
        if (sh) nextShift = `Next: ${d.toLocaleDateString([], { weekday: 'short' })} ${fmtTime(sh.start)}`;
      }
      $('#tile-work').textContent = 'Day off';
      $('#tile-work-sub').textContent = nextShift || (state.shifts.length ? 'No shifts this week' : 'Tap to add shifts');
    }
  }
  $('#next-card').addEventListener('click', (e) => {
    const b = e.target.closest('[data-next]');
    if (!b) { show('today'); return; }
    const id = b.parentElement.dataset.item;
    if (b.dataset.next === 'snooze') snooze(id); else resolve(id, 'done');
    renderHome();
  });
  document.querySelector('.tiles').addEventListener('click', (e) => {
    if (e.target.closest('#tile-water-add')) {
      const n = Food.addWater(1, false, dateKey());
      homeSay(n >= state.settings.waterGoal ? say(pick(R.water.goal)) : say(`That's ${n} glass${n === 1 ? '' : 'es'} today. Good — keep going~`), 'happy');
      renderHome();
      return;
    }
    const t = e.target.closest('[data-go]');
    if (t) show(t.dataset.go);
  });
  $('#qa-talk').addEventListener('click', () => { show('chat'); $('#say').focus(); });
  $('#qa-mic').addEventListener('click', () => { show('chat'); listen(); });
  $('#qa-remind').addEventListener('click', () => { show('today'); openEditor(null); });
  $('#qa-food').addEventListener('click', () => { show('food'); Food.openAdd(mealFor(nowMin())); });
  $('#open-settings').addEventListener('click', () => show('settings'));
  $('#qa-mic').hidden = !canListen();

  // ---------- shared from other apps (Android "Share → Rias") ----------
  // Text: a reminder from Samsung Reminder, Google Keep, a message... Image: a schedule or meal photo.
  function guessTime(text) {
    const m = text.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)\b/i) || text.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!m) return null;
    let h = Number(m[1]) % 24;
    const ap = (m[3] || '').toLowerCase()[0];
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return minToTime(h * 60 + Number(m[2] || 0));
  }
  window.riasShared = (item) => {
    if (!state.profile || !item) return;
    if (item.type === 'image' && item.data) {
      show('chat');
      // Same path as the 📷 button: Rias's AI reads it (schedule → shifts, meal → food log).
      const thumbImg = new Image();
      thumbImg.onload = () => {
        const k = Math.min(1, 360 / Math.max(thumbImg.width, thumbImg.height));
        const c = document.createElement('canvas');
        c.width = Math.round(thumbImg.width * k); c.height = Math.round(thumbImg.height * k);
        c.getContext('2d').drawImage(thumbImg, 0, 0, c.width, c.height);
        userSays(item.text || 'I shared this with you. Can you add it to my schedule or food log?', { full: item.data, thumb: c.toDataURL('image/jpeg', 0.7) });
      };
      thumbImg.onerror = () => userSays(item.text || 'I shared a picture with you.', { full: item.data, thumb: '' });
      thumbImg.src = `data:image/jpeg;base64,${item.data}`;
      return;
    }
    const text = String(item.text || '').trim();
    if (!text) return;
    if (AI.enabled()) {
      show('chat');
      userSays(`Please add this as a reminder for me: “${text}”`);
      return;
    }
    // Without AI: open the new-reminder sheet filled in.
    show('today');
    openEditor(null);
    const firstLine = text.split('\n').find((l) => l.trim()) || text;
    ef.elements.title.value = firstLine.replace(/\s+/g, ' ').slice(0, 60);
    const t = guessTime(text);
    if (t) ef.elements.time.value = t;
  };

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
    ef.elements.popup.value = (item && item.popup) || 'default';
    $('#edit-delete').hidden = !item;
    $('#date-wrap').hidden = ef.elements.repeat.value !== 'once';
    editor.showModal();
  }
  ef.addEventListener('change', (e) => { if (e.target.name === 'repeat') $('#date-wrap').hidden = ef.elements.repeat.value !== 'once'; });
  $('#edit-cancel').addEventListener('click', () => editor.close());
  $('#edit-delete').addEventListener('click', () => {
    state.items = state.items.filter((it) => it.id !== editingId);
    updateSummary(); save(); editor.close(); renderToday(); renderFeed(); renderStatus();
  });
  ef.addEventListener('submit', () => {
    const data = {
      title: ef.elements.title.value.trim(), time: ef.elements.time.value, category: ef.elements.category.value,
      repeat: ef.elements.repeat.value, date: ef.elements.repeat.value === 'once' ? ef.elements.date.value : undefined, enabled: true,
      popup: ef.elements.popup.value === 'default' ? undefined : ef.elements.popup.value,
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
  $('#items-groups').addEventListener('click', (e) => {
    const li = e.target.closest('.row-item');
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
          at: t, text: `${say(pick(R.due[it.category] || R.due.custom), it)}${alarmFor(it) ? '' : `\n${fmtTime(it.time)} · ${it.title}`}`,
          itemId: it.id, title: `${fmtTime(it.time)} · ${it.title}`, alarm: alarmFor(it),
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
      if (it && sn.at > now) events.push({ at: sn.at, text: say(pick(R.due[it.category] || R.due.custom), it), itemId: it.id, title: it.title, alarm: alarmFor(it) });
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
    sf.elements.homeChar.value = state.settings.homeChar || 'animated';
    popupCheck();
    const list = $('#alarm-cat-list');
    list.textContent = '';
    for (const [key, label] of ALARM_CATS) {
      const l = document.createElement('label');
      l.className = 'chip';
      l.innerHTML = '<input type="checkbox" name="alarmCat"><span></span>';
      l.querySelector('input').value = key;
      l.querySelector('input').checked = (state.settings.alarmCats || []).includes(key);
      l.querySelector('span').textContent = label;
      list.append(l);
    }
    $('#alarm-cats').disabled = !alarmOn();
    const N2 = window.RiasNative;
    $('#test-lock').hidden = !(N2 && N2.testAlarm);
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
    sf.elements.foodReminders.checked = state.settings.foodReminders;
    sf.elements.waterGoal.value = String(state.settings.waterGoal);
    renderSync();
  }
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(state.profile, { name: sf.elements.name.value.trim(), wake: sf.elements.wake.value, sleep: sf.elements.sleep.value });
    Object.assign(state.settings, { checkins: sf.elements.checkins.checked, checkinEvery: Number(sf.elements.checkinEvery.value), notify: sf.elements.notify.checked, praise: sf.elements.praise.value, voice: sf.elements.voice.checked,
      voiceName: sf.elements.voiceName.value, voicePitch: Number(sf.elements.voicePitch.value), voiceRate: Number(sf.elements.voiceRate.value) });
    Object.assign(state.settings, {
      foodReminders: sf.elements.foodReminders.checked,
      alarmPopup: sf.elements.alarmPopup.checked,
      homeChar: sf.elements.homeChar.value,
      alarmCats: [...sf.querySelectorAll('[name=alarmCat]:checked')].map((b) => b.value),
      waterGoal: Number(sf.elements.waterGoal.value),
    });
    Object.assign(state.ai, {
      on: sf.elements.aiOn.checked, provider: sf.elements.aiProvider.value,
      key: sf.elements.aiKey.value.trim(), model: sf.elements.aiModel.value, geminiKey: sf.elements.geminiKey.value.trim(),
    });
    applyNativeVoice();
    save();
    show('home');
    addMessage('rias', say('Settings updated. I\'ll keep that in mind, {name}.'));
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

  // "Pop-up check": everything Android needs before reminders can pop up outside the app.
  const POPUP_CHECKS = [
    ['notifications', 'Notifications allowed', 'Without this Rias can\'t reach you outside the app at all.'],
    ['channel', 'Pop-up alerts set to make sound and pop on screen', 'Tap Fix, then pick “Alert” / “Urgent” for Reminder pop-ups.'],
    ['overlay', 'Appear on top', 'Shows the pop-up in the middle of the screen while you use other apps. Tap Fix and turn on “Allow” for Rias.'],
    ['fullScreen', 'Full screen over the lock screen', 'Tap Fix and turn on “Allow full screen notifications”.'],
    ['battery', 'Not put to sleep by battery saving', 'Samsung puts unused apps to sleep, which stops reminders. Tap Fix and choose Allow / Unrestricted.'],
    ['exact', 'Alarms at the exact time', 'Tap Fix and allow “Alarms & reminders”.'],
  ];
  function popupCheck() {
    const N = window.RiasNative;
    const box = $('#popup-check');
    if (!(N && N.alarmCheck)) { box.hidden = true; return; }
    let res = {};
    try { res = JSON.parse(N.alarmCheck()); } catch { /* old app */ }
    const bad = POPUP_CHECKS.filter(([k]) => res[k] === false);
    box.hidden = false;
    box.classList.toggle('ok', !bad.length);
    $('#pc-head').textContent = bad.length
      ? `${bad.length} thing${bad.length === 1 ? '' : 's'} can stop pop-ups outside the app`
      : 'Pop-ups are all set ✓';
    const ul = $('#pc-list');
    ul.textContent = '';
    for (const [key, label, help] of POPUP_CHECKS) {
      if (!(key in res)) continue;
      const okay = res[key] !== false;
      const li = document.createElement('li');
      li.className = okay ? 'ok' : 'bad';
      li.innerHTML = '<span class="pc-ic"></span><div class="pc-text"><b></b><small></small></div>';
      li.querySelector('.pc-ic').textContent = okay ? '✓' : '!';
      li.querySelector('b').textContent = label;
      li.querySelector('small').textContent = okay ? '' : help;
      if (!okay) {
        const fix = document.createElement('button');
        fix.type = 'button';
        fix.className = 'btn-primary sm';
        fix.textContent = 'Fix';
        fix.addEventListener('click', () => N.openAlarmFix(key));
        li.append(fix);
      }
      ul.append(li);
    }
  }
  sf.elements.alarmPopup.addEventListener('change', () => { $('#alarm-cats').disabled = !sf.elements.alarmPopup.checked; });

  // Test buttons for the pop-ups.
  const testText = () => say("This is how I'll call you when it's time, {name}. Don't keep me waiting~");
  $('#test-alarm').addEventListener('click', () => {
    alarmQueue.length = 0;
    showAlarmCard({ id: '', title: 'Test pop-up' }, testText());
  });
  $('#test-lock').addEventListener('click', () => {
    const N = window.RiasNative;
    if (!N || !N.testAlarm) return;
    N.testAlarm(testText());
    $('#test-hint').textContent = 'Now go to your home screen or another app (or lock your phone). The pop-up arrives in about 10 seconds.';
  });
  $('#test-banner').addEventListener('click', () => {
    // The banner only shows outside the chat, which is where you are (Settings).
    showToast({ text: say('Just checking in, {name}. This is what my messages look like when you\'re on another tab.') });
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
  renderHome();
  setInterval(tick, 20000);
  setInterval(syncCalendar, 15 * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    syncCalendar(); applyNativeActions(); tick(); renderFeed(); renderToday();
    if (state.profile && !$('#view-settings').hidden) { notifyHint(); popupCheck(); }
  });
})();
