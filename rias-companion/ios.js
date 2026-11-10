/* iPhone style (ios.css): the compact title bar that appears when a big title scrolls away,
   Phosphor icons in place of emoji labels, and Motion (motion.dev) for the small animations.
   Does nothing in the "Classic Rias look". */
(function () {
  const root = document.documentElement;
  const on = () => !root.dataset.scene;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const M = window.Motion || null;

  // ---------- compact title bar ----------
  const bar = document.createElement('div');
  bar.className = 'ios-nav';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  const visible = (el) => el && el.offsetParent !== null;
  function titleOf(view) {
    const t = [...view.querySelectorAll('.page-title, .home-greet h1')].find(visible);
    return t || null;
  }
  function update(view) {
    if (!on() || !view || view.hidden || view.id === 'view-chat') { bar.classList.remove('show'); return; }
    const t = titleOf(view);
    if (!t) { bar.classList.remove('show'); return; }
    const top = parseFloat(getComputedStyle(bar).paddingTop) || 12;
    const gone = t.getBoundingClientRect().bottom < top + 18;
    bar.textContent = t.textContent.trim();
    bar.classList.toggle('show', gone);
  }
  const fab = document.getElementById('add');
  document.addEventListener('scroll', (e) => {
    const v = e.target && e.target.closest ? e.target.closest('.view') : null;
    if (v) update(v);
    // The "New reminder" button shrinks to a round + once the list is scrolled (any style).
    if (fab && v && v.id === 'view-today') fab.classList.toggle('compact', e.target.scrollTop > 60);
  }, { capture: true, passive: true });
  const app = document.querySelector('.app');
  if (app) new MutationObserver(() => { bar.classList.remove('show'); const v = document.querySelector('.view:not([hidden])'); if (v) { update(v); enter(v); } })
    .observe(app, { attributes: true, attributeFilter: ['data-view'] });

  // ---------- emoji labels → icons ----------
  // The character stays inside the icon's <title>, so the text still reads the same.
  const ICONS = {
    '⏱': 'timer', '✦': 'sparkle', '📋': 'todo', '🎯': 'goal', '🧽': 'chore', '⏰': 'alarm', '↪': 'cue', '▶': 'pair', '⭐': 'star',
    '💼': 'work', '📅': 'calendar', '＋': 'plus', '🔥': 'fire', '💧': 'water', '🌙': 'moon', '✓': 'check', '⏳': 'clock',
  };
  const KEYS = Object.keys(ICONS);
  function iconize(el) {
    const n = el.firstChild;
    if (!n || n.nodeType !== 3) return;
    const text = n.nodeValue.replace(/^\s+/, '');
    const key = KEYS.find((k) => text.startsWith(k));
    if (!key) return;
    let rest = text.slice(key.length);
    if (rest.startsWith('️')) rest = rest.slice(1);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ii');
    svg.setAttribute('aria-hidden', 'true');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = key;
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${ICONS[key]}`);
    svg.append(title, use);
    n.nodeValue = rest;
    el.insertBefore(svg, n);
  }
  const SEL = '.tag-chip, button, .eyebrow, .next-label, .tile-label, .allday, .dd-facts span, .tile-sub';
  let queued = false;
  function sweep() {
    queued = false;
    if (!on()) return;
    for (const el of document.querySelectorAll(SEL)) iconize(el);
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(sweep); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  sweep();

  // ---------- motion ----------
  // Rows rise in one after another when a screen opens (a CSS animation, so it can never get stuck half-way).
  function enter(view) {
    if (!on() || reduce) return;
    const els = [];
    for (const el of view.querySelectorAll('.row-item, .more-row, .coming-row, .tile, .next-card, .set-tile, .goal-card')) {
      if (visible(el)) { els.push(el); if (els.length === 14) break; }
    }
    // Reset them all, let the browser take that in once, then start them all (not once per row).
    let restart = false;
    for (const el of els) if (el.classList.contains('ios-in')) { el.classList.remove('ios-in'); restart = true; }
    if (restart) void view.offsetWidth;
    els.forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('ios-in'); });
  }
  // A satisfying little pop when something gets ticked off.
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.check');
    if (!c || !on() || reduce || !M) return;
    const row = c.closest('[data-id], [data-todo], [data-chore]');
    const key = row ? (row.dataset.id ? `[data-id="${row.dataset.id}"]` : row.dataset.todo ? `[data-todo="${row.dataset.todo}"]` : `[data-chore="${row.dataset.chore}"]`) : null;
    setTimeout(() => {
      const fresh = key ? document.querySelector(`${key} .check`) : c;
      if (fresh && fresh.isConnected) { try { M.animate(fresh, { transform: ['scale(1)', 'scale(1.28)', 'scale(1)'] }, { duration: 0.34, easing: 'ease-out' }); } catch { /* ignore */ } }
    }, 30);
  }, true);
  // Bottom sheets: a springy rise (the CSS animation is the fallback).
  window.iosSheet = (dlg) => { if (on() && !reduce && M && dlg) { try { M.animate(dlg, { transform: ['translateY(60%)', 'none'] }, { type: 'spring', stiffness: 380, damping: 34 }); } catch { /* ignore */ } } };
})();
