// The alarm pop-up as an immersive full-art card: the art fills the whole card, the
// subject (the animated Rias, or your photo cut out from its background) steps out
// over the top edge, and three layers (scene, subject, sparkles) move at different
// depths as the card tilts (phone motion, a drag, or a gentle idle sway), under a
// holo sheen. The reminder sits on the art. Used by the in-app pop-up (index.html)
// and by the Android alarm screen (alarm.html).
window.AlarmCard = (() => {
  'use strict';

  const CIRCLE = `<svg class="ac-circle" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="currentColor">
    <circle cx="100" cy="100" r="96" stroke-width="1.4"/><circle cx="100" cy="100" r="86" stroke-width=".7"/><circle cx="100" cy="100" r="56" stroke-width="1"/>
    <polygon points="100,14 174.5,143 25.5,143" stroke-width="1.1"/><polygon points="100,186 25.5,57 174.5,57" stroke-width="1.1"/></g></svg>`;

  const HTML = `
  <div class="ac-scene">
    <div class="ac-room" aria-hidden="true"></div>
    <img class="ac-bg-pic" alt="" hidden>
    <div class="ac-motes" aria-hidden="true">${'<i></i>'.repeat(14)}</div>
    <div class="ac-top">
      <span class="ac-calling">Rias is calling you</span>
      <div class="ac-big-time" id="alarm-time"></div>
    </div>
    <div class="ac-card-wrap">
      <div class="ac-card">
        <div class="ac-layer ac-back">
          <img class="ac-back-pic" alt="" hidden>
          <div class="ac-back-living"></div>
          ${CIRCLE}
          <div class="ac-rays"></div>
        </div>
        <div class="ac-layer ac-subject">
          <img class="ac-cut" alt="" hidden>
          <div class="ac-stage"></div>
        </div>
        <div class="ac-layer ac-front" aria-hidden="true">${'<i>✦</i>'.repeat(7)}${'<b></b>'.repeat(6)}</div>
        <div class="ac-holo" aria-hidden="true"></div>
        <div class="ac-glare" aria-hidden="true"></div>
        <div class="ac-head">
          <span class="ac-name">Rias Gremory</span>
          <span class="ac-type" aria-hidden="true"></span>
        </div>
        <div class="ac-info">
          <div class="ac-title" id="alarm-title"></div>
          <p class="ac-text" id="alarm-text"></p>
          <div class="ac-foot"><span>✦ Gremory · Occult Research Club</span><span class="ac-no"></span></div>
        </div>
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
   * opts: { time, title, text, icon, animated, pic (full photo, data URL), cut (the subject cut out, data URL),
   *         bg (picture for the blurred room behind), hasItem, plain + name (Discreet mode: a plain card) }
   * With `cut`, the photo fills the card and the cut-out subject steps out over the top edge.
   * Without it, the photo fills the card as a living photo. `animated` puts the animated Rias in front.
   * Call each time the alarm shows; it replays the card's entrance.
   */
  function fill(opts) {
    if (!root) return;
    const q = (s) => root.querySelector(s);
    q('#alarm-time').textContent = opts.time || '';
    q('.ac-calling').textContent = opts.plain ? 'Reminder' : 'Rias is calling you';
    q('.ac-name').textContent = opts.plain ? (opts.name || 'Assistant') : 'Rias Gremory';
    q('#alarm-title').textContent = opts.title || 'Reminder';
    q('#alarm-text').textContent = opts.text || '';
    q('.ac-type').textContent = opts.icon || '⏰';
    q('.ac-no').textContent = `No. ${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getHours()).padStart(2, '0')}`;
    const photo = !opts.animated && opts.pic;
    const popOut = !!(photo && opts.cut);
    card.classList.toggle('pop', popOut || !!opts.animated);
    card.classList.toggle('has-photo', !!photo);
    // Back layer: the photo itself (blurred a little when the cut-out stands in front of it).
    const back = q('.ac-back-pic');
    back.hidden = !popOut;
    if (popOut) back.src = opts.pic;
    const lv = q('.ac-back-living');
    lv.hidden = !photo || popOut;
    if (photo && !popOut && window.createLivingPhoto) {
      if (!living) living = window.createLivingPhoto(lv, { tiltFrame: false });
      living.setSrc(opts.pic);
    } else if (photo && !popOut) {
      back.hidden = false; back.src = opts.pic;
    }
    // Subject layer: the cut-out, or the animated Rias.
    const cut = q('.ac-cut');
    cut.hidden = !popOut;
    if (popOut) cut.src = opts.cut;
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
