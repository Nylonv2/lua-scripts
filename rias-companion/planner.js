/* Planner (Plan tab → To-do and Goals): a to-do list Rias fits into your free time, goals and habits
   with streaks, and an evening check-in that moves unfinished things to tomorrow.
   Planned to-dos and goal sessions show up as ordinary items on the day (ids "t:<todo>" and "g:<goal>"),
   so they get notifications, alarms, swipe Done / Snooze and the widget like any reminder. */
window.createPlanner = function createPlanner(ctx) {
  'use strict';
  const { state, save, $, dateKey, uid, fmtTime, toMin } = ctx;
  state.todos ||= [];   // [{ id, title, due: 'YYYY-MM-DD'|null, mins, priority: 'high'|'normal', notes, done, doneAt, created, plan: { date, time }|null, notOn }]
  state.goals ||= [];   // [{ id, title, kind: 'times'|'amount', times, target, unit, per: 'day'|'week'|'month', time: 'HH:MM'|'', mins, sessions, log: { date: n }, plans: { date: 'HH:MM' }, created }]
  state.checkedIn ||= {};
  state.chores ||= [];  // [{ id, title, every (days), mins, first, time, last: 'YYYY-MM-DD'|null, pushed, zones?: [...], zone, plans: { date: 'HH:MM' } }]
  state.dayPlans ||= {}; // { date: { made, items: [{ key, title, time, mins, cat }] } }: daily essentials placed by "Plan my day"
  const pad = (n) => String(n).padStart(2, '0');
  const minToTime = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const addDays = (k, n) => { const d = new Date(`${k}T12:00`); d.setDate(d.getDate() + n); return dateKey(d); };
  const dayOf = (k) => new Date(`${k}T12:00`);
  const words = (s) => String(s).toLowerCase().match(/[a-z0-9$]+/g) || [];
  const STOP = new Set(['the', 'a', 'an', 'my', 'to', 'for', 'and', 'of', 'on', 'in', 'at', 'by', 'with', 'do', 'go', 'get', 'it', 'i', 'me', 'this', 'that', 'times', 'week', 'day', 'month', 'per', 'a', 'x']);

  // ---------- dates people say ----------
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  /** "by Friday", "tomorrow", "next week", "in 3 days", "Nov 12", "11/12" → { due, rest } (rest = text without it). */
  function parseDue(text) {
    const today = dateKey();
    const rules = [
      [/\b(?:by |before |due |on )?(?:today|tonight)\b/i, () => today],
      [/\b(?:by |before |due |on )?tomorrow\b/i, () => addDays(today, 1)],
      [/\b(?:by |before |due )?(?:the )?end of (?:the )?week\b/i, () => addDays(today, (7 - new Date().getDay()) % 7 || 7)],
      [/\b(?:by |before |due )?next week\b/i, () => addDays(today, 7)],
      [/\bin (\d+) days?\b/i, (m) => addDays(today, Number(m[1]))],
      // Full day names anywhere; short ones ("fri") only after by/on/due ("wedding" isn't Wednesday).
      [/\b(?:(?:by|before|due|on|this|next) )*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(?:by|before|due|on|this|next) (sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i, (m) => {
        const want = WEEKDAYS.findIndex((w) => w.startsWith((m[1] || m[2]).toLowerCase().slice(0, 3)));
        let n = (want - new Date().getDay() + 7) % 7;
        if (/next/i.test(m[0]) && n === 0) n = 7;
        return addDays(today, n);
      }],
      [/\b(?:by |before |due |on )?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.? (\d{1,2})(?:st|nd|rd|th)?\b/i, (m) => monthDay(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)), Number(m[2]))],
      [/\b(?:by|before|due|on) (\d{1,2})\/(\d{1,2})\b/, (m) => monthDay(Number(m[1]) - 1, Number(m[2]))],
    ];
    for (const [re, fn] of rules) {
      const m = text.match(re);
      if (m) return { due: fn(m), rest: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim() };
    }
    return { due: null, rest: text.trim() };
  }
  function monthDay(mo, day) {
    if (mo < 0 || mo > 11 || day < 1 || day > 31) return null;
    const now = new Date();
    let d = new Date(now.getFullYear(), mo, day, 12);
    if (dateKey(d) < dateKey()) d = new Date(now.getFullYear() + 1, mo, day, 12);
    return dateKey(d);
  }
  /** "(1h)", "for 2 hours", "30 min" → minutes. */
  function parseMins(text) {
    const m = text.match(/\(?\b(?:for |takes |about )?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b\)?/i);
    if (!m) return { mins: null, rest: text };
    const n = Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1);
    return { mins: Math.max(10, Math.min(480, Math.round(n))), rest: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim() };
  }
  function dueLabel(k) {
    if (!k) return '';
    const diff = Math.round((dayOf(k) - dayOf(dateKey())) / 86400000);
    if (diff < 0) return diff === -1 ? 'was due yesterday' : `overdue ${-diff} days`;
    if (diff === 0) return 'due today';
    if (diff === 1) return 'due tomorrow';
    if (diff < 7) return `due ${dayOf(k).toLocaleDateString([], { weekday: 'long' })}`;
    return `due ${dayOf(k).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  const dayWord = (k) => (k === dateKey() ? 'today' : k === addDays(dateKey(), 1) ? 'tomorrow' : dayOf(k).toLocaleDateString([], { weekday: 'long' }));

  // ---------- finding things by name ----------
  function match(list, query) {
    const q = words(query).filter((w) => !STOP.has(w));
    if (!q.length) return [];
    const scored = list.map((x) => {
      const t = words(x.title);
      const score = q.filter((w) => t.some((tw) => tw === w || (w.length > 3 && (tw.startsWith(w) || w.startsWith(tw))))).length;
      return { x, score };
    }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return [];
    return scored.filter((s) => s.score === scored[0].score).map((s) => s.x);
  }
  const openTodos = () => state.todos.filter((t) => !t.done);

  // ---------- goals: progress and streaks ----------
  function periodRange(goal, k = dateKey()) {
    if (goal.per === 'day') return [k, k];
    if (goal.per === 'month') { const s = `${k.slice(0, 7)}-01`; const d = dayOf(s); d.setMonth(d.getMonth() + 1); d.setDate(0); return [s, dateKey(d)]; }
    const d = dayOf(k); const s = addDays(k, -((d.getDay() + 6) % 7)); return [s, addDays(s, 6)]; // weeks start Monday
  }
  function amountOn(goal, k) {
    return (goal.log && goal.log[k] || 0) + ((state.log[k] || {})[`g:${goal.id}`] === 'done' ? 1 : 0);
  }
  function progress(goal, k = dateKey()) {
    const [s, e] = periodRange(goal, k);
    let n = 0;
    for (let d = s; d <= e; d = addDays(d, 1)) n += amountOn(goal, d);
    const need = goal.kind === 'amount' ? Number(goal.target) || 0 : Number(goal.times) || 1;
    return { n: Math.round(n * 100) / 100, need, start: s, end: e, met: n >= need };
  }
  function streak(goal) {
    let k = dateKey(), count = 0;
    let p = progress(goal, k);
    if (!p.met) k = addDays(p.start, -1); // the current period still has time
    for (let i = 0; i < 400; i++) {
      p = progress(goal, k);
      if (!p.met || p.start < dateKey(new Date(goal.created || Date.now()))) break;
      count++;
      k = addDays(p.start, -1);
    }
    return count;
  }
  const perWord = (g) => ({ day: 'today', week: 'this week', month: 'this month' }[g.per] || 'this week');
  const unitFmt = (g, n) => (g.unit === '$' ? `$${n}` : `${n}${g.unit ? ` ${g.unit}` : ''}`);
  function progressText(g) {
    const p = progress(g);
    return g.kind === 'amount' ? `${unitFmt(g, p.n)} of ${unitFmt(g, p.need)} ${perWord(g)}` : `${p.n} of ${p.need} ${perWord(g)}`;
  }

  // ---------- planned items on a day (pure: only reads stored plans) ----------
  function items(d) {
    const k = dateKey(d);
    const out = [];
    const todoItems = [];
    for (const t of state.todos) {
      if (t.plan && t.plan.date === k && (!t.done || t.doneVia === 'plan')) {
        const shrunk = (t.pushed || 0) >= 2 && !t.done;
        todoItems.push({ id: `t:${t.id}`, time: t.plan.time, title: shrunk ? `Just start: ${t.title}` : t.title, category: 'todo', source: 'plan', todoId: t.id,
          mins: t.plan.mins || t.mins, first: t.first || '', pushed: t.pushed || 0, rank: rankOf(t) });
      }
    }
    // The one to do first: the most avoided / most urgent to-do of the day.
    const open = todoItems.filter((it) => !(state.log[k] || {})[it.id]);
    if (open.length) open.reduce((a, c) => (c.rank > a.rank ? c : a)).frog = true;
    out.push(...todoItems);
    for (const g of state.goals) {
      const tm = g.plans && g.plans[k];
      if (tm) out.push({ id: `g:${g.id}`, time: tm, title: g.title, category: 'goal', source: 'plan', goalId: g.id, mins: g.mins });
    }
    for (const c of state.chores) {
      const tm = c.plans && c.plans[k];
      if (!tm) continue;
      const shrunk = (c.pushed || 0) >= 2 && (c.mins || 15) > 25;
      out.push({ id: `c:${c.id}`, time: tm, title: shrunk ? `Just start: ${choreTitle(c)}` : choreTitle(c), category: 'chores', source: 'plan', choreId: c.id,
        mins: shrunk ? 25 : c.mins || 15, first: c.first || '', overdue: overdueOn(c, k) });
    }
    const dp = state.dayPlans[k];
    if (dp) for (const x of dp.items) out.push({ id: `e:${k}:${x.key}`, time: x.time, title: x.title, category: x.cat, source: 'plan', essential: x.key, mins: x.mins, first: x.first || '' });
    return out;
  }

  // ---------- daily essentials: the basics every day should have ----------
  // win: [earliest, latest] start in minutes (functions get wake / bed); pref: preferred start.
  const ESSENTIALS = [
    { key: 'morning', title: 'Morning routine: water, wash up, get dressed', mins: 20, cat: 'hygiene', win: (w) => [w, w + 60], pref: (w) => w + 5, anchored: true, covers: /shower|brush|wash|get ready|dress/i },
    { key: 'breakfast', title: 'Breakfast', mins: 20, cat: 'meal', win: (w) => [w + 15, Math.max(w + 90, 10 * 60 + 30)], pref: (w) => w + 40, anchored: true, covers: /breakfast/i },
    { key: 'lunch', title: 'Lunch', mins: 30, cat: 'meal', win: () => [11 * 60 + 30, 14 * 60 + 30], pref: () => 12 * 60 + 30, anchored: true, covers: /lunch/i },
    { key: 'dinner', title: 'Dinner', mins: 40, cat: 'meal', win: (w, b) => [17 * 60 + 30, Math.min(20 * 60 + 30, b - 90)], pref: () => 18 * 60 + 45, anchored: true, covers: /dinner|supper/i },
    { key: 'winddown', title: 'Wind down: screens off, plan tomorrow', mins: 30, cat: 'wind', win: (w, b) => [b - 75, b - 30], pref: (w, b) => b - 45, anchored: true, covers: /wind ?down|screens off/i },
    { key: 'focus', title: 'Focus block: the thing you\'ve been putting off', mins: 50, cat: 'work', first: 'close other apps, put your phone face down, open the task', win: (w) => [w + 60, 17 * 60], pref: () => 9 * 60 + 30, covers: /focus|deep work|study/i },
    { key: 'move', title: 'Move: workout or a brisk walk', mins: 30, cat: 'exercise', win: (w, b) => [w + 45, b - 150], pref: () => 17 * 60 + 30, covers: /walk|workout|work out|gym|run|exercise|yoga|lift|train/i },
    { key: 'outside', title: 'Get outside for some daylight', mins: 15, cat: 'break', win: (w) => [w + 30, 16 * 60 + 30], pref: () => 13 * 60 + 15, covers: /outside|daylight|sunlight|walk/i },
    { key: 'tidy', title: 'Tidy up: one area, 15 minutes', mins: 15, cat: 'chores', win: (w, b) => [16 * 60, b - 50], pref: () => 19 * 60 + 45, covers: /tidy|clean|chores|laundry|dishes/i,
      first: 'pick up five things and put them where they belong' },
  ];
  const DEFAULT_ESSENTIALS = ['morning', 'breakfast', 'lunch', 'dinner', 'winddown', 'focus', 'move', 'outside', 'tidy'];
  // Earlier choices: the "check in with someone" block is gone and tidying became a daily default.
  if (Array.isArray(state.settings.essentials) && !state.settings.essentialsV2) {
    state.settings.essentials = state.settings.essentials.filter((k) => k !== 'connect');
    if (!state.settings.essentials.includes('tidy')) state.settings.essentials.push('tidy');
    state.settings.essentialsV2 = true;
  }
  const chosenEssentials = () => (Array.isArray(state.settings.essentials) ? state.settings.essentials : DEFAULT_ESSENTIALS);
  const bedMin = () => { const w = toMin(state.profile.wake), b = toMin(state.profile.sleep); return b > w ? b : 24 * 60 - 1; };
  /** Fixed time on day k: work (with commute) and calendar events. Reminders aren't fixed; they're pings. */
  function fixedOn(k) {
    const d = dayOf(k), out = [];
    const commute = state.settings.workReminders ? Number(state.settings.commute) || 0 : 0;
    for (const sh of ctx.shiftsOn(d)) { const a = toMin(sh.start), b = toMin(sh.end); out.push([a - commute, (b <= a ? 1440 : b) + commute]); }
    if (state.settings.phoneCalendar) {
      for (const ev of state.phoneEvents || []) {
        if (ev.allDay || dateKey(new Date(ev.begin)) !== k) continue;
        const a = new Date(ev.begin), b = new Date(ev.end || ev.begin + 3600000);
        out.push([a.getHours() * 60 + a.getMinutes(), dateKey(b) === k ? b.getHours() * 60 + b.getMinutes() : 1440]);
      }
    }
    return out;
  }
  /** Is essential e already covered on day k by one of their reminders (at a time they're actually free) or a goal session? */
  function covered(e, k) {
    const [lo, hi] = e.win(toMin(state.profile.wake), bedMin());
    const fixed = fixedOn(k);
    const free = (t) => !fixed.some(([a, b]) => t >= a && t < b);
    const match = (it) => (it.category === e.cat && e.cat !== 'work' && e.cat !== 'break') || e.covers.test(it.title);
    if (ctx.baseItems(dayOf(k)).some((it) => !it.source && match(it) && toMin(it.time) >= lo - 30 && toMin(it.time) <= hi + 30 && free(toMin(it.time)))) return true;
    if (e.key === 'move') return state.goals.some((g) => g.plans && g.plans[k] && e.covers.test(g.title));
    if (e.key === 'tidy') return state.chores.some((c) => c.plans && c.plans[k]); // a real chore beats a generic tidy-up
    return false;
  }
  /** Places the chosen essentials on day k (keeping ones already done). `which`: 'anchored' (meals, mornings, evenings) or 'flex'. */
  function placeEssentials(k, which) {
    if (!state.profile) return;
    const w = toMin(state.profile.wake), b = bedMin();
    const [from, to] = windowFor(k);
    const plan = (state.dayPlans[k] ||= { made: Date.now(), items: [] });
    for (const e of ESSENTIALS) {
      if (!chosenEssentials().includes(e.key) || !!e.anchored !== (which === 'anchored')) continue;
      if (plan.items.some((x) => x.key === e.key) || covered(e, k)) continue;
      if (e.key === 'focus') {
        // A day that already has a long to-do block doesn't need a separate focus block.
        const todoMins = items(dayOf(k)).filter((it) => it.todoId).reduce((n, it) => n + (it.mins || 30), 0);
        if (todoMins >= 90) continue;
      }
      const [lo, hi] = e.win(w, b);
      const a = slot(busyOn(k), Math.max(from, lo), Math.min(to + 45, hi + e.mins), e.mins, Math.max(from, Math.min(hi, e.pref(w, b))));
      if (a != null && a <= hi) plan.items.push({ key: e.key, title: e.title, time: minToTime(a), mins: e.mins, cat: e.cat, first: e.first || '' });
    }
  }
  /** "Plan my day" clears essentials that haven't happened yet so they can be placed again. */
  function clearEssentials(k, from) {
    const plan = state.dayPlans[k];
    if (!plan) return;
    plan.items = plan.items.filter((x) => (state.log[k] || {})[`e:${k}:${x.key}`] || toMin(x.time) < from);
  }

  /** How much a to-do needs doing first: put off before, then deadline, then marked important. */
  function rankOf(t) {
    const days = t.due ? Math.round((dayOf(t.due) - dayOf(dateKey())) / 86400000) : 30;
    return (t.pushed || 0) * 100 + (t.priority === 'high' ? 40 : 0) + Math.max(0, 30 - days);
  }

  // ---------- chores: on a schedule, overdue until done ----------
  const CHORE_PRESETS = [
    { title: 'Dishes', every: 1, mins: 15, first: 'fill the sink with hot soapy water', time: '19:30' },
    { title: 'Wipe the kitchen counters and stove', every: 1, mins: 5, first: 'grab a cloth and spray' },
    { title: 'Take out the trash', every: 3, mins: 5, first: 'tie up the bag' },
    { title: 'Vacuum or sweep the floors', every: 4, mins: 20, first: 'plug in the vacuum' },
    { title: 'Laundry', every: 7, mins: 30, first: 'carry the hamper to the machine' },
    { title: 'Clean the bathroom', every: 7, mins: 30, first: 'spray the sink and toilet, then let it sit' },
    { title: 'Change the bed sheets', every: 14, mins: 15, first: 'pull the old sheets off' },
    { title: 'Deep clean', every: 7, mins: 60, first: 'put on music and clear every surface in the room', zones: ['kitchen', 'bathroom', 'bedroom', 'living room'] },
    { title: 'Clean out the fridge', every: 14, mins: 20, first: 'throw out anything expired' },
  ];
  const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / 86400000);
  const choreTitle = (c) => (c.zones && c.zones.length ? `${c.title}: ${c.zones[(c.zone || 0) % c.zones.length]}` : c.title);
  /** Days overdue on day k (0 = due that day, negative = not due yet). Never done counts as due. */
  const overdueOn = (c, k = dateKey()) => (c.last ? daysBetween(c.last, k) - (Number(c.every) || 1) : c.firstDue ? daysBetween(c.firstDue, k) : 0);
  const choreDue = (c, k = dateKey()) => overdueOn(c, k) >= 0;
  function choreStatus(c) {
    const o = overdueOn(c);
    if (o > 0) return `${o} day${o === 1 ? '' : 's'} overdue`;
    if (o === 0) return c.last || c.firstDue ? 'due today' : 'not done yet';
    return `${c.last ? 'next' : 'first one'} in ${-o} day${o === -1 ? '' : 's'}`;
  }
  const choreRank = (c, k) => overdueOn(c, k) * 20 + (c.pushed || 0) * 30 + (Number(c.every) <= 1 ? 5 : 0);

  // ---------- fitting things into free time ----------
  function windowFor(k) {
    const w = toMin(state.profile.wake), s = toMin(state.profile.sleep);
    const end = s > w ? s - 45 : 23 * 60 + 15; // stop 45 min before bed (bedtimes after midnight: 11:15 PM)
    let start = w + 30;
    if (k === dateKey()) start = Math.max(start, Math.ceil((nowMin() + 10) / 15) * 15);
    return [start, end];
  }
  function busyOn(k) {
    const d = dayOf(k);
    const busy = [];
    // Quick reminders (water, stretch, meds) are just a ping and can land during a block; meals take real time.
    for (const it of ctx.baseItems(d)) {
      if (it.source || it.category !== 'meal') continue; // shifts and calendar events are added with their real length below
      const t = toMin(it.time);
      busy.push([t, t + 30]);
    }
    const commute = state.settings.workReminders ? Number(state.settings.commute) || 0 : 0;
    for (const sh of ctx.shiftsOn(d)) {
      const a = toMin(sh.start), b = toMin(sh.end);
      busy.push([a - commute, (b <= a ? 1440 : b) + commute]);
    }
    if (state.settings.phoneCalendar) {
      for (const ev of state.phoneEvents || []) {
        if (ev.allDay || dateKey(new Date(ev.begin)) !== k) continue;
        const a = new Date(ev.begin), b = new Date(ev.end || ev.begin + 3600000);
        busy.push([a.getHours() * 60 + a.getMinutes(), dateKey(b) === k ? b.getHours() * 60 + b.getMinutes() : 1440]);
      }
    }
    for (const it of items(d)) busy.push([toMin(it.time), toMin(it.time) + (it.mins || 30)]);
    return busy.sort((x, y) => x[0] - y[0]);
  }
  /** Earliest free start ≥ from that fits `mins` (plus a 10-minute breather), or null. */
  function slot(busy, from, to, mins, near) {
    const free = (a) => a + mins <= to && !busy.some(([s, e]) => a < e + 10 && a + mins + 10 > s);
    if (near != null) {
      // Closest free time to the preferred one (goals like "gym at 6 PM")
      for (let off = 0; off <= 600; off += 15) {
        for (const a of off ? [near + off, near - off] : [near]) if (a >= from && free(a)) return a;
      }
      return null;
    }
    for (let a = from; a + mins <= to; a += 15) if (free(a)) return a;
    return null;
  }
  const dailyBudget = () => (Number(state.settings.planHours) || 3) * 60; // to-do time per day at most

  /**
   * Plans day `k`: goal sessions that are due, then open to-dos by deadline and priority, into free time.
   * `replan`: also move what's planned there but not done yet (for "plan my day"). Returns what's on the day.
   */
  function planDay(k = dateKey(), replan = false) {
    if (!state.profile) return [];
    const [from, to] = windowFor(k);
    const before = new Map();
    const fullDay = replan || (state.settings.autoDay && !state.dayPlans[k]);
    if (replan) {
      clearEssentials(k, from);
      for (const c of state.chores) if (c.plans && c.plans[k] && toMin(c.plans[k]) >= from && !(state.log[k] || {})[`c:${c.id}`]) delete c.plans[k];
      for (const t of openTodos()) if (t.plan && t.plan.date === k && toMin(t.plan.time) >= from) { before.set(t, t.plan); t.plan = null; }
      for (const g of state.goals) if (g.plans && g.plans[k] && toMin(g.plans[k]) >= from && !(state.log[k] || {})[`g:${g.id}`]) delete g.plans[k];
    }
    // A full day: meals, mornings and evenings first, at their natural times.
    if (fullDay) placeEssentials(k, 'anchored');
    // Goal sessions next: they happen at a set rhythm.
    for (const g of state.goals) {
      if (g.kind === 'amount' || g.sessions === false) continue;
      g.plans ||= {};
      if (g.plans[k] || amountOn(g, k) > 0) continue;
      if (!sessionDue(g, k)) continue;
      const mins = Number(g.mins) || 30;
      const near = g.time ? toMin(g.time) : null;
      // While replanning, a goal doesn't take a slot a to-do already had (those keep it if nothing better turns up).
      const held = [...before].map(([t, o]) => [toMin(o.time), toMin(o.time) + (t.mins || 30)]);
      const a = slot(busyOn(k).concat(held), from, to, mins, near != null ? near : Math.max(from, 17 * 60));
      if (a != null) g.plans[k] = minToTime(a);
    }
    placeChores(k, from, to, before);
    // Then to-dos: overdue and soonest-due first, important first; spread over days by the daily budget.
    let used = openTodos().filter((t) => t.plan && t.plan.date === k).reduce((n, t) => n + (t.mins || 30), 0);
    // Most-avoided first (they get the earliest slot of the day), then by deadline and importance.
    const waiting = openTodos().filter((t) => (!t.plan || t.plan.date < dateKey()) && t.notOn !== k)
      .sort((a, b) => rankOf(b) - rankOf(a) || a.created - b.created);
    for (const t of waiting) {
      const shrink = (t.pushed || 0) >= 2;
      const mins = shrink ? Math.min(25, t.mins || 30) : t.mins || 30;
      const urgent = t.due && t.due <= addDays(k, 1);
      if (!urgent && used + mins > dailyBudget()) continue;
      const a = slot(busyOn(k), from, to, mins);
      if (a == null) continue;
      t.plan = shrink ? { date: k, time: minToTime(a), mins } : { date: k, time: minToTime(a) };
      used += mins;
    }
    // Then the flexible essentials (focus, movement, daylight, people) into what's left.
    if (fullDay) { placeEssentials(k, 'flex'); state.dayPlans[k].made = Date.now(); }
    // Replanning never loses a to-do: one that found no new spot keeps its old one if that's still free.
    for (const [t, old] of before) {
      if (t.plan) continue;
      const a = toMin(old.time);
      if (!busyOn(k).some(([bs, be]) => a < be && a + (t.mins || 30) > bs)) t.plan = old;
    }
    return items(dayOf(k)).sort((a, b) => toMin(a.time) - toMin(b.time));
  }
  /** Chores that are due (most overdue / most put off first). Put off twice: right after the morning, 25 minutes. */
  function placeChores(k, from, to, before = new Map()) {
    const held = [...before].map(([t, o]) => [toMin(o.time), toMin(o.time) + (t.mins || 30)]);
    let used = 0;
    const due = state.chores.filter((c) => choreDue(c, k) && !(c.plans && c.plans[k]) && !(state.log[k] || {})[`c:${c.id}`] && c.notOn !== k)
      .sort((a, b) => choreRank(b, k) - choreRank(a, k));
    for (const c of due) {
      const stuck = (c.pushed || 0) >= 2;
      const mins = stuck && (c.mins || 15) > 25 ? 25 : c.mins || 15;
      if (used + mins > 90 && overdueOn(c, k) <= 0 && !stuck) continue; // spread big chore days out, but never skip overdue ones
      const free = !ctx.shiftsOn(dayOf(k)).length;
      const near = stuck ? from + 60 : c.time ? toMin(c.time) : (c.mins || 15) >= 45 ? (free ? 10 * 60 + 30 : 18 * 60) : 19 * 60;
      const a = slot(busyOn(k).concat(held), from, to, mins, Math.max(from, near));
      if (a == null) continue;
      (c.plans ||= {})[k] = minToTime(a);
      used += mins;
    }
  }
  /** Should goal `g` get a session on day k? Daily: always. Weekly/monthly: when behind, with rest days if there's time. */
  function sessionDue(g, k) {
    const p = progress(g, k);
    const need = p.need - p.n;
    if (need <= 0) return false;
    if (g.per === 'day') return true;
    const daysLeft = Math.round((dayOf(p.end) - dayOf(k)) / 86400000) + 1;
    if (need >= daysLeft) return true;
    const y = addDays(k, -1);
    return !(amountOn(g, y) > 0 || (g.plans && g.plans[y])); // a rest day after a session
  }
  /** Quietly keeps today (and tomorrow, in the evening) planned. Called on every heartbeat. */
  let lastAuto = '';
  function autoPlan() {
    if (!state.profile) return false;
    syncDone();
    const today = dateKey();
    // Planned on a past day and not done: back in the queue.
    for (const t of openTodos()) if (t.plan && t.plan.date < today) t.plan = null;
    const sig = JSON.stringify([today, Math.floor(nowMin() / 30), state.todos.map((t) => [t.id, t.done, t.plan, t.due, t.mins]), state.goals.map((g) => [g.id, g.plans && g.plans[today]])]);
    if (sig === lastAuto) return false;
    lastAuto = sig;
    planDay(today);
    if (nowMin() >= checkinMin() - 60) planDay(addDays(today, 1));
    // Old day plans aren't needed after a few days.
    for (const k of Object.keys(state.dayPlans)) if (k < addDays(today, -7)) delete state.dayPlans[k];
    return true;
  }
  /** Ticking a planned item done (or skipping it) updates the to-do. */
  function syncDone() {
    for (const t of state.todos) {
      if (!t.plan) continue;
      const st = (state.log[t.plan.date] || {})[`t:${t.id}`];
      if (st === 'done' && !t.done) { t.done = true; t.doneAt = Date.now(); t.doneVia = 'plan'; }
      else if (!st && t.done && t.doneVia === 'plan') { t.done = false; t.doneAt = 0; t.doneVia = ''; } // undone from the list
      else if (st === 'skipped' && !t.done) { t.notOn = t.plan.date; t.plan = null; t.pushed = (t.pushed || 0) + 1; }
    }
    for (const c of state.chores) {
      for (const [k] of Object.entries(c.plans || {})) {
        const st = (state.log[k] || {})[`c:${c.id}`];
        if (st === 'done' && (!c.last || c.last < k)) finishChore(c, k);
        else if (st === 'skipped' && !c.skipSeen?.includes(k)) { (c.skipSeen ||= []).push(k); c.pushed = (c.pushed || 0) + 1; c.notOn = k; }
      }
      for (const k of Object.keys(c.plans || {})) if (k < addDays(dateKey(), -7)) delete c.plans[k];
      if (c.skipSeen) c.skipSeen = c.skipSeen.filter((k) => k >= addDays(dateKey(), -7));
    }
  }
  function finishChore(c, k = dateKey()) {
    c.last = k;
    delete c.firstDue;
    c.pushed = 0;
    c.notOn = '';
    if (c.zones && c.zones.length) c.zone = ((c.zone || 0) + 1) % c.zones.length;
  }

  // ---------- actions (UI, chat and her AI all use these) ----------
  function addTodo({ title, due = null, mins = null, priority = 'normal', notes = '', first = '' }) {
    title = String(title || '').trim().replace(/^to ?do:?\s*/i, '');
    if (!title) return { error: 'empty to-do' };
    const t = { id: uid(), title: title[0].toUpperCase() + title.slice(1), due: due || null, mins: Number(mins) || 30, priority: priority === 'high' ? 'high' : 'normal', notes, done: false, created: Date.now(), plan: null,
      first: String(first || '').trim().replace(/[.]+$/, ''), pushed: 0 };
    state.todos.push(t);
    ctx.noteAdded && ctx.noteAdded({ kind: 'todo', id: t.id });
    planDay(dateKey());
    if (!t.plan) planDay(addDays(dateKey(), 1));
    if (!t.plan && t.due) for (let i = 2; i < 7 && !t.plan && addDays(dateKey(), i) <= t.due; i++) planDay(addDays(dateKey(), i));
    changed();
    return { ok: true, todo: t, planned: t.plan ? `${dayWord(t.plan.date)} at ${fmtTime(t.plan.time)}` : null };
  }
  function completeTodo(query) {
    const found = typeof query === 'object' ? [query] : match(openTodos(), query);
    if (found.length !== 1) return { error: found.length ? 'ambiguous' : 'not found', choices: found.map((t) => t.title) };
    const t = found[0];
    t.done = true; t.doneAt = Date.now(); t.doneVia = 'manual';
    if (t.plan) { (state.log[t.plan.date] ||= {})[`t:${t.id}`] = 'done'; t.doneVia = 'plan'; }
    changed();
    return { ok: true, done: t.title, left: openTodos().length };
  }
  function deleteTodo(query) {
    const found = typeof query === 'object' ? [query] : match(state.todos, query);
    if (found.length !== 1) return { error: found.length ? 'ambiguous' : 'not found', choices: found.map((t) => t.title) };
    state.todos = state.todos.filter((t) => t !== found[0]);
    ctx.toTrash && ctx.toTrash({ kind: 'todo', item: found[0] });
    changed();
    return { ok: true, deleted: found[0].title };
  }
  function addGoal({ title, kind = 'times', times = null, per = 'week', target = null, unit = '', time = '', mins = null }) {
    title = String(title || '').trim();
    if (!title) return { error: 'empty goal' };
    const g = {
      id: uid(), title: title[0].toUpperCase() + title.slice(1), kind: kind === 'amount' ? 'amount' : 'times',
      times: Math.max(1, Math.round(Number(times) || (per === 'day' ? 1 : 3))), per: ['day', 'week', 'month'].includes(per) ? per : 'week',
      target: Number(target) || 0, unit: unit || '', time: /^\d{2}:\d{2}$/.test(time || '') ? time : '', mins: Number(mins) || 45,
      sessions: kind !== 'amount', log: {}, plans: {}, created: Date.now(),
    };
    state.goals.push(g);
    planDay(dateKey());
    changed();
    const next = g.plans[dateKey()] ? `today at ${fmtTime(g.plans[dateKey()])}` : null;
    return { ok: true, goal: g.title, rhythm: g.kind === 'amount' ? `${unitFmt(g, g.target)} per ${g.per}` : `${g.times}× per ${g.per}`, next_session: next };
  }
  function logGoal(query, amount = null) {
    const found = typeof query === 'object' ? [query] : match(state.goals, query);
    if (found.length !== 1) return { error: found.length ? 'ambiguous' : 'not found', choices: found.map((g) => g.title) };
    const g = found[0], k = dateKey();
    const sess = `g:${g.id}`;
    if (g.kind !== 'amount' && g.plans && g.plans[k] && !(state.log[k] || {})[sess]) (state.log[k] ||= {})[sess] = 'done'; // ticks today's planned session
    else (g.log ||= {})[k] = (g.log[k] || 0) + (g.kind === 'amount' ? Number(amount) || 0 : Number(amount) || 1);
    changed();
    const p = progress(g);
    return { ok: true, goal: g.title, progress: progressText(g), met: p.met, streak: streak(g) };
  }
  function deleteGoal(query) {
    const found = typeof query === 'object' ? [query] : match(state.goals, query);
    if (found.length !== 1) return { error: found.length ? 'ambiguous' : 'not found', choices: found.map((g) => g.title) };
    state.goals = state.goals.filter((g) => g !== found[0]);
    changed();
    return { ok: true, deleted: found[0].title };
  }
  function addChore({ title, every = 7, mins = 15, first = '', time = '', zones = null }) {
    title = String(title || '').trim();
    if (!title) return { error: 'empty chore' };
    const c = { id: uid(), title: title[0].toUpperCase() + title.slice(1), every: Math.max(1, Math.round(Number(every) || 7)), mins: Math.max(5, Math.round(Number(mins) || 15)),
      first: String(first || '').trim().replace(/[.]+$/, ''), time: /^\d{2}:\d{2}$/.test(time || '') ? time : '', last: null, pushed: 0, plans: {}, ...(zones ? { zones, zone: 0 } : {}) };
    state.chores.push(c);
    planDay(dateKey());
    changed();
    return { ok: true, chore: choreTitle(c), every: c.every, planned: c.plans[dateKey()] ? `today at ${fmtTime(c.plans[dateKey()])}` : null };
  }
  /** Marks a chore done today (from the list, the chat or her AI). */
  function choreDone(query) {
    const found = typeof query === 'object' ? [query] : match(state.chores.map((c) => ({ ...c, title: choreTitle(c) + ' ' + c.title })), query).map((x) => state.chores.find((c) => c.id === x.id));
    if (found.length !== 1) return { error: found.length ? 'ambiguous' : 'not found', choices: found.map(choreTitle) };
    const c = found[0], k = dateKey();
    const was = choreTitle(c), late = overdueOn(c);
    if (c.plans && c.plans[k]) (state.log[k] ||= {})[`c:${c.id}`] = 'done';
    finishChore(c, k);
    changed();
    return { ok: true, done: was, was_overdue_days: Math.max(0, late), next: `in ${c.every} day${c.every === 1 ? '' : 's'}` };
  }
  function deleteChore(query) {
    const found = typeof query === 'object' ? [query] : match(state.chores, query);
    if (found.length !== 1) return { error: found.length ? 'ambiguous' : 'not found', choices: found.map((c) => c.title) };
    state.chores = state.chores.filter((c) => c !== found[0]);
    changed();
    return { ok: true, deleted: found[0].title };
  }
  function changed() {
    save();
    ctx.refresh();
    render();
  }

  // ---------- Plan my day with her AI (Claude or Gemini) ----------
  const catFor = (t) => (/breakfast|lunch|dinner|meal|eat|snack/i.test(t) ? 'meal' : /walk|gym|workout|work out|run|exercise|yoga|stretch|lift/i.test(t) ? 'exercise'
    : /wind ?down|bed|sleep/i.test(t) ? 'wind' : /shower|brush|wash|dress|morning routine/i.test(t) ? 'hygiene'
      : /clean|tidy|laundry|dishes|chores/i.test(t) ? 'chores' : /break|outside|daylight|rest|nap/i.test(t) ? 'break' : /focus|work|study|deep|edit|write/i.test(t) ? 'work' : 'custom');
  const hm = (m) => minToTime(m);
  /** Everything about day k, for her AI to plan from. */
  function brief(k) {
    const d = dayOf(k), today = k === dateKey();
    const [from, to] = windowFor(k);
    const w = toMin(state.profile.wake), b = bedMin();
    const fixed = [];
    const commute = state.settings.workReminders ? Number(state.settings.commute) || 0 : 0;
    for (const sh of ctx.shiftsOn(d)) fixed.push(`${hm(toMin(sh.start) - commute)}–${hm(toMin(sh.end) + commute)} ${sh.label || 'Work'} shift ${sh.start}–${sh.end}${commute ? ` (includes ${commute} min commute each way)` : ''}`);
    if (state.settings.phoneCalendar) {
      for (const ev of state.phoneEvents || []) {
        if (ev.allDay || dateKey(new Date(ev.begin)) !== k) continue;
        const a = new Date(ev.begin), e = new Date(ev.end || ev.begin + 3600000);
        fixed.push(`${hm(a.getHours() * 60 + a.getMinutes())}–${hm(e.getHours() * 60 + e.getMinutes())} ${ev.title || 'Calendar event'}`);
      }
    }
    const log = state.log[k] || {};
    const reminders = ctx.baseItems(d).filter((it) => !it.source).map((it) => `${it.time} ${it.title}${log[it.id] ? ` (${log[it.id]})` : ''}`);
    const todos = openTodos().slice(0, 20).sort((a, c) => rankOf(c) - rankOf(a)).map((t) => `id ${t.id}: "${t.title}", about ${t.mins || 30} min${t.due ? `, ${dueLabel(t.due)} (${t.due})` : ''}${t.priority === 'high' ? ', IMPORTANT' : ''}${t.pushed ? `, PUT OFF ${t.pushed} TIME${t.pushed === 1 ? '' : 'S'} already` : ''}${t.first ? `, first step so far: "${t.first}"` : ''}`);
    const goals = state.goals.filter((g) => g.kind !== 'amount' && g.sessions !== false && !(amountOn(g, k) > 0)).map((g) => {
      const p = progress(g, k);
      return `id ${g.id}: "${g.title}", ${p.n} of ${p.need} done ${g.per === 'day' ? 'today' : `this ${g.per}`}, sessions ${g.mins || 45} min${g.time ? `, usually around ${g.time}` : ''}`;
    });
    const amountGoals = state.goals.filter((g) => g.kind === 'amount').map((g) => `"${g.title}": ${progressText(g)}`);
    const essentials = ESSENTIALS.filter((e) => chosenEssentials().includes(e.key)).map((e) => e.title.split(':')[0]);
    const memory = (state.memory || []).slice(-15).map((m) => m.text);
    return [
      `Plan my ${today ? 'day today' : 'day'}: ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} (${k}).`,
      today ? `It's now ${hm(nowMin())}. Only plan from ${hm(from)} on.` : '',
      `I wake at ${hm(w)} and go to bed at ${hm(b)}. Plan between ${hm(from)} and ${hm(Math.min(b, to + 45))}.`,
      `Fixed, never put anything during these: ${fixed.length ? fixed.join('; ') : 'nothing fixed'}.`,
      `My reminders today (they stay as they are; don't add a second block for something one already covers, unless it falls during fixed time): ${reminders.length ? reminders.join('; ') : 'none'}.`,
      `My to-do list (schedule what fits, deadline-first and important first; at most ${(Number(state.settings.planHours) || 3)} hours of to-dos unless something is due today or tomorrow; split nothing): ${todos.length ? todos.join('; ') : 'empty'}.`,
      `Goals that could use a session today (plan one only if it makes sense for the rhythm, e.g. leave rest days): ${goals.length ? goals.join('; ') : 'none'}.`,
      amountGoals.length ? `Other goals (no time block needed, but you can mention them): ${amountGoals.join('; ')}.` : '',
      `My chores (kind "chore" with ref = its id; overdue ones must get time today, most overdue first; a chore put off twice gets an early 25-minute "just start" block): ${state.chores.filter((c) => choreDue(c, k)).map((c) => `id ${c.id}: "${choreTitle(c)}", about ${c.mins || 15} min, ${choreStatus(c)}${c.pushed ? `, PUT OFF ${c.pushed}×` : ''}${c.first ? `, first step "${c.first}"` : ''}`).join('; ') || 'none due'}.`,
      `Daily essentials I want in every day, when I'm free for them: ${essentials.join(', ')}.`,
      'Why I use this: I procrastinate, and nobody else holds me to anything (no one comes over, no boss checking), so this plan is my structure and accountability. Plan to beat procrastination: put the hardest or most put-off task in the first good focus window of the day; keep task blocks 25 to 50 minutes (a task put off twice or more gets a short 25-minute "just start" block); give every to-do, goal and chore block a tiny, concrete first step that takes under two minutes (first_step, e.g. "open the project and drag in today\'s footage"); include a short daily tidy-up; leave some breathing room so the day is doable, not overpacked. Never add blocks about texting, calling or checking in with people.',
      memory.length ? `Things you know about me (use them to make the plan fit me): ${memory.join('; ')}.` : '',
      '',
      'Make a realistic, kind schedule as blocks: essentials (kind "essential"), to-dos (kind "todo" with ref = its id), goal sessions (kind "goal" with ref = its id), and anything else that would genuinely help (kind "other", sparingly). Rules: blocks never overlap each other or the fixed times; leave about 10 minutes between blocks; meals at normal times; nothing heavy right before bed; a wind-down block before bed; do not repeat my reminders as blocks. Use 24-hour HH:MM times on this date only. Then a short message to me.',
    ].filter((x) => x !== '').join('\n');
  }
  /** Asks her AI to plan day k, checks every block, and applies it. → lines to say, or null to fall back. */
  async function planDayAI(k = dateKey()) {
    if (!state.profile || !ctx.aiPlan) return null;
    const res = await ctx.aiPlan(brief(k));
    if (!res || res.error || !Array.isArray(res.blocks)) return null;
    const [from, to] = windowFor(k);
    const end = Math.min(bedMin(), to + 45);
    // Start from a clean slate for what hasn't happened yet (like "Plan my day" without AI).
    clearEssentials(k, from);
    const oldTodo = new Map(), oldGoal = new Map();
    for (const t of openTodos()) if (t.plan && t.plan.date === k && toMin(t.plan.time) >= from) { oldTodo.set(t, t.plan); t.plan = null; }
    for (const g of state.goals) if (g.plans && g.plans[k] && toMin(g.plans[k]) >= from && !(state.log[k] || {})[`g:${g.id}`]) { oldGoal.set(g, g.plans[k]); delete g.plans[k]; }
    const oldChore = new Map();
    for (const c of state.chores) if (c.plans && c.plans[k] && toMin(c.plans[k]) >= from && !(state.log[k] || {})[`c:${c.id}`]) { oldChore.set(c, c.plans[k]); delete c.plans[k]; }
    const plan = (state.dayPlans[k] ||= { made: Date.now(), items: [] });
    const taken = fixedOn(k).concat(items(dayOf(k)).map((it) => [toMin(it.time), toMin(it.time) + (it.mins || 30)]));
    let placed = 0, n = 0;
    const firstOf = (x) => String(x.first_step || '').trim().replace(/[.]+$/, '').slice(0, 140);
    const blocks = res.blocks.filter((x) => /^\d{1,2}:\d{2}$/.test(x.time || '')).sort((a, c) => toMin(a.time.padStart(5, '0')) - toMin(c.time.padStart(5, '0')));
    for (const x of blocks) {
      const a = toMin(x.time.padStart(5, '0'));
      const mins = Math.max(5, Math.min(240, Math.round(Number(x.minutes) || 30)));
      if (a < from || a + Math.min(mins, 30) > end + 15) continue;        // outside the day
      if (taken.some(([s, e]) => a < e && a + mins > s)) continue;       // clashes with work, calendar or another block
      if (x.kind === 'todo') {
        const t = openTodos().find((y) => y.id === x.ref);
        if (!t || (t.plan && t.plan.date === k)) continue;
        t.plan = mins < (t.mins || 30) ? { date: k, time: hm(a), mins } : { date: k, time: hm(a) };
        if (firstOf(x)) t.first = firstOf(x);
      } else if (x.kind === 'chore') {
        const c = state.chores.find((y) => y.id === x.ref);
        if (!c || (c.plans && c.plans[k])) continue;
        (c.plans ||= {})[k] = hm(a);
        if (firstOf(x) && !c.first) c.first = firstOf(x);
      } else if (x.kind === 'goal') {
        const g = state.goals.find((y) => y.id === x.ref);
        if (!g || (g.plans && g.plans[k])) continue;
        (g.plans ||= {})[k] = hm(a);
      } else {
        const title = String(x.title || '').trim().slice(0, 80);
        if (!title) continue;
        if (/\b(text|call|message|check in with|catch up with)\b/i.test(title)) continue; // no people-related blocks
        plan.items.push({ key: `ai${Date.now().toString(36)}${n++}`, title, time: hm(a), mins, cat: catFor(title), ai: true, first: firstOf(x) });
      }
      taken.push([a, a + mins]);
      placed++;
    }
    if (!placed) {
      // Nothing usable came back: put things back as they were.
      for (const [t, old] of oldTodo) t.plan = old;
      for (const [g, old] of oldGoal) (g.plans ||= {})[k] = old;
      for (const [c, old] of oldChore) (c.plans ||= {})[k] = old;
      return null;
    }
    // Overdue chores Claude left out still get a slot (they don't get to slide).
    placeChores(k, from, Math.min(bedMin(), to + 45));
    plan.made = Date.now();
    changed();
    const list = planList(k);
    const lines = [String(res.message || '').trim() || `Here's your ${dayWord(k)}.`, `${dayWord(k)[0].toUpperCase() + dayWord(k).slice(1)}:\n${list.map((l) => `• ${l}`).join('\n')}`];
    const unplanned = openTodos().filter((t) => !t.plan);
    if (unplanned.length) lines.push(`Still on your list for later: ${unplanned.slice(0, 4).map((t) => t.title).join(', ')}${unplanned.length > 4 ? '…' : ''}.`);
    return lines;
  }

  // ---------- what she says ----------
  function planList(k) {
    const list = ctx.allItems(dayOf(k)).filter((it) => !(state.log[k] || {})[it.id] && (k !== dateKey() || toMin(it.time) >= nowMin() - 5));
    return list.map((it) => `${fmtTime(it.time)} ${it.title}${it.source === 'plan' ? (it.todoId ? ' (to-do)' : it.goalId ? ' (goal)' : it.choreId ? ` (chore${it.overdue > 0 ? `, ${it.overdue} day${it.overdue === 1 ? '' : 's'} overdue` : ''})` : '') : it.source === 'work' ? ' (work)' : ''}`);
  }
  function planReply(k = dateKey(), replan = false) {
    planDay(k, replan);
    changed();
    const list = planList(k);
    const added = replan ? items(dayOf(k)).filter((it) => it.essential && !(state.log[k] || {})[it.id]).length : 0;
    const lines = [list.length ? `Here's your ${dayWord(k)}${replan ? ', planned around your schedule' : ''}:\n${list.map((l) => `• ${l}`).join('\n')}` : `Nothing left to plan for ${dayWord(k)}.`];
    if (added) lines.push(`I added ${added} daily essential${added === 1 ? '' : 's'} where you had room (meals, movement, focus, daylight, winding down). I'll remind you at each one; swipe any you don't want.`);
    const unplanned = openTodos().filter((t) => !t.plan);
    if (unplanned.length) lines.push(`Still on your list for later: ${unplanned.slice(0, 4).map((t) => t.title).join(', ')}${unplanned.length > 4 ? '…' : ''}.`);
    return lines;
  }
  /** One paragraph for the morning briefing. */
  function morningLine() {
    const k = dateKey();
    const todos = items(dayOf(k)).filter((it) => it.todoId && !(state.log[k] || {})[it.id]);
    const goals = items(dayOf(k)).filter((it) => it.goalId && !(state.log[k] || {})[it.id]);
    const parts = [];
    if (todos.length) parts.push(`On your to-do list today: ${todos.map((it) => `${it.title} at ${fmtTime(it.time)}`).join(', ')}.`);
    if (goals.length) parts.push(`For your goals: ${goals.map((it) => `${it.title} at ${fmtTime(it.time)}`).join(', ')}.`);
    const overdue = openTodos().filter((t) => t.due && t.due < k);
    if (overdue.length) parts.push(`Overdue: ${overdue.map((t) => t.title).join(', ')}.`);
    return parts.join(' ');
  }
  /** For her AI: the to-do list and goals. */
  function summary() {
    const todos = openTodos().slice(0, 25).map((t) => `${t.title}${t.due ? ` (${dueLabel(t.due)})` : ''}${t.priority === 'high' ? ' [important]' : ''}${t.plan ? ` [planned ${dayWord(t.plan.date)} ${fmtTime(t.plan.time)}]` : ' [not planned yet]'}`);
    const goals = state.goals.map((g) => `${g.title}: ${progressText(g)}${streak(g) ? `, streak ${streak(g)}` : ''}${g.plans && g.plans[dateKey()] ? `, session today ${fmtTime(g.plans[dateKey()])}` : ''}`);
    const chores = state.chores.map((c) => `${choreTitle(c)} (every ${c.every} day${c.every === 1 ? '' : 's'}, ${choreStatus(c)}${c.pushed ? `, put off ${c.pushed}×` : ''}${c.plans && c.plans[dateKey()] ? `, planned today ${fmtTime(c.plans[dateKey()])}` : ''})`);
    return [`To-do list: ${todos.length ? todos.join('; ') : 'empty'}.`, goals.length ? `Goals: ${goals.join('; ')}.` : '', chores.length ? `Chores: ${chores.join('; ')}.` : ''].filter(Boolean).join('\n');
  }

  // ---------- evening check-in ----------
  function checkinMin() {
    if (state.settings.checkinTime) return toMin(state.settings.checkinTime);
    const w = toMin(state.profile.wake), s = toMin(state.profile.sleep);
    return Math.max(19 * 60, (s > w ? s : 24 * 60) - 90);
  }
  const checkinOn = () => state.settings.eveningCheckin !== false && (state.todos.length > 0 || state.goals.length > 0 || state.chores.length > 0);
  /** Goes over today, moves what's left to tomorrow. Returns { text, todos } or null when there's nothing to say. */
  function checkIn() {
    const k = dateKey(), tomorrow = addDays(k, 1);
    state.checkedIn[k] = true;
    syncDone();
    const doneToday = state.todos.filter((t) => t.done && t.doneAt && dateKey(new Date(t.doneAt)) === k);
    const left = openTodos().filter((t) => t.plan && t.plan.date === k);
    for (const t of left) { t.plan = null; t.notOn = ''; t.pushed = (t.pushed || 0) + 1; }
    const choresDone = state.chores.filter((c) => c.last === k);
    const choresLeft = state.chores.filter((c) => c.plans && c.plans[k] && c.last !== k);
    // Re-place them for tomorrow with the new count (the evening may already have planned tomorrow).
    for (const c of choresLeft) { c.pushed = (c.pushed || 0) + 1; c.notOn = ''; if (c.plans) delete c.plans[tomorrow]; }
    planDay(tomorrow);
    const moved = left.map((t) => (t.plan ? `${t.title} (tomorrow ${fmtTime(t.plan.time)})` : t.title));
    const stuck = left.filter((t) => t.pushed >= 2);
    const goalBits = state.goals.map((g) => {
      const p = progress(g);
      return `${g.title}: ${progressText(g)}${p.met ? ' ✓' : ''}`;
    });
    if (!doneToday.length && !left.length && !goalBits.length && !choresDone.length && !choresLeft.length) return null;
    const parts = [ctx.plain() ? 'Evening check-in.' : ctx.say('Evening check-in, {name}~')];
    if (doneToday.length) parts.push(`Done today: ${doneToday.map((t) => t.title).join(', ')} ✓`);
    if (left.length) parts.push(`Not finished: ${moved.join(', ')}. I moved ${left.length === 1 ? 'it' : 'them'} to tomorrow. If you did ${left.length === 1 ? 'it' : 'any'} after all, tap below.`);
    // Honest about what keeps getting put off, and make it small.
    stuck.sort((a, c) => rankOf(c) - rankOf(a)).forEach((t, i) => {
      const when = i === 0 ? "Tomorrow it's the first thing you do" : 'It comes right after';
      parts.push(`“${t.title}” has been pushed ${t.pushed} times now. ${when}, and only 25 minutes. All you have to do is start: ${t.first || 'open it and work on it for five minutes'}.`);
    });
    if (choresDone.length) parts.push(`Chores done: ${choresDone.map((c) => c.title).join(', ')} ✓`);
    // Chores don't get to slide quietly.
    for (const c of choresLeft) {
      const o = overdueOn(c, tomorrow);
      const when = c.plans && c.plans[tomorrow] ? `tomorrow at ${fmtTime(c.plans[tomorrow])}` : 'tomorrow';
      parts.push(`${choreTitle(c)} didn't happen${o > 0 ? `; by tomorrow it's ${o} day${o === 1 ? '' : 's'} overdue` : ''}. It's back on ${when}${c.pushed >= 2 ? `, early, and only ${Math.min(25, c.mins || 15)} minutes` : ''}. Start with: ${c.first || 'set a timer for five minutes and begin'}.`);
    }
    if (goalBits.length) parts.push(`Goals: ${goalBits.join(' · ')}`);
    const firsts = planList(tomorrow).slice(0, 4);
    if (firsts.length) parts.push(`Tomorrow starts with: ${firsts.join(', ')}.`);
    save();
    return { text: parts.join('\n\n'), todos: left.map((t) => t.id), chores: choresLeft.map((c) => c.id) };
  }
  // ---------- getting started: nudges and sprint pings ----------
  const startLine = (it) => `${it.first ? `Just ${it.first.replace(/^just /i, '')}` : 'Just do the first five minutes'}.`;
  /** Pings that help you start and keep going, for day k: [{ key, at (minutes), text }]. */
  function nudgesFor(k) {
    const out = [];
    const log = state.log[k] || {};
    for (const it of items(dayOf(k))) {
      if (log[it.id]) continue;
      const nudgeable = it.todoId || it.goalId || it.choreId || ['focus', 'tidy'].includes(it.essential) || (it.essential && /work|chores|exercise/.test(it.category));
      if (!nudgeable) continue;
      const t0 = toMin(it.time);
      if (state.settings.startNudge !== false) {
        out.push({ key: `n:${it.id}`, at: t0 + 10, text: `Started “${it.title}” yet? ${startLine(it)} Five minutes, then decide if you keep going.` });
      }
      if (state.settings.sprints !== false && (it.mins || 0) >= 50) {
        for (let m = 25; m + 5 < it.mins; m += 30) {
          out.push({ key: `b:${it.id}:${m}`, at: t0 + m, text: `25 minutes done on “${it.title}”. Take 5: stand up, drink some water, no phone.` });
          if (m + 30 <= it.mins) out.push({ key: `r:${it.id}:${m}`, at: t0 + m + 5, text: `Back in: the next 25 minutes on “${it.title}”.` });
        }
      }
    }
    return out;
  }
  /** For the phone's own schedule: nudges today and tomorrow. */
  function nudgeEvents() {
    const out = [];
    for (const k of [dateKey(), addDays(dateKey(), 1)]) {
      const d = dayOf(k);
      for (const n of nudgesFor(k)) {
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, n.at).getTime();
        if (at > Date.now()) out.push({ at, text: n.text });
      }
    }
    return out;
  }
  /** In the app: nudges whose time just came (each once). */
  function dueNudges() {
    const k = dateKey(), nm = nowMin();
    const sent = ((state.nudged ||= {})[k] ||= {});
    const out = [];
    for (const n of nudgesFor(k)) {
      if (sent[n.key] || n.at > nm) continue;
      sent[n.key] = true;
      if (nm - n.at <= 5) out.push(n.text); // missed ones (app was closed) were sent by the phone
    }
    return out;
  }
  /** Snoozing a planned to-do counts as putting it off. */
  function notePushed(itemId) {
    const t = state.todos.find((x) => `t:${x.id}` === itemId);
    if (t && !t.done) t.pushed = (t.pushed || 0) + 1;
  }

  /** For the phone's own schedule (fires even with the app closed). */
  function checkinEvents(days = 7) {
    if (!checkinOn()) return [];
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const k = dateKey(d);
      if (state.checkedIn[k]) continue;
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, checkinMin()).getTime();
      if (at > Date.now()) out.push({ at, text: ctx.plain() ? 'Evening check-in: let’s go over today and set up tomorrow.' : ctx.say('Evening check-in time, {name}. Come tell me how today went and I’ll set up tomorrow~') });
    }
    return out;
  }

  // ---------- chat without her AI ----------
  /** Plain-language commands about to-dos, plans and goals. Returns her lines, or null if it isn't one. */
  function handle(text) {
    const s = text.trim().replace(/[.!]+$/, '');
    let m;
    if (/^(?:plan|organi[sz]e|schedule) (?:out )?my (day|today|tomorrow)\b/i.test(s) || /^make (?:me )?a plan for (today|tomorrow)/i.test(s)) {
      const k = /tomorrow/i.test(s) ? addDays(dateKey(), 1) : dateKey();
      return planReply(k, true);
    }
    if (/^what(?:'s| is) (?:my |the )?plan(?: for (today|tomorrow))?\??$/i.test(s) || /^what(?:'s| is) on my (?:schedule|plan)/i.test(s)) {
      return planReply(/tomorrow/i.test(s) ? addDays(dateKey(), 1) : dateKey(), false);
    }
    if (/^(?:what(?:'s| is)|show(?: me)?) (?:on )?my to-?do(?: list)?|^my to-?do(?: list)?\??$|^what do i (?:need|have) to do/i.test(s)) {
      const open = openTodos();
      if (!open.length) return ['Your to-do list is empty. Tell me something like “I need to finish the edit by Friday” and I’ll plan it.'];
      return [`Your to-do list:\n${open.slice(0, 10).map((t) => `• ${t.title}${t.due ? ` (${dueLabel(t.due)})` : ''}${t.plan ? `, planned ${dayWord(t.plan.date)} ${fmtTime(t.plan.time)}` : ''}`).join('\n')}`];
    }
    if ((m = s.match(/^(?:add|put) (.+?) (?:to|on) my (?:to-?do|task)s?(?: list)?$/i)) || (m = s.match(/^(?:to-?do|task|add (?:a )?(?:to-?do|task))[:,]?\s+(.+)$/i))
      || (m = s.match(/^i (?:need|have|got|gotta|must)(?: to)? (.+?\b(?:by|before|due)\b.+)$/i))) {
      return addReply(m[1]);
    }
    if ((m = s.match(/^(?:i )?(?:finished|completed|done with|did|checked off|crossed off) (?:the |my )?(.+)$/i)) || (m = s.match(/^(?:mark|check off|cross off) (.+?)(?: as)? (?:done|complete|finished|off)?$/i))) {
      const todo = match(openTodos(), m[1]);
      if (todo.length === 1) { const r = completeTodo(todo[0]); return [ctx.say(`Crossed off: ${r.done} ✓ ${r.left ? `${r.left} left on your list.` : 'Your list is clear!'}`)]; }
    }
    if ((m = s.match(/^(?:delete|remove) (.+?) from my (?:to-?do|task)s?(?: list)?$/i))) {
      const r = deleteTodo(m[1]);
      return [r.ok ? `Removed “${r.deleted}” from your to-do list.` : r.choices && r.choices.length ? `Which one? ${r.choices.join(', ')}` : 'I couldn’t find that on your to-do list.'];
    }
    // "New goal: gym 4 times a week", "my goal is to read 3 times a week", "goal: save $200 a month"
    if ((m = s.match(/^(?:new goal|goal|add (?:a )?goal|set (?:a )?goal|my goal is(?: to)?|i want to)[:,]?\s+(.+?)\s+(\d+)\s*(?:x|times?)\s*(?:a|per|every|each)\s*(day|week|month)$/i))) {
      const r = addGoal({ title: m[1], times: Number(m[2]), per: m[3].toLowerCase() });
      return [`New goal: ${r.goal}, ${r.rhythm}. I'll plan the sessions into your days${r.next_session ? ` (first one ${r.next_session})` : ''} and check in on your streak.`];
    }
    if ((m = s.match(/^(?:new goal|goal|add (?:a )?goal|set (?:a )?goal|my goal is(?: to)?|i want to)[:,]?\s+(.+?)\s+(?:every ?day|daily)$/i))) {
      const r = addGoal({ title: m[1], times: 1, per: 'day' });
      return [`New daily goal: ${r.goal}. I'll fit it into each day${r.next_session ? ` (today at ${r.next_session.replace('today at ', '')})` : ''}.`];
    }
    if ((m = s.match(/^(?:new goal|goal|add (?:a )?goal|set (?:a )?goal|my goal is(?: to)?|i want to)[:,]?\s+(save|earn|make|read|run|walk|study|post|lose)\s+\$?(\d+(?:\.\d+)?)\s*([a-z$]*)\s*(?:a|per|every|each)\s*(week|month|day)$/i))) {
      const unit = /\$/.test(s) ? '$' : m[3] || '';
      const r = addGoal({ title: `${m[1]} ${unit === '$' ? '$' : ''}${m[2]}${unit && unit !== '$' ? ` ${unit}` : ''} a ${m[4]}`, kind: 'amount', target: Number(m[2]), unit, per: m[4].toLowerCase() });
      return [`New goal: ${r.goal}. Tell me as you go (“I saved $50”) and I'll keep track.`];
    }
    // Chores: "I did the dishes", "washed the dishes", "cleaned the bathroom", "took out the trash"
    if (state.chores.length && /\b(did|done|washed|cleaned|finished|took out|vacuumed|swept|changed|wiped|folded|deep cleaned)\b/i.test(s)) {
      const hits = match(state.chores.map((c) => ({ id: c.id, title: `${choreTitle(c)} ${c.title}` })), s.replace(/\b(i|just|did|done|finished|today|the|my)\b/gi, ''));
      if (hits.length === 1) {
        const r = choreDone(state.chores.find((c) => c.id === hits[0].id));
        if (r.ok) return [ctx.say(`${r.done} ✓${r.was_overdue_days ? ` (it was ${r.was_overdue_days} day${r.was_overdue_days === 1 ? '' : 's'} overdue, so that's a real win)` : ''}. Next one ${r.next}.`)];
      }
    }
    if ((m = s.match(/^(?:add (?:a )?chore|new chore|chore)[:,]?\s+(.+?)(?:\s+every\s+(\d+)?\s*(day|days|week|weeks))?$/i))) {
      const n = Number(m[2]) || 1, unit = (m[3] || 'week').toLowerCase();
      const r = addChore({ title: m[1], every: /week/.test(unit) ? n * 7 : n });
      return [`New chore: ${r.chore}, every ${r.every} day${r.every === 1 ? '' : 's'}.${r.planned ? ` First one ${r.planned}.` : ''} I'll keep track and keep it on your plan until it's done.`];
    }
    if (/^(?:what|which) chores|^my chores|^chores\??$/i.test(s)) {
      if (!state.chores.length) return ['No chores yet. Open Plan → Chores and tap “Starter chores”, or say “add chore dishes every day”.'];
      return [`Your chores:\n${state.chores.map((c) => `• ${choreTitle(c)}: ${choreStatus(c)}`).join('\n')}`];
    }
    // "I went to the gym", "did my workout", "I saved $50", "read 20 pages"
    if (state.goals.length && /\b(went|did|done|finished|completed|hit|worked out|saved|read|ran|walked|studied|posted|made|earned|practiced|practised)\b/i.test(s)) {
      const amount = (s.match(/\$?(\d+(?:\.\d+)?)/) || [])[1];
      const hits = match(state.goals, s.replace(/\b(went|did|done|finished|completed|hit|today|just)\b/gi, ''));
      const byVerb = hits.length ? hits : state.goals.filter((g) => (/\bsav/i.test(s) && /sav/i.test(g.title)) || (/worked out|workout/i.test(s) && /gym|work ?out|exercise|lift/i.test(g.title)));
      if (byVerb.length === 1) {
        const g = byVerb[0];
        const r = logGoal(g, g.kind === 'amount' ? amount : null);
        if (r.ok) return [ctx.say(`${r.met ? 'Goal reached' : 'Logged'}: ${r.goal}, ${r.progress}.${r.streak > 1 ? ` That's a ${r.streak}-${g.per} streak.` : ''}`)];
      }
    }
    return null;
  }
  function addReply(raw) {
    let { due, rest } = parseDue(raw);
    const mm = parseMins(rest);
    rest = mm.rest.replace(/\b(?:by|before|due)\s*$/i, '').trim();
    const high = /\b(important|urgent|asap|!)\b/i.test(rest) || /!$/.test(raw);
    rest = rest.replace(/\b(?:it's |its )?(important|urgent|asap)\b/gi, '').replace(/!+/g, '').trim();
    const r = addTodo({ title: rest, due, mins: mm.mins, priority: high ? 'high' : 'normal' });
    if (!r.ok) return ['What should I put on your list?'];
    return [ctx.say(`Added to your to-do list: ${r.todo.title}${due ? ` (${dueLabel(due)})` : ''}. ${r.planned ? `I set time aside ${r.planned}.` : 'No free time for it soon, so it waits on your list for now.'}`)];
  }

  // ---------- Plan tab: To-do and Goals panes ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render() {
    if ($('#chores-pane') && !$('#chores-pane').hidden) renderChores();
    if ($('#todo-pane') && !$('#todo-pane').hidden) renderTodos();
    if ($('#goals-pane') && !$('#goals-pane').hidden) renderGoals();
  }
  function renderTodos() {
    const box = $('#todo-list');
    box.textContent = '';
    const k = dateKey();
    const open = openTodos().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.priority === 'high') - (a.priority === 'high') || a.created - b.created);
    const groups = [
      ['Overdue', open.filter((t) => t.due && t.due < k)],
      ['Today', open.filter((t) => (t.due === k) || (!(t.due && t.due < k) && t.plan && t.plan.date === k))],
      ['Coming up', open.filter((t) => t.due && t.due > k && !(t.plan && t.plan.date === k))],
      ['No deadline', open.filter((t) => !t.due && !(t.plan && t.plan.date === k))],
    ];
    $('#todo-count').textContent = open.length ? `${open.length} open` : 'All clear';
    if (!open.length) {
      const empty = el('div', 'empty-state');
      empty.innerHTML = '<div class="empty-ic">✓</div><b></b><p></p>';
      empty.querySelector('b').textContent = 'Nothing on your list';
      empty.querySelector('p').textContent = 'Add things above, or just tell her: “I need to finish the edit by Friday”. She fits them into your free time.';
      box.append(empty);
    }
    for (const [name, list] of groups) {
      if (!list.length) continue;
      const sec = el('section', 'group');
      const h = el('h3', 'group-title');
      h.innerHTML = '<span></span><span class="count"></span>';
      h.firstChild.textContent = name;
      h.lastChild.textContent = String(list.length);
      const card = el('div', 'list-card');
      for (const t of list) card.append(todoRow(t));
      sec.append(h, card);
      box.append(sec);
    }
    const done = state.todos.filter((t) => t.done).sort((a, b) => b.doneAt - a.doneAt).slice(0, 8);
    if (done.length) {
      const det = el('details', 'todo-done');
      det.append(el('summary', '', `Done (${state.todos.filter((t) => t.done).length})`));
      const card = el('div', 'list-card');
      for (const t of done) card.append(todoRow(t));
      det.append(card);
      box.append(det);
    }
  }
  function todoRow(t) {
    const row = el('div', `row-item todo-row${t.done ? ' done' : ''}`);
    row.dataset.todo = t.id;
    row.innerHTML = `<button type="button" class="check" aria-label="">✓</button><div class="ri-main"><div class="ri-title"></div><div class="ri-meta"></div></div>`;
    row.querySelector('.check').setAttribute('aria-label', t.done ? `Undo ${t.title}` : `Mark ${t.title} done`);
    row.querySelector('.ri-title').textContent = t.title;
    const meta = row.querySelector('.ri-meta');
    const add = (text, cls) => meta.append(el('span', cls || '', text));
    if (t.priority === 'high' && !t.done) add('Important', 'tag-chip flag warn');
    if ((t.pushed || 0) >= 1 && !t.done) add(`Pushed ${t.pushed}×`, 'tag-chip flag warn');
    if (t.due && !t.done) add(dueLabel(t.due), t.due < dateKey() ? 'tag-chip flag warn' : 'ri-sub');
    if (t.plan && !t.done) add(`⏱ ${dayWord(t.plan.date)} ${fmtTime(t.plan.time)}`, 'tag-chip plan');
    else if (!t.done) add('not planned yet', 'ri-sub');
    if (!t.done) add(t.mins >= 60 ? `${t.mins / 60}h` : `${t.mins}m`, 'ri-sub');
    if (t.done && t.doneAt) add(`done ${new Date(t.doneAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, 'ri-sub');
    return row;
  }
  function renderGoals() {
    const box = $('#goal-list');
    box.textContent = '';
    if (!state.goals.length) {
      const empty = el('div', 'empty-state');
      empty.innerHTML = '<div class="empty-ic">🎯</div><b></b><p></p>';
      empty.querySelector('b').textContent = 'No goals yet';
      empty.querySelector('p').textContent = 'Add one, or tell her: “New goal: gym 4 times a week” or “Goal: save $200 a month”. She plans the sessions and keeps your streak.';
      box.append(empty);
      return;
    }
    for (const g of state.goals) {
      const p = progress(g), st = streak(g);
      const card = el('div', 'card goal-card');
      card.dataset.goal = g.id;
      const top = el('div', 'goal-top');
      const title = el('b', 'goal-title', g.title);
      const sub = el('span', 'goal-sub', g.kind === 'amount' ? `Goal ${unitFmt(g, g.target)} per ${g.per}` : `${g.times}× per ${g.per}${g.time ? ` · around ${fmtTime(g.time)}` : ''}`);
      const left = el('div');
      left.append(title, sub);
      const streakEl = el('span', 'goal-streak', st ? `🔥 ${st}` : '');
      streakEl.title = st ? `${st} ${g.per}${st === 1 ? '' : 's'} in a row` : '';
      top.append(left, streakEl);
      const bar = el('div', 'goal-bar');
      const fill = el('i');
      fill.style.width = `${Math.min(100, p.need ? (p.n / p.need) * 100 : 0)}%`;
      bar.append(fill);
      const foot = el('div', 'goal-foot');
      foot.append(el('span', p.met ? 'goal-met' : 'muted small', `${progressText(g)}${p.met ? ' ✓' : ''}`));
      const today = g.plans && g.plans[dateKey()];
      if (today && !(state.log[dateKey()] || {})[`g:${g.id}`]) foot.append(el('span', 'tag-chip plan', `⏱ today ${fmtTime(today)}`));
      const btn = el('button', 'btn-primary sm', g.kind === 'amount' ? '+ Add' : '+1 Done');
      btn.type = 'button';
      btn.dataset.log = g.id;
      foot.append(btn);
      card.append(top, bar, foot);
      box.append(card);
    }
  }

  // To-do dialog
  const tdlg = $('#todo-dlg'), tf = $('#todo-form');
  let editing = null;
  function openTodo(t) {
    editing = t || null;
    tf.reset();
    $('#todo-dlg-title').textContent = t ? 'Edit to-do' : 'New to-do';
    tf.elements.title.value = t ? t.title : '';
    tf.elements.due.value = t && t.due ? t.due : '';
    tf.elements.mins.value = String(t ? t.mins : 30);
    if (!tf.elements.mins.value) tf.elements.mins.value = '30';
    tf.elements.priority.checked = !!(t && t.priority === 'high');
    tf.elements.notes.value = t ? t.notes || '' : '';
    tf.elements.first.value = t ? t.first || '' : '';
    $('#todo-delete').hidden = !t;
    $('#todo-plan-info').textContent = t && t.plan && !t.done ? `Planned ${dayWord(t.plan.date)} at ${fmtTime(t.plan.time)}.` : '';
    tdlg.showModal();
  }
  tf.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { title: tf.elements.title.value.trim(), due: tf.elements.due.value || null, mins: Number(tf.elements.mins.value) || 30, priority: tf.elements.priority.checked ? 'high' : 'normal', notes: tf.elements.notes.value.trim(), first: tf.elements.first.value.trim().replace(/[.]+$/, '') };
    if (!data.title) return;
    if (editing) {
      const replanNeeded = editing.mins !== data.mins || editing.due !== data.due;
      Object.assign(editing, data);
      if (replanNeeded && !editing.done && editing.plan && editing.plan.date >= dateKey()) { editing.plan = null; planDay(dateKey()); if (!editing.plan) planDay(addDays(dateKey(), 1)); }
      changed();
    } else addTodo(data);
    tdlg.close();
  });
  $('#todo-cancel').addEventListener('click', () => tdlg.close());
  $('#todo-delete').addEventListener('click', async () => {
    if (!editing || !(await ctx.ask(`Delete “${editing.title}”?`))) return;
    deleteTodo(editing);
    tdlg.close();
  });
  $('#todo-quick').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#todo-quick-text');
    const text = input.value.trim();
    if (!text) { openTodo(null); return; }
    const [line] = addReply(text);
    input.value = '';
    ctx.toast(line);
  });
  $('#todo-plan-day').addEventListener('click', () => {
    const lines = planReply(dateKey(), true);
    ctx.toast(lines[0].split('\n').length > 1 ? `Planned: ${lines[0].split('\n').slice(1, 4).map((l) => l.replace('• ', '')).join(', ')}` : lines[0]);
  });
  $('#todo-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-todo]');
    if (!row) return;
    const t = state.todos.find((x) => x.id === row.dataset.todo);
    if (!t) return;
    if (e.target.closest('.check')) {
      if (t.done) {
        t.done = false; t.doneAt = 0; t.doneVia = '';
        if (t.plan && state.log[t.plan.date]) delete state.log[t.plan.date][`t:${t.id}`];
        changed();
      } else {
        completeTodo(t);
        ctx.celebrateSmall && ctx.celebrateSmall();
      }
      return;
    }
    openTodo(t);
  });

  // ---------- Chores pane ----------
  function renderChores() {
    const box = $('#chore-list');
    if (!box) return;
    box.textContent = '';
    $('#chore-starter').hidden = state.chores.length > 0;
    if (!state.chores.length) {
      const empty = el('div', 'empty-state');
      empty.innerHTML = '<div class="empty-ic">🧽</div><b></b><p></p>';
      empty.querySelector('b').textContent = 'No chores yet';
      empty.querySelector('p').textContent = 'Tap “Starter chores” for dishes, trash, bathroom, laundry, a rotating deep clean and more. She plans them into your days and keeps overdue ones on your plan until they’re done.';
      box.append(empty);
      return;
    }
    const sorted = state.chores.slice().sort((a, b) => overdueOn(b) - overdueOn(a));
    const card = el('div', 'list-card');
    for (const c of sorted) {
      const o = overdueOn(c);
      const row = el('div', `row-item chore-row${o > 0 ? ' overdue' : ''}`);
      row.dataset.chore = c.id;
      row.innerHTML = '<button type="button" class="check" aria-label="">✓</button><div class="ri-main"><div class="ri-title"></div><div class="ri-meta"></div></div>';
      row.querySelector('.check').setAttribute('aria-label', `Mark ${choreTitle(c)} done`);
      row.querySelector('.ri-title').textContent = choreTitle(c);
      const meta = row.querySelector('.ri-meta');
      const add = (text, cls) => meta.append(el('span', cls || '', text));
      add(choreStatus(c), o > 0 ? 'tag-chip flag warn' : o === 0 ? 'tag-chip plan' : 'ri-sub');
      if ((c.pushed || 0) >= 1) add(`Pushed ${c.pushed}×`, 'tag-chip flag warn');
      const tm = c.plans && c.plans[dateKey()];
      if (tm && c.last !== dateKey()) add(`⏱ today ${fmtTime(tm)}`, 'tag-chip plan');
      add(`every ${c.every === 1 ? 'day' : c.every === 7 ? 'week' : c.every === 14 ? '2 weeks' : `${c.every} days`} · ${c.mins}m`, 'ri-sub');
      if (c.last) add(c.last === dateKey() ? 'done today ✓' : `last done ${dayOf(c.last).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, 'ri-sub');
      card.append(row);
    }
    box.append(card);
  }
  const cdlg = $('#chore-dlg'), cf = $('#chore-form');
  let editingChore = null;
  function openChore(c) {
    editingChore = c || null;
    cf.reset();
    $('#chore-dlg-title').textContent = c ? 'Edit chore' : 'New chore';
    cf.elements.title.value = c ? c.title : '';
    cf.elements.every.value = String(c ? c.every : 7);
    if (!cf.elements.every.value) cf.elements.every.value = '7';
    cf.elements.mins.value = String(c ? c.mins : 15);
    if (!cf.elements.mins.value) cf.elements.mins.value = '15';
    cf.elements.first.value = c ? c.first || '' : '';
    cf.elements.time.value = c && c.time ? c.time : '';
    $('#chore-delete').hidden = !c;
    cdlg.showModal();
  }
  cf.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { title: cf.elements.title.value.trim(), every: Number(cf.elements.every.value) || 7, mins: Number(cf.elements.mins.value) || 15, first: cf.elements.first.value.trim().replace(/[.]+$/, ''), time: cf.elements.time.value || '' };
    if (!data.title) return;
    const dueNow = cf.elements.dueNow.checked;
    if (editingChore && dueNow) { editingChore.last = null; editingChore.firstDue = dateKey(); } // overdue in real life: on today's plan
    if (editingChore) {
      Object.assign(editingChore, data);
      const k = dateKey();
      if (editingChore.plans && editingChore.plans[k] && !(state.log[k] || {})[`c:${editingChore.id}`]) delete editingChore.plans[k];
      planDay(k);
      changed();
    } else {
      addChore(data); // new chores are due right away
    }
    cdlg.close();
  });
  $('#chore-cancel').addEventListener('click', () => cdlg.close());
  $('#chore-delete').addEventListener('click', async () => {
    if (!editingChore || !(await ctx.ask(`Delete the chore “${editingChore.title}”?`))) return;
    deleteChore(editingChore);
    cdlg.close();
  });
  $('#chore-add').addEventListener('click', () => openChore(null));
  $('#chore-starter').addEventListener('click', () => {
    for (const pr of CHORE_PRESETS) {
      if (state.chores.some((c) => c.title.toLowerCase() === pr.title.toLowerCase())) continue;
      state.chores.push({ id: uid(), ...pr, zones: pr.zones ? pr.zones.slice() : undefined, zone: 0, last: null, pushed: 0, plans: {} });
    }
    // Spread the first round out: only the daily ones are due right away.
    for (const c of state.chores) if (!c.last && !c.firstDue && c.every > 1) c.firstDue = addDays(dateKey(), Math.ceil(c.every / 2));
    planDay(dateKey());
    changed();
    ctx.toast('Starter chores added. Edit or delete any that don’t fit; daily ones start today, the rest are spread over the coming days.');
  });
  $('#chore-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-chore]');
    if (!row) return;
    const c = state.chores.find((x) => x.id === row.dataset.chore);
    if (!c) return;
    if (e.target.closest('.check')) {
      if (c.last === dateKey()) return;
      const r = choreDone(c);
      ctx.toast(`${r.done} ✓${r.was_overdue_days ? ` (was ${r.was_overdue_days} day${r.was_overdue_days === 1 ? '' : 's'} overdue)` : ''}`);
      ctx.celebrateSmall && ctx.celebrateSmall();
      return;
    }
    openChore(c);
  });

  // Goal dialog
  const gdlg = $('#goal-dlg'), gf = $('#goal-form');
  let editingGoal = null;
  function kindShown() {
    const amount = gf.elements.kind.value === 'amount';
    $('#goal-times-row').hidden = amount;
    $('#goal-amount-row').hidden = !amount;
    $('#goal-session-row').hidden = amount;
  }
  function openGoal(g) {
    editingGoal = g || null;
    gf.reset();
    $('#goal-dlg-title').textContent = g ? 'Edit goal' : 'New goal';
    gf.elements.title.value = g ? g.title : '';
    gf.elements.kind.value = g ? g.kind : 'times';
    gf.elements.times.value = String(g ? g.times : 3);
    gf.elements.per.value = g ? g.per : 'week';
    gf.elements.target.value = g && g.target ? String(g.target) : '';
    gf.elements.unit.value = g ? g.unit || '' : '';
    gf.elements.time.value = g && g.time ? g.time : '';
    gf.elements.mins.value = String(g ? g.mins || 45 : 45);
    $('#goal-delete').hidden = !g;
    kindShown();
    gdlg.showModal();
  }
  gf.elements.kind.addEventListener('change', kindShown);
  gf.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: gf.elements.title.value.trim(), kind: gf.elements.kind.value, times: Number(gf.elements.times.value) || 1, per: gf.elements.per.value,
      target: Number(gf.elements.target.value) || 0, unit: gf.elements.unit.value.trim(), time: gf.elements.time.value || '', mins: Number(gf.elements.mins.value) || 45,
    };
    if (!data.title) return;
    if (editingGoal) {
      Object.assign(editingGoal, data, { sessions: data.kind !== 'amount' });
      if (editingGoal.plans) { const k = dateKey(); if (editingGoal.plans[k] && !(state.log[k] || {})[`g:${editingGoal.id}`]) delete editingGoal.plans[k]; }
      planDay(dateKey());
      changed();
    } else addGoal(data);
    gdlg.close();
  });
  $('#goal-cancel').addEventListener('click', () => gdlg.close());
  $('#goal-delete').addEventListener('click', async () => {
    if (!editingGoal || !(await ctx.ask(`Delete the goal “${editingGoal.title}”? Its history goes too.`))) return;
    deleteGoal(editingGoal);
    gdlg.close();
  });
  $('#goal-add').addEventListener('click', () => openGoal(null));
  $('#goal-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-log]');
    if (b) {
      const g = state.goals.find((x) => x.id === b.dataset.log);
      if (!g) return;
      let amount = null;
      if (g.kind === 'amount') {
        amount = await ctx.prompt(`How much toward “${g.title}”?${g.unit ? ` (${g.unit})` : ''}`);
        if (!amount || !Number(amount)) return;
      }
      const r = logGoal(g, amount);
      ctx.toast(`${r.goal}: ${r.progress}${r.met ? ' ✓' : ''}`);
      if (r.met) ctx.celebrateSmall && ctx.celebrateSmall();
      return;
    }
    const card = e.target.closest('[data-goal]');
    if (card) openGoal(state.goals.find((x) => x.id === card.dataset.goal));
  });

  return {
    openTodo: (id) => openTodo(state.todos.find((t) => t.id === id) || null),
    openGoal: (id) => openGoal(state.goals.find((g) => g.id === id) || null),
    items, planDay, autoPlan, syncDone, addTodo, completeTodo, deleteTodo, addGoal, logGoal, deleteGoal, handle, addReply,
    planReply, planDayAI, brief, morningLine, summary, checkIn, checkinMin, checkinOn, checkinEvents, render, renderTodos, renderGoals,
    nudgeEvents, dueNudges, notePushed, rankOf,
    addChore, choreDone, deleteChore, renderChores, openChore: (id) => openChore(state.chores.find((c) => c.id === id) || null), choreTitle, overdueOn,
    parseDue, progress, streak, openTodos, match, dayWord, ESSENTIALS, DEFAULT_ESSENTIALS, dayPlanned: (k = dateKey()) => !!state.dayPlans[k],
    restore(kind, item) { if (kind === 'todo') { state.todos.push(item); changed(); return true; } return false; },
  };
};
