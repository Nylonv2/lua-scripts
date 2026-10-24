// The alarm pop-up as a holographic trading card floating in a dark, sparkling scene:
// your photo (or the animated Rias) in the art window, drifting behind the card too,
// a rainbow sheen and glare that follow the tilt (phone motion, a drag, or a gentle
// idle sway), and the reminder printed on the card. Used by the in-app pop-up
// (index.html) and by the Android alarm screen (alarm.html).
window.AlarmCard = (() => {
  'use strict';

  const HTML = `
  <div class="ac-scene">
    <img class="ac-bg-pic" alt="" hidden>
    <div class="ac-motes" aria-hidden="true">${'<i></i>'.repeat(14)}</div>
    <div class="ac-top">
      <span class="ac-calling">Rias is calling you</span>
      <div class="ac-big-time" id="alarm-time"></div>
    </div>
    <div class="ac-card-wrap">
      <div class="ac-card">
        <div class="ac-inner">
          <div class="ac-head">
            <span class="ac-name">Rias Gremory</span>
            <span class="ac-type" aria-hidden="true"></span>
          </div>
          <div class="ac-art">
            <img class="ac-pic" alt="" hidden>
            <div class="ac-stage"></div>
            <div class="ac-art-sparks" aria-hidden="true">${'<i>✦</i>'.repeat(6)}</div>
          </div>
          <div class="ac-title" id="alarm-title"></div>
          <div class="ac-ability">
            <span class="ac-ability-label">✦ Rias says</span>
            <p class="ac-text" id="alarm-text"></p>
          </div>
          <div class="ac-foot"><span>Gremory · Occult Research Club</span><span class="ac-no"></span></div>
        </div>
        <div class="ac-holo" aria-hidden="true"></div>
        <div class="ac-glare" aria-hidden="true"></div>
      </div>
    </div>
    <div class="ac-actions">
      <button type="button" class="ac-done" id="alarm-done">Done ✓</button>
      <div class="ac-snooze" id="alarm-snooze">
        <span>Snooze</span>
        <button type="button" data-snooze="5">5 min</button>
        <button type="button" data-snooze="10">10 min</button>
        <button type="button" data-snooze="30">30 min</button>
      </div>
      <button type="button" class="ac-dismiss" id="alarm-dismiss">Dismiss</button>
    </div>
  </div>`;

  let root = null, card = null, raf = 0, lastInput = 0, living = null;

  function tilt(x, y) {
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    const s = card.style;
    s.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`);
    s.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
    s.setProperty('--mx', `${(50 + x * 50).toFixed(1)}%`);
    s.setProperty('--my', `${(50 + y * 50).toFixed(1)}%`);
    s.setProperty('--px', x.toFixed(3));
    s.setProperty('--py', y.toFixed(3));
  }
  // With no finger or phone motion, the card sways on its own.
  function loop(t) {
    if (!root || !root.isConnected) { raf = 0; return; }
    if (Date.now() - lastInput > 2500) tilt(Math.sin(t / 1900) * 0.55, Math.cos(t / 2600) * 0.4);
    raf = requestAnimationFrame(loop);
  }
  function onPointer(e) {
    const r = card.getBoundingClientRect();
    lastInput = Date.now();
    tilt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  }
  function onOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    lastInput = Date.now();
    tilt(e.gamma / 25, (e.beta - 45) / 25);
  }

  function mount(el) {
    root = el;
    root.innerHTML = HTML;
    card = root.querySelector('.ac-card');
    const wrap = root.querySelector('.ac-card-wrap');
    wrap.addEventListener('pointermove', onPointer);
    wrap.addEventListener('pointerdown', onPointer);
    window.addEventListener('deviceorientation', onOrientation);
    tilt(0, 0);
    return { stage: root.querySelector('.ac-stage') };
  }

  /**
   * opts: { time, title, text, icon, pic (data URL or ''), bg (data URL or ''), animated, hasItem }
   * Call each time the alarm shows; it replays the card's entrance.
   */
  function fill(opts) {
    if (!root) return;
    const q = (s) => root.querySelector(s);
    q('#alarm-time').textContent = opts.time || '';
    q('#alarm-title').textContent = opts.title || 'Reminder';
    q('#alarm-text').textContent = opts.text || '';
    q('.ac-type').textContent = opts.icon || '⏰';
    q('.ac-no').textContent = `No. ${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getHours()).padStart(2, '0')}`;
    const pic = q('.ac-pic');
    pic.hidden = !!opts.animated || !opts.pic;
    if (!pic.hidden) pic.src = opts.pic;
    // A photo in the art window comes alive (living-photo.js) when it can.
    if (!pic.hidden && window.createLivingPhoto) {
      if (!living) { const el = document.createElement('div'); q('.ac-art').prepend(el); living = window.createLivingPhoto(el, { tiltFrame: false }); }
      living.setSrc(opts.pic);
      pic.hidden = true;
    }
    if (living) q('.ac-art .living').hidden = !!opts.animated || !opts.pic;
    q('.ac-stage').hidden = !opts.animated;
    const bg = q('.ac-bg-pic');
    bg.hidden = !opts.bg;
    if (opts.bg) bg.src = opts.bg;
    q('#alarm-done').hidden = q('#alarm-snooze').hidden = !opts.hasItem;
    root.classList.toggle('long-text', (opts.text || '').length > 140);
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
    lastInput = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  }

  return { mount, fill };
})();

// In the app the pop-up lives in <dialog id="alarm">: build it now, before app.js wires its buttons.
if (document.getElementById('alarm') && !document.querySelector('#alarm .ac-scene')) {
  window.AlarmCard.mount(document.getElementById('alarm'));
}
