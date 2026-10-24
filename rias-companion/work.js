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
      const short = (k) => new Date(`${k}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const range = `${sh.from && sh.from > dateKey() ? ` · from ${short(sh.from)}` : ''}${sh.until ? ` · until ${short(sh.until)}` : ''}`;
      li.querySelector('.tag').textContent = `${when(sh)}${sh.date ? '' : ' · weekly'}${range}`;
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

  // ---------- Week planner: a whole week on one screen ----------
  const pl = $('#planner');
  const pf = $('#planner-form');
  const DAY_RE = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  let weekStart = null; // Sunday of the week being planned

  const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const rows = () => [...$('#pl-days').children];
  const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // Each day is just its own start and end time: both filled = a work day, empty = off.
  function setRow(row, on, start, end) {
    row.querySelector('.pl-start').value = on ? start || '' : '';
    row.querySelector('.pl-end').value = on ? end || '' : '';
    syncRow(row);
  }
  const pretty = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  function syncRow(row) {
    const st = row.querySelector('.pl-start').value, en = row.querySelector('.pl-end').value;
    for (const b of row.querySelectorAll('.pl-time')) {
      const v = b.dataset.for === 'start' ? st : en;
      b.textContent = v ? pretty(v) : b.dataset.for === 'start' ? 'Start' : 'End';
      b.classList.toggle('empty', !v);
      b.setAttribute('aria-label', `${row.dataset.name} ${b.dataset.for}: ${v ? pretty(v) : 'not set'}`);
    }
    const on = !!(st && en);
    row.classList.toggle('on', on);
    row.querySelector('.pl-state').textContent = on ? `${Math.round(hours({ start: st, end: en }) * 10) / 10} h` : 'Off';
    // ✕ clears a work day; on an empty day ↺ copies the day above.
    const btn = row.querySelector('.pl-act');
    const prev = row.previousElementSibling;
    if (on || st || en) { btn.textContent = '✕'; btn.title = 'Clear this day (day off)'; btn.hidden = false; }
    else { btn.textContent = '↺'; btn.title = 'Same as the day before'; btn.hidden = !(prev && prev.classList.contains('on')); }
    btn.setAttribute('aria-label', btn.title);
    updateTotal();
  }

  function updateTotal() {
    let n = 0, h = 0;
    for (const r of rows()) {
      if (!r.classList.contains('on')) continue;
      n++;
      h += hours({ start: r.querySelector('.pl-start').value, end: r.querySelector('.pl-end').value });
    }
    $('#pl-total').textContent = n ? `${n} shift${n === 1 ? '' : 's'} · ${Math.round(h * 10) / 10} hours this week` : 'No shifts this week yet. Type a start and end time on any day.';
  }

  function renderPlanner() {
    const end = addDays(weekStart, 6);
    const fmt = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const thisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
    const nextWeek = startOfWeek(addDays(new Date(), 7)).getTime() === weekStart.getTime();
    $('#pl-week').textContent = `${thisWeek ? 'This week' : nextWeek ? 'Next week' : 'Week'} · ${fmt(weekStart)} – ${fmt(end)}`;
    const box = $('#pl-days');
    box.textContent = '';
    const today = dateKey();
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const row = document.createElement('div');
      row.className = `pl-day${dateKey(d) === today ? ' today' : ''}`;
      row.dataset.date = dateKey(d);
      row.innerHTML = '<div class="pl-label"><b></b><small></small><span class="pl-state"></span></div>'
        + '<input type="hidden" class="pl-start"><input type="hidden" class="pl-end">'
        + '<button type="button" class="pl-time" data-for="start"></button><button type="button" class="pl-time" data-for="end"></button>'
        + '<button type="button" class="pl-act"></button>';
      const name = d.toLocaleDateString([], { weekday: 'long' });
      row.querySelector('.pl-label b').textContent = DAYS[d.getDay()];
      row.querySelector('.pl-label small').textContent = d.getDate();
      row.dataset.name = name;
      box.append(row);
      const sh = ctx.shiftsOn(d)[0];
      setRow(row, !!sh, sh && sh.start, sh && sh.end);
    }
    for (const r of rows()) syncRow(r); // ↺ depends on the day above
  }

  function openPlanner() {
    // Late in the week, start on next week; otherwise this week.
    const now = new Date();
    weekStart = startOfWeek(now.getDay() >= 5 ? addDays(now, 7) : now);
    const last = state.shifts[state.shifts.length - 1];
    pf.elements.label.value = (last && last.label) || 'Work';
    pf.elements.repeat.checked = false;
    pf.elements.paste.value = '';
    renderPlanner();
    pl.showModal();
  }

  $('#pl-days').addEventListener('click', (e) => {
    const btn = e.target.closest('.pl-act');
    if (!btn) return;
    const row = btn.closest('.pl-day');
    const prev = row.previousElementSibling;
    if (btn.textContent === '✕') setRow(row, false);
    else if (prev) setRow(row, true, prev.querySelector('.pl-start').value, prev.querySelector('.pl-end').value);
    const next = row.nextElementSibling;
    if (next) syncRow(next);
  });
  // Tapping a time opens Rias's own time picker (works the same on every phone).
  $('#pl-days').addEventListener('click', (e) => {
    const b = e.target.closest('.pl-time');
    if (!b) return;
    const row = b.closest('.pl-day');
    const input = row.querySelector(b.dataset.for === 'start' ? '.pl-start' : '.pl-end');
    const fallback = b.dataset.for === 'start' ? '09:00' : (() => {
      const st = row.querySelector('.pl-start').value;
      if (!st) return '17:00';
      const [h, m] = st.split(':').map(Number);
      return hhmm((h * 60 + m + 8 * 60) % 1440);
    })();
    ctx.pickTime(`${row.dataset.name} · ${b.dataset.for === 'start' ? 'start' : 'end'}`, input.value || fallback, (value) => {
      input.value = value || '';
      // Setting a start on an empty day fills an 8-hour end you can change.
      const en = row.querySelector('.pl-end');
      if (b.dataset.for === 'start' && value && !en.value) {
        const [h, m] = value.split(':').map(Number);
        en.value = hhmm((h * 60 + m + 8 * 60) % 1440);
      }
      syncRow(row);
      if (row.nextElementSibling) syncRow(row.nextElementSibling);
    });
  });
  $('#pl-copy').addEventListener('click', () => {
    for (const r of rows()) {
      const sh = ctx.shiftsOn(addDays(new Date(`${r.dataset.date}T12:00`), -7))[0];
      setRow(r, !!sh, sh && sh.start, sh && sh.end);
    }
    for (const r of rows()) syncRow(r);
  });
  $('#pl-clear').addEventListener('click', () => { for (const r of rows()) setRow(r, false); for (const r of rows()) syncRow(r); });
  $('#pl-prev').addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderPlanner(); });
  $('#pl-next').addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderPlanner(); });
  $('#pl-cancel').addEventListener('click', () => pl.close());

  // "Mon 9-5", "tue off", "Wed-Fri 12:30pm-9", "thursday 7a-3:30p" → day rows.
  function parseTime(h, m, ap) {
    let hh = Number(h) % 24;
    if (ap) { ap = ap[0]; if (ap === 'p' && hh < 12) hh += 12; if (ap === 'a' && hh === 12) hh = 0; }
    return hh * 60 + Number(m || 0);
  }
  function parseRange(text) {
    const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
    if (!m) return null;
    let [, sh, sm, sap, eh, em, eap] = m;
    sap = sap && sap.toLowerCase(); eap = eap && eap.toLowerCase();
    let start = parseTime(sh, sm, sap);
    let end = parseTime(eh, em, eap);
    if (!sap && !eap) {
      // No AM/PM at all: shifts starting 1–5 are afternoon ("2-10"), and the end comes after the start ("9-5", "6:30-3").
      if (Number(sh) >= 1 && Number(sh) <= 5) start += 12 * 60;
      if (end <= start && end + 12 * 60 > start && Number(eh) < 12) end += 12 * 60;
    } else if (!sap && eap) {
      // "1-9pm" → afternoon start; "11-7pm" → morning start.
      if (eap[0] === 'p' && Number(sh) < 12 && Number(sh) < Number(eh)) start += 12 * 60;
    } else if (sap && !eap) {
      if (end <= start && Number(eh) < 12) end += 12 * 60;
    }
    return { start: hhmm(start % 1440), end: hhmm(end % 1440) };
  }
  function parseSchedule(text) {
    const found = new Map(); // day of week → { on, start, end }
    const parts = text.toLowerCase().split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean);
    const dayAt = (str) => { const k = str.slice(0, 3); return k in DAY_RE ? DAY_RE[k] : null; };
    for (const part of parts) {
      const dm = part.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?(?:\s*(?:-|–|to|through|thru)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*)?/);
      if (!dm) continue;
      const a = dayAt(dm[1]);
      const b = dm[2] ? dayAt(dm[2]) : a;
      const days = [];
      for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break; }
      const rest = part.slice(dm.index + dm[0].length);
      const off = /\boff\b|\bfree\b|\bnone\b|\bno work\b|\brest\b/.test(rest) || !/\d/.test(rest);
      const range = off ? null : parseRange(rest);
      for (const d of days) found.set(d, range ? { on: true, ...range } : { on: false });
    }
    return found;
  }
  $('#pl-parse').addEventListener('click', () => {
    const found = parseSchedule(pf.elements.paste.value);
    if (!found.size) { $('#pl-parse-hint').textContent = 'I couldn’t find any days in that. Try lines like “Mon 9-5” or “Tue off”.'; return; }
    for (const r of rows()) {
      const dow = new Date(`${r.dataset.date}T12:00`).getDay();
      if (found.has(dow)) { const f = found.get(dow); setRow(r, f.on, f.start, f.end); }
    }
    for (const r of rows()) syncRow(r);
    $('#pl-parse-hint').textContent = `Filled ${found.size} day${found.size === 1 ? '' : 's'}. Check the times, then tap Save week.`;
  });

  pf.addEventListener('submit', () => {
    const label = pf.elements.label.value.trim() || 'Work';
    const plan = rows().map((r) => ({
      date: r.dataset.date,
      dow: new Date(`${r.dataset.date}T12:00`).getDay(),
      on: r.classList.contains('on'),
      start: r.querySelector('.pl-start').value,
      end: r.querySelector('.pl-end').value,
    })).filter((p) => !p.on || (p.start && p.end));
    const dates = new Set(plan.map((p) => p.date));
    // One-off shifts on these dates are replaced by the plan.
    state.shifts = state.shifts.filter((sh) => !(sh.date && dates.has(sh.date)));
    if (pf.elements.repeat.checked) {
      // Weekly from this week on: this job's older weekly shifts stop the day before,
      // and any that would only have started later are replaced.
      const startKey = dateKey(weekStart);
      const sameJob = (sh) => !sh.date && (sh.label || 'Work') === label;
      state.shifts = state.shifts.filter((sh) => !(sameJob(sh) && sh.from && sh.from >= startKey));
      for (const sh of state.shifts) {
        if (sameJob(sh) && (!sh.until || sh.until >= startKey)) sh.until = dateKey(addDays(weekStart, -1));
      }
      const groups = new Map();
      for (const p of plan.filter((x) => x.on)) {
        const k = `${p.start}|${p.end}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p.dow);
      }
      for (const [k, days] of groups) {
        const [start, end] = k.split('|');
        // Repeats from the week being planned onward; earlier weeks keep what they had.
        state.shifts.push({ id: uid(), label, days: days.sort(), date: null, start, end, from: dateKey(weekStart) });
      }
    } else {
      for (const p of plan) {
        // Weekly shifts that day: keep if they match, otherwise skip them for just this date.
        let covered = false;
        for (const sh of state.shifts.filter((x) => !x.date && (x.days || []).includes(p.dow) && !(x.skip || []).includes(p.date))) {
          if (p.on && !covered && sh.start === p.start && sh.end === p.end && (sh.label || 'Work') === label) covered = true;
          else sh.skip = [...(sh.skip || []), p.date];
        }
        if (p.on && !covered) state.shifts.push({ id: uid(), label, date: p.date, days: null, start: p.start, end: p.end });
      }
    }
    ctx.silencePast();
    save();
    render();
    ctx.refresh();
    const on = plan.filter((p) => p.on);
    const total = on.reduce((h, p) => h + hours(p), 0);
    ctx.riasLine(on.length
      ? [`Got it — ${on.length} shift${on.length === 1 ? '' : 's'}, ${Math.round(total * 10) / 10} hours. I'll make sure you leave on time, {name}.`]
      : ['A whole week off? Then rest properly — that\'s an order.']);
  });

  $('#plan-week').addEventListener('click', openPlanner);

  return { render, addShift, summary, openPlanner, parseSchedule };
};
