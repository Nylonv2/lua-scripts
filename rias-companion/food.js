// Food diary + water tracker (the Food tab).
window.createFoodDiary = function createFoodDiary(ctx) {
  'use strict';
  const { state, save, $, dateKey, uid, fmtClock, riasLine } = ctx;
  const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snacks']];
  const KIND_LABEL = { healthy: '🥗 Healthy', normal: '🍽️ Normal', treat: '🍰 Treat' };
  let viewDate = new Date();
  let editing = null; // { date, id } when editing an entry

  const keyOf = () => dateKey(viewDate);
  const isToday = () => keyOf() === dateKey();

  function render() {
    const k = keyOf();
    const label = isToday() ? 'Today' : viewDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    $('#food-date').textContent = label;
    $('#food-next').disabled = isToday();

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
      h.textContent = name;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'link';
      add.dataset.addMeal = meal;
      add.textContent = '＋ Add';
      head.append(h, add);
      sec.append(head);
      const list = entries.filter((e) => e.meal === meal);
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
        meta.textContent = `${KIND_LABEL[e.kind] || ''} · ${fmtClock(e.ts)}`;
        row.append(what, meta);
        sec.append(row);
      }
      box.append(sec);
    }

    // Streak of days with at least one meal logged.
    let n = 0;
    const d = new Date();
    if (!(state.food[dateKey(d)] || []).length) d.setDate(d.getDate() - 1);
    while ((state.food[dateKey(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
    $('#food-streak').textContent = n ? `Food diary streak: ${n} day${n === 1 ? '' : 's'} 🔥` : 'Log a meal to start your food diary streak.';
  }

  // Shared by the dialog and by Rias's AI tools. Returns the saved entry.
  function logFood(meal, text, kind = 'normal', when = new Date()) {
    const k = dateKey(when);
    const entry = { id: uid(), meal, text: text.trim(), kind, ts: when.getTime() };
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

  const dlg = $('#food-dialog');
  const form = $('#food-form');

  function openAdd(meal) {
    editing = null;
    $('#food-dialog-title').textContent = 'What did you eat?';
    form.elements.meal.value = meal || 'snack';
    form.elements.text.value = '';
    form.elements.kind.value = 'normal';
    $('#food-delete').hidden = true;
    dlg.showModal();
    form.elements.text.focus();
  }
  function openEdit(id) {
    const k = keyOf();
    const e = (state.food[k] || []).find((x) => x.id === id);
    if (!e) return;
    editing = { date: k, id };
    $('#food-dialog-title').textContent = 'Edit entry';
    form.elements.meal.value = e.meal;
    form.elements.text.value = e.text;
    form.elements.kind.value = e.kind || 'normal';
    $('#food-delete').hidden = false;
    dlg.showModal();
  }

  form.addEventListener('submit', () => {
    const meal = form.elements.meal.value, text = form.elements.text.value.trim(), kind = form.elements.kind.value;
    if (!text) return;
    if (editing) {
      const e = (state.food[editing.date] || []).find((x) => x.id === editing.id);
      if (e) Object.assign(e, { meal, text, kind });
      save();
    } else {
      // Logging for a past day keeps the entry on that day.
      const when = isToday() ? new Date() : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 12);
      logFood(meal, text, kind, when);
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

  $('#meals').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-meal]');
    if (add) { openAdd(add.dataset.addMeal); return; }
    const row = e.target.closest('.food-entry');
    if (row) openEdit(row.dataset.id);
  });
  $('#food-add').addEventListener('click', () => openAdd(ctx.mealNow()));
  $('#water-plus').addEventListener('click', () => addWater(1));
  $('#water-minus').addEventListener('click', () => addWater(-1, false));
  $('#food-prev').addEventListener('click', () => { viewDate.setDate(viewDate.getDate() - 1); render(); });
  $('#food-next').addEventListener('click', () => { if (!isToday()) { viewDate.setDate(viewDate.getDate() + 1); render(); } });

  // Plain-text summary for Rias's AI context.
  function summary(k = dateKey()) {
    const entries = state.food[k] || [];
    const meals = MEALS.map(([meal, name]) => {
      const list = entries.filter((e) => e.meal === meal).map((e) => `${e.text} (${e.kind})`);
      return `${name}: ${list.length ? list.join(', ') : 'nothing logged'}`;
    }).join('. ');
    return `${meals}. Water: ${state.water[k] || 0}/${state.settings.waterGoal || 8} glasses.`;
  }

  return { render, openAdd, logFood, addWater, summary, resetView: () => { viewDate = new Date(); } };
};
