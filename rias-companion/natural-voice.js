// Her natural voice: Google's Gemini text-to-speech, steered toward Rias's character
// (an elegant, confident young noblewoman: warm, a little low and velvety, poised, with a
// playful tease). It's an original voice that fits her, not a copy of any actor's voice.
// Needs a Gemini key (Settings → Rias's mind; the free tier works). If it can't be
// reached, she falls back to the phone's voice.
window.NaturalVoice = (() => {
  'use strict';
  const API = 'https://generativelanguage.googleapis.com/v1beta';
  // Gemini's prebuilt voices that suit her, warmest first.
  const VOICES = [
    ['Sulafat', 'Warm (recommended)'],
    ['Gacrux', 'Mature'],
    ['Despina', 'Smooth'],
    ['Kore', 'Firm & confident'],
    ['Vindemiatrix', 'Gentle'],
    ['Aoede', 'Breezy'],
    ['Leda', 'Youthful'],
  ];
  const STYLE = 'Read this aloud as an elegant, confident young noblewoman: warm, slightly low and velvety, calm and poised, '
    + 'affectionate with a light playful tease, natural pace, never rushed. Read only the words after the colon: ';
  let audioCtx = null, webSource = null, failUntil = 0, playingUntil = 0;

  const clean = (t) => t.replace(/\p{Extended_Pictographic}|️/gu, '').replace(/[~•*_#]/g, '').replace(/…/g, '...').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  async function call(key, path, body) {
    const res = await fetch(`${API}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // The newest Flash TTS model this key can use (remembered on the state object).
  async function model(state, key) {
    const ai = state.ai;
    if (ai.ttsModel && ai.ttsModelKey === key.slice(-6)) return ai.ttsModel;
    let names = [];
    try {
      const data = await call(key, 'models?pageSize=200');
      names = (data.models || []).map((m) => m.name.replace(/^models\//, '')).filter((n) => /tts/.test(n));
    } catch { /* fall through to the default */ }
    const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const flash = names.filter((n) => /flash/.test(n)).sort((a, b) => ver(b) - ver(a));
    ai.ttsModel = flash[0] || names.sort((a, b) => ver(b) - ver(a))[0] || 'gemini-2.5-flash-preview-tts';
    ai.ttsModelKey = key.slice(-6);
    return ai.ttsModel;
  }

  /** Base64 16-bit PCM + sample rate for `text`. Throws on failure. */
  async function synth(state, text, voice) {
    const key = (state.ai.geminiKey || '').trim();
    if (!key) throw new Error('no-key');
    const m = await model(state, key);
    const data = await call(key, `models/${m}:generateContent`, {
      contents: [{ parts: [{ text: STYLE + clean(text) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || VOICES[0][0] } } },
      },
    });
    const part = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData);
    if (!part) throw new Error('no-audio');
    const rate = parseInt((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || '24000', 10);
    return { pcm: part.inlineData.data, rate };
  }

  function playWeb(b64, rate) {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const bin = atob(b64);
    const n = bin.length >> 1;
    const buf = audioCtx.createBuffer(1, n, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 32768) v -= 65536;
      ch[i] = v / 32768;
    }
    stop();
    webSource = audioCtx.createBufferSource();
    webSource.buffer = buf;
    webSource.connect(audioCtx.destination);
    webSource.start();
  }

  /**
   * Speaks `text` in her natural voice. Resolves true once it starts playing, false if it
   * couldn't (no key, offline, out of free quota): the caller then uses the phone's voice.
   */
  // Several messages in a row: fetch them all at once, play them one after another.
  let chain = Promise.resolve(), gen = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function speak(state, text, voice) {
    if (!clean(text) || Date.now() < failUntil) return false;
    const my = gen;
    const pending = synth(state, text, voice);
    const turn = chain.then(async () => {
      const got = await pending;
      while (playing() && my === gen) await wait(120);
      return got;
    });
    chain = turn.catch(() => {});
    try {
      const { pcm, rate } = await turn;
      if (my !== gen) return true; // stopped meanwhile
      const dev = window.RiasDevice;
      if (dev && dev.playPcm) dev.playPcm(pcm, rate);
      else playWeb(pcm, rate);
      playingUntil = Date.now() + (pcm.length * 3 / 4 / 2 / rate) * 1000;
      return true;
    } catch (e) {
      // Rate-limited or rejected: use the phone voice for a while instead of retrying every line.
      if (e.message !== 'no-key') failUntil = Date.now() + (e.status === 429 ? 10 * 60000 : 60000);
      speak.lastError = e.status === 429 ? 'The free Gemini voice quota is used up for now; I\'ll use the phone voice for a bit.'
        : e.message === 'no-key' ? 'Paste a free Google key in the box above (tap “Get a free key”) to hear her natural voice.'
          : `Her natural voice couldn't load (${e.message}).`;
      return false;
    }
  }

  function stop() {
    gen++;
    playingUntil = 0;
    const dev = window.RiasDevice;
    if (dev && dev.stopPcm) { try { dev.stopPcm(); } catch { /* ignore */ } }
    if (webSource) { try { webSource.stop(); } catch { /* already done */ } webSource = null; }
  }
  const playing = () => Date.now() < playingUntil;

  return { VOICES, speak, stop, playing, clean };
})();
