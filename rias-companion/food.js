// Food diary + nutrition + water tracker (the Food tab).
// Each entry can carry estimated nutrition: n = { kcal, p, c, f, fiber, sugar } (grams).
window.createFoodDiary = function createFoodDiary(ctx) {
  'use strict';
  const { state, save, $, dateKey, uid, fmtClock, riasLine } = ctx;
  const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snacks']];
  const KIND_LABEL = { healthy: '🥗 Healthy', normal: '🍽️ Normal', treat: '🍰 Treat' };
  const MACROS = [['p', 'Protein', 'proteinGoal'], ['c', 'Carbs', 'carbGoal'], ['f', 'Fat', 'fatGoal']];
  let viewDate = new Date();
  let editing = null; // { date, id } when editing an entry
  let picked = -1;    // bar selected in the 7-day chart

  const keyOf = () => dateKey(viewDate);
  const isToday = () => keyOf() === dateKey();
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Math.max(0, Math.round(Number(v))));
  const fmt = (v) => Math.round(v).toLocaleString();
  const goals = () => ({
    kcal: state.settings.calorieGoal || 2000,
    p: state.settings.proteinGoal || 120,
    c: state.settings.carbGoal || 225,
    f: state.settings.fatGoal || 65,
  });

  function totals(k) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, counted: 0, missing: 0 };
    for (const e of state.food[k] || []) {
      if (!e.n || e.n.kcal == null) { t.missing++; continue; }
      t.counted++;
      for (const key of ['kcal', 'p', 'c', 'f', 'fiber', 'sugar']) t[key] += e.n[key] || 0;
    }
    return t;
  }

  function meter(el, value, goal) {
    const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
    el.innerHTML = '<span></span>';
    el.firstChild.style.width = `${pct}%`;
    el.classList.toggle('over', value > goal);
  }

  function renderNutrition(k) {
    const t = totals(k);
    const g = goals();
    $('#kcal-now').textContent = fmt(t.kcal);
    $('#kcal-goal').textContent = `/ ${fmt(g.kcal)} kcal`;
    const left = g.kcal - t.kcal;
    // Over the goal is a status, so it gets an icon and words, not just a color.
    $('#kcal-left').textContent = left >= 0 ? `${fmt(left)} left` : `⚠ ${fmt(-left)} over`;
    $('#kcal-left').classList.toggle('over', left < 0);
    meter($('#kcal-meter'), t.kcal, g.kcal);
    const box = $('#macros');
    box.textContent = '';
    for (const [key, name] of MACROS) {
      const row = document.createElement('div');
      row.className = 'macro';
      row.innerHTML = '<span class="macro-name"></span><span class="macro-val"></span><div class="meter"></div>';
      row.querySelector('.macro-name').textContent = name;
      row.querySelector('.macro-val').textContent = `${fmt(t[key])} / ${g[key]} g`;
      meter(row.querySelector('.meter'), t[key], g[key]);
      box.append(row);
    }
    $('#nutri-extra').textContent = `Fiber ${fmt(t.fiber)} g · Sugar ${fmt(t.sugar)} g${t.missing ? ` · ${t.missing} item${t.missing === 1 ? '' : 's'} without numbers` : ''}`;
  }

  // Calories for the 7 days ending on the viewed day: one series, goal as a dashed line.
  function renderWeek() {
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(viewDate); d.setDate(d.getDate() - i); days.push(d); }
    const g = goals().kcal;
    const vals = days.map((d) => totals(dateKey(d)).kcal);
    const max = Math.max(g * 1.15, ...vals, 1);
    const chart = $('#week-chart');
    chart.textContent = '';
    const goalLine = document.createElement('div');
    goalLine.className = 'goal-line';
    goalLine.style.bottom = `${(g / max) * 100}%`;
    goalLine.innerHTML = '<span></span>';
    goalLine.firstChild.textContent = `Goal ${fmt(g)}`;
    chart.append(goalLine);
    days.forEach((d, i) => {
      const col = document.createElement('button');
      col.type = 'button';
      col.className = `bar-col${i === 6 ? ' current' : ''}${i === picked ? ' picked' : ''}`;
      col.dataset.i = i;
      const label = `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}: ${vals[i] ? `${fmt(vals[i])} kcal` : 'nothing logged'}`;
      col.setAttribute('aria-label', label);
      col.title = label;
      col.innerHTML = '<span class="bar-val"></span><span class="bar"></span><span class="bar-day"></span>';
      col.querySelector('.bar').style.height = `${(vals[i] / max) * 100}%`;
      col.querySelector('.bar-day').textContent = d.toLocaleDateString([], { weekday: 'narrow' });
      // Only the current day (or the one you tapped) is labeled, to keep it readable.
      if ((i === 6 && picked < 0) || i === picked) col.querySelector('.bar-val').textContent = vals[i] ? fmt(vals[i]) : '';
      chart.append(col);
    });
    const avgDays = vals.filter(Boolean);
    $('#week-note').textContent = picked >= 0
      ? `${days[picked].toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}: ${vals[picked] ? `${fmt(vals[picked])} kcal` : 'nothing logged'}`
      : avgDays.length ? `Average ${fmt(avgDays.reduce((a, b) => a + b, 0) / avgDays.length)} kcal on ${avgDays.length} logged day${avgDays.length === 1 ? '' : 's'}` : 'Log meals with calories to see your week.';
  }

  function render() {
    const k = keyOf();
    const label = isToday() ? 'Today' : viewDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    $('#food-date').textContent = label;
    $('#food-next').disabled = isToday();
    renderNutrition(k);
    renderWeek();

    // Water
    const goal = state.settings.waterGoal || 8;
    const glasses = state.water[k] || 0;
    $('#water-count').textContent = `${glasses} / ${goal} glasses`;
    const drops = $('#water-drops');
    drops.textContent = '';
    for (let i = 0; i < Math.max(goal, glasses); i++) {
      const d = document.createElement('span');
      d.className = `drop${i < glasses ? ' full' : ''}`;
      d.textContent = '💧';
      drops.append(d);
    }

    // Meals
    const entries = state.food[k] || [];
    const box = $('#meals');
    box.textContent = '';
    for (const [meal, name] of MEALS) {
      const sec = document.createElement('section');
      sec.className = 'meal';
      const head = document.createElement('div');
      head.className = 'meal-head';
      const h = document.createElement('h3');
      const list = entries.filter((e) => e.meal === meal);
      const mealKcal = list.reduce((a, e) => a + ((e.n && e.n.kcal) || 0), 0);
      h.textContent = mealKcal ? `${name} · ${fmt(mealKcal)} kcal` : name;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'link';
      add.dataset.addMeal = meal;
      add.textContent = '＋ Add';
      head.append(h, add);
      sec.append(head);
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'muted small';
        p.textContent = 'Nothing logged yet.';
        sec.append(p);
      }
      for (const e of list) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'food-entry';
        row.dataset.id = e.id;
        const what = document.createElement('span');
        what.textContent = e.text;
        const meta = document.createElement('span');
        meta.className = 'tag';
        const n = e.n && e.n.kcal != null ? `${fmt(e.n.kcal)} kcal · P ${fmt(e.n.p || 0)} · C ${fmt(e.n.c || 0)} · F ${fmt(e.n.f || 0)} · ` : '';
        meta.textContent = `${n}${KIND_LABEL[e.kind] || ''} · ${fmtClock(e.ts)}`;
        row.append(what, meta);
        sec.append(row);
      }
      box.append(sec);
    }

    // Streak of days with at least one meal logged.
    let s = 0;
    const d = new Date();
    if (!(state.food[dateKey(d)] || []).length) d.setDate(d.getDate() - 1);
    while ((state.food[dateKey(d)] || []).length) { s++; d.setDate(d.getDate() - 1); }
    $('#food-streak').textContent = s ? `Food diary streak: ${s} day${s === 1 ? '' : 's'} 🔥` : 'Log a meal to start your food diary streak.';
  }

  // Shared by the dialog and by Rias's AI tools. Returns the saved entry.
  function logFood(meal, text, kind = 'normal', when = new Date(), n) {
    const k = dateKey(when);
    const entry = { id: uid(), meal, text: text.trim(), kind, ts: when.getTime() };
    if (n && n.kcal != null) entry.n = n;
    (state.food[k] ||= []).push(entry);
    save();
    return entry;
  }

  function addWater(n = 1, react = true, k = keyOf()) {
    const before = state.water[k] || 0;
    const after = Math.max(0, before + n);
    state.water[k] = after;
    save();
    const goal = state.settings.waterGoal || 8;
    if (react && k === dateKey() && before < goal && after >= goal) riasLine(ctx.R.water.goal);
    render();
    return after;
  }

  // ---------- add / edit dialog ----------
  const dlg = $('#food-dialog');
  const form = $('#food-form');
  const F = form.elements;
  const nFields = [['kcal', 'kcal'], ['p', 'protein'], ['c', 'carbs'], ['f', 'fat'], ['fiber', 'fiber'], ['sugar', 'sugar']];
  const readN = () => {
    const n = {};
    for (const [key, field] of nFields) { const v = num(F[field].value); if (v !== undefined) n[key] = v; }
    return n.kcal == null ? undefined : n;
  };
  const writeN = (n) => { for (const [key, field] of nFields) F[field].value = n && n[key] != null ? n[key] : ''; };

  function showEstimate() {
    $('#food-estimate').hidden = !(ctx.canEstimate && ctx.canEstimate());
    $('#estimate-hint').textContent = '';
  }
  // Your recent foods (last 30 days, newest first), each once.
  function recentFoods(limit = 8) {
    const seen = new Set(), out = [];
    for (let i = 0; i < 30 && out.length < limit; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const list = (state.food[dateKey(d)] || []).slice().sort((a, b) => b.ts - a.ts);
      for (const e of list) {
        const key = e.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
  function renderRecent() {
    const box = $('#food-recent');
    const list = recentFoods();
    $('#food-recent-wrap').hidden = !list.length;
    box.textContent = '';
    for (const e of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'recent-chip';
      b.textContent = e.text.length > 28 ? `${e.text.slice(0, 27)}…` : e.text;
      if (e.n && e.n.kcal != null) {
        const k = document.createElement('small');
        k.textContent = `${Math.round(e.n.kcal)} kcal`;
        b.append(k);
      }
      b.addEventListener('click', () => {
        const when = isToday() ? new Date() : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 12);
        logFood(F.meal.value, e.text, e.kind || 'normal', when, e.n ? { ...e.n } : undefined);
        dlg.close();
        if (isToday()) riasLine(ctx.R.food[e.kind] || ctx.R.food.normal);
        render();
      });
      box.append(b);
    }
  }
  function openAdd(meal) {
    editing = null;
    renderRecent();
    $('#food-dialog-title').textContent = 'What did you eat?';
    F.meal.value = meal || 'snack';
    F.text.value = '';
    F.kind.value = 'normal';
    writeN(null);
    $('#food-delete').hidden = true;
    showEstimate();
    dlg.showModal();
    F.text.focus();
  }
  function openEdit(id) {
    const k = keyOf();
    const e = (state.food[k] || []).find((x) => x.id === id);
    if (!e) return;
    editing = { date: k, id };
    $('#food-dialog-title').textContent = 'Edit entry';
    F.meal.value = e.meal;
    F.text.value = e.text;
    F.kind.value = e.kind || 'normal';
    writeN(e.n);
    $('#food-recent-wrap').hidden = true;
    $('#food-delete').hidden = false;
    showEstimate();
    dlg.showModal();
  }

  $('#food-estimate').addEventListener('click', async () => {
    const text = F.text.value.trim();
    if (!text) { $('#estimate-hint').textContent = 'Type what you ate first, with the portion if you know it.'; return; }
    $('#estimate-hint').textContent = 'Rias is estimating…';
    const est = await ctx.estimate(text);
    if (!est) { $('#estimate-hint').textContent = 'She couldn’t estimate that right now. Check your internet, or type the numbers yourself.'; return; }
    writeN({ kcal: num(est.calories), p: num(est.protein_g), c: num(est.carbs_g), f: num(est.fat_g), fiber: num(est.fiber_g), sugar: num(est.sugar_g) });
    if (est.kind && KIND_LABEL[est.kind]) F.kind.value = est.kind;
    $('#estimate-hint').textContent = est.note ? `Estimate: ${est.note}` : 'Estimated. Adjust anything that looks off.';
  });

  form.addEventListener('submit', () => {
    const meal = F.meal.value, text = F.text.value.trim(), kind = F.kind.value, n = readN();
    if (!text) return;
    if (editing) {
      const e = (state.food[editing.date] || []).find((x) => x.id === editing.id);
      if (e) { Object.assign(e, { meal, text, kind }); if (n) e.n = n; else delete e.n; }
      save();
    } else {
      // Logging for a past day keeps the entry on that day.
      const when = isToday() ? new Date() : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 12);
      logFood(meal, text, kind, when, n);
      if (isToday()) riasLine(ctx.R.food[kind] || ctx.R.food.normal);
    }
    render();
  });
  $('#food-cancel').addEventListener('click', () => dlg.close());
  $('#food-delete').addEventListener('click', () => {
    if (editing) state.food[editing.date] = (state.food[editing.date] || []).filter((x) => x.id !== editing.id);
    save();
    dlg.close();
    render();
  });

  // ---------- goals dialog ----------
  const gd = $('#goals-dialog');
  const gf = $('#goals-form');
  $('#goals-btn').addEventListener('click', () => {
    const g = goals();
    gf.elements.calorieGoal.value = g.kcal;
    gf.elements.proteinGoal.value = g.p;
    gf.elements.carbGoal.value = g.c;
    gf.elements.fatGoal.value = g.f;
    gd.showModal();
  });
  gf.addEventListener('submit', () => {
    for (const k of ['calorieGoal', 'proteinGoal', 'carbGoal', 'fatGoal']) {
      const v = num(gf.elements[k].value);
      if (v) state.settings[k] = v;
    }
    save();
    render();
  });
  $('#goals-cancel').addEventListener('click', () => gd.close());

  $('#week-chart').addEventListener('click', (e) => {
    const col = e.target.closest('.bar-col');
    if (!col) return;
    const i = Number(col.dataset.i);
    picked = picked === i ? -1 : i;
    renderWeek();
  });
  $('#meals').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-meal]');
    if (add) { openAdd(add.dataset.addMeal); return; }
    const row = e.target.closest('.food-entry');
    if (row) openEdit(row.dataset.id);
  });
  $('#food-add').addEventListener('click', () => openAdd(ctx.mealNow()));
  $('#water-plus').addEventListener('click', () => addWater(1));
  $('#water-minus').addEventListener('click', () => addWater(-1, false));
  $('#food-prev').addEventListener('click', () => { viewDate.setDate(viewDate.getDate() - 1); picked = -1; render(); });
  $('#food-next').addEventListener('click', () => { if (!isToday()) { viewDate.setDate(viewDate.getDate() + 1); picked = -1; render(); } });

  // Plain-text summary for Rias's AI context.
  function summary(k = dateKey()) {
    const entries = state.food[k] || [];
    const meals = MEALS.map(([meal, name]) => {
      const list = entries.filter((e) => e.meal === meal).map((e) => `${e.text} (${e.kind}${e.n && e.n.kcal != null ? `, ${e.n.kcal} kcal` : ''})`);
      return `${name}: ${list.length ? list.join(', ') : 'nothing logged'}`;
    }).join('. ');
    const t = totals(k), g = goals();
    return `${meals}. Totals so far: ${fmt(t.kcal)}/${g.kcal} kcal, protein ${fmt(t.p)}/${g.p} g, carbs ${fmt(t.c)}/${g.c} g, fat ${fmt(t.f)}/${g.f} g, fiber ${fmt(t.fiber)} g, sugar ${fmt(t.sugar)} g. Water: ${state.water[k] || 0}/${state.settings.waterGoal || 8} glasses.`;
  }

  return { render, openAdd, logFood, addWater, summary, totals, goals, resetView: () => { viewDate = new Date(); } };
};
