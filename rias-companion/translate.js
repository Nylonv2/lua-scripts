// Assistant tab → Translate: a face-to-face interpreter. The screen splits in two: the top half
// faces the other person (upside down, so they can read it across from you), the bottom half is
// yours. Each side taps its mic and talks; Rias translates (her AI) and says it out loud in the
// other person's language (the phone's voices). Typing works too.
window.createTranslator = function createTranslator(ctx) {
  'use strict';
  const { state, save, $ } = ctx;
  // [speech/voice code, English name, the language's own name, "tap to talk" in that language]
  const LANGS = [
    ['en-US', 'English', 'English', 'Tap to talk'],
    ['es-US', 'Spanish', 'Español', 'Toca para hablar'],
    ['es-MX', 'Spanish (Mexico)', 'Español (México)', 'Toca para hablar'],
    ['es-ES', 'Spanish (Spain)', 'Español (España)', 'Toca para hablar'],
    ['fr-FR', 'French', 'Français', 'Touchez pour parler'],
    ['de-DE', 'German', 'Deutsch', 'Zum Sprechen tippen'],
    ['it-IT', 'Italian', 'Italiano', 'Tocca per parlare'],
    ['pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)', 'Toque para falar'],
    ['pt-PT', 'Portuguese (Portugal)', 'Português', 'Toque para falar'],
    ['zh-CN', 'Chinese (Mandarin)', '中文 (普通话)', '点击说话'],
    ['zh-HK', 'Cantonese', '粵語', '點擊說話'],
    ['ja-JP', 'Japanese', '日本語', 'タップして話す'],
    ['ko-KR', 'Korean', '한국어', '눌러서 말하기'],
    ['vi-VN', 'Vietnamese', 'Tiếng Việt', 'Chạm để nói'],
    ['fil-PH', 'Tagalog (Filipino)', 'Tagalog', 'Pindutin para magsalita'],
    ['ar-SA', 'Arabic', 'العربية', 'اضغط للتحدث'],
    ['hi-IN', 'Hindi', 'हिन्दी', 'बोलने के लिए टैप करें'],
    ['ur-PK', 'Urdu', 'اردو', 'بولنے کے لیے ٹیپ کریں'],
    ['bn-BD', 'Bengali', 'বাংলা', 'কথা বলতে ট্যাপ করুন'],
    ['pa-IN', 'Punjabi', 'ਪੰਜਾਬੀ', 'ਬੋਲਣ ਲਈ ਟੈਪ ਕਰੋ'],
    ['ru-RU', 'Russian', 'Русский', 'Нажмите, чтобы говорить'],
    ['uk-UA', 'Ukrainian', 'Українська', 'Натисніть, щоб говорити'],
    ['pl-PL', 'Polish', 'Polski', 'Dotknij, aby mówić'],
    ['tr-TR', 'Turkish', 'Türkçe', 'Konuşmak için dokun'],
    ['fa-IR', 'Persian (Farsi)', 'فارسی', 'برای صحبت ضربه بزنید'],
    ['he-IL', 'Hebrew', 'עברית', 'הקש כדי לדבר'],
    ['el-GR', 'Greek', 'Ελληνικά', 'Πατήστε για να μιλήσετε'],
    ['nl-NL', 'Dutch', 'Nederlands', 'Tik om te praten'],
    ['th-TH', 'Thai', 'ไทย', 'แตะเพื่อพูด'],
    ['id-ID', 'Indonesian', 'Bahasa Indonesia', 'Ketuk untuk bicara'],
    ['ht-HT', 'Haitian Creole', 'Kreyòl ayisyen', 'Peze pou pale'],
    ['sw-KE', 'Swahili', 'Kiswahili', 'Gusa ili kuongea'],
    ['so-SO', 'Somali', 'Soomaali', 'Taabo si aad u hadasho'],
    ['am-ET', 'Amharic', 'አማርኛ', 'ለመናገር ይንኩ'],
    ['ne-NP', 'Nepali', 'नेपाली', 'बोल्न ट्याप गर्नुहोस्'],
    ['ta-IN', 'Tamil', 'தமிழ்', 'பேச தட்டவும்'],
  ];
  const lang = (code) => LANGS.find((l) => l[0] === code) || LANGS[0];
  const RTL = /^(ar|ur|fa|he)/;
  const cfg = () => (state.translate ||= { me: guessMine(), them: 'es-US', flip: true });
  function guessMine() {
    const nav = (navigator.language || 'en-US');
    return (LANGS.find((l) => l[0].toLowerCase() === nav.toLowerCase()) || LANGS.find((l) => l[0].slice(0, 2) === nav.slice(0, 2)) || LANGS[0])[0];
  }
  const D = () => window.RiasDevice || null;
  const N = () => window.RiasNative || null;
  const WebRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let busy = false;
  const history = []; // this session only: [{ side, said, translated }]
  const last = { me: null, them: null }; // what's shown on each half: { text, orig, code }

  // ---------- the setup card ----------
  function fillSelects() {
    for (const id of ['#tr-me', '#tr-them']) {
      const sel = $(id);
      if (sel.options.length) continue;
      for (const [code, name, native] of LANGS) sel.append(new Option(name === native ? name : `${name} · ${native}`, code));
    }
    $('#tr-me').value = cfg().me;
    $('#tr-them').value = cfg().them;
  }
  function render() {
    fillSelects();
    $('#tr-hint').textContent = ctx.ai.enabled() ? '' : 'The translator needs her AI. Turn it on in Settings → Rias\'s mind (a free Gemini key works).';
    const box = $('#tr-history');
    box.hidden = !history.length;
    box.innerHTML = history.length ? `<p class="group-title">This conversation</p>${history.slice(-12).map((h) => `<div class="tr-hist ${h.side}"><b>${esc(h.translated)}</b><small>${esc(h.said)}</small></div>`).join('')}` : '';
  }
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('#tr-me').addEventListener('change', (e) => { cfg().me = e.target.value; save(); });
  $('#tr-them').addEventListener('change', (e) => { cfg().them = e.target.value; save(); });
  $('#tr-swap').addEventListener('click', () => { const c = cfg(); [c.me, c.them] = [c.them, c.me]; save(); fillSelects(); });
  $('#tr-start').addEventListener('click', start);

  // ---------- the live split screen ----------
  function start() {
    if (!ctx.ai.enabled()) { render(); $('#tr-hint').textContent = 'Turn on her AI first: Settings → Rias\'s mind (a free Gemini key works).'; return; }
    const c = cfg();
    last.me = null; last.them = null;
    paint();
    $('#tr-live').classList.toggle('flat', !c.flip);
    $('#tr-live').showModal();
    status('');
    // Warn early if the phone can't speak one of the languages.
    setTimeout(() => {
      const d = D();
      if (!d || !d.voiceCheck) return;
      const missing = [c.them, c.me].filter((code) => { try { return /missing|unsupported/.test(d.voiceCheck(code)); } catch { return false; } });
      if (missing.length) status(`No ${missing.map((m) => lang(m)[1]).join(' or ')} voice on this phone: I'll show the text. To hear it, add the voice in Android Settings → Accessibility → Text-to-speech.`, true);
    }, 1500);
  }
  function paint() {
    const c = cfg();
    for (const side of ['me', 'them']) {
      const code = side === 'me' ? c.me : c.them;
      const L = lang(code);
      const half = $(`#tr-half-${side}`);
      half.dir = RTL.test(code) ? 'rtl' : 'ltr';
      half.querySelector('.tr-lang').textContent = L[2];
      half.querySelector('.tr-mic-label').textContent = L[3];
      const shown = last[side];
      half.querySelector('.tr-text').textContent = shown ? shown.text : (side === 'them' ? L[3] : 'Tap your mic and talk. I\'ll say it in their language.');
      half.querySelector('.tr-text').classList.toggle('idle', !shown);
      half.querySelector('.tr-orig').textContent = shown ? shown.orig : '';
      half.querySelector('.tr-replay').hidden = !shown;
    }
  }
  function status(text, warn) {
    const el = $('#tr-status');
    el.textContent = text;
    el.classList.toggle('warn', !!warn);
  }
  function setBusy(on, side) {
    busy = on;
    for (const b of $('#tr-live').querySelectorAll('.tr-mic, .tr-type')) b.disabled = on;
    $('#tr-live').querySelectorAll('.tr-mic').forEach((b) => b.classList.toggle('listening', on && b.dataset.side === side));
  }

  // Someone talked (or typed): translate it for the other side and say it out loud.
  async function handle(side, said) {
    said = String(said || '').trim();
    if (!said) { setBusy(false); status(''); return; }
    const c = cfg();
    const fromCode = side === 'me' ? c.me : c.them;
    const toCode = side === 'me' ? c.them : c.me;
    setBusy(true, null);
    status('Translating…');
    const context = history.slice(-4).map((h) => `${h.side === 'me' ? 'Person A' : 'Person B'}: ${h.said}`).join('\n');
    const res = await ctx.ai.translate({ text: said, from: lang(fromCode)[1], to: lang(toCode)[1], context });
    setBusy(false);
    if (res.error) { status(res.error === 'no-ai' ? 'Turn on her AI to translate.' : res.error, true); return; }
    const other = side === 'me' ? 'them' : 'me';
    last[other] = { text: res.text, orig: said, code: toCode };
    history.push({ side, said, translated: res.text });
    paint();
    status('');
    speak(res.text, toCode);
  }
  function speak(text, code) {
    const d = D();
    if (d && d.speakIn) {
      let r = 'ok';
      try { r = String(d.speakIn(text, code)); } catch { r = 'error'; }
      if (/missing|unsupported/.test(r)) status(`This phone has no ${lang(code)[1]} voice, so read it instead. (Add one in Android Settings → Accessibility → Text-to-speech.)`, true);
      return;
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = code;
      const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(code.slice(0, 2).toLowerCase()));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    }
  }
  function listen(side) {
    if (busy) return;
    const c = cfg();
    const code = side === 'me' ? c.me : c.them;
    const n = N();
    status(side === 'me' ? 'Listening to you…' : `Listening… (${lang(code)[1]})`);
    setBusy(true, side);
    if (n && n.listenIn) { n.listenIn(code, side, lang(code)[3]); return; }
    if (WebRec) {
      const rec = new WebRec();
      rec.lang = code;
      rec.interimResults = false;
      rec.onresult = (e) => handle(side, e.results[0][0].transcript);
      rec.onerror = () => { setBusy(false); status('Couldn\'t hear that. Try again, or type it.', true); };
      rec.onend = () => { if (busy && !$('#tr-status').textContent.startsWith('Translating')) { setBusy(false); status(''); } };
      rec.start();
      return;
    }
    setBusy(false);
    status('Voice input isn\'t available here. Tap ⌨ to type.', true);
  }
  // Android voice typing result for one side.
  window.riasTrHeard = (side, text, err) => {
    if (err) { setBusy(false); status('Voice typing isn\'t available on this phone. Tap ⌨ to type.', true); return; }
    if (!text) { setBusy(false); status(''); return; }
    handle(side, text);
  };

  $('#tr-live').addEventListener('click', (e) => {
    const mic = e.target.closest('.tr-mic');
    if (mic) { listen(mic.dataset.side); return; }
    const type = e.target.closest('.tr-type');
    if (type) {
      const f = $(`#tr-half-${type.dataset.side} .tr-typebox`);
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector('input').focus();
      return;
    }
    const rep = e.target.closest('.tr-replay');
    if (rep) { const s = last[rep.dataset.side]; if (s) speak(s.text, s.code); }
  });
  for (const f of document.querySelectorAll('#tr-live .tr-typebox')) {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = f.querySelector('input');
      const v = input.value.trim();
      input.value = '';
      f.hidden = true;
      if (v) handle(f.dataset.side, v);
    });
  }
  $('#tr-close').addEventListener('click', () => { const d = D(); if (d && d.stopSpeakIn) d.stopSpeakIn(); $('#tr-live').close(); render(); });
  $('#tr-flip').addEventListener('click', () => { const c = cfg(); c.flip = !c.flip; save(); $('#tr-live').classList.toggle('flat', !c.flip); });
  $('#tr-live').addEventListener('cancel', () => { const d = D(); if (d && d.stopSpeakIn) d.stopSpeakIn(); setTimeout(render, 0); });

  return { render, start };
};
