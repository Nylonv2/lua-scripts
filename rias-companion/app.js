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
  const CATEGORY_ICON = {
    custom: '📌', wake: '⏰', water: '💧', meal: '🍽️', exercise: '🏃', work: '📚', break: '☕', hygiene: '🪥', meds: '💊',
    social: '💬', chores: '🧹', wind: '🌙', sleep: '😴', workLeave: '💼', workStart: '💼', workEnd: '💼', calendar: '📅',
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
      autoBackup: true, briefing: true, city: '', recap: true, windDown: true,
      alarmSound: 'chime', alarmSoundUri: '', alarmSoundTitle: '', alarmRing: true, alarmArt: 'auto',
      riasOutfit: 'auto', theme: 'crimson', haptics: true, aiLimit: 0,
      alarmCats: ['wake', 'meds', 'shift', 'calendar', 'custom', 'sleep'],
      homeChar: 'animated',
      calorieGoal: 2000, proteinGoal: 120, carbGoal: 225, fatGoal: 65,
    },
    lastRias: 0,
    chat: {},        // what Rias remembers from conversations (chat.js)
    memory: [],      // "Things Rias remembers": [{ id, text, ts }]
    sleep: {},       // { date you woke: { at: bedtime ms, quality? } }
    briefed: {},     // { date: true } morning briefing given
    recaps: {},      // { week key: true } Sunday recap given
    weather: null,   // { place, lat, lon, days: [{ date, max, min, rain, code }], at }
    lastBackup: 0, lastAutoBackup: 0,
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
  let restoring = false; // a backup is being restored: don't overwrite it before the reload
  const save = () => {
    if (restoring) return;
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
      case 'days': return (item.days || []).includes(day);
      default: return true;
    }
  }
  // "Every 2 hours until 8 PM": one reminder becomes several on the day, each with its own id.
  function expand(item) {
    if (!item.every) return [item];
    const out = [item];
    const end = toMin(item.until || '20:00');
    for (let m = toMin(item.time) + item.every; m <= end && m < 1440; m += item.every) {
      out.push({ ...item, id: `${item.id}~${minToTime(m).replace(':', '')}`, time: minToTime(m), baseId: item.id });
    }
    return out;
  }
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function repeatLabel(it) {
    const days = it.repeat === 'days' ? (it.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_SHORT[d]).join(' ')
      : { weekdays: 'weekdays', weekends: 'weekends', once: 'once' }[it.repeat] || '';
    const every = it.every ? `every ${it.every >= 60 ? `${it.every / 60}h` : `${it.every}m`} until ${fmtTime(it.until || '20:00')}` : '';
    return [days, every].filter(Boolean).join(' · ');
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
  const itemsOn = (d) => state.items.filter((it) => appliesOn(it, d)).flatMap(expand).concat(virtualItems(d))
    .sort((a, b) => toMin(a.time) - toMin(b.time));
  const todaysItems = (d = new Date()) => itemsOn(d);
  const findItem = (id) => state.items.find((it) => it.id === id)
    || (String(id).includes('~') ? state.items.filter((it) => it.every && String(id).startsWith(`${it.id}~`)).flatMap(expand).find((it) => it.id === id) : null)
    || virtualItems(new Date()).find((it) => it.id === id);
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
  // ---------- celebrations, haptics, theme ----------
  // A burst of hearts, sparkles and petals with a little badge, and Rias reacting.
  function celebrate(title, sub = '') {
    const box = document.createElement('div');
    box.className = 'celebrate';
    box.setAttribute('role', 'status');
    let parts = '';
    for (let i = 0; i < 42; i++) {
      const ch = ['♥', '✦', '✧', '❀', '•'][i % 5];
      const x = (Math.random() * 2 - 1) * 46, y = -(30 + Math.random() * 55), r = Math.round(Math.random() * 720 - 360);
      parts += `<i style="--x:${x.toFixed(1)}vw;--y:${y.toFixed(1)}vh;--r:${r}deg;--d:${Math.round(Math.random() * 300)}ms;font-size:${12 + Math.round(Math.random() * 16)}px">${ch}</i>`;
    }
    box.innerHTML = `${parts}<div class="celebrate-badge"><span>✦</span><b></b><small></small></div>`;
    box.querySelector('b').textContent = title;
    box.querySelector('small').textContent = sub;
    document.body.append(box);
    haptic([20, 40, 30]);
    if (Avatar) { Avatar.setMood('happy'); Avatar.react(); setTimeout(() => Avatar.gesture('wink', 1600), 500); }
    const close = () => box.remove();
    box.addEventListener('click', close);
    setTimeout(close, 3200);
  }
  function haptic(pattern = 8) {
    if (state.settings.haptics === false || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* not allowed */ }
  }
  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme || 'crimson';
    const N = window.RiasNative;
    if (N && N.setTheme) { try { N.setTheme(state.settings.theme || 'crimson'); } catch { /* older app */ } }
  }
  applyTheme();
  // A light tick on every button; a firmer one for the main actions.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, .chip, .row-item');
    if (!b) return;
    haptic(b.matches('.btn-primary, button.primary, .ac-done, .check, .fab, .send') ? 14 : 6);
  }, true);

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
  let Living = null; // your picture brought to life (living-photo.js), when Home shows your picture
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

  // ---------- alarm sounds ----------
  // Built-in sounds are synthesized by sounds/make_sounds.py; the Android app can also use any phone sound.
  const SOUNDS = [
    ['chime', '🔔 Crimson Chime'], ['harp', '🎼 Harp'], ['musicbox', '🎶 Music Box'], ['magic', '✨ Magic Circle'],
    ['classic', '⏰ Classic Beep'], ['pulse', '💗 Soft Pulse'], ['phone', '📱 My phone\'s alarm', true], ['custom', '🎵 From my phone…', true],
    ['voice', '🗣️ Chime + Rias says it'], ['silent', '🔕 Vibrate only'],
  ];
  const soundChoices = () => SOUNDS.filter(([, , nat]) => !nat || (window.RiasNative && window.RiasNative.pickSound));
  const soundLabel = (k) => (k === 'custom' && state.settings.alarmSoundTitle ? `🎵 ${state.settings.alarmSoundTitle}` : (SOUNDS.find((x) => x[0] === k) || SOUNDS[0])[1]);
  const soundSrc = (k) => (window.RIAS_SOUNDS || {})[k] || `sounds/alarm_${k}.ogg`;
  let webAudio = null, ringTimer = 0;
  function startSound(key, loop, vibrate = true) {
    stopSound();
    const N = window.RiasNative;
    if (N && N.alarmStart) {
      try { N.alarmStart(key, loop, vibrate); } catch { /* older app */ }
    } else {
      if (vibrate && navigator.vibrate) navigator.vibrate([400, 250, 400]);
      if (key !== 'silent') {
        webAudio = new Audio(soundSrc(['voice', 'phone', 'custom'].includes(key) ? 'chime' : key));
        webAudio.loop = loop && key !== 'voice';
        webAudio.play().catch(() => { /* autoplay blocked */ });
      }
    }
    if (loop) ringTimer = setTimeout(stopSound, 3 * 60000); // like a real alarm, it gives up after a while
  }
  function stopSound() {
    clearTimeout(ringTimer);
    const N = window.RiasNative;
    if (N && N.alarmStop) { try { N.alarmStop(); } catch { /* older app */ } }
    if (webAudio) { webAudio.pause(); webAudio = null; }
  }
  // The Android app needs the choice for alarms that fire while it's closed.
  function pushSound() {
    const N = window.RiasNative;
    if (!(N && N.setAlarmSound)) return;
    const st = state.settings;
    try { N.setAlarmSound(JSON.stringify({ key: st.alarmSound || 'chime', uri: st.alarmSoundUri || '', title: st.alarmSoundTitle || '', ring: st.alarmRing !== false })); } catch { /* ignore */ }
  }
  function showAlarmCard(item, text) {
    if (alarmDlg.open) { alarmQueue.push([item, text]); return; }
    alarmItem = item;
    const art = alarmArt();
    const pic = art === 'photo' ? loadAlarmPicture() : art === 'mine' ? loadPicture() : '';
    // The animated Rias steps into the card's art window while it's up.
    if (art === 'animated') { $('.ac-stage').append($('#stage')); $('#stage').hidden = false; Avatar.setMood('happy'); }
    window.AlarmCard.fill({
      time: fmtClock(Date.now()), title: item.title, text, icon: CATEGORY_ICON[item.category] || '⏰',
      pic, cut: loadCutout(art), bg: pic || loadPicture(), animated: art === 'animated', hasItem: !!item.id, // tests only get Dismiss
    });
    alarmDlg.showModal();
    if (art === 'animated') setTimeout(() => Avatar.talk(text.length * 55), 700);
    const key = item.sound || state.settings.alarmSound || 'chime';
    startSound(key, state.settings.alarmRing !== false);
    // "Chime + Rias says it": she reads it out even if her voice is off for chat.
    if (key === 'voice' && state.settings.voice === false) setTimeout(() => speak(text, true), 1200);
  }
  function closeAlarm() {
    stopSound();
    if (alarmDlg.open) alarmDlg.close();
    if ($('.ac-stage #stage')) { placeRias(currentView === 'chat' ? 'chat' : 'home'); renderHome(); }
    alarmItem = null;
    const next = alarmQueue.shift();
    if (next) setTimeout(() => showAlarmCard(...next), 300);
  }
  $('#alarm-done').addEventListener('click', () => { const it = alarmItem; closeAlarm(); if (it && it.id) resolve(it.id, 'done'); });
  $('#alarm-snooze').addEventListener('click', (e) => {
    const b = e.target.closest('[data-snooze]');
    if (!b) return;
    const it = alarmItem; closeAlarm(); if (it && it.id) snooze(it.id, Number(b.dataset.snooze));
  });
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
        const n = streak();
        const milestone = [3, 7, 14, 21, 30, 50, 100, 365].includes(n);
        celebrate(milestone ? `${n}-day streak!` : 'All done for today!', milestone ? say('Look at you, {name}. I knew you had it in you~') : say(pick(praiseLines())));
      } else if (status === 'done' && item.category === 'meal') {
        // Finished a meal reminder: ask what it was, with a button into the food diary.
        setTimeout(() => addMessage('rias', say(pick(R.food.ask)), { action: 'food', meal: mealFor(toMin(item.time)) }), 900);
      }
    }, 500);
    renderToday();
    renderStatus();
  }

  function snooze(itemId, mins = SNOOZE_MIN) {
    const item = findItem(itemId);
    if (!item || statusOf(itemId)) return;
    state.snoozes = state.snoozes.filter((s) => s.id !== itemId);
    state.snoozes.push({ id: itemId, at: Date.now() + mins * 60000 });
    addMessage('me', `${mins} more minutes…`);
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
      // The morning briefing, if you open the app within a few hours of waking.
      if (state.settings.briefing !== false && nm - toMin(state.profile.wake) <= 300) { state.briefed[today] = true; deliverBriefing(); }
      else riasSays(`${say(pick(R.greet[period(nm)] || R.greet.morning))}\n\n${planText()}`);
    }

    // Weekly recap: Sunday evening, or Monday morning if you weren't around.
    if (state.settings.recap !== false && isAwake(nm)) {
      const y = new Date(d); y.setDate(y.getDate() - 1);
      if (d.getDay() === 0 && nm >= 18 * 60 && !state.recaps[weekKey(d)]) { state.recaps[weekKey(d)] = true; riasSays(recapText(d)); }
      else if (d.getDay() === 1 && nm < 12 * 60 && !state.recaps[weekKey(y)]) { state.recaps[weekKey(y)] = true; riasSays(recapText(y)); }
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

    // Idle check-ins while you're awake (sometimes about something you told her).
    const quietFor = Date.now() - state.lastRias;
    if (state.settings.checkins && isAwake(nm) && quietFor > state.settings.checkinEvery * 60000) {
      const p = period(nm);
      const mem = Math.random() < 0.25 ? memoryLine() : '';
      if (mem) riasSays(mem);
      else if (R.checkin[p]) riasSays(checkinLine(p, doneToday()));
    }

    // Past bedtime with the app open and no goodnight yet: one gentle nudge.
    const late = minutesPastBedtime();
    if (state.settings.windDown !== false && late >= 30 && late <= 300 && !state.sleep[wakeDayKey()] && !nudged.bed) {
      nudged.bed = true;
      riasSays(say(pick(R.lateNight)));
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

  // ---------- daily rhythm: morning briefing, weather, sleep, weekly recap ----------
  // Weather comes from Open-Meteo (free, no key): the city you set in Settings, nothing else is sent.
  const WX = {
    0: ['clear skies', '☀️'], 1: ['mostly clear', '🌤️'], 2: ['partly cloudy', '⛅'], 3: ['cloudy', '☁️'], 45: ['foggy', '🌫️'], 48: ['foggy', '🌫️'],
    51: ['light drizzle', '🌦️'], 53: ['drizzle', '🌦️'], 55: ['heavy drizzle', '🌧️'], 56: ['freezing drizzle', '🌧️'], 57: ['freezing drizzle', '🌧️'],
    61: ['light rain', '🌦️'], 63: ['rain', '🌧️'], 65: ['heavy rain', '🌧️'], 66: ['freezing rain', '🌧️'], 67: ['freezing rain', '🌧️'],
    71: ['light snow', '🌨️'], 73: ['snow', '🌨️'], 75: ['heavy snow', '❄️'], 77: ['snow', '🌨️'], 80: ['showers', '🌦️'], 81: ['showers', '🌧️'],
    82: ['heavy showers', '⛈️'], 85: ['snow showers', '🌨️'], 86: ['snow showers', '🌨️'], 95: ['thunderstorms', '⛈️'], 96: ['thunderstorms', '⛈️'], 99: ['thunderstorms', '⛈️'],
  };
  const useFahrenheit = () => /-(US|LR|MM)$/i.test(navigator.language || 'en-US');
  async function findCity(name) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name)}`);
    const j = await r.json();
    const c = j && j.results && j.results[0];
    return c ? { place: [c.name, c.admin1].filter(Boolean).join(', '), lat: c.latitude, lon: c.longitude } : null;
  }
  async function fetchForecast(lat, lon) {
    const unit = useFahrenheit() ? '&temperature_unit=fahrenheit' : '';
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7${unit}`);
    const dl = (await r.json()).daily;
    if (!dl || !dl.time) return null;
    return dl.time.map((date, i) => ({ date, code: dl.weather_code[i], max: Math.round(dl.temperature_2m_max[i]), min: Math.round(dl.temperature_2m_min[i]), rain: dl.precipitation_probability_max[i] || 0 }));
  }
  // Her AI's get_weather tool: any place, or your saved city.
  async function weatherTool({ place, date }) {
    const name = String(place || '').trim();
    const loc = name ? await findCity(name) : state.weather && state.weather.lat != null ? state.weather : null;
    if (!loc) return { error: name ? `Couldn't find a place called "${name}".` : 'No saved city yet: ask which city, or tell them to set one in Settings → Your day with Rias.' };
    const days = await fetchForecast(loc.lat, loc.lon);
    if (!days) return { error: 'The weather service didn\'t answer.' };
    const pickDays = date ? days.filter((x) => x.date === date) : days;
    return {
      place: loc.place, unit: useFahrenheit() ? '°F' : '°C',
      days: (pickDays.length ? pickDays : days).map((x) => ({ date: x.date, conditions: (WX[x.code] || ['mixed weather'])[0], high: x.max, low: x.min, chanceOfRainPercent: x.rain })),
    };
  }
  async function refreshWeather(force) {
    const w = state.weather;
    if (!w || w.lat == null) return;
    const fresh = w.at && Date.now() - w.at < 3 * 3600000 && (w.days || []).some((x) => x.date === dateKey());
    if (fresh && !force) return;
    try {
      const days = await fetchForecast(w.lat, w.lon);
      if (!days) return;
      state.weather = { ...w, days, unit: useFahrenheit() ? 'F' : 'C', at: Date.now() };
      save();
    } catch { /* offline: keep the last forecast */ }
  }
  const weatherFor = (d) => state.weather && (state.weather.days || []).find((x) => x.date === dateKey(d));
  function weatherLine(d = new Date(), short = false) {
    const x = weatherFor(d);
    if (!x) return '';
    const [desc, icon] = WX[x.code] || ['mixed weather', '🌡️'];
    const f = state.weather.unit === 'F';
    if (short) return `${icon} ${x.max}°/${x.min}° ${desc}${x.rain >= 30 ? `, ${x.rain}% rain` : ''}`;
    const tip = x.rain >= 50 ? ' Take an umbrella.' : (f ? x.max < 50 : x.max < 10) ? ' Dress warm.' : (f ? x.max >= 90 : x.max >= 32) ? ' It\'s going to be hot, so drink extra water.' : '';
    return `${icon} ${state.weather.place}: ${desc}, high ${x.max}°, low ${x.min}°${x.rain >= 20 ? `, ${x.rain}% chance of rain` : ''}.${tip}`;
  }

  // Sleep is filed under the morning you wake up.
  const wakeDayKey = (t = Date.now()) => { const d = new Date(t); if (d.getHours() >= 12) d.setDate(d.getDate() + 1); return dateKey(d); };
  function minutesPastBedtime(t = Date.now()) {
    const d = new Date(t);
    let diff = d.getHours() * 60 + d.getMinutes() - toMin(state.profile.sleep);
    if (diff < -720) diff += 1440;
    if (diff > 720) diff -= 1440;
    return diff;
  }
  const GOODNIGHT = /\b(good ?night|nighty? night|going to (bed|sleep)|heading to bed|gonna (go to )?sleep|time for bed|off to bed)\b/i;
  function logSleep() {
    state.sleep[wakeDayKey()] = { at: Date.now() };
    save();
    renderHome();
    const late = minutesPastBedtime();
    return late > 30 ? say(`It's ${fmtClock(Date.now())}, ${late >= 90 ? 'way ' : ''}past your bedtime, {name}. Tomorrow you go to bed earlier. Promise me.`) : '';
  }
  function sleepRemark() {
    const nights = [0, 1, 2].map((i) => { const d = new Date(); d.setDate(d.getDate() - i); return state.sleep[dateKey(d)]; });
    if (nights.every((n) => n && minutesPastBedtime(n.at) > 45)) return say('That\'s three late nights in a row, {name}. Tonight you go to bed on time. That\'s an order.');
    const last = nights[0];
    if (!last) return '';
    return minutesPastBedtime(last.at) > 45
      ? `You fell asleep around ${fmtClock(last.at)}, later than you should have. Take it easy today.`
      : `You were in bed by ${fmtClock(last.at)}. Good.`;
  }

  function briefingText(d = new Date()) {
    const k = dateKey(d), nm = dateKey() === k ? nowMin() : 0;
    const log = state.log[k] || {};
    const items = itemsOn(d).filter((it) => !log[it.id]);
    const shifts = shiftsOn(d);
    const parts = [];
    if (shifts.length) {
      const leave = state.settings.workReminders && state.settings.commute > 0 ? ` (leave by ${fmtTime(minToTime(toMin(shifts[0].start) - state.settings.commute))})` : '';
      parts.push(`You work ${shifts.map((sh) => `${fmtTime(sh.start)}–${fmtTime(sh.end)}`).join(' and ')}${leave}.`);
    }
    const own = items.filter((it) => !it.source && toMin(it.time) > nm + 1);
    if (own.length) parts.push(`${own.length} reminder${own.length === 1 ? '' : 's'} left today, next is ${own[0].title} at ${fmtTime(own[0].time)}.`);
    const cal = items.filter((it) => it.source === 'calendar');
    if (cal.length) parts.push(`On your calendar: ${cal.slice(0, 3).map((it) => `${it.title} at ${fmtTime(it.time)}`).join(', ')}.`);
    const allDay = allDayEvents(d);
    if (allDay.length) parts.push(`All day: ${allDay.map((ev) => ev.title).join(', ')}.`);
    return [
      say(pick(R.greet.morning)),
      `Your ${d.toLocaleDateString([], { weekday: 'long' })}: ${parts.join(' ') || 'nothing planned. A free day, ufufu.'}`,
      weatherLine(d),
      sleepRemark(),
      memoryLine(),
    ].filter(Boolean).join('\n\n');
  }
  // One line for the wake-up notification (the app may be closed then).
  function briefingShort(d) {
    const k = dateKey(d);
    const shifts = shiftsOn(d);
    const n = itemsOn(d).filter((it) => !it.source && !(state.log[k] || {})[it.id]).length;
    return [shifts.length ? `Work ${shifts.map((sh) => `${fmtTime(sh.start)}–${fmtTime(sh.end)}`).join(', ')}` : '', `${n} reminder${n === 1 ? '' : 's'}`, weatherLine(d, true)]
      .filter(Boolean).join(' · ');
  }
  async function deliverBriefing() {
    await refreshWeather();
    riasSays(briefingText());
    const night = state.sleep[dateKey()];
    if (night && !night.quality && state.settings.windDown !== false) {
      setTimeout(() => addMessage('rias', say('So, how did you sleep, {name}?'), { action: 'sleep', day: dateKey() }), 1400);
    }
  }

  // Sunday evening (or Monday morning if you missed it): how the week went.
  const weekKey = (d = new Date()) => { const m = new Date(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return dateKey(m); };
  const shiftHours = (sh) => { let m = toMin(sh.end) - toMin(sh.start); if (m <= 0) m += 1440; return m / 60; };
  function recapText(end = new Date()) {
    let done = 0, total = 0, best = null, water = 0, goalDays = 0, kcal = 0, kcalDays = 0, hours = 0;
    const beds = [];
    const goal = state.settings.waterGoal || 8;
    for (let i = 0; i < 7; i++) {
      const d = new Date(end); d.setDate(d.getDate() - i);
      const k = dateKey(d);
      const s = state.summary[k];
      if (s) { done += s.done; total += s.total; if (s.done && (!best || s.done > best.done)) best = { d, done: s.done }; }
      const g = state.water[k] || 0;
      water += g;
      if (g >= goal) goalDays++;
      const kc = (state.food[k] || []).reduce((a, e) => a + ((e.n && e.n.kcal) || 0), 0);
      if (kc) { kcal += kc; kcalDays++; }
      hours += shiftsOn(d).reduce((a, sh) => a + shiftHours(sh), 0);
      if (state.sleep[k]) beds.push(minutesPastBedtime(state.sleep[k].at));
    }
    const pct = total ? Math.round((done / total) * 100) : 0;
    const lines = [say('Here\'s your week, {name}:')];
    lines.push(`✅ ${done} of ${total} reminders done (${pct}%)${best ? `, best day ${best.d.toLocaleDateString([], { weekday: 'long' })}` : ''}`);
    lines.push(`💧 ${(water / 7).toFixed(1)} glasses a day, goal hit ${goalDays} of 7 days`);
    if (kcalDays) lines.push(`🍽️ About ${Math.round(kcal / kcalDays)} kcal a day on the ${kcalDays} day${kcalDays === 1 ? '' : 's'} you logged`);
    if (hours) lines.push(`💼 ${Math.round(hours * 10) / 10} hours of work`);
    if (beds.length) {
      const avg = Math.round(beds.reduce((a, b) => a + b, 0) / beds.length);
      lines.push(`🌙 ${avg > 20 ? `In bed about ${avg} min after your bedtime on average` : 'Mostly in bed on time'} (${beds.length} night${beds.length === 1 ? '' : 's'} logged)`);
    }
    lines.push('');
    lines.push(pct >= 75 ? say(pick(praiseLines())) : pct >= 45 ? say('Not bad. But next week I want more from you, {name}.')
      : say('That was a rough week. I\'m not angry. We\'ll do better together, okay?'));
    return lines.join('\n');
  }

  // ---------- things Rias remembers ----------
  function remember(text, kind) {
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    if (!text || state.memory.some((m) => m.text.toLowerCase() === text.toLowerCase())) return false;
    state.memory.push({ id: uid(), text, ts: Date.now(), ...(kind ? { kind } : {}) });
    if (state.memory.length > 60) state.memory.splice(0, state.memory.length - 60);
    save();
    return true;
  }
  function forget(q) {
    const low = String(q || '').toLowerCase().trim();
    const before = state.memory.length;
    if (low) state.memory = state.memory.filter((m) => !m.text.toLowerCase().includes(low));
    save();
    return before - state.memory.length;
  }
  // Without her AI she still notices a few clear facts, and "Remember that …".
  function noticeFacts(text) {
    const t = text.trim();
    let m = t.match(/^(?:please\s+|hey rias,?\s+)?remember(?: that)?\s+(.{3,140}?)[.!]*$/i);
    if (m) { remember(m[1]); return 'explicit'; }
    if ((m = t.match(/\bi (?:work|am working|'m working) (?:at|for) ([\w&'.-]+(?: [\w&'.-]+){0,3}?)(?=\s+(?:and|but|as|so|it|now|today|because|since|with)\b|[.,!?]|$)/i))) remember(`Works at ${m[1].replace(/[.!?]+$/, '')}`, 'work');
    if ((m = t.match(/\bmy (girlfriend|boyfriend|wife|husband|fianc[eé]e?|best friend|mom|mum|dad|mother|father|sister|brother|son|daughter|dog|cat|boss)(?:'s name)? is (?:called |named )?([A-Z][a-z]+)/))) remember(`Their ${m[1]} is ${m[2]}`, 'person');
    if ((m = t.match(/\bmy birthday is (?:on )?([^.,!?]{3,25})/i))) remember(`Birthday: ${m[1].trim()}`, 'birthday');
    return '';
  }
  function memoryLine() {
    const facts = state.memory.filter((m) => m.kind === 'work' || m.kind === 'person');
    if (!facts.length || Math.random() < 0.5) return '';
    const f = pick(facts);
    if (f.kind === 'work') return say(`How are things at ${f.text.replace(/^Works at /, '')}? Tell me if anyone there gives you trouble.`);
    const parts = f.text.match(/^Their (.+) is (.+)$/);
    return parts ? say(`How's ${parts[2]} doing? You don't tell me enough about your ${parts[1]}.`) : '';
  }

  // Home screen widget (Android): upcoming items and a few of her lines.
  function widgetData() {
    const now = Date.now(), next = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const log = state.log[dateKey(d)] || {};
      for (const it of itemsOn(d)) {
        const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, toMin(it.time)).getTime();
        if (t > now - 60000 && !log[it.id]) next.push({ at: t, title: it.title });
      }
    }
    const lines = {};
    for (const p of ['morning', 'afternoon', 'evening', 'night']) {
      lines[p] = [].concat(R.checkin[p] || [], R.greet[p] || [], p === 'night' ? R.lateNight : []).slice(0, 10).map((l) => say(l));
    }
    return JSON.stringify({ next: next.slice(0, 40), lines });
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
  let skipAnimNext = false;
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
      if (m.from === 'rias' && el.classList.contains('fresh') && skipAnimNext) { skipAnimNext = false; el.append(m.text); } // already seen while streaming
      else if (m.from === 'rias' && el.classList.contains('fresh')) {
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
          acts.innerHTML = '<button class="done" data-act="done">Done ✓</button><button data-act="snooze" data-mins="10">10 min</button><button data-act="snooze" data-mins="30">30 min</button><button data-act="skip">Skip</button>';
          acts.dataset.item = m.itemId;
          el.append(acts);
        } else if (st === 'done' || st === 'skipped') {
          const r = document.createElement('div');
          r.className = 'resolved';
          r.textContent = st === 'done' ? '✓ Done' : 'Skipped';
          el.append(r);
        }
      }
      if (m.action === 'sleep' && m.day && state.sleep[m.day] && !state.sleep[m.day].quality) {
        const acts = document.createElement('div');
        acts.className = 'actions';
        acts.innerHTML = '<button data-sleep="great">😴 Great</button><button data-sleep="okay">🙂 Okay</button><button data-sleep="bad">😵 Badly</button>';
        acts.dataset.day = m.day;
        el.append(acts);
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
    if (Living && !$('#stage-pic').hidden) Living.talk(text.length * 55);
    if (Avatar) {
      Avatar.talk(text.length * 55);
      const mood = /good (boy|girl)|proud of you|ufufu|love|happy|well done|perfect/i.test(text) ? 'happy'
        : /worried|haven't|still|don't keep me waiting|missed/i.test(text) ? 'worried' : null;
      clearTimeout(chatMoodTimer);
      if (mood) { Avatar.setMood(mood); chatMoodTimer = setTimeout(() => Avatar.setMood(baseMood()), 5000); }
      if (mood === 'happy' && /good (boy|girl)|proud|ufufu|well done/i.test(text) && Math.random() < 0.6) setTimeout(() => Avatar.gesture('wink', 1600), 600);
      if (mood === 'worried') Avatar.gesture('crossed', 3200);
      if (/\b(hello|hi|hey|welcome back|morning|goodnight|good night)\b/i.test(text) && Math.random() < 0.5) Avatar.gesture('wave', 2300);
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

  // A reply she's still writing: one live line at the end of the chat, replaced by the real messages when she's done.
  let liveEl = null, liveTalk = 0;
  function streamPreview(text) {
    if (text === null) { if (liveEl) { skipAnimNext = !!liveEl.textContent; liveEl.remove(); } liveEl = null; return; }
    if (!liveEl) { liveEl = document.createElement('div'); liveEl.className = 'msg rias first streaming'; }
    if (!liveEl.isConnected) feed.append(liveEl);
    liveEl.textContent = text;
    liveEl.hidden = !text;
    const near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160;
    if (near) feed.scrollTop = feed.scrollHeight;
    if (text && Avatar && currentView === 'chat' && Date.now() > liveTalk) { Avatar.talk(1500); liveTalk = Date.now() + 1400; }
  }
  // While she "types", she thinks in the scene: dots beside her head.
  function showTyping() {
    const view = $('#view-chat');
    view.classList.add('thinking');
    return { remove() { view.classList.remove('thinking'); } };
  }

  function renderStatus() {
    if (!state.profile) return;
    document.querySelector('.app').dataset.period = period();
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
        else add([CATEGORY_LABEL[it.category] || 'Other', repeatLabel(it)].filter(Boolean).join(' · '), 'ri-sub');
        if (alarmFor(it)) add('⏰ Alarm', 'tag-chip alm');
        if (flag) add(flag, `tag-chip flag ${flag === 'Missed' ? 'warn' : ''}`);
        // Swipe right: done. Swipe left: snooze, or delete (skip for shifts and calendar events).
        const wrap = document.createElement('div');
        wrap.className = 'swipe';
        wrap.innerHTML = `<div class="swipe-done">${ICON('check')} ${st === 'done' ? 'Undo' : 'Done'}</div>`
          + `<div class="swipe-acts"><button type="button" data-swipe="snooze">Snooze</button>${it.source
            ? '<button type="button" data-swipe="skip">Skip</button>' : '<button type="button" class="del" data-swipe="delete">Delete</button>'}</div>`;
        wrap.append(row);
        card.append(wrap);
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
    if (currentView === 'settings' && setCat) { openSetCat(null); return true; }
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
    // Screens glide in instead of snapping.
    const next = $(`#view-${view}`);
    if (next && next.hidden) { next.classList.remove('view-enter'); void next.offsetWidth; next.classList.add('view-enter'); }
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
    // Saying goodnight logs when you went to bed.
    if (!photo && GOODNIGHT.test(text) && minutesPastBedtime() > -180) {
      const lateLine = logSleep();
      if (lateLine) setTimeout(() => addMessage('rias', lateLine), 3200);
    }
    // Without her AI she still remembers clear facts, and "Remember that …".
    if (!photo && !AI.enabled() && noticeFacts(text) === 'explicit') {
      const typing = showTyping();
      setTimeout(() => { typing.remove(); addMessage('rias', say(pick(["I'll remember that, {name}.", 'Noted. I won\'t forget.', 'Mm, I\'ll keep that in mind~']))); }, 900);
      return;
    }
    if (photo && !AI.enabled()) {
      addMessage('rias', say('I need my AI turned on to read photos, {name}. Set it up in Settings → Rias’s mind (a free Gemini key works). Or use Work → Plan my week and paste the schedule as text.'));
      return;
    }
    let r = photo ? undefined : reply(text, AI.enabled());
    let aiTyped = false;
    if (r === undefined) {
      // Her AI is thinking: show typing until it answers, then fall back to written lines if needed.
      const typing = showTyping();
      // Her words appear in the chat as she writes them (Claude); the typing dots go once she starts.
      const res = await AI.reply(text, photo && photo.full, {
        onText(t) { typing.remove(); streamPreview(t); },
        onReset() { streamPreview(''); },
      });
      typing.remove();
      streamPreview(null);
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
    const sb = e.target.closest('[data-sleep]');
    if (sb) {
      const night = state.sleep[sb.parentElement.dataset.day];
      if (!night) return;
      night.quality = sb.dataset.sleep;
      save();
      addMessage('me', sb.textContent);
      const line = { great: 'Good. A well-rested {name} is a useful {name}. Make today count~',
        okay: 'Okay is fine. Coffee, water, and don\'t overdo it today.',
        bad: 'I\'m sorry. Go easy today, and tonight you\'re going to bed early. I\'ll remind you.' }[night.quality];
      setTimeout(() => addMessage('rias', say(line)), 700);
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.parentElement.dataset.item;
    if (b.dataset.act === 'snooze') snooze(id, Number(b.dataset.mins) || SNOOZE_MIN); else resolve(id, b.dataset.act === 'done' ? 'done' : 'skipped');
  });

  // ---------- food, work, phone calendar, AI ----------
  function silencePast() {
    const f = (state.fired[dateKey()] ||= {});
    for (const it of todaysItems()) if (toMin(it.time) <= nowMin() && !f[it.id]) f[it.id] = 'silent';
  }
  function refresh() { updateSummary(); renderToday(); renderStatus(); }
  const modCtx = {
    state, save, $, R, dateKey, uid, fmtClock, fmtTime, toMin, shiftsOn, silencePast, refresh,
    celebrate: (title, sub) => celebrate(title, sub),
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
      state.memory.length ? `Things you remember about the user (saved earlier; bring them up naturally, never recite the list): ${state.memory.map((m) => m.text).join('; ')}.` : '',
      state.sleep[dateKey()] ? `They went to sleep last night at ${fmtClock(state.sleep[dateKey()].at)}${state.sleep[dateKey()].quality ? ` and slept ${state.sleep[dateKey()].quality}` : ''}.` : '',
      weatherFor(now) ? `Weather today: ${weatherLine(now, true)}.` : '',
      `What you (Rias) are doing right now, shown in the app; stay consistent if it comes up: ${riasActivity()}.`,
    ].filter(Boolean).join('\n');
  }

  // ---------- AI cost meter ----------
  // Estimated from Anthropic's list prices ($ per million tokens); Gemini's free tier counts as $0.
  const PRICES = {
    'claude-opus-5-5': [4, 20, 0.2, 5], 'claude-sonnet-5-5': [2, 10, 0.2, 2.5], 'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
    'claude-opus-5': [5, 25, 0.5, 6.25], 'claude-fable-5-1': [10, 50, 0.25, 12.5],
  };
  const monthKey = (d = new Date()) => dateKey(d).slice(0, 7);
  function trackUsage(model, u) {
    if (!u) return;
    const m = (state.aiUsage ||= {})[monthKey()] ||= { cost: 0, replies: 0, input: 0, output: 0, searches: 0 };
    const p = /^gemini/.test(model) ? [0, 0, 0, 0] : PRICES[model] || PRICES[Object.keys(PRICES).find((k) => model.startsWith(k))] || [5, 25, 0.5, 6.25];
    const searches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
    m.cost += ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[2] + (u.cache_creation_input_tokens || 0) * p[3]) / 1e6
      + (p[0] ? searches * 0.01 : 0);
    m.replies += 1; m.input += u.input_tokens || 0; m.output += u.output_tokens || 0; m.searches += searches;
    save();
    if (overLimit() && !m.warned) {
      m.warned = true;
      setTimeout(() => addMessage('rias', say(`I've reached the AI budget you set ($${state.settings.aiLimit}) for this month, {name}, so I'll use my own words until next month. You can raise it in Settings → Rias's mind.`)), 1500);
    }
    if (!$('#view-settings').hidden) renderCost();
  }
  function overLimit() {
    const lim = Number(state.settings.aiLimit) || 0;
    const m = (state.aiUsage || {})[monthKey()];
    return !!(lim && m && m.cost >= lim);
  }
  function renderCost() {
    const m = (state.aiUsage || {})[monthKey()] || { cost: 0, replies: 0, searches: 0 };
    const lim = Number(state.settings.aiLimit) || 0;
    $('#cost-now').textContent = `$${m.cost < 10 ? m.cost.toFixed(2) : m.cost.toFixed(1)}`;
    $('#cost-bar').style.width = `${lim ? Math.min(100, (m.cost / lim) * 100) : Math.min(100, m.cost * 10)}%`;
    $('#cost-meter').classList.toggle('over', overLimit());
    $('#cost-sub').textContent = `${m.replies} AI request${m.replies === 1 ? '' : 's'}${m.searches ? ` · ${m.searches} web search${m.searches === 1 ? '' : 'es'}` : ''}`
      + (overLimit() ? ' · Limit reached: she uses her own words until next month.' : lim ? ` · limit $${lim}` : '') + '. An estimate from list prices; your Anthropic bill is the real number.';
  }

  const AI = window.createRiasAI({
    state, contextText, onUsage: trackUsage, overLimit,
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
      getWeather: weatherTool,
      remember({ fact }) { return remember(fact) ? { ok: true } : { ok: true, note: 'already remembered' }; },
      forget({ fact }) { return { ok: true, removed: forget(fact) }; },
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
    if (mood === 'worried') Avatar.gesture('crossed', 3000);
    else if (mood === 'happy' && Math.random() < 0.35) setTimeout(() => Avatar.gesture('wink', 1500), 400);
    Avatar.talk(text.length * 55);
    if (Living) Living.talk(text.length * 55);
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
    const mem = memoryLine();
    if (mem) options.push([mem, 'happy']);
    options.push([say(pick([].concat(T.whatDoing))), 'happy']);
    if (R.checkin[period()]) options.push([checkinLine(period(), doneToday()), 'neutral']);
    const o = pick(options);
    return [[].concat(o[0]).join(' '), o[1]];
  }
  // What she's wearing: pajamas near bedtime, a coat when it's cold or winter, summer clothes when it's hot.
  function outfitNow() {
    const pick = state.settings.riasOutfit || 'auto';
    if (pick !== 'auto') return pick;
    if (!state.profile) return 'uniform';
    const late = minutesPastBedtime();
    if (!isAwake() || late > -60) return 'pajamas';
    const w = weatherFor(new Date());
    const hot = w && (state.weather.unit === 'F' ? w.max >= 86 : w.max >= 30);
    const cold = w && (state.weather.unit === 'F' ? w.max <= 50 : w.max <= 10);
    const m = new Date().getMonth();
    if (cold || (!w && [11, 0, 1].includes(m))) return 'winter';
    if (hot || (!w && [5, 6, 7].includes(m))) return 'summer';
    return 'uniform';
  }
  let wavedThisSession = false;
  function greetWave() {
    if (wavedThisSession || !Avatar) return;
    wavedThisSession = true;
    setTimeout(() => Avatar.gesture('wave', 2300), 500);
  }
  // One Rias: she stands on Home, and walks into the chat scene when you talk to her.
  function placeRias(view) {
    const host = view === 'chat' ? $('#scene-rias') : $('.home-hero');
    for (const el of [$('#stage'), $('#stage-pic')]) if (el.parentElement !== host) host.append(el);
    if (Avatar && Avatar.mood !== 'happy') Avatar.setMood(baseMood());
    if (Avatar) Avatar.setOutfit(outfitNow());
    greetWave();
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
    $('#home-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
      + (weatherFor(new Date()) ? `  ·  ${weatherLine(new Date(), true)}` : '');
    const toBed = minutesPastBedtime();
    $('#home-goodnight').hidden = !(toBed >= -90 && toBed <= 360) || !!state.sleep[wakeDayKey()];
    if (!$('#home-bubble').textContent) $('#home-bubble').textContent = say(pick(R.greet[period(nm)] || R.greet.evening));
    if (Avatar.mood !== 'happy') Avatar.setMood(baseMood());
    Avatar.setOutfit(outfitNow());

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

  // `onDate` (YYYY-MM-DD): a new one-time reminder on that day (from the month calendar).
  function openEditor(item, onDate) {
    editingId = item ? item.id : null;
    const otherDay = !item && onDate && onDate !== dateKey();
    $('#edit-title').textContent = item ? 'Edit reminder' : otherDay
      ? `New reminder · ${new Date(`${onDate}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}` : 'New reminder';
    ef.elements.title.value = item ? item.title : '';
    ef.elements.time.value = item ? item.time : otherDay ? '09:00' : minToTime(Math.ceil((nowMin() + 15) / 15) * 15);
    ef.elements.category.value = item ? item.category : 'custom';
    ef.elements.repeat.value = item ? item.repeat : 'once';
    ef.elements.date.value = (item && item.date) || onDate || dateKey();
    ef.elements.popup.value = (item && item.popup) || 'default';
    const days = (item && item.days) || [new Date().getDay()];
    for (const b of ef.querySelectorAll('[name=days]')) b.checked = days.includes(Number(b.value));
    ef.elements.every.value = String((item && item.every) || 0);
    fillSoundSelect(ef.elements.sound, 'Default sound (from Settings)');
    ef.elements.sound.value = (item && item.sound) || '';
    ef.elements.until.value = (item && item.until) || '20:00';
    $('#edit-delete').hidden = !item;
    syncRepeatFields();
    editor.showModal();
  }
  function syncRepeatFields() {
    $('#date-wrap').hidden = ef.elements.repeat.value !== 'once';
    $('#days-wrap').hidden = ef.elements.repeat.value !== 'days';
    $('#until-wrap').hidden = ef.elements.every.value === '0';
  }
  ef.addEventListener('change', (e) => { if (['repeat', 'every'].includes(e.target.name)) syncRepeatFields(); });
  $('#edit-cancel').addEventListener('click', () => editor.close());
  $('#edit-delete').addEventListener('click', () => {
    state.items = state.items.filter((it) => it.id !== editingId);
    updateSummary(); save(); editor.close(); renderToday(); renderFeed(); renderStatus();
    if (!$('#month-pane').hidden) renderMonth();
  });
  ef.addEventListener('submit', () => {
    const data = {
      title: ef.elements.title.value.trim(), time: ef.elements.time.value, category: ef.elements.category.value,
      repeat: ef.elements.repeat.value, date: ef.elements.repeat.value === 'once' ? ef.elements.date.value : undefined, enabled: true,
      popup: ef.elements.popup.value === 'default' ? undefined : ef.elements.popup.value,
      days: ef.elements.repeat.value === 'days' ? [...ef.querySelectorAll('[name=days]:checked')].map((b) => Number(b.value)) : undefined,
      every: Number(ef.elements.every.value) || undefined,
      sound: ef.elements.sound.value || undefined,
      until: Number(ef.elements.every.value) ? ef.elements.until.value : undefined,
    };
    if (data.repeat === 'days' && !data.days.length) data.repeat = 'daily';
    const existing = state.items.find((it) => it.id === editingId);
    if (existing) {
      // Moving an item later in the day re-arms it.
      if (data.time !== existing.time && toMin(data.time) > nowMin()) delete (state.fired[dateKey()] || {})[existing.id];
      Object.assign(existing, data);
    } else {
      const item = { id: uid(), ...data };
      state.items.push(item);
      // Don't instantly ping for something created in the past today.
      if (toMin(item.time) <= nowMin() && (item.repeat !== 'once' || item.date === dateKey())) (state.fired[dateKey()] ||= {})[item.id] = 'silent';
      const on = item.repeat === 'once' && item.date && item.date !== dateKey()
        ? ` on ${new Date(`${item.date}T12:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}` : '';
      addMessage('rias', say(`Noted. I'll remind you: ${item.title} at ${fmtTime(item.time)}${on}.`));
    }
    updateSummary(); save(); renderToday(); renderStatus();
    if (!$('#month-pane').hidden) renderMonth();
  });

  $('#add').addEventListener('click', () => openEditor(null));

  // ---------- month calendar (Reminders → Month) ----------
  let monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1), monthSel = dateKey();
  $('#rem-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    for (const x of $('#rem-mode').children) x.classList.toggle('active', x === b);
    const month = b.dataset.m === 'month';
    $('#view-today').classList.toggle('month-mode', month);
    $('#month-pane').hidden = !month;
    if (month) renderMonth();
  });
  $('#m-prev').addEventListener('click', () => { monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1); renderMonth(); });
  $('#m-next').addEventListener('click', () => { monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1); renderMonth(); });
  $('#m-grid').addEventListener('click', (e) => {
    const c = e.target.closest('[data-day]');
    if (!c) return;
    monthSel = c.dataset.day;
    renderMonth();
  });
  function dayStats(d) {
    const k = dateKey(d), today = dateKey();
    const s = k === today ? (updateSummary(), state.summary[k]) : state.summary[k];
    const night = state.sleep[k];
    return {
      k, past: k <= today, s, ratio: s && s.total ? s.done / s.total : null,
      shifts: shiftsOn(d), sleepOk: night && minutesPastBedtime(night.at) <= 30, night,
      kcal: (state.food[k] || []).reduce((a, e) => a + ((e.n && e.n.kcal) || 0), 0), water: state.water[k] || 0,
      // Things special to this day (the daily routine is on every day, so it isn't counted).
      oneOffs: state.items.filter((it) => it.enabled && it.repeat === 'once' && it.date === k).length,
      events: state.settings.phoneCalendar ? state.phoneEvents.filter((ev) => evDateKey(ev) === k).length : 0,
    };
  }
  function renderMonth() {
    $('#m-title').textContent = monthStart.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const grid = $('#m-grid');
    grid.textContent = '';
    for (const w of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      const h = document.createElement('span'); h.className = 'm-wd'; h.textContent = w[0]; grid.append(h);
    }
    const first = new Date(monthStart);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    for (let i = 0; i < 42; i++) {
      const d = new Date(first); d.setDate(first.getDate() + i);
      if (i >= 35 && d.getMonth() !== monthStart.getMonth()) break;
      const st = dayStats(d);
      const c = document.createElement('button');
      c.type = 'button';
      c.dataset.day = st.k;
      const heat = st.ratio == null ? 0 : st.ratio >= 0.9 ? 4 : st.ratio >= 0.6 ? 3 : st.ratio >= 0.3 ? 2 : st.ratio > 0 ? 1 : 0;
      c.className = `m-day h${st.past ? heat : 0}${d.getMonth() !== monthStart.getMonth() ? ' out' : ''}${st.k === dateKey() ? ' today' : ''}${st.k === monthSel ? ' sel' : ''}${st.past ? '' : ' future'}`;
      const special = st.oneOffs + st.events;
      if (special) c.classList.add('has-rem');
      const dots = '<i class="m-dot"></i>'.repeat(Math.min(st.oneOffs, 3)) + '<i class="m-dot ev"></i>'.repeat(Math.min(st.events, Math.max(0, 3 - st.oneOffs)));
      c.innerHTML = `<b>${d.getDate()}</b>${special ? `<span class="m-dots">${dots}${special > 3 ? '<small>+</small>' : ''}</span>` : ''}`
        + `${st.shifts.length ? '<i class="m-shift"></i>' : ''}${st.sleepOk ? '<em>🌙</em>' : ''}`;
      c.setAttribute('aria-label', d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
        + (special ? `, ${special} reminder${special === 1 ? '' : 's'}` : ''));
      grid.append(c);
    }
    renderDayDetail();
  }
  function renderDayDetail() {
    const [y, m, dd] = monthSel.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    const st = dayStats(d);
    const box = $('#m-detail');
    box.textContent = '';
    const head = document.createElement('div');
    head.className = 'dd-head';
    head.innerHTML = '<div><p class="eyebrow"></p><h3></h3></div><span class="dd-score"></span>';
    head.querySelector('.eyebrow').textContent = d.toLocaleDateString([], { weekday: 'long' });
    head.querySelector('h3').textContent = d.toLocaleDateString([], { month: 'long', day: 'numeric' });
    head.querySelector('.dd-score').textContent = st.past && st.s && st.s.total ? `${st.s.done}/${st.s.total} done` : st.past ? '' : 'Planned';
    const quick = document.createElement('button');
    quick.type = 'button';
    quick.className = 'dd-quick-add';
    quick.textContent = '＋ Add';
    quick.setAttribute('aria-label', `Add a reminder on ${d.toLocaleDateString([], { month: 'long', day: 'numeric' })}`);
    quick.addEventListener('click', () => openEditor(null, st.k));
    head.append(quick);
    box.append(head);
    const facts = [];
    for (const sh of st.shifts) facts.push(`💼 ${sh.label || 'Work'} ${fmtTime(sh.start)}–${fmtTime(sh.end)}`);
    if (st.past && st.kcal) facts.push(`🍽️ ${Math.round(st.kcal)} kcal`);
    if (st.past && st.water) facts.push(`💧 ${st.water} glass${st.water === 1 ? '' : 'es'}`);
    if (st.night) facts.push(`🌙 Bed at ${fmtClock(st.night.at)}${st.night.quality ? ` · slept ${st.night.quality}` : ''}`);
    const w = weatherFor(d);
    if (w) facts.push(weatherLine(d, true));
    if (facts.length) {
      const f = document.createElement('div'); f.className = 'dd-facts';
      for (const t of facts) { const s = document.createElement('span'); s.textContent = t; f.append(s); }
      box.append(f);
    }
    const log = state.log[st.k] || {};
    const items = itemsOn(d);
    const ul = document.createElement('ul');
    ul.className = 'dd-list';
    if (!items.length) ul.innerHTML = '<li class="muted">Nothing planned.</li>';
    for (const it of items.slice(0, 60)) {
      const li = document.createElement('li');
      const status = log[it.id];
      li.className = status || (st.past && st.k !== dateKey() ? 'missed' : '');
      li.dataset.id = it.baseId || it.id;
      li.dataset.src = it.source || '';
      li.innerHTML = '<span class="dd-dot"></span><span class="dd-time"></span><span class="dd-title"></span><span class="dd-tag"></span>';
      li.querySelector('.dd-time').textContent = fmtTime(it.time);
      li.querySelector('.dd-title').textContent = it.title;
      li.querySelector('.dd-tag').textContent = it.source === 'work' ? '💼' : it.source === 'calendar' ? '📅' : it.repeat && it.repeat !== 'once' ? '↻' : '›';
      ul.append(li);
    }
    box.append(ul);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn-primary dd-add';
    add.textContent = `＋ Add a reminder on ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    add.addEventListener('click', () => openEditor(null, st.k));
    box.append(add);
  }
  // Tap a reminder in the day: edit it (repeating ones change every day they repeat); shifts open Work.
  $('#m-detail').addEventListener('click', (e) => {
    const li = e.target.closest('.dd-list li[data-id]');
    if (!li) return;
    if (li.dataset.src === 'work') { show('work'); return; }
    if (li.dataset.src === 'calendar') return; // edit it in the phone's calendar
    const item = state.items.find((x) => x.id === li.dataset.id);
    if (item) openEditor(item);
  });

  // ---------- swipe on reminders ----------
  const SWIPE_OPEN = 168;
  let drag = null, swallowClick = false;
  const groupsEl = $('#items-groups');
  const closeSwipes = (except) => {
    for (const r of groupsEl.querySelectorAll('.row-item.open')) if (r !== except) { r.classList.remove('open'); r.style.transform = ''; }
  };
  groupsEl.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.row-item');
    if (!row || e.target.closest('.check')) return;
    closeSwipes(row);
    drag = { row, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, active: false, base: row.classList.contains('open') ? -SWIPE_OPEN : 0 };
  });
  groupsEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        drag.active = true;
        drag.row.classList.add('dragging');
        try { drag.row.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(dy) > 10) { drag = null; return; } else return;
    }
    const x = Math.max(-SWIPE_OPEN - 24, Math.min(130, drag.base + dx));
    drag.dx = x;
    drag.row.style.transform = `translateX(${x}px)`;
    drag.row.parentElement.classList.toggle('right', x > 0);
  });
  const endDrag = () => {
    if (!drag) return;
    const { row, active, dx } = drag;
    drag = null;
    if (!active) return;
    row.classList.remove('dragging');
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 350);
    if (dx > 80) {
      row.style.transform = '';
      const id = row.dataset.id;
      if (statusOf(id)) undo(id); else resolve(id, 'done');
    } else if (dx < -60) {
      row.style.transform = `translateX(${-SWIPE_OPEN}px)`;
      row.classList.add('open');
    } else {
      row.style.transform = '';
      row.classList.remove('open');
    }
  };
  groupsEl.addEventListener('pointerup', endDrag);
  groupsEl.addEventListener('pointercancel', endDrag);
  groupsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-swipe]');
    if (b) {
      e.stopImmediatePropagation();
      const row = b.closest('.swipe').querySelector('.row-item');
      const id = row.dataset.id;
      const it = findItem(id);
      closeSwipes();
      if (!it) return;
      if (b.dataset.swipe === 'snooze') snooze(id, SNOOZE_MIN);
      else if (b.dataset.swipe === 'skip') resolve(id, 'skipped');
      else if (await ask(`Delete “${it.title}”${it.baseId || it.repeat !== 'once' ? ' (every time it repeats)' : ''}?`)) {
        const baseId = it.baseId || it.id;
        state.items = state.items.filter((x) => x.id !== baseId);
        updateSummary(); save(); renderToday(); renderStatus();
      }
      return;
    }
    // The click that ends a swipe does nothing; a tap on an opened row closes it.
    if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); return; }
    if (e.target.closest('.row-item.open')) { e.stopImmediatePropagation(); closeSwipes(); }
  }, true);
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
    openEditor(item && item.baseId ? state.items.find((it) => it.id === item.baseId) : item);
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
    if (Living) Living.setSrc(dataUrl || DEFAULT_PIC);
  }
  function setPicture(dataUrl) {
    try { if (dataUrl) localStorage.setItem(PIC_KEY, dataUrl); else localStorage.removeItem(PIC_KEY); }
    catch { $('#pic-hint').textContent = 'Couldn’t save the picture on this device (storage is full or blocked).'; return; }
    applyPicture(dataUrl);
    // The Android app keeps its own copy for notifications.
    const N = window.RiasNative;
    if (N && N.setPicture) { try { N.setPicture(dataUrl ? dataUrl.split(',')[1] : ''); } catch { /* older app */ } }
  }
  if (window.createLivingPhoto) { Living = window.createLivingPhoto($('#stage-pic')); Living.setSrc(loadPicture() || DEFAULT_PIC); }
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
      state.shifts, state.phoneEvents, (state.food[today] || []).length, state.water[today] || 0, state.sleep, state.weather && state.weather.at]);
    if (sig === lastSync) return;
    lastSync = sig;
    try { Native.schedule(JSON.stringify(upcomingEvents())); } catch { /* bridge unavailable */ }
    try { if (Native.setWidget) Native.setWidget(widgetData()); } catch { /* older app */ }
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
      const brief = state.settings.briefing !== false ? briefingShort(d) : '';
      let briefed = false;
      for (const it of items) {
        const t = at(d, toMin(it.time));
        if (t <= now || log[it.id]) continue;
        // The wake-up reminder carries the day's briefing.
        const withBrief = brief && !briefed && it.category === 'wake';
        if (withBrief) briefed = true;
        events.push({
          at: t, text: `${say(pick(R.due[it.category] || R.due.custom), it)}${alarmFor(it) ? '' : `\n${fmtTime(it.time)} · ${it.title}`}${withBrief ? `\n${brief}` : ''}`,
          itemId: it.id, title: `${fmtTime(it.time)} · ${it.title}`, alarm: alarmFor(it), ...(it.sound ? { sound: it.sound } : {}),
          icon: CATEGORY_ICON[it.category] || '⏰',
        });
      }
      if (brief && !briefed && at(d, w) > now) events.push({ at: at(d, w), text: `${say(pick(R.greet.morning))}\n${brief}` });
      if (state.settings.recap !== false && d.getDay() === 0 && at(d, 19 * 60) > now && !state.recaps[weekKey(d)]) {
        events.push({ at: at(d, 19 * 60), text: say('Your weekly recap is ready, {name}. Come see how you did~') });
      }
      if (state.settings.windDown !== false) {
        const t = at(d, s + 45);
        if (t > now && !state.sleep[wakeDayKey(t)]) events.push({ at: t, text: say(pick(R.lateNight)) });
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
      if (it && sn.at > now) events.push({ at: sn.at, text: say(pick(R.due[it.category] || R.due.custom), it), itemId: it.id, title: it.title, alarm: alarmFor(it), ...(it.sound ? { sound: it.sound } : {}) });
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
  // Settings opens on a short menu of categories; each one shows just its sections.
  const SET_CATS = [
    { k: 'you', icon: '👤', title: 'You & her voice', sub: 'Your name and times, what she calls you, her voice' },
    { k: 'look', icon: '🎨', title: 'Look & feel', sub: 'Theme, Home screen, her outfit, her picture' },
    { k: 'mind', icon: '🧠', title: 'Rias\'s mind', sub: 'AI replies, monthly cost, what she remembers' },
    { k: 'alerts', icon: '🔔', title: 'Alarms & notifications', sub: 'Pop-ups, alarm card, sounds, check-ins' },
    { k: 'day', icon: '📅', title: 'Your day', sub: 'Morning briefing, weather, recap, sleep, calendar, food & water' },
    { k: 'data', icon: '💾', title: 'Backup & data', sub: 'Backups, updates, reset' },
  ];
  let setCat = null;
  function renderSetMenu() {
    const nav = $('#set-menu');
    nav.textContent = '';
    const st = state.settings;
    const extra = {
      you: state.profile ? `${state.profile.name} · wakes ${fmtTime(state.profile.wake)}` : '',
      look: `${{ crimson: 'Crimson', amethyst: 'Amethyst', midnight: 'Midnight blue', gold: 'Royal gold' }[st.theme] || 'Crimson'} theme`,
      mind: state.ai.on ? `AI on · ${state.ai.provider === 'gemini' ? 'Gemini' : 'Claude'}` : 'AI off',
      alerts: alarmOn() ? 'Alarm pop-ups on' : 'Alarm pop-ups off',
      day: state.weather && state.weather.place ? `Weather: ${state.weather.place}` : '',
      data: state.lastBackup || state.lastAutoBackup ? `Last backup ${new Date(Math.max(state.lastBackup || 0, state.lastAutoBackup || 0)).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'No backup yet',
    };
    for (const c of SET_CATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'set-tile';
      b.dataset.cat = c.k;
      b.innerHTML = '<span class="set-ic"></span><span class="set-txt"><b></b><small></small><em></em></span><span class="set-chev">›</span>';
      b.querySelector('.set-ic').textContent = c.icon;
      b.querySelector('b').textContent = c.title;
      b.querySelector('small').textContent = c.sub;
      b.querySelector('em').textContent = extra[c.k] || '';
      nav.append(b);
    }
  }
  function openSetCat(k) {
    setCat = k;
    for (const g of sf.querySelectorAll('.set-group')) g.hidden = !k || g.dataset.cat !== k;
    $('#set-menu').hidden = !!k;
    $('#set-title').hidden = !!k;
    $('#set-cat-head').hidden = !k;
    $('.save-bar').hidden = !k;
    if (k) $('#set-cat-title').textContent = (SET_CATS.find((c) => c.k === k) || {}).title || '';
    else renderSetMenu();
    $('#view-settings').scrollTop = 0;
    const v = $('#view-settings'); v.classList.remove('view-enter'); void v.offsetWidth; v.classList.add('view-enter');
  }
  $('#set-menu').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) openSetCat(b.dataset.cat); });
  $('#set-back').addEventListener('click', () => openSetCat(null));

  function fillSettings() {
    openSetCat(null);
    sf.elements.name.value = state.profile.name;
    sf.elements.wake.value = state.profile.wake;
    sf.elements.sleep.value = state.profile.sleep;
    sf.elements.checkins.checked = state.settings.checkins;
    sf.elements.checkinEvery.value = String(state.settings.checkinEvery);
    sf.elements.notify.checked = state.settings.notify;
    sf.elements.alarmPopup.checked = alarmOn();
    sf.elements.homeChar.value = state.settings.homeChar || 'animated';
    sf.elements.riasOutfit.value = state.settings.riasOutfit || 'auto';
    sf.elements.theme.value = state.settings.theme || 'crimson';
    sf.elements.haptics.checked = state.settings.haptics !== false;
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
    sf.elements.autoBackup.checked = state.settings.autoBackup !== false;
    sf.elements.briefing.checked = state.settings.briefing !== false;
    sf.elements.recap.checked = state.settings.recap !== false;
    sf.elements.windDown.checked = state.settings.windDown !== false;
    sf.elements.city.value = (state.weather && state.weather.place) || '';
    $('#city-hint').textContent = weatherFor(new Date()) ? `Today: ${weatherLine(new Date(), true)}` : state.weather ? '' : 'Set your city and Rias tells you the weather each morning.';
    renderMemory();
    renderSounds();
    renderCost();
    sf.elements.aiLimit.value = String(state.settings.aiLimit || 0);
    renderArt();
    sf.elements.alarmRing.checked = state.settings.alarmRing !== false;
    backupHint();
    renderUpdate();
  }
  // Settings → Alarm sound. Tapping one plays it; the choice applies right away.
  function fillSoundSelect(sel, first) {
    sel.textContent = '';
    for (const [k, label] of [['', first]].concat(soundChoices().filter(([k]) => k !== 'custom' || state.settings.alarmSoundUri))) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = k ? soundLabel(k) : label;
      sel.append(o);
    }
  }
  function renderSounds() {
    const box = $('#sound-list');
    box.textContent = '';
    for (const [k] of soundChoices()) {
      const l = document.createElement('label');
      l.className = 'chip';
      l.innerHTML = '<input type="radio" name="alarmSound"><span></span>';
      l.querySelector('input').value = k;
      l.querySelector('input').checked = (state.settings.alarmSound || 'chime') === k;
      l.querySelector('span').textContent = soundLabel(k);
      box.append(l);
    }
    $('#sound-hint').textContent = state.settings.alarmSound === 'voice'
      ? 'A chime, then Rias reads the reminder out loud.'
      : state.settings.alarmSound === 'silent' ? 'No sound, just vibration.' : '';
  }
  $('#sound-list').addEventListener('click', (e) => {
    const input = e.target.closest('input[name=alarmSound]');
    if (!input) return;
    const k = input.value;
    if (k === 'custom') {
      // Keep the old choice until a sound is actually picked.
      input.checked = false;
      const prev = sf.querySelector(`input[name=alarmSound][value="${state.settings.alarmSound || 'chime'}"]`);
      if (prev) prev.checked = true;
      window.RiasNative.pickSound(state.settings.alarmSoundUri || '');
      return;
    }
    state.settings.alarmSound = k;
    save(); pushSound(); renderSounds();
    startSound(k, false);
    if (k === 'voice') setTimeout(() => speak(say('It\'s time, {name}. This is how I\'ll call you.'), true), 1200);
  });
  window.riasSoundPicked = (uri, title) => {
    Object.assign(state.settings, { alarmSound: 'custom', alarmSoundUri: uri, alarmSoundTitle: title });
    save(); pushSound(); renderSounds();
    startSound('custom', false);
  };
  sf.elements.alarmRing.addEventListener('change', () => { state.settings.alarmRing = sf.elements.alarmRing.checked; save(); pushSound(); });

  // Settings → Alarm card picture: the animated Rias, her picture, or a photo just for the card.
  const ALARM_PIC_KEY = 'rias-alarm-picture';
  function loadAlarmPicture() { try { return localStorage.getItem(ALARM_PIC_KEY) || ''; } catch { return ''; } }
  function alarmArt() {
    const a = state.settings.alarmArt || 'auto';
    if (a === 'photo' && loadAlarmPicture()) return 'photo';
    if (a === 'mine' && loadPicture()) return 'mine';
    if (a === 'animated') return 'animated';
    return loadAlarmPicture() ? 'photo' : loadPicture() ? 'mine' : 'animated';
  }
  const ART = [['animated', '✨ Animated Rias'], ['mine', '🖼️ Rias\'s picture'], ['photo', '📷 My photo']];
  function renderArt() {
    const box = $('#art-list');
    box.textContent = '';
    const cur = alarmArt();
    for (const [k, label] of ART) {
      if (k === 'mine' && !loadPicture()) continue;
      if (k === 'photo' && !loadAlarmPicture()) continue;
      const l = document.createElement('label');
      l.className = 'chip';
      l.innerHTML = '<input type="radio" name="alarmArt"><span></span>';
      l.querySelector('input').value = k;
      l.querySelector('input').checked = k === cur;
      l.querySelector('span').textContent = label;
      box.append(l);
    }
    $('#art-photo').textContent = loadAlarmPicture() ? '📷 Change the card photo' : '📷 Choose a photo for the card';
    renderCut();
  }
  function pushArt() {
    const N = window.RiasNative;
    if (N && N.setAlarmArt) { try { N.setAlarmArt(alarmArt()); } catch { /* older app */ } }
  }
  $('#art-list').addEventListener('change', (e) => {
    if (e.target.name !== 'alarmArt') return;
    state.settings.alarmArt = e.target.value;
    save(); pushArt(); renderCut();
  });
  $('#art-photo').addEventListener('click', () => $('#art-file').click());
  $('#art-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await shrinkPhoto(file, 900);
      localStorage.setItem(ALARM_PIC_KEY, `data:image/jpeg;base64,${data.full}`);
      state.settings.alarmArt = 'photo';
      save();
      const N = window.RiasNative;
      if (N && N.setAlarmPicture) { try { N.setAlarmPicture(data.full); } catch { /* older app */ } }
      pushArt(); renderArt();
      $('#art-hint').textContent = 'Card photo set. It stays on this phone.';
      makeCutout();
    } catch {
      $('#art-hint').textContent = 'That file couldn’t be opened as a picture, or the phone’s storage is full.';
    }
  });
  // "Pop out of the card": cut the subject out of the card's photo (photo-cutout.js, on the phone).
  const CUT_KEY = 'rias-alarm-cutout';
  function loadCutout(art) {
    try { const c = JSON.parse(localStorage.getItem(CUT_KEY) || 'null'); return c && c.for === art ? c.data : ''; } catch { return ''; }
  }
  async function makeCutout() {
    const art = alarmArt();
    const src = art === 'photo' ? loadAlarmPicture() : art === 'mine' ? loadPicture() : '';
    if (!src || !window.RiasCutout) { renderCut(); return; }
    $('#cut-hint').textContent = 'Cutting the photo out… (the first time downloads about 20 MB)';
    $('#cut-make').disabled = true;
    try {
      const r = await window.RiasCutout.cut(src);
      if (!r) { $('#cut-hint').textContent = 'I couldn’t find one clear subject in that photo. It still fills the card, just without stepping out.'; return; }
      localStorage.setItem(CUT_KEY, JSON.stringify({ for: art, data: r.cutout }));
      const N = window.RiasNative;
      if (N && N.setAlarmCutout) { try { N.setAlarmCutout(r.cutout.split(',')[1], art); } catch { /* older app */ } }
      $('#cut-hint').textContent = 'Done ✓ The photo steps out of the card. Tap 👀 Preview.';
    } catch {
      $('#cut-hint').textContent = 'Couldn’t cut it out. The first time needs internet to download the cutout tool.';
    } finally {
      $('#cut-make').disabled = false;
      renderCut();
    }
  }
  function renderCut() {
    const art = alarmArt();
    $('#cut-row').hidden = art === 'animated';
    const has = !!loadCutout(art);
    $('#cut-make').textContent = has ? '↻ Redo the pop-out' : '✨ Make the photo pop out';
    $('#cut-off').hidden = !has;
  }
  $('#cut-make').addEventListener('click', makeCutout);
  $('#cut-off').addEventListener('click', () => {
    try { localStorage.removeItem(CUT_KEY); } catch { /* ignore */ }
    const N = window.RiasNative;
    if (N && N.setAlarmCutout) { try { N.setAlarmCutout('', ''); } catch { /* older app */ } }
    $('#cut-hint').textContent = 'Pop-out off: the photo fills the card.';
    renderCut();
  });
  $('#art-preview').addEventListener('click', () => showAlarmCard({ id: '', title: 'Preview', category: 'custom' }, say('This is how I\'ll call you, {name}. Tilt your phone~')));

  // Settings → Things Rias remembers.
  function renderMemory() {
    const ul = $('#mem-list');
    ul.textContent = '';
    if (!state.memory.length) ul.innerHTML = '<li class="mem-empty">Nothing yet. Tell her about yourself~</li>';
    for (const m of state.memory.slice().reverse()) {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><button type="button" class="mem-del" aria-label="Forget this">✕</button>';
      li.firstChild.textContent = m.text;
      li.lastChild.dataset.id = m.id;
      ul.append(li);
    }
  }
  sf.elements.theme.addEventListener('change', () => { document.documentElement.dataset.theme = sf.elements.theme.value; });
  sf.elements.riasOutfit.addEventListener('change', () => {
    if (!Avatar) return;
    const v = sf.elements.riasOutfit.value;
    if (v !== 'auto') { Avatar.setOutfit(v); return; }
    const was = state.settings.riasOutfit; state.settings.riasOutfit = 'auto'; Avatar.setOutfit(outfitNow()); state.settings.riasOutfit = was;
  });
  $('#mem-list').addEventListener('click', (e) => {
    const b = e.target.closest('.mem-del');
    if (!b) return;
    state.memory = state.memory.filter((m) => m.id !== b.dataset.id);
    save(); renderMemory();
  });
  const addMemory = () => {
    const i = $('#mem-input');
    if (remember(i.value)) { i.value = ''; renderMemory(); }
  };
  $('#mem-add').addEventListener('click', addMemory);
  $('#mem-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMemory(); } });
  // Settings → City for the weather.
  async function setCity() {
    const name = sf.elements.city.value.trim();
    if (!name) { state.weather = null; save(); $('#city-hint').textContent = 'Weather turned off.'; return; }
    $('#city-hint').textContent = 'Looking it up…';
    try {
      const c = await findCity(name);
      if (!c) { $('#city-hint').textContent = `Couldn't find “${name}”. Try the nearest big city.`; return; }
      state.weather = c;
      await refreshWeather(true);
      sf.elements.city.value = c.place;
      $('#city-hint').textContent = weatherFor(new Date()) ? `${c.place} ✓ Today: ${weatherLine(new Date(), true)}` : `${c.place} ✓`;
      save();
    } catch {
      $('#city-hint').textContent = 'Couldn’t reach the weather service. Are you online?';
    }
  }
  $('#city-set').addEventListener('click', setCity);
  sf.elements.city.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setCity(); } });
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(state.profile, { name: sf.elements.name.value.trim(), wake: sf.elements.wake.value, sleep: sf.elements.sleep.value });
    Object.assign(state.settings, { checkins: sf.elements.checkins.checked, checkinEvery: Number(sf.elements.checkinEvery.value), notify: sf.elements.notify.checked, praise: sf.elements.praise.value, voice: sf.elements.voice.checked,
      voiceName: sf.elements.voiceName.value, voicePitch: Number(sf.elements.voicePitch.value), voiceRate: Number(sf.elements.voiceRate.value) });
    Object.assign(state.settings, {
      foodReminders: sf.elements.foodReminders.checked,
      alarmPopup: sf.elements.alarmPopup.checked,
      homeChar: sf.elements.homeChar.value,
      riasOutfit: sf.elements.riasOutfit.value,
      theme: sf.elements.theme.value,
      haptics: sf.elements.haptics.checked,
      alarmCats: [...sf.querySelectorAll('[name=alarmCat]:checked')].map((b) => b.value),
      waterGoal: Number(sf.elements.waterGoal.value),
      autoBackup: sf.elements.autoBackup.checked,
      briefing: sf.elements.briefing.checked,
      recap: sf.elements.recap.checked,
      windDown: sf.elements.windDown.checked,
      alarmRing: sf.elements.alarmRing.checked,
      aiLimit: Number(sf.elements.aiLimit.value) || 0,
    });
    applyTheme();
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
  // ---------- backup & restore ----------
  // Everything lives only on this phone, so a backup file is the safety net. API keys stay out of it.
  function backupData() {
    const copy = JSON.parse(JSON.stringify(state));
    if (copy.ai) { copy.ai.key = ''; copy.ai.geminiKey = ''; }
    return JSON.stringify({ app: 'rias-companion', format: 1, savedAt: new Date().toISOString(), state: copy, picture: loadPicture() || '', alarmPicture: loadAlarmPicture() });
  }
  function backupHint() {
    const parts = [];
    if (state.lastBackup) parts.push(`Last saved backup: ${new Date(state.lastBackup).toLocaleDateString([], { month: 'short', day: 'numeric' })}`);
    if (state.lastAutoBackup) parts.push(`Last auto backup: ${new Date(state.lastAutoBackup).toLocaleDateString([], { month: 'short', day: 'numeric' })}`);
    $('#backup-hint').textContent = parts.join(' · ') || 'No backup yet.';
    $('#auto-backup-row').hidden = !(Native && Native.autoBackup);
  }
  $('#backup-save').addEventListener('click', () => {
    const name = `rias-backup-${dateKey()}.json`;
    const data = backupData();
    if (Native && Native.saveFile) {
      $('#backup-hint').textContent = 'Choose where to save it: Google Drive, Downloads…';
      Native.saveFile(name, data);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    window.riasSaved(true);
  });
  window.riasSaved = (ok) => {
    if (ok) { state.lastBackup = Date.now(); save(); }
    backupHint();
    if (!ok) $('#backup-hint').textContent = 'The backup wasn’t saved.';
    else $('#backup-hint').textContent = `Backup saved ✓ ${$('#backup-hint').textContent}`;
  };
  $('#backup-restore').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data = null;
    try { data = JSON.parse(await file.text()); } catch { /* not JSON */ }
    if (!data || data.app !== 'rias-companion' || !data.state || !data.state.profile) {
      $('#backup-hint').textContent = 'That file isn’t a Rias backup.';
      return;
    }
    const when = new Date(data.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (!(await ask(`Restore the backup from ${when}? It replaces everything in the app right now.`))) return;
    const next = data.state;
    next.ai = { ...(next.ai || {}), key: state.ai.key || '', geminiKey: state.ai.geminiKey || '' }; // keys stay on this phone
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      if (data.picture) localStorage.setItem(PIC_KEY, data.picture); else localStorage.removeItem(PIC_KEY);
      if (data.alarmPicture) localStorage.setItem(ALARM_PIC_KEY, data.alarmPicture); else localStorage.removeItem(ALARM_PIC_KEY);
    } catch {
      $('#backup-hint').textContent = 'Couldn’t restore: the phone’s storage is full.';
      return;
    }
    if (data.picture && Native && Native.setPicture) { try { Native.setPicture(data.picture.split(',')[1]); } catch { /* ignore */ } }
    if (data.alarmPicture && Native && Native.setAlarmPicture) { try { Native.setAlarmPicture(data.alarmPicture.split(',')[1]); } catch { /* ignore */ } }
    restoring = true;
    location.reload();
  });
  // Weekly automatic copy in Downloads/RiasCompanion (Android 10+).
  function maybeAutoBackup() {
    if (!state.profile || !state.settings.autoBackup || !(Native && Native.autoBackup)) return;
    if (Date.now() - (state.lastAutoBackup || 0) < 7 * 86400000) return;
    try { if (Native.autoBackup(backupData())) { state.lastAutoBackup = Date.now(); save(); } } catch { /* ignore */ }
  }

  // ---------- update check ----------
  // The Android build writes version.json next to the APK on GitHub; once a day the app compares.
  const VERSION_URL = 'https://raw.githubusercontent.com/nylonv2/lua-scripts/master/rias-companion/version.json';
  let latest = null;
  function installedVersion() {
    try { return Native && Native.appVersion ? JSON.parse(Native.appVersion()) : {}; } catch { return {}; }
  }
  function renderUpdate() {
    const mine = installedVersion();
    $('#app-version').textContent = mine.name ? `${mine.name} (build ${mine.code})` : 'Web version: always up to date';
    const ready = !!(latest && mine.code && latest.versionCode > mine.code);
    $('#update-card').hidden = !ready;
    if (ready) $('#update-title').textContent = `Rias ${latest.versionName} is ready`;
    $('#update-check').textContent = ready ? `Get ${latest.versionName}` : 'Check for updates';
  }
  async function checkUpdate(manual) {
    const mine = installedVersion();
    if (!mine.code) { if (manual) $('#update-hint').textContent = 'Updates are checked in the Android app.'; return; }
    if (manual) $('#update-hint').textContent = 'Checking…';
    try {
      const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
      latest = await r.json();
      state.lastUpdateCheck = Date.now(); save();
      if (manual) {
        $('#update-hint').textContent = latest.versionCode > mine.code
          ? `Version ${latest.versionName} is available.` : `You're on the newest version (${mine.name}).`;
      }
    } catch {
      if (manual) $('#update-hint').textContent = 'Couldn’t check. Are you online?';
    }
    renderUpdate();
  }
  function getUpdate() {
    if (!latest || !(Native && Native.openUrl)) return;
    Native.openUrl(latest.apk);
    $('#update-hint').textContent = 'Downloading in your browser. When it finishes, tap the file and choose Install (allow it if Android asks).';
  }
  $('#update-check').addEventListener('click', () => {
    const mine = installedVersion();
    if (latest && mine.code && latest.versionCode > mine.code) getUpdate(); else checkUpdate(true);
  });
  $('#update-get').addEventListener('click', getUpdate);
  function maybeCheckUpdate() {
    if (Native && Native.appVersion && Date.now() - (state.lastUpdateCheck || 0) > 20 * 3600000) checkUpdate(false);
  }

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
  const housekeeping = () => { maybeAutoBackup(); maybeCheckUpdate(); refreshWeather().then(() => { if (currentView === 'home') renderHome(); }); };
  setTimeout(housekeeping, 1500);
  pushSound();
  pushArt();
  $('#home-goodnight').addEventListener('click', () => { show('chat'); userSays('Goodnight, Rias 🌙'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    housekeeping();
    syncCalendar(); applyNativeActions(); tick(); renderFeed(); renderToday();
    if (state.profile && !$('#view-settings').hidden) { notifyHint(); popupCheck(); }
  });
})();
