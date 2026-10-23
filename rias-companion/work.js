// Work schedule (the Work tab): weekly or one-off shifts. The reminders themselves
// ("leave for work", "shift starts", "shift ends") come from app.js virtualItems().
window.createWorkSchedule = function createWorkSchedule(ctx) {
  'use strict';
  const { state, save, $, dateKey, uid, fmtTime, toMin } = ctx;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let editingId = null;

  const hours = (sh) => {
    let m = toMin(sh.end) - toMin(sh.start);
    if (m <= 0) m += 1440;
    return m / 60;
  };
  const when = (sh) => (sh.date
    ? new Date(`${sh.date}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : (sh.days || []).length === 7 ? 'Every day' : (sh.days || []).map((d) => DAYS[d]).join(', '));

  function render() {
    // Next 7 days at a glance.
    const week = $('#week');
    week.textContent = '';
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const list = ctx.shiftsOn(d);
      const row = document.createElement('div');
      row.className = `week-row${list.length ? ' on' : ''}`;
      const day = document.createElement('b');
      day.textContent = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
      const what = document.createElement('span');
      what.textContent = list.length
        ? list.map((sh) => `${fmtTime(sh.start)} – ${fmtTime(sh.end)} · ${sh.label || 'Work'}`).join('  |  ')
        : 'Off';
      row.append(day, what);
      week.append(row);
      for (const sh of list) total += hours(sh);
    }
    $('#week-hours').textContent = total ? `${Math.round(total * 10) / 10} hours of work in the next 7 days.` : 'No shifts in the next 7 days.';

    // Saved shifts.
    const ul = $('#shifts');
    ul.textContent = '';
    if (!state.shifts.length) {
      ul.innerHTML = '<li class="empty">No shifts yet. Tap ＋ to add your work schedule.</li>';
    }
    for (const sh of state.shifts) {
      const li = document.createElement('li');
      li.className = 'item';
      li.dataset.id = sh.id;
      li.innerHTML = '<span class="what"><span></span><br><span class="tag"></span></span><span class="t"></span>';
      li.querySelector('.what span').textContent = sh.label || 'Work';
      li.querySelector('.tag').textContent = `${when(sh)}${sh.date ? '' : ' · weekly'}`;
      li.querySelector('.t').textContent = `${fmtTime(sh.start)} – ${fmtTime(sh.end)}`;
      ul.append(li);
    }

    const f = $('#work-settings');
    f.elements.commute.value = String(state.settings.commute);
    f.elements.workReminders.checked = state.settings.workReminders;
  }

  const dlg = $('#shift-dialog');
  const form = $('#shift-form');
  const syncType = () => {
    const once = form.elements.type.value === 'once';
    $('#shift-days').hidden = once;
    $('#shift-date-wrap').hidden = !once;
  };

  function open(sh) {
    editingId = sh ? sh.id : null;
    $('#shift-title').textContent = sh ? 'Edit shift' : 'New shift';
    form.elements.label.value = sh ? sh.label || '' : 'Work';
    form.elements.type.value = sh && sh.date ? 'once' : 'weekly';
    form.elements.date.value = (sh && sh.date) || dateKey();
    form.elements.start.value = sh ? sh.start : '09:00';
    form.elements.end.value = sh ? sh.end : '17:00';
    const days = sh && sh.days ? sh.days : [1, 2, 3, 4, 5];
    for (const box of form.querySelectorAll('[name=day]')) box.checked = days.includes(Number(box.value));
    $('#shift-delete').hidden = !sh;
    syncType();
    dlg.showModal();
  }

  // Shared by the dialog and by Rias's AI tools.
  function addShift({ label = 'Work', date = null, days = null, start, end }) {
    const sh = { id: uid(), label: label || 'Work', date, days: date ? null : days, start, end };
    state.shifts.push(sh);
    // Don't ping for parts of today's shift that already passed.
    ctx.silencePast();
    save();
    return sh;
  }

  form.elements.type.addEventListener('change', syncType);
  form.addEventListener('submit', (e) => {
    const type = form.elements.type.value;
    const days = [...form.querySelectorAll('[name=day]:checked')].map((b) => Number(b.value));
    if (type === 'weekly' && !days.length) { e.preventDefault(); $('#shift-days').classList.add('shake'); setTimeout(() => $('#shift-days').classList.remove('shake'), 400); return; }
    const data = {
      label: form.elements.label.value.trim() || 'Work',
      date: type === 'once' ? form.elements.date.value : null,
      days: type === 'once' ? null : days,
      start: form.elements.start.value,
      end: form.elements.end.value,
    };
    const existing = state.shifts.find((x) => x.id === editingId);
    if (existing) { Object.assign(existing, data); ctx.silencePast(); save(); }
    else { addShift(data); ctx.riasLine(['Noted. I know your schedule now — I\'ll make sure you leave on time.', 'Got it. I\'ll remind you before every shift, {name}.']); }
    render();
    ctx.refresh();
  });
  $('#shift-cancel').addEventListener('click', () => dlg.close());
  $('#shift-delete').addEventListener('click', () => {
    state.shifts = state.shifts.filter((x) => x.id !== editingId);
    save();
    dlg.close();
    render();
    ctx.refresh();
  });
  $('#shifts').addEventListener('click', (e) => {
    const li = e.target.closest('.item');
    const sh = li && state.shifts.find((x) => x.id === li.dataset.id);
    if (sh) open(sh);
  });
  $('#shift-add').addEventListener('click', () => open(null));
  $('#work-settings').addEventListener('change', () => {
    const f = $('#work-settings');
    state.settings.commute = Number(f.elements.commute.value);
    state.settings.workReminders = f.elements.workReminders.checked;
    ctx.silencePast();
    save();
    ctx.refresh();
  });

  // Plain-text summary for Rias's AI context.
  function summary() {
    const lines = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const list = ctx.shiftsOn(d);
      if (list.length) lines.push(`${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}: ${list.map((sh) => `${sh.label || 'Work'} ${fmtTime(sh.start)}–${fmtTime(sh.end)}`).join(', ')}`);
    }
    return lines.length ? lines.join('; ') : 'no shifts in the next 7 days';
  }

  return { render, addShift, summary };
};
