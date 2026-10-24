// Rias as a voice assistant (Alexa-style): timers and alarms, music, volume, flashlight,
// Do Not Disturb, opening apps, calls, texts, directions, sleep sounds, reading your
// notifications, routines ("Good morning", "Goodnight"), the time, and quick math.
// Commands are understood without her AI; with it on, the AI can also use them through
// the set_timer / phone_control tools, so any wording works. The phone parts need the
// Android app (window.RiasDevice); in a browser she says so, except timers and math.
window.createAssistant = function createAssistant(ctx) {
  'use strict';
  const D = () => window.RiasDevice || null;
  const st = () => ctx.state;
  const say = (line, extra) => ctx.say(line, extra);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const NEEDS_APP = 'That one needs the Android app, {name}. In a browser I can\'t reach your phone.';

  // ---------- numbers & durations ----------
  const WORDS = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
  // "twenty five" → "25", "a couple" → "2", "half an hour" → "30 minutes"
  function normNumbers(s) {
    return s
      .replace(/\bhalf an? hour\b/g, '30 minutes').replace(/\ban? hour and a half\b/g, '90 minutes')
      .replace(/\ba quarter of an hour\b/g, '15 minutes').replace(/\ba couple( of)?\b/g, '2').replace(/\ba few\b/g, '3')
      .replace(/\b(twenty|thirty|forty|fifty)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (m, t, u) => String(WORDS[t] + WORDS[u]))
      .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)\b/g, (m) => String(WORDS[m]))
      .replace(/\ban? (?=(hour|minute|second|min|sec)s?\b)/g, '1 ');
  }
  // Seconds in "1 hour 30 minutes", "90 seconds", "5 min", "2.5 hours"; 0 if none.
  function parseDuration(s) {
    let total = 0, found = false;
    const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b|minutes?|mins?|m\b|seconds?|secs?|s\b)/g;
    let m;
    while ((m = re.exec(s))) {
      found = true;
      const n = parseFloat(m[1]), u = m[2][0];
      total += u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
    }
    return found ? Math.round(total) : 0;
  }
  function durationText(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const parts = [];
    if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
    if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
    if (s && !h) parts.push(`${s} second${s > 1 ? 's' : ''}`);
    return parts.join(' and ') || '0 seconds';
  }
  // "6", "6 am", "6:30 pm", "18:45", "noon", "7 in the evening" → "HH:MM" (or null).
  function parseClock(s) {
    if (/\bnoon|midday\b/.test(s)) return '12:00';
    if (/\bmidnight\b/.test(s)) return '00:00';
    const m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|in the (morning|afternoon|evening|night)|tonight|o'?clock)?/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (h > 23 || min > 59) return null;
    const tag = m[3] || '';
    if (/^p|afternoon|evening|night|tonight/.test(tag) && h < 12) h += 12;
    if (/^a|morning/.test(tag) && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const fmt = (hhmm) => ctx.fmtTime(hhmm);

  // ---------- timers ----------
  const timers = () => (st().timers ||= []);
  const webTimers = {};
  function armWeb(t) {
    clearTimeout(webTimers[t.id]);
    webTimers[t.id] = setTimeout(() => timerDone(t.id), Math.max(0, t.ends - Date.now()));
  }
  function timerDone(id) {
    const t = timers().find((x) => x.id === id);
    if (!t) return;
    st().timers = timers().filter((x) => x.id !== id);
    ctx.save();
    // On Android the alarm rings natively; in the app (or a browser) she also says it here.
    if (!ctx.headless) ctx.timerUp(t);
  }
  function startTimer(seconds, label) {
    seconds = Math.round(seconds);
    if (!(seconds > 0) || seconds > 24 * 3600) return { error: 'Timers can be 1 second to 24 hours.' };
    const t = { id: `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, label: (label || '').trim().slice(0, 40), ends: Date.now() + seconds * 1000, secs: seconds };
    timers().push(t);
    ctx.save();
    const d = D();
    if (d && d.timerStart) d.timerStart(t.id, t.ends, t.label);
    if (!ctx.headless) armWeb(t);
    return { ok: true, timer: `${durationText(seconds)}${t.label ? ` (${t.label})` : ''}` };
  }
  function cancelTimers(which) {
    const list = timers();
    const gone = which ? list.filter((t) => t.label && t.label.toLowerCase().includes(which)) : list.slice();
    for (const t of gone) {
      const d = D();
      if (d && d.timerCancel) d.timerCancel(t.id);
      clearTimeout(webTimers[t.id]);
    }
    st().timers = list.filter((t) => !gone.includes(t));
    ctx.save();
    return gone.length;
  }
  function timerStatus() {
    const list = timers().filter((t) => t.ends > Date.now()).sort((a, b) => a.ends - b.ends);
    if (!list.length) return 'You don\'t have any timers running, {name}.';
    return list.map((t) => `${t.label ? `Your ${t.label} timer has` : list.length > 1 ? 'One timer has' : 'Your timer has'} ${durationText((t.ends - Date.now()) / 1000)} left.`).join(' ');
  }
  // Timers that ran out while the app was closed are dropped; running ones re-armed.
  function restore() {
    st().timers = timers().filter((t) => t.ends > Date.now() - 60000);
    if (!ctx.headless) for (const t of timers()) if (t.ends > Date.now()) armWeb(t);
  }

  // ---------- alarms ("wake me up at 6") ----------
  function setAlarm(hhmm, label) {
    const now = new Date();
    const [h, m] = hhmm.split(':').map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (at <= now) at.setDate(at.getDate() + 1);
    ctx.addItem({ title: label || 'Wake up', time: hhmm, category: label ? 'custom' : 'wake', repeat: 'once', date: ctx.dateKey(at) });
    const when = ctx.dateKey(at) === ctx.dateKey(now) ? 'today' : 'tomorrow';
    return say(pick([
      `Done. I'll wake you at ${fmt(hhmm)} ${when}, {name}. Don't make me come in there~`,
      `Alarm set for ${fmt(hhmm)} ${when}. I'll be the first thing you hear.`,
    ]));
  }

  // ---------- results → her words ----------
  function deviceCall(fn, ...args) {
    const d = D();
    if (!d || !d[fn]) return null;
    try { return String(d[fn](...args)); } catch { return 'error'; }
  }
  const musicApp = () => st().settings.musicApp || '';
  const SOUND_WORDS = [['rain', /\brain/], ['ocean', /\b(ocean|waves?|sea|beach)\b/], ['brown', /\b(brown|white|pink) noise\b|\bnoise\b/], ['fire', /\b(fire|fireplace|campfire|crackl)/], ['fan', /\bfan\b/]];
  const SOUND_NAMES = { rain: 'rain', ocean: 'ocean waves', brown: 'brown noise', fire: 'the fireplace', fan: 'the fan' };

  /** Runs one phone action. Returns { ok, said } (said = what she tells you), or { error }. */
  function run(action, value = '', message = null) {
    const v = String(value || '').trim();
    const r = (line) => ({ ok: true, said: say(line) });
    const fail = (line) => ({ ok: false, said: say(line) });
    const needApp = () => fail(NEEDS_APP);
    switch (action) {
      case 'play_music': {
        const res = deviceCall('playSearch', v, musicApp());
        if (res == null) return needApp();
        return res === 'ok' ? r(pick([`Playing ${cap(v)}~`, `${cap(v)}, coming up.`, `Mm, good choice. Playing ${cap(v)}.`])) : fail('I couldn\'t find a music app to play that, {name}.');
      }
      case 'pause_music': return deviceCall('media', 'pause') == null ? needApp() : r(pick(['Paused.', 'Music paused~']));
      case 'resume_music': return deviceCall('media', 'play') == null ? needApp() : r(pick(['Playing.', 'Back on~']));
      case 'next_track': return deviceCall('media', 'next') == null ? needApp() : r(pick(['Skipped.', 'Next one~']));
      case 'previous_track': return deviceCall('media', 'previous') == null ? needApp() : r('Going back one.');
      case 'volume_up': case 'volume_down': case 'mute': case 'unmute': case 'volume_set': {
        const res = deviceCall('volume', action.replace('volume_', ''), Math.max(0, Math.min(100, parseInt(v, 10) || 50)));
        if (res == null) return needApp();
        if (res === 'no-permission') return fail('Your phone won\'t let me change the volume during Do Not Disturb.');
        return r(action === 'mute' ? 'Muted.' : action === 'unmute' ? 'Unmuted.' : `Volume's at ${res}%.`);
      }
      case 'flashlight_on': case 'flashlight_off': {
        const res = deviceCall('flashlight', action === 'flashlight_on');
        if (res == null) return needApp();
        return res === 'ok' ? r(action === 'flashlight_on' ? pick(['Light\'s on~', 'There, now you can see.']) : 'Flashlight off.') : fail('This phone doesn\'t have a flashlight I can use.');
      }
      case 'dnd_on': case 'dnd_off': {
        const res = deviceCall('dnd', action === 'dnd_on');
        if (res == null) return needApp();
        if (res === 'no-permission') return fail('I need permission for Do Not Disturb first. Go to Settings → Assistant → Do Not Disturb and allow me.');
        return r(action === 'dnd_on' ? 'Do Not Disturb is on. Nobody bothers you but me~' : 'Do Not Disturb is off.');
      }
      case 'open_app': {
        const res = deviceCall('openApp', v);
        if (res == null) return needApp();
        return res ? r(`Opening ${res}.`) : fail(`I couldn't find an app called “${v}” on your phone.`);
      }
      case 'call': {
        const res = deviceCall('call', v);
        if (res == null) return needApp();
        if (res === 'no-permission') return fail('I need access to your contacts to call by name. Go to Settings → Assistant → Calls & texts.');
        if (res === 'not-found') return fail(`I couldn't find “${v}” in your contacts.`);
        return res.startsWith('ok') ? r(`Calling ${res.slice(3) || v}.`) : fail('I couldn\'t start the call.');
      }
      case 'text': {
        if (!message) return fail(`What should I say to ${v}?`);
        const res = deviceCall('text', v, message);
        if (res == null) return needApp();
        if (res === 'no-permission') return fail('I need access to your contacts to text by name. Go to Settings → Assistant → Calls & texts.');
        if (res === 'not-found') return fail(`I couldn't find “${v}” in your contacts.`);
        return res.startsWith('ok') ? r(`Your message to ${res.slice(3) || v} is ready. Just tap send.`) : fail('I couldn\'t open your messages app.');
      }
      case 'directions': {
        const res = deviceCall('directions', v);
        if (res == null) return needApp();
        return res === 'ok' ? r(`Directions to ${cap(v)}. Drive safe, {name}.`) : fail('I couldn\'t open maps.');
      }
      case 'sleep_sound': {
        const key = (SOUND_WORDS.find(([, re]) => re.test(v.toLowerCase())) || [st().settings.sleepSound || 'rain'])[0];
        const mins = parseInt(message, 10) || st().settings.sleepMinutes || 45;
        if (deviceCall('sleepSound', key, mins) == null) return needApp();
        return r(`Playing ${SOUND_NAMES[key]} for ${durationText(mins * 60)}. Sleep well~`);
      }
      case 'stop_sleep_sound': return deviceCall('sleepStop') == null ? needApp() : r('Sounds off.');
      case 'read_notifications': return readNotifications();
      case 'cancel_timers': {
        const n = cancelTimers(v.toLowerCase());
        return n ? r(n > 1 ? `Cancelled ${n} timers.` : 'Timer cancelled.') : fail('There\'s no timer running.');
      }
      case 'timer_status': return r(timerStatus());
      case 'run_routine': {
        const rt = findRoutine(v);
        return rt ? { ok: true, said: runRoutine(rt).join(' ') } : fail(`I don't have a routine called “${v}”.`);
      }
      default: return { error: `Unknown action ${action}` };
    }
  }

  function readNotifications() {
    const d = D();
    if (!d || !d.notifications) return { ok: false, said: say(NEEDS_APP) };
    let s = {};
    try { s = JSON.parse(d.status()); } catch { /* old app */ }
    if (!s.notifications) return { ok: false, said: say('I need permission to read your notifications. Go to Settings → Assistant → Read notifications and allow me.') };
    let list = [];
    try { list = JSON.parse(d.notifications(st().notesReadAt || 0)); } catch { /* none */ }
    st().notesReadAt = Date.now();
    ctx.save();
    if (!list.length) return { ok: true, said: say(pick(['Nothing new, {name}. You haven\'t missed a thing.', 'All quiet. No new notifications.'])) };
    const byApp = {};
    for (const n of list) (byApp[n.app] ||= []).push(n);
    const parts = Object.entries(byApp).slice(0, 5).map(([app, ns]) => {
      const last = ns.slice(-2).map((n) => `${n.title ? `${n.title}: ` : ''}${(n.text || '').slice(0, 90)}`).join('. ');
      return `${app}${ns.length > 2 ? ` (${ns.length})` : ''}: ${last}`;
    });
    return { ok: true, said: `${list.length === 1 ? 'One new notification.' : `${list.length} new notifications.`} ${parts.join('. ')}.` };
  }

  // ---------- routines ----------
  const DEFAULT_ROUTINES = [
    { id: 'morning', phrase: 'good morning', brief: true, dnd: 'off', sound: 'stop', music: '', volume: '' },
    { id: 'night', phrase: 'goodnight', brief: false, tomorrow: true, dnd: 'on', sound: 'rain', minutes: 45, music: '', volume: '' },
  ];
  const routines = () => (st().settings.routines ||= DEFAULT_ROUTINES.map((r) => ({ ...r })));
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function findRoutine(text) {
    const t = clean(text).replace(/^(hey |ok |okay )?rias /, '').replace(/ rias$/, '').replace(/good night/g, 'goodnight');
    return routines().find((r) => r.phrase && (t === clean(r.phrase).replace(/good night/g, 'goodnight') || t === `run ${clean(r.phrase)}` || t === `start ${clean(r.phrase)}`));
  }
  function runRoutine(rt) {
    const out = [];
    if (rt.dnd === 'on' || rt.dnd === 'off') run(rt.dnd === 'on' ? 'dnd_on' : 'dnd_off');
    if (rt.volume !== '' && rt.volume != null && !isNaN(rt.volume)) run('volume_set', String(rt.volume));
    if (rt.brief) out.push(ctx.briefing());
    if (rt.tomorrow) out.push(ctx.tomorrowLine());
    if (rt.sound === 'stop') { if (D() && D().sleepPlaying && D().sleepPlaying()) run('stop_sleep_sound'); }
    else if (rt.sound) { const r = run('sleep_sound', rt.sound, String(rt.minutes || 45)); if (r.ok) out.push(r.said); }
    if (rt.music) { const r = run('play_music', rt.music); out.push(r.said); }
    if (rt.say) out.push(say(rt.say));
    if (!out.length) out.push(say(pick(['Done~', 'All set, {name}.'])));
    return out.filter(Boolean);
  }

  // ---------- quick math ----------
  function math(t) {
    let m = t.match(/(?:what(?:'s| is)\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+\$?(\d+(?:\.\d+)?)/);
    if (m) return `${fmtNum(parseFloat(m[1]) / 100 * parseFloat(m[2]))}.`;
    m = t.match(/\btip\b.*?\$?(\d+(?:\.\d+)?)(?:.*?(\d+)\s*(?:%|percent))?/);
    if (m && /\b(tip|tipping)\b/.test(t)) {
      const bill = parseFloat(m[1]), pct = parseFloat(m[2] || 20), tip = bill * pct / 100;
      return `A ${pct}% tip on $${fmtNum(bill)} is $${tip.toFixed(2)}, so $${(bill + tip).toFixed(2)} in total.`;
    }
    m = t.match(/^(?:what(?:'s| is)|calculate|how much is)\s+(-?\d+(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|\*|multiplied by|divided by|over|\/)\s*(-?\d+(?:\.\d+)?)\??$/);
    if (m) {
      const a = parseFloat(m[1]), b = parseFloat(m[3]), op = m[2];
      const v = /plus|\+/.test(op) ? a + b : /minus|-/.test(op) ? a - b : /times|x|\*|multiplied/.test(op) ? a * b : b === 0 ? NaN : a / b;
      return isNaN(v) ? 'Even I can\'t divide by zero~' : `${fmtNum(v)}.`;
    }
    return null;
  }
  const cap = (x) => x.replace(/(^|\s)([a-z])/g, (q, sp, c) => sp + c.toUpperCase());
  const fmtNum = (n) => (Math.round(n * 100) / 100).toLocaleString();

  // ---------- understanding what you said ----------
  let pendingText = null; // "text Jake" → "what should I say?" → your next message is the text

  /** Returns her reply lines if `text` was an assistant command, else null. */
  function handle(rawText) {
    let t = normNumbers(rawText.toLowerCase().replace(/[’]/g, "'").trim());
    t = t.replace(/^(hey |hi |ok |okay )?rias[,!.]?\s+/, '').replace(/^(please |can you |could you |would you |will you |i want you to |i need you to )+/, '')
      .replace(/[?!.]+$/, '').replace(/\s+please$/, '').trim();
    if (!t) return null;
    const one = (x) => [typeof x === 'string' ? x : x.said];

    if (pendingText) {
      const to = pendingText;
      pendingText = null;
      if (!/^(never ?mind|cancel|forget it|nothing)$/.test(t)) return one(run('text', to, rawText.trim()));
      return [say('Okay, I won\'t send it.')];
    }

    // Routines first ("good morning", "goodnight", your own).
    const rt = findRoutine(t);
    if (rt) return runRoutine(rt);

    // Timers
    if (/\btimer\b/.test(t) || /^(start )?(a )?\d/.test(t) && /\b(minute|second|hour)s?\b.*\btimer\b/.test(t)) {
      if (/\b(cancel|stop|delete|remove|clear|end|turn off)\b/.test(t)) {
        const label = (t.match(/\b(?:the |my )?(\w+) timer\b/) || [])[1];
        return one(run('cancel_timers', label && !/^(the|my|all|that|this|a)$/.test(label) ? label : ''));
      }
      if (/\b(how (much|long)|time left|remaining|left on|check)\b/.test(t)) return [say(timerStatus())];
      const secs = parseDuration(t);
      if (secs) {
        const label = (t.match(/\b(?:for|called|named|labell?ed)\s+(?:the\s+|my\s+)?([a-z][a-z ]{1,25}?)(?:\s+for\b|$)/) || [])[1];
        const lbl = label && !/^\d|minute|second|hour/.test(label) ? label.trim() : (t.match(/\b([a-z]+) timer\b/) || [])[1];
        const res = startTimer(secs, lbl && !/^(a|the|my|minute|second|hour|set|start)$/.test(lbl) ? lbl : '');
        if (res.error) return [say(res.error)];
        return [say(pick([`${durationText(secs)}, starting now. I'll call you when it's done~`, `Timer set: ${res.timer}. I'm watching the clock for you.`, `Okay, ${durationText(secs)}. Off you go.`]))];
      }
      if (/\b(set|start)\b/.test(t)) return [say('For how long, {name}? Say something like “set a timer for 10 minutes”.')];
    }
    if (/^(how much time|how long) (is )?(left|remaining)\b/.test(t)) return [say(timerStatus())];

    // Alarms
    let m = t.match(/^(?:wake me( up)?|set (?:an |my )?alarm|alarm)\b(?: (?:for|at))?\s*(.*)$/);
    if (m && !/\b(cancel|delete|stop|off)\b/.test(t)) {
      const hhmm = parseClock(m[2] || '');
      if (hhmm) return [setAlarm(hhmm, '')];
      const secs = parseDuration(m[2] || '');
      if (secs && /\bin\b/.test(m[2])) {
        const at = new Date(Date.now() + secs * 1000);
        return [setAlarm(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`, '')];
      }
      return [say('What time should I wake you, {name}?')];
    }

    // Sleep / ambient sounds (before music, so "play rain sounds" isn't a song search)
    if (/\b(stop|turn off|end|enough)\b.*\b(sounds?|rain|noise|ocean|waves|fireplace|fan)\b/.test(t)) return one(run('stop_sleep_sound'));
    if (/\b(sleep sounds?|ambient sounds?|rain sounds?|white noise|brown noise|pink noise|ocean sounds?|wave sounds?|fireplace|fire sounds?|fan sounds?|sounds? of (the )?(rain|ocean|waves))\b/.test(t)
      || /^play (some )?(rain|ocean|waves|noise)$/.test(t)) {
      const mins = (parseDuration(t) / 60) || '';
      return one(run('sleep_sound', t, mins ? String(Math.round(mins)) : null));
    }

    // Music
    if (/^(pause|stop)( the| my)?( music| song| playback| it)?$/.test(t)) return one(run('pause_music'));
    if (/^(resume|unpause|continue|keep playing)( the| my)?( music| song| playback)?$|^play( the)? music$|^play$/.test(t)) return one(run('resume_music'));
    if (/^(next|skip)( song| track| this( song)?| it)?$|^play the next (song|track)$/.test(t)) return one(run('next_track'));
    if (/^(previous|last|go back|back)( song| track| one)?$|^play the (previous|last) (song|track)$/.test(t)) return one(run('previous_track'));
    m = t.match(/^(?:play|put on|listen to)\s+(.+?)(?:\s+on\s+(spotify|youtube music|youtube|pandora|amazon music|apple music))?$/);
    if (m && !/^(a |some )?(game|games|trivia|music$)/.test(m[1])) {
      const d = D();
      if (!d) return [say(NEEDS_APP)];
      const res = deviceCall('playSearch', m[1].replace(/^(some|the song|the album|the playlist|my)\s+/, (x) => (x.startsWith('my') ? x : '')), m[2] || musicApp());
      return [say(res === 'ok' ? pick([`Playing ${cap(m[1])}~`, `${cap(m[1])}, coming right up.`]) : 'I couldn\'t find a music app to play that, {name}.')];
    }

    // Volume
    if (/^(un ?mute)( the)?( volume| sound| phone)?$/.test(t)) return one(run('unmute'));
    if (/^mute( the)?( volume| sound| phone| music)?$/.test(t)) return one(run('mute'));
    m = t.match(/\b(?:set |turn )?(?:the )?volume (?:to |at )?(\d{1,3})\s*(?:%|percent)?\b/);
    if (m) return one(run('volume_set', m[1]));
    if (/\b(volume up|turn (it|the volume|the music) up|louder|raise the volume|increase the volume)\b/.test(t)) return one(run('volume_up'));
    if (/\b(volume down|turn (it|the volume|the music) down|quieter|softer|lower the volume|decrease the volume)\b/.test(t)) return one(run('volume_down'));

    // Flashlight
    if (/\b(flash ?light|torch)\b/.test(t)) {
      if (/\b(off|disable|stop)\b/.test(t)) return one(run('flashlight_off'));
      return one(run('flashlight_on'));
    }

    // Do Not Disturb
    if (/\b(do not disturb|don't disturb|dnd)\b/.test(t)) return one(run(/\b(off|disable|stop|end|turn off|deactivate)\b/.test(t) ? 'dnd_off' : 'dnd_on'));

    // Calls, texts, directions
    m = t.match(/^(?:call|phone|ring|dial)\s+(.+)$/);
    if (m && !/^(me|it)\b/.test(m[1])) return one(run('call', m[1].replace(/\s+(on|from) (my )?(phone|mobile|cell)$/, '')));
    m = rawText.trim().replace(/[?.!]+$/, '').match(/^(?:(?:hey |ok |okay )?rias[,!.]?\s+)?(?:please\s+)?(?:send (?:a )?(?:text|message|sms) to|text|message)\s+(.+?)(?:\s*(?:,|saying|that says|that|and say|and tell (?:him|her|them))\s+(.+))?$/i);
    if (m && /^(send|text|message)/.test(t)) {
      let to = m[1].trim(), body = (m[2] || '').trim();
      // "Text Jake I'm running late": no "saying", so the name is the first word
      // (or two, like "Jake Smith", when typed with capitals).
      if (!body && to.includes(' ')) {
        const w = to.split(/\s+/);
        const two = w.length > 2 && /^[A-Z]/.test(w[1]) && !/^I('|$)/.test(w[1]);
        to = w.slice(0, two ? 2 : 1).join(' ');
        body = w.slice(two ? 2 : 1).join(' ');
        if (/^(mom|dad|my)$/i.test(to) && /^(mom|dad|wife|husband|boyfriend|girlfriend|brother|sister)\b/i.test(body)) {
          to = `${to} ${body.split(' ')[0]}`; body = body.split(' ').slice(1).join(' ');
        }
      }
      if (!body) { pendingText = to; return [say(`What should I say to ${to}?`)]; }
      return one(run('text', to, body));
    }
    m = t.match(/^(?:get |give me |show me )?(?:directions|navigate|navigation|take me|drive me|how do i get|route me)(?: me)?\s+(?:to\s+)(.+)$/);
    if (m) return one(run('directions', m[1]));

    // Open apps
    m = t.match(/^(?:open|launch|start|go to)\s+(?:the\s+)?(.+?)(?:\s+app)?$/);
    if (m && !/\b(timer|routine|music)\b/.test(m[1])) {
      const page = ctx.openPage && ctx.openPage(m[1]);
      if (page) return [say(page)];
      return one(run('open_app', m[1]));
    }

    // Notifications
    if (/\b(what did i miss|read (me )?my (notifications|messages)|read (the |my )?notifications|any (new )?(notifications|messages)|do i have (any )?(new )?(notifications|messages))\b/.test(t)) return one(readNotifications());

    // Time & date
    if (/^(what time is it|what's the time|what is the time|time|tell me the time|do you know what time it is)$/.test(t)) {
      return [say(pick([`It's ${ctx.nowText()}, {name}.`, `${ctx.nowText()}~`]))];
    }
    if (/^(what's the date|what is the date|what day is it|what's today's date|what is today|today's date|what day is today)( today)?$/.test(t)) {
      return [say(`Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.`)];
    }

    // Quick math
    const mathAns = math(t);
    if (mathAns) return [say(mathAns)];

    // "Stop" / "be quiet"
    if (/^(stop|stop talking|be quiet|shush|quiet|shut up|that's all|never ?mind)$/.test(t)) {
      ctx.stopSpeaking();
      const d = D();
      if (d && d.sleepPlaying && d.sleepPlaying() && /^stop$/.test(t)) d.sleepStop();
      return [say(pick(['Okay~', 'Mm, I\'ll hush.', 'As you wish.']))];
    }
    return null;
  }

  return { handle, run, startTimer, cancelTimers, timerStatus, restore, timerDone, routines, DEFAULT_ROUTINES, durationText, parseDuration, parseClock };
};
