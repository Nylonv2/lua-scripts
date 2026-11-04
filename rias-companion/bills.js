/* Bills & subscriptions: what you pay, when it's due, what it costs a month, and help cancelling.
   Rias can't log into anyone's account, so cancelling is: open the right page (or draft the email),
   you do the last tap, then mark it cancelled. Pay-by and cancel-before-it-renews tasks land on the plan.
   window.createBills(ctx) → { items(d), sync(), render(), add(), cancelHelp(), summary(), handle(text) } */
window.createBills = function createBills(ctx) {
  const { state, save, $, dateKey, uid, fmtTime } = ctx;
  state.bills ||= [];
  const today = () => dateKey();
  const dayOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = dayOf(k); d.setDate(d.getDate() + n); return dateKey(d); };
  const CYCLES = { week: 'week', month: 'month', quarter: '3 months', year: 'year' };
  const PER_MONTH = { week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 };
  function addCycle(k, cycle) {
    const d = dayOf(k);
    if (cycle === 'week') d.setDate(d.getDate() + 7);
    else {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + (cycle === 'year' ? 12 : cycle === 'quarter' ? 3 : 1));
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); // Jan 31 → Feb 28
    }
    return dateKey(d);
  }
  const money = (n) => (Number(n) || 0).toLocaleString(undefined, { style: 'currency', currency: state.settings.currency || 'USD' });
  const monthly = (b) => (Number(b.amount) || 0) * (PER_MONTH[b.cycle] || 1);
  const short = (k) => dayOf(k).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const daysTo = (k) => Math.round((dayOf(k) - dayOf(today())) / 86400000);
  const when = (k) => { const n = daysTo(k); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${-n} days ago` : n < 7 ? dayOf(k).toLocaleDateString([], { weekday: 'long' }) : short(k); };
  const active = () => state.bills.filter((b) => b.status !== 'cancelled');

  // ---------- where to cancel (official account / cancel pages) ----------
  const PLAY = 'https://play.google.com/store/account/subscriptions';
  const DIRECTORY = [
    [/netflix/i, 'https://www.netflix.com/cancelplan'],
    [/spotify/i, 'https://www.spotify.com/account/subscription/'],
    [/youtube|yt premium|yt tv/i, 'https://www.youtube.com/paid_memberships'],
    [/disney/i, 'https://www.disneyplus.com/account/subscription'],
    [/hulu/i, 'https://secure.hulu.com/account'],
    [/paramount/i, 'https://www.paramountplus.com/account/'],
    [/peacock/i, 'https://www.peacocktv.com/account/plans'],
    [/prime|amazon/i, 'https://www.amazon.com/gp/primecentral'],
    [/audible/i, 'https://www.audible.com/account/overview'],
    [/apple|icloud/i, 'https://apps.apple.com/account/subscriptions'],
    [/google one/i, 'https://one.google.com/settings'],
    [/claude|anthropic/i, 'https://claude.ai/settings/billing'],
    [/adobe/i, 'https://account.adobe.com/plans'],
    [/xbox|game pass|microsoft|office|365/i, 'https://account.microsoft.com/services'],
    [/nintendo/i, 'https://ec.nintendo.com/my/membership'],
    [/iracing/i, 'https://members.iracing.com/membersite/account/MyInfo.do'],
    [/coach dave|delta/i, 'https://coachdaveacademy.com/my-account/'],
    [/crunchyroll/i, 'https://www.crunchyroll.com/account/membership'],
    [/twitch/i, 'https://www.twitch.tv/subscriptions'],
    [/patreon/i, 'https://www.patreon.com/settings/memberships'],
  ];
  // Ones you cancel inside their own app.
  const IN_APP = [
    [/uber/i, 'Open the Uber app → Account → Uber One → Manage membership → End membership.'],
    [/floatme/i, 'Open the FloatMe app → Account/Settings → Membership → Cancel (or contact support in the app).'],
    [/flex/i, 'Open the Flex app → Account → Membership. Rent still has to be paid another way after you leave Flex.'],
    [/dave/i, 'Open the Dave app → Settings → Manage membership → Cancel (pay off any ExtraCash first).'],
    [/brigit/i, 'Open the Brigit app → Profile → Plan → Cancel (any advance has to be repaid first).'],
    [/doordash|dashpass/i, 'Open DoorDash → Account → DashPass → End subscription.'],
    [/xfinity|comcast/i, 'Xfinity cancels by chat or phone: open the Xfinity app → Chat, or call 1-800-934-6489. Return any equipment.'],
  ];
  const cancelUrl = (b) => b.cancelUrl || (DIRECTORY.find(([re]) => re.test(b.name)) || [])[1] || '';
  const inAppHow = (b) => (IN_APP.find(([re]) => re.test(b.name)) || [])[1] || '';

  // ---------- keep dates moving ----------
  function roll() {
    const k = today();
    let changed = false;
    for (const b of state.bills) {
      if (!b.next || !/^\d{4}-\d{2}-\d{2}$/.test(b.next)) continue;
      if (b.status === 'cancelling' && b.next < k) { b.status = 'active'; changed = true; } // it renewed before it got cancelled
      if (b.status === 'cancelled') continue;
      let guard = 0;
      while (b.next < k && (b.autopay || (b.paid || {})[b.next]) && guard++ < 60) { b.next = addCycle(b.next, b.cycle); changed = true; }
    }
    if (changed) save();
  }
  /** Ticking a "Pay …" or "Cancel … before it renews" item on the plan. */
  function sync() {
    roll();
    let changed = false;
    for (const b of state.bills) {
      for (const [k, log] of Object.entries(state.log || {})) {
        if (log[`b:${b.id}:${b.next}`] === 'done') { markPaid(b, true); changed = true; break; }
        if (log[`x:${b.id}:${b.next}`] === 'done' && b.status !== 'cancelled') { markCancelled(b, b.next, true); changed = true; break; }
        void k;
      }
    }
    if (changed) { save(); render(); }
  }
  function markPaid(b, quiet) {
    (b.paid ||= {})[b.next] = true;
    b.next = addCycle(b.next, b.cycle);
    if (!quiet) { save(); ctx.refresh && ctx.refresh(); render(); }
  }
  function markCancelled(b, endsOn, quiet) {
    b.status = 'cancelled';
    b.endsOn = endsOn || b.next || today();
    b.cancelledOn = today();
    if (!quiet) { save(); ctx.refresh && ctx.refresh(); render(); }
  }

  // ---------- on the plan ----------
  function items(d) {
    const k = dateKey(d), t = today();
    const out = [];
    for (const b of state.bills) {
      if (!b.next) continue;
      if (b.status === 'cancelling') {
        // Cancel two days before it renews (or today if that's already passed).
        const day = addDays(b.next, -2) < t ? (k === t && b.next >= t ? t : null) : addDays(b.next, -2);
        if (day === k) out.push({ id: `x:${b.id}:${b.next}`, time: '18:30', title: `Cancel ${b.name} before it renews ${when(b.next)}`, category: 'money', source: 'plan', billId: b.id, mins: 10,
          first: inAppHow(b) ? inAppHow(b).split('→')[0].trim().toLowerCase() : 'open the cancel page (Tools → Bills & subscriptions)' });
        continue;
      }
      if (b.status !== 'active' || b.autopay) continue;
      // Pay-by: from two days before it's due; if it's late it stays on today until it's paid.
      const shows = (k >= addDays(b.next, -2) && k <= b.next && k >= t) || (k === t && b.next < t);
      if (shows) out.push({ id: `b:${b.id}:${b.next}`, time: '19:00', title: `Pay ${b.name} (${money(b.amount)})${b.next < t ? ' · late' : b.next === k ? ' · due today' : ` · due ${when(b.next)}`}`, category: 'money', source: 'plan', billId: b.id, mins: 5, first: 'open the app or site and pay it' });
    }
    return out;
  }

  // ---------- add / edit / import ----------
  function add({ name, amount, cycle = 'month', next = '', kind = 'sub', autopay = null, notes = '' }) {
    name = String(name || '').trim();
    if (!name) return { error: 'no name' };
    const b = { id: uid(), name: name[0].toUpperCase() + name.slice(1), amount: Math.round((Number(String(amount).replace(/[^0-9.]/g, '')) || 0) * 100) / 100,
      cycle: CYCLES[cycle] ? cycle : 'month', next: /^\d{4}-\d{2}-\d{2}$/.test(next || '') ? next : '', kind: kind === 'bill' ? 'bill' : 'sub',
      autopay: autopay == null ? kind !== 'bill' : !!autopay, status: 'active', paid: {}, notes: String(notes || ''), created: Date.now() };
    state.bills.push(b);
    roll();
    save();
    render();
    return { ok: true, bill: b };
  }
  /** "Netflix | 15.49 | month | 2026-11-12 | sub | autopay" (one per line; extra fields optional). */
  function importText(text) {
    let n = 0;
    for (const raw of String(text || '').split(/\n+/)) {
      const line = raw.trim().replace(/^[-•*]\s*/, '');
      if (!line || /^#/.test(line)) continue;
      const p = line.split(/\s*[|;\t]\s*/);
      if (p.length < 2) continue;
      const [name, amount, cycle = 'month', next = '', kind = 'sub', pay = ''] = p;
      const cyc = /week/i.test(cycle) ? 'week' : /year|annual/i.test(cycle) ? 'year' : /quarter|3 ?mo/i.test(cycle) ? 'quarter' : 'month';
      const status = /cancel/i.test(pay) ? 'cancelled' : 'active';
      if (state.bills.some((b) => b.name.toLowerCase() === name.trim().toLowerCase())) continue;
      const r = add({ name, amount, cycle: cyc, next: next.trim(), kind: /bill|rent|util|internet|phone/i.test(kind) ? 'bill' : 'sub', autopay: !/manual|pay myself|no auto/i.test(pay) });
      if (r.ok) { if (status === 'cancelled') { markCancelled(r.bill, next.trim() || today(), true); delete r.bill.cancelledOn; } n++; } // cancelled before it was tracked: not counted as savings
    }
    save();
    render();
    return n;
  }

  // ---------- the screen ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render() {
    const box = $('#bills-list');
    if (!box) return;
    roll();
    const act = active();
    const total = act.reduce((sum, b) => sum + monthly(b), 0);
    const saving = state.bills.filter((b) => b.status === 'cancelled' && b.cancelledOn).reduce((s, b) => s + monthly(b), 0);
    $('#bills-month').textContent = money(total);
    $('#bills-year').textContent = `${money(total * 12)} a year · ${act.length} active`;
    const upcoming = act.filter((b) => b.next).sort((a, b) => a.next.localeCompare(b.next))[0];
    $('#bills-next').textContent = upcoming ? `Next: ${upcoming.name} ${money(upcoming.amount)} ${when(upcoming.next)}` : 'Add what you pay for and she keeps track.';
    $('#bills-saving').hidden = !saving;
    $('#bills-saving').textContent = `Saving ${money(saving)} a month from what you cancelled`;
    box.textContent = '';
    const t = today();
    const soon = act.filter((b) => b.next && daysTo(b.next) <= 7).sort((a, b) => a.next.localeCompare(b.next));
    const groups = [
      ['Coming up (7 days)', soon],
      ['Bills', act.filter((b) => b.kind === 'bill' && !soon.includes(b))],
      ['Subscriptions', act.filter((b) => b.kind !== 'bill' && !soon.includes(b))],
      ['Cancelled', state.bills.filter((b) => b.status === 'cancelled')],
    ];
    if (!state.bills.length) {
      const e = el('div', 'empty-state');
      e.innerHTML = '<div class="empty-ic">💳</div><b>Nothing tracked yet</b><p>Add your rent, phone, streaming and other subscriptions, or paste a list with Import. She shows what\'s due and helps you cancel what you don\'t use.</p>';
      box.append(e);
      return;
    }
    for (const [title, list] of groups) {
      if (!list.length) continue;
      const h = el('div', 'group-title'); h.append(el('span', '', title)); box.append(h);
      const card = el('div', 'list-card');
      for (const b of list.sort((a, c) => (a.next || '9').localeCompare(c.next || '9'))) {
        const row = el('button', 'row-item bill-row');
        row.type = 'button';
        row.dataset.bill = b.id;
        const late = b.status === 'active' && !b.autopay && b.next && b.next < t;
        const main = el('div', 'ri-main');
        main.append(el('div', 'ri-title', b.name));
        const meta = el('div', 'ri-meta');
        const add_ = (text, cls) => meta.append(el('span', cls || '', text));
        if (b.status === 'cancelled') add_(b.endsOn && b.endsOn >= t ? `Access until ${short(b.endsOn)}` : `Ended ${b.endsOn ? short(b.endsOn) : ''}`, 'ri-sub');
        else {
          add_(b.next ? `${b.autopay ? (b.kind === 'bill' ? 'Autopay' : 'Renews') : 'Due'} ${when(b.next)}` : 'No date yet', late ? 'tag-chip flag warn' : 'ri-sub');
          if (b.status === 'cancelling') add_('Cancel before it renews', 'tag-chip flag warn');
          if (late) add_('Late', 'tag-chip flag warn');
        }
        const amt = el('div', 'bill-amt');
        amt.append(el('b', '', money(b.amount)), el('small', '', `/${b.cycle === 'quarter' ? '3 mo' : b.cycle === 'month' ? 'mo' : b.cycle === 'year' ? 'yr' : 'wk'}`));
        main.append(meta);
        row.append(main, amt);
        card.append(row);
      }
      box.append(card);
    }
  }

  // ---------- dialogs ----------
  const dlg = $('#bill-dlg'), f = $('#bill-form');
  let editing = null;
  function open(b) {
    editing = b || null;
    f.reset();
    $('#bill-dlg-title').textContent = b ? b.name : 'Add a bill or subscription';
    f.elements.name.value = b ? b.name : '';
    f.elements.amount.value = b ? String(b.amount || '') : '';
    f.elements.cycle.value = b ? b.cycle : 'month';
    f.elements.next.value = b ? b.next || '' : '';
    f.elements.kind.value = b ? b.kind : 'sub';
    f.elements.autopay.checked = b ? !!b.autopay : true;
    f.elements.notes.value = b ? b.notes || '' : '';
    $('#bill-delete').hidden = !b;
    $('#bill-cancel-help').hidden = !b || b.status === 'cancelled';
    $('#bill-paid').hidden = !b || b.status !== 'active' || b.autopay || !b.next;
    $('#bill-restart').hidden = !b || b.status !== 'cancelled';
    dlg.showModal();
  }
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { name: f.elements.name.value.trim(), amount: f.elements.amount.value, cycle: f.elements.cycle.value, next: f.elements.next.value, kind: f.elements.kind.value, autopay: f.elements.autopay.checked, notes: f.elements.notes.value.trim() };
    if (!data.name) return;
    if (editing) {
      Object.assign(editing, { ...data, amount: Math.round((Number(String(data.amount).replace(/[^0-9.]/g, '')) || 0) * 100) / 100 });
      roll(); save(); render(); ctx.refresh && ctx.refresh();
    } else add(data);
    dlg.close();
  });
  $('#bill-close').addEventListener('click', () => dlg.close());
  $('#bill-delete').addEventListener('click', async () => {
    if (!editing || !(await ctx.ask(`Remove ${editing.name} from the list? (This doesn't cancel it.)`))) return;
    state.bills = state.bills.filter((b) => b !== editing);
    save(); render(); ctx.refresh && ctx.refresh(); dlg.close();
  });
  $('#bill-paid').addEventListener('click', () => { if (editing) { const nm = editing.name; markPaid(editing); dlg.close(); ctx.toast(`${nm} paid ✓ Next one is ${when(editing.next)}.`); } });
  $('#bill-restart').addEventListener('click', () => { if (editing) { editing.status = 'active'; delete editing.cancelledOn; if (!editing.next || editing.next < today()) editing.next = today(); roll(); save(); render(); dlg.close(); } });
  $('#bill-cancel-help').addEventListener('click', () => { const b = editing; dlg.close(); if (b) cancelHelp(b); });

  // Cancel helper
  const cdlg = $('#cancel-dlg');
  let cancelling = null;
  function cancelHelp(b) {
    if (typeof b === 'string') b = match(b);
    if (!b) return { error: 'not found' };
    cancelling = b;
    $('#cx-title').textContent = `Cancel ${b.name}`;
    $('#cx-sub').textContent = `${money(b.amount)} a ${CYCLES[b.cycle]}${b.next ? ` · ${b.autopay ? 'renews' : 'due'} ${when(b.next)}` : ''}. Rias can't sign in to your accounts, so the last tap is yours; this gets you there.`;
    const url = cancelUrl(b), how = inAppHow(b);
    $('#cx-open').hidden = !url;
    $('#cx-open').textContent = url ? `Open ${b.name}'s cancel / account page` : '';
    $('#cx-how').hidden = !how;
    $('#cx-how').textContent = how;
    $('#cx-remind').hidden = !b.next || b.status === 'cancelling';
    $('#cx-ends').value = b.next || today();
    cdlg.showModal();
    return { ok: true, name: b.name, url, how };
  }
  const openUrl = (url) => { const N = window.RiasNative; if (N && N.openUrl) N.openUrl(url); else window.open(url, '_blank', 'noopener'); };
  $('#cx-open').addEventListener('click', () => { if (cancelling) openUrl(cancelUrl(cancelling)); });
  $('#cx-play').addEventListener('click', () => openUrl(PLAY));
  $('#cx-apple').addEventListener('click', () => openUrl('https://apps.apple.com/account/subscriptions'));
  $('#cx-search').addEventListener('click', () => { if (cancelling) openUrl(`https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${cancelling.name} subscription`)}`); });
  $('#cx-email').addEventListener('click', () => {
    if (!cancelling) return;
    const who = (state.profile && state.profile.name) || '';
    const body = `Hello,\n\nPlease cancel my ${cancelling.name} ${cancelling.kind === 'bill' ? 'service' : 'membership/subscription'} effective immediately (or at the end of the current billing period), and stop all future charges.\n\nAccount email: ${ctx.accountEmail ? ctx.accountEmail() : '[your account email]'}\nName on the account: ${who || '[your name]'}\n\nPlease reply to confirm the cancellation in writing, including the date it takes effect.\n\nThank you.`;
    const a = document.createElement('a');
    a.href = `mailto:?subject=${encodeURIComponent(`Cancel my ${cancelling.name} ${cancelling.kind === 'bill' ? 'service' : 'subscription'}`)}&body=${encodeURIComponent(body)}`;
    a.click(); // opens the email app with it written; nothing is sent until you press Send there
  });
  $('#cx-remind').addEventListener('click', () => {
    if (!cancelling) return;
    cancelling.status = 'cancelling';
    save(); render(); ctx.refresh && ctx.refresh(); cdlg.close();
    ctx.toast(`I'll put "Cancel ${cancelling.name}" on your plan ${when(addDays(cancelling.next, -2) < today() ? today() : addDays(cancelling.next, -2))}, before it renews.`);
  });
  $('#cx-done').addEventListener('click', () => {
    if (!cancelling) return;
    const ends = $('#cx-ends').value || cancelling.next || today();
    const saved = monthly(cancelling);
    markCancelled(cancelling, ends);
    cdlg.close();
    ctx.toast(`${cancelling.name} cancelled ✓ That's ${money(saved)} a month back${ends >= today() ? `; you keep access until ${short(ends)}` : ''}.`);
  });
  $('#cx-close').addEventListener('click', () => cdlg.close());

  // Import
  const idlg = $('#bills-import');
  $('#bills-import-btn').addEventListener('click', () => { $('#bills-import-text').value = ''; idlg.showModal(); });
  $('#bills-import-go').addEventListener('click', () => { const n = importText($('#bills-import-text').value); idlg.close(); ctx.toast(n ? `Added ${n} to Bills & subscriptions.` : 'Nothing new to add (check the format: Name | amount | month | YYYY-MM-DD).'); });
  $('#bills-import-close').addEventListener('click', () => idlg.close());
  $('#bills-add').addEventListener('click', () => open(null));
  $('#bills-list').addEventListener('click', (e) => { const r = e.target.closest('[data-bill]'); if (r) open(state.bills.find((b) => b.id === r.dataset.bill)); });

  // ---------- chat & AI ----------
  function match(q) {
    const s = String(q || '').toLowerCase().trim();
    return state.bills.find((b) => b.name.toLowerCase() === s) || state.bills.find((b) => b.name.toLowerCase().includes(s) || s.includes(b.name.toLowerCase()));
  }
  function summary() {
    if (!state.bills.length) return '';
    const act = active();
    return `Bills & subscriptions (${money(act.reduce((s, b) => s + monthly(b), 0))}/month): ${act.map((b) => `${b.name} ${money(b.amount)}/${b.cycle}${b.next ? `, ${b.autopay ? 'renews' : 'due'} ${b.next}` : ''}${b.status === 'cancelling' ? ', wants to cancel' : ''}${b.autopay ? '' : ', paid manually'}`).join('; ')}.${state.bills.some((b) => b.status === 'cancelled') ? ` Cancelled: ${state.bills.filter((b) => b.status === 'cancelled').map((b) => b.name).join(', ')}.` : ''}`;
  }
  /** Local commands (no AI needed): "cancel netflix", "what subscriptions do I have". */
  function handle(text) {
    const t = String(text || '').trim();
    let m = t.match(/^(?:help me |i want to |can you )?cancel (?:my )?(.+?)(?: subscription| membership)?[.!?]*$/i);
    if (m) {
      const b = match(m[1]);
      if (b) { cancelHelp(b); return [`Here's how to cancel ${b.name}. Open its page, do the last tap there, then tap "I cancelled it" so I stop counting it.`]; }
    }
    if (/\b(what|which|how much|list)\b.*\b(subscriptions?|bills?)\b/i.test(t) && state.bills.length) {
      const act = active();
      return [`You're paying ${money(act.reduce((s, b) => s + monthly(b), 0))} a month:\n${act.sort((a, b) => (a.next || '9').localeCompare(b.next || '9')).map((b) => `• ${b.name}: ${money(b.amount)}/${b.cycle === 'month' ? 'mo' : b.cycle}${b.next ? ` (${b.autopay ? 'renews' : 'due'} ${when(b.next)})` : ''}`).join('\n')}`];
    }
    return null;
  }
  roll();
  return { items, sync, render, add, importText, cancelHelp, summary, handle, open, match, markPaid };
};
