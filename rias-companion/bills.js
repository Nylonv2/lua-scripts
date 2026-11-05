/* Bills & subscriptions: what you pay, when it's due, what it costs a month, and help cancelling.
   Rias can't log into anyone's account, so cancelling is: open the right page (or draft the email),
   you do the last tap, then mark it cancelled. Pay-by and cancel-before-it-renews tasks land on the plan.
   window.createBills(ctx) → { items(d), sync(), render(), add(), cancelHelp(), summary(), handle(text) } */
window.createBills = function createBills(ctx) {
  const { state, save, $, dateKey, uid, fmtTime } = ctx;
  state.bills ||= [];
  state.billSuggest ||= [];   // things spotted in email notifications, waiting for a yes/no
  state.billIgnored ||= [];   // names you said no to
  state.billNotesAt ||= 0;    // newest notification already read
  state.spend ||= [];         // money going out: { id, date, amount, what, cat, key }
  state.income ||= [];
  const today = () => dateKey();
  const dayOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = dayOf(k); d.setDate(d.getDate() + n); return dateKey(d); };
  const CYCLES = { week: 'week', month: 'month', quarter: '3 months', year: 'year', once: 'one time' };
  const PER_MONTH = { week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12, once: 0 };
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
      if (b.cycle === 'once' && b.next < k && (b.autopay || (b.paid || {})[b.next])) { b.status = 'cancelled'; b.endsOn = b.next; b.paidOff = true; changed = true; continue; }
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
    if (b.cycle === 'once') { b.status = 'cancelled'; b.endsOn = b.next; b.paidOff = true; } else b.next = addCycle(b.next, b.cycle);
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
    const b = { id: uid(), name: /^[a-z][A-Z]/.test(name) ? name : name[0].toUpperCase() + name.slice(1), amount: Math.round((Number(String(amount).replace(/[^0-9.]/g, '')) || 0) * 100) / 100,
      cycle: CYCLES[cycle] ? cycle : 'month', next: /^\d{4}-\d{2}-\d{2}$/.test(next || '') ? next : '', kind: kind === 'bill' ? 'bill' : 'sub',
      autopay: autopay == null ? kind !== 'bill' : !!autopay, status: 'active', paid: {}, notes: String(notes || ''), created: Date.now() };
    state.bills.push(b);
    roll();
    save();
    render();
    return { ok: true, bill: b };
  }
  /** "Netflix | 15.49 | month | 2026-11-12 | sub | autopay" (one per line; extra fields optional). */
  /** Does this text look like a money list (several "a | b | c" lines)? */
  const looksLikeList = (text) => String(text || '').split(/\n+/).filter((l) => /^[^#].*\S\s*\|\s*\S.*\|/.test(l.trim())).length >= 3;
  let lastImport = { bills: 0, ins: 0, spends: 0 };
  function importText(text) {
    let n = 0;
    lastImport = { bills: 0, ins: 0, spends: 0 };
    for (const raw of String(text || '').split(/\n+/)) {
      const line = raw.trim().replace(/^[-•*]\s*/, '');
      if (!line || /^#/.test(line)) continue;
      const p = line.split(/\s*[|;\t]\s*/);
      if (p.length < 2) continue;
      if (/^(pay|take[- ]home pay|salary)$/i.test(p[0])) { // "PAY | 2748 | biweekly | 2026-10-10"
        const monthly = Number(String(p[1]).replace(/[^0-9.]/g, ''));
        const every = /semi|twice/i.test(p[2] || '') ? 'semimonthly' : /^week/i.test(p[2] || '') ? 'weekly' : /month/i.test(p[2] || '') ? 'monthly' : 'biweekly';
        if (monthly && /^\d{4}-\d{2}-\d{2}$/.test(p[3] || '')) {
          const old = state.settings.pay || {};
          if (old.monthly !== monthly || old.every !== every || old.anchor !== p[3]) { state.settings.pay = { monthly, every, anchor: p[3] }; n++; lastImport.pay = true; }
        }
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(p[0]) && (/^\+/.test(p[2] || '') || /^(income|paycheck|pay|earned|money in|borrowed|early pay)$/i.test(p[3] || ''))) { // "2026-11-04 | DailyPay | +109.70 | Early pay"
        if (logIncome({ date: p[0], what: p[1], amount: Number(String(p[2]).replace(/[^0-9.]/g, '')), kind: /borrow/i.test(p[3] || '') ? 'borrowed' : /early/i.test(p[3] || '') ? 'early' : 'earned' }, true)) { n++; lastImport.ins++; }
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(p[0])) { // "2026-11-03 | Wingstop (Uber Eats) | 21.69 | Food & delivery"
        const amt = Number(String(p[2] || '').replace(/[^0-9.]/g, ''));
        if (/^(advance (paid back|repaid)|repaid|paid back)$/i.test(p[3] || '')) { if (logSpend({ date: p[0], what: p[1], amount: amt, repaid: true, provider: providerOf(p[1]) }, true)) { n++; lastImport.spends++; } continue; }
        if (logSpend({ date: p[0], what: p[1], amount: amt, cat: p[3] && (CATS.some(([c]) => c === p[3]) || p[3] === 'Other') ? p[3] : catOf(`${p[1]} ${p[3] || ''}`) }, true)) { n++; lastImport.spends++; }
        continue;
      }
      const [name, amount, cycle = 'month', next = '', kind = 'sub', pay = ''] = p;
      const cyc = /once|one[- ]time|single/i.test(cycle) ? 'once' : /week/i.test(cycle) ? 'week' : /year|annual/i.test(cycle) ? 'year' : /quarter|3 ?mo/i.test(cycle) ? 'quarter' : 'month';
      const status = /cancel/i.test(pay) ? 'cancelled' : 'active';
      if (state.bills.some((b) => b.name.toLowerCase() === name.trim().toLowerCase())) continue;
      const r = add({ name, amount, cycle: cyc, next: next.trim(), kind: /bill|rent|util|internet|phone/i.test(kind) ? 'bill' : 'sub', autopay: !/manual|pay myself|no auto/i.test(pay) });
      if (r.ok) { if (status === 'cancelled') { markCancelled(r.bill, next.trim() || today(), true); delete r.bill.cancelledOn; } n++; lastImport.bills++; } // cancelled before it was tracked: not counted as savings
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
    renderSuggest();
    renderSpend();
    renderDue();
    renderPay();
    watchStatus();
    $('#bills-month').textContent = money(total);
    $('#bills-year').textContent = `${money(total * 12)} a year · ${act.length} active`;
    const upcoming = act.filter((b) => b.next).sort((a, b) => a.next.localeCompare(b.next))[0];
    $('#bills-next').textContent = upcoming ? `Next: ${upcoming.name} ${money(upcoming.amount)} ${when(upcoming.next)}` : 'Add what you pay for and she keeps track.';
    $('#bills-saving').hidden = !saving;
    $('#bills-saving').textContent = `Saving ${money(saving)} a month from what you cancelled`;
    box.textContent = '';
    const t = today();
    const groups = [
      ['Bills & loans', act.filter((b) => b.kind === 'bill')],
      ['Subscriptions', act.filter((b) => b.kind !== 'bill')],
      ['Cancelled', state.bills.filter((b) => b.status === 'cancelled')],
    ];
    if (!state.bills.length && !state.billSuggest.length) {
      if (state.spend.length) return;
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
        if (b.status === 'cancelled') add_(b.paidOff ? `Paid off ${b.endsOn ? short(b.endsOn) : ''}` : b.endsOn && b.endsOn >= t ? `Access until ${short(b.endsOn)}` : `Ended ${b.endsOn ? short(b.endsOn) : ''}`, 'ri-sub');
        else {
          add_(b.next ? `${b.autopay ? (b.kind === 'bill' ? 'Autopay' : 'Renews') : 'Due'} ${when(b.next)}` : 'No date yet', late ? 'tag-chip flag warn' : 'ri-sub');
          if (b.status === 'cancelling') add_('Cancel before it renews', 'tag-chip flag warn');
          if (late) add_('Late', 'tag-chip flag warn');
        }
        const amt = el('div', 'bill-amt');
        amt.append(el('b', '', money(b.amount)), el('small', '', b.cycle === 'once' ? ' once' : `/${b.cycle === 'quarter' ? '3 mo' : b.cycle === 'month' ? 'mo' : b.cycle === 'year' ? 'yr' : 'wk'}`));
        main.append(meta);
        row.append(main, amt);
        card.append(row);
      }
      box.append(card);
    }
  }

  /** Overview: what's due in the next 7 days (and anything late). */
  function renderDue() {
    const box = $('#money-due');
    if (!box) return;
    box.textContent = '';
    const t = today();
    const due = active().filter((b) => b.next && daysTo(b.next) <= 7 && (b.next >= t || !b.autopay)).sort((a, b) => a.next.localeCompare(b.next));
    $('#money-due-wrap').hidden = !due.length;
    for (const b of due) {
      const r = el('button', 'row-item due-row');
      r.type = 'button'; r.dataset.bill = b.id;
      const main = el('div', 'ri-main');
      main.append(el('div', 'ri-title', b.name));
      const late = b.next < t;
      main.append(el('div', `ri-meta${late ? ' loss' : ''}`, `${late ? 'Late · was due ' : b.autopay ? 'Comes out ' : 'Due '}${when(b.next)}${b.status === 'cancelling' ? ' · cancel before then' : ''}`));
      const amt = el('div', 'bill-amt'); amt.append(el('b', '', money(b.amount)));
      r.append(main, amt);
      box.append(r);
    }
    const empty = !state.bills.length && !state.spend.length && !state.income.length;
    $('#money-empty').hidden = !empty;
  }
  $('#money-due').addEventListener('click', (e) => { const r = e.target.closest('[data-bill]'); if (r) open(state.bills.find((b) => b.id === r.dataset.bill)); });
  // Take-home pay card
  function renderPay() {
    const p = state.settings.pay || {};
    $('#pay-monthly').value = p.monthly ? String(p.monthly) : '';
    $('#pay-every').value = p.every || 'biweekly';
    $('#pay-anchor').value = p.anchor || '';
    $('#pay-summary').textContent = payCfg() ? `${money(p.monthly)} a month, ${PAY_EVERY[p.every || 'biweekly']}: ${money(perCheck(p))} per paycheck. Early pay from DailyPay is treated as part of your paycheck, not extra.` : 'Your take-home pay after taxes, how often you get paid, and one payday.';
  }
  $('#pay-save').addEventListener('click', () => {
    const monthly = Number(String($('#pay-monthly').value).replace(/[^0-9.]/g, ''));
    const anchor = $('#pay-anchor').value;
    if (!monthly || !anchor) { ctx.toast('Put in your monthly take-home pay and one payday date.'); return; }
    state.settings.pay = { monthly, every: $('#pay-every').value, anchor };
    save(); render(); ctx.toast(`Pay set: ${money(monthly)} a month. Paydays now count as money in.`);
  });
  // Tabs
  function showPane(name) {
    for (const b of document.querySelectorAll('#money-seg [data-mp]')) b.classList.toggle('active', b.dataset.mp === name);
    for (const p of document.querySelectorAll('#view-bills .money-pane')) p.hidden = p.dataset.pane !== name;
  }
  $('#money-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-mp]'); if (b) showPane(b.dataset.mp); });
  $('#money-empty-import').addEventListener('click', () => { $('#bills-import-text').value = ''; $('#bills-import').showModal(); });

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

  /** A pasted or shared list: load it all, jump to Money, and say what was added. */
  function importShared(text) {
    const n = importText(text);
    const r = lastImport;
    const parts = [r.pay && 'your take-home pay', r.bills && `${r.bills} bill${r.bills === 1 ? '' : 's'} & subscription${r.bills === 1 ? '' : 's'}`, r.ins && `${r.ins} payment${r.ins === 1 ? '' : 's'} in`, r.spends && `${r.spends} purchase${r.spends === 1 ? '' : 's'}`].filter(Boolean);
    return n ? `Loaded into Money: ${parts.join(', ')}. ${flowSummary()}`.trim() : 'That list is already in Money; nothing new to add.';
  }

  // ---------- watching email notifications (receipts, renewals, bills) ----------
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const SUB = /subscription|membership|renew|recurring|monthly|per month|\/mo\b|annual|yearly|your bill|bill is|auto-?pay|automatic payment|plan\b|trial|member fee|membership fee/i;
  const STRONG = /receipt|renew|charged|withdrawn|payment (received|confirmed|processed|successful|date|amount)|automatic payment|auto-?pay|bill is (ready|available)|invoice|trial (ends|will end)|cancel+ed|membership fee|recurring billing/i;
  const PROMO = /\d+% off|\bdeals?\b|\bsale\b|save up to|\boffer\b|upgrade|unlock|reward|free shipping|get \$?\d+ off|try .* free|limited time/i;
  const CANCEL = /(will be|has been|was|been) cancel+ed|recurring billing (has been )?(turned off|disabled)|subscription (has )?ended|benefits are ending|will end on/i;
  const PAID = /receipt|paid|charged|withdrawn|has renewed|renewal order.{0,40}complete|payment (received|confirmed|processed|successful)|thank you for your (purchase|payment)/i;
  function findDate(text, ts) {
    const base = new Date(ts || Date.now());
    const out = [];
    const re = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'gi');
    let m;
    while ((m = re.exec(text))) {
      const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
      let y = m[3] ? Number(m[3]) : base.getFullYear();
      let d = new Date(y, mo, Number(m[2]));
      if (!m[3] && d < new Date(base.getFullYear(), base.getMonth(), base.getDate() - 45)) d = new Date(y + 1, mo, Number(m[2]));
      out.push({ at: m.index, k: dateKey(d) });
    }
    const re2 = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((m = re2.exec(text))) out.push({ at: m.index, k: dateKey(new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]))) });
    const re3 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re3.exec(text))) out.push({ at: m.index, k: `${m[1]}-${m[2]}-${m[3]}` });
    if (!out.length) return '';
    // Prefer a date right after "renew / due / on / payment date / end".
    const key = /(renew\w*|due|payment date|withdrawn|charged|end\w*|on)\b[^.]{0,25}$/i;
    const best = out.find((o) => key.test(text.slice(Math.max(0, o.at - 40), o.at))) || out[0];
    return best.k;
  }
  function cleanName(t) {
    return String(t || '').replace(/\b(customer )?(support|receipts?|team|billing|account services|no-?reply|notifications?|inc\.?|llc|pbc|corp\.?|,)\b/gi, '').replace(/[,·|:-]+\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  /** One notification → { name, amount, cycle, next, cancel } or null when it isn't about a bill or subscription. */
  function parseNote(n) {
    const title = String(n.title || ''), text = String(n.text || '');
    const all = `${title} ${text}`;
    if (!SUB.test(all) || !STRONG.test(all)) return null;
    if (PROMO.test(all) && !/receipt|charged|withdrawn|renew|cancel+ed|bill is|auto-?pay/i.test(all)) return null;
    // Who: "Your Hinge subscription…", "subscription from X on Google Play", else the sender (Gmail shows it as the title).
    let name = '';
    const m1 = all.match(/(?:subscription|purchase) (?:purchase )?(?:from|to|for) ([A-Z][\w&+.' -]{1,40}?)(?: on | has| will|[.,]|$)/) || all.match(/your ([A-Z][\w&+.' -]{1,40}?) (?:subscription|membership|plan|bill)\b/) || all.match(/(?:membership|subscription) (?:fee )?(?:with|at) ([A-Z][\w&+.' -]{1,40}?)[.,]/);
    if (m1) name = m1[1];
    if (!name || /^(google play|app store)$/i.test(name)) name = /gmail|mail|outlook|yahoo/i.test(`${n.pkg} ${n.app}`) ? title : (title || n.app);
    name = cleanName(name).replace(/^(the|your)\s+/i, '');
    if (!name || name.length > 40) return null;
    const am = all.match(/\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/);
    const amount = am ? Number(am[1].replace(/,/g, '')) : 0;
    const cycle = /\b(annual|yearly|per year|12-month|1-year)\b|\/\s?(yr|year)\b/i.test(all) ? 'year' : /\b(weekly|per week|1 week|7-day)\b|\/\s?(wk|week)\b/i.test(all) ? 'week' : 'month';
    const cancel = CANCEL.test(all);
    let next = findDate(text || all, n.ts);
    const paidNow = PAID.test(all) && !/will be (charged|withdrawn)|set to renew|will (automatically )?renew|renews on|payment date/i.test(all);
    if (paidNow) next = addCycle(next || dateKey(new Date(n.ts || Date.now())), cycle); // charged on that date → the next one is a cycle later
    return { name, amount, cycle, next, cancel, kind: /bill|xfinity|electric|energy|water|internet|phone|rent|insurance/i.test(all) ? 'bill' : 'sub', ts: n.ts };
  }
  const sameName = (a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); const w = (s) => s.split(/\W+/).filter((t) => t.length > 2); return x === y || x.includes(y) || y.includes(x) || w(x).some((t) => w(y).includes(t) && !/^(the|your|plus|premium|pro|online|membership|subscription|app)$/.test(t)); };
  /** Reads new receipt / renewal notifications: updates what's tracked, suggests what isn't. */
  function readNotes(list) {
    const fresh = [], updated = [];
    let spent = 0;
    for (const n of list) {
      state.billNotesAt = Math.max(state.billNotesAt || 0, Number(n.ts) || 0);
      if (logSpend(parseSpend(n), true)) spent++;
      if (logIncome(parseIncome(n), true)) spent++;
      const p = parseNote(n);
      if (!p) continue;
      const b = state.bills.find((x) => sameName(x.name, p.name));
      if (b) {
        if (p.cancel) {
          if (b.status !== 'cancelled' && !state.billSuggest.some((x) => x.type === 'cancel' && x.billId === b.id)) { state.billSuggest.push({ id: uid(), type: 'cancel', billId: b.id, name: b.name, next: p.next, ts: p.ts }); fresh.push(`${b.name} looks cancelled`); }
          continue;
        }
        const bits = [];
        if (p.next && p.next >= today() && p.next !== b.next) { b.next = p.next; bits.push(`next ${when(p.next)}`); }
        if (p.amount && Math.abs(p.amount - (b.amount || 0)) > 0.009) { bits.push(`${money(p.amount)} (was ${money(b.amount)})`); b.amount = p.amount; }
        if (b.status === 'cancelled' && !p.cancel && PAID.test(`${n.title} ${n.text}`)) { b.status = 'active'; bits.push('charged again, so it\'s back on the list'); }
        if (bits.length) updated.push(`${b.name}: ${bits.join(', ')}`);
        continue;
      }
      if (p.cancel || state.billIgnored.some((x) => sameName(x, p.name)) || state.billSuggest.some((x) => sameName(x.name, p.name))) continue;
      state.billSuggest.push({ id: uid(), type: 'add', ...p });
      fresh.push(`${p.name}${p.amount ? ` (${money(p.amount)}/${p.cycle === 'month' ? 'mo' : p.cycle})` : ''}`);
    }
    if (fresh.length || updated.length) {
      save(); render();
      const lines = [];
      if (fresh.length) lines.push(`From your email: ${fresh.join(', ')}. Want ${fresh.length === 1 ? 'it' : 'them'} on your Bills & subscriptions list? (More → Bills & subscriptions)`);
      if (updated.length) lines.push(`Updated from your email: ${updated.join('; ')}.`);
      ctx.toast(lines.join('\n'));
    } else if (list.length) { save(); if (spent) render(); }
    return { fresh, updated, spent };
  }
  function poll() {
    if (state.settings.billWatch === false) return;
    const d = window.RiasDevice;
    if (!d || !d.moneyNotes) return;
    let list = [];
    try { list = JSON.parse(d.moneyNotes(state.billNotesAt || 0)); } catch { return; }
    if (list.length) readNotes(list);
  }
  function watchStatus() {
    const sw = $('#bills-watch'), stat = $('#bills-watch-status'), allow = $('#bills-watch-allow');
    if (!sw) return;
    sw.checked = state.settings.billWatch !== false;
    const d = window.RiasDevice;
    let ok = false;
    try { ok = !!(d && d.status && JSON.parse(d.status()).notifications); } catch { /* older app */ }
    stat.textContent = !d ? 'Works in the Android app (it reads your email notifications as they arrive).' : !sw.checked ? 'Off.' : ok ? '✓ On. New receipts and renewal emails get added or updated here.' : 'One step left: allow notification access.';
    allow.hidden = !d || ok || !sw.checked;
  }
  function renderSuggest() {
    const box = $('#bills-suggest');
    if (!box) return;
    box.textContent = '';
    const list = state.billSuggest.filter((x) => x.type === 'add' || state.bills.some((b) => b.id === x.billId && b.status !== 'cancelled'));
    if (!list.length) return;
    const h = el('div', 'group-title'); h.append(el('span', '', 'Found in your email')); box.append(h);
    const card = el('div', 'list-card');
    for (const x of list) {
      const row = el('div', 'row-item bill-sug');
      const main = el('div', 'ri-main');
      main.append(el('div', 'ri-title', x.type === 'cancel' ? `${x.name} looks cancelled` : x.name));
      main.append(el('div', 'ri-meta', x.type === 'cancel' ? 'An email said it was cancelled or is ending.' : `${x.amount ? `${money(x.amount)}/${x.cycle === 'month' ? 'mo' : x.cycle}` : 'Amount unknown'}${x.next ? ` · next ${when(x.next)}` : ''}`));
      const acts = el('div', 'sug-acts');
      const yes = el('button', 'btn-primary sm', x.type === 'cancel' ? 'Mark cancelled' : 'Add');
      yes.type = 'button'; yes.dataset.sugYes = x.id;
      const no = el('button', 'btn-primary sm tonal', x.type === 'cancel' ? 'Not yet' : 'Ignore');
      no.type = 'button'; no.dataset.sugNo = x.id;
      acts.append(yes, no);
      main.append(acts);
      row.append(main);
      card.append(row);
    }
    box.append(card);
  }
  function suggestAnswer(id, yes) {
    const x = state.billSuggest.find((s) => s.id === id);
    if (!x) return;
    state.billSuggest = state.billSuggest.filter((s) => s !== x);
    if (x.type === 'cancel') { const b = state.bills.find((y) => y.id === x.billId); if (yes && b) markCancelled(b, x.next || b.next, true); }
    else if (yes) add({ name: x.name, amount: x.amount, cycle: x.cycle, next: x.next, kind: x.kind, autopay: true });
    else state.billIgnored.push(x.name);
    save(); render(); ctx.refresh && ctx.refresh();
  }
  $('#bills-suggest').addEventListener('click', (e) => {
    const y = e.target.closest('[data-sug-yes]'), n = e.target.closest('[data-sug-no]');
    if (y) suggestAnswer(y.dataset.sugYes, true); else if (n) suggestAnswer(n.dataset.sugNo, false);
  });
  $('#bills-watch').addEventListener('change', (e) => { state.settings.billWatch = e.target.checked; save(); watchStatus(); if (e.target.checked) poll(); });
  $('#bills-watch-allow').addEventListener('click', () => { const d = window.RiasDevice; if (d && d.openSettings) d.openSettings('notifications'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { watchStatus(); poll(); } });

  // ---------- spending: everything going out ----------
  const CATS = [
    ['Advance & app fees', /\b(membership fee|monthly fee|express fee|instant (transfer )?fee|transfer fee|tip)\b.*\b(dave|extracash|brigit|floatme|earnin|cleo|empower|klover|moneylion|instacash|mypay|albert|possible)\b|\b(dave|extracash|brigit|floatme|earnin|cleo|empower|klover|moneylion|instacash|mypay|albert|possible)\b.*\b(fee|tip)\b/i],
    ['Rent & housing', /\brent\b|apartment|landlord|property/i],
    ['Loans & payment plans', /\b(klarna|afterpay|affirm|sezzle|zip pay|upstart|dr bank|car payment|auto loan|car loan|personal loan|loan payment|installment|solo ?funds|possible finance|loan)\b/i],
    ['Bills & utilities', /xfinity|comcast|duke energy|electric|energy|water bill|internet|phone bill|t-mobile|verizon|at&t|insurance|utilit/i],
    ['Betting', /thescore|draftkings|fanduel|betmgm|caesars|kalshi|sportsbook|prizepicks|\bbet\b/i],
    ['Food & delivery', /uber eats|doordash|grubhub|wingstop|chick-fil-a|mcdonald|wendy|culver|taco bell|burger|pizza|chipotle|restaurant|cafe|coffee|starbucks|gopuff|instacart|subway|kfc|popeyes|panda/i],
    ['Groceries', /grocer|meijer|kroger|aldi|whole foods|trader joe|costco|sam's club|food lion|publix|safeway/i],
    ['Rides & gas', /\blyft\b|uber (trip|ride)|your (trip|ride)|parking|\bgas\b|fuel|gas station|speedway|marathon|shell|circle k|car wash/i],
    ['Subscriptions', /subscription|membership|renew|claude|anthropic|netflix|spotify|iracing|coach dave|switch online|game pass|patreon|prime|hinge|refuseless/i],
    ['Games', /nintendo|playstation|xbox|steam|epic games|eshop|v-?bucks/i],
    ['Shopping', /amazon|best buy|micro ?center|walmart|target|ebay|vitamin shoppe|sell\.?app|stripe/i],
  ];
  const catOf = (text) => (CATS.find(([, re]) => re.test(text)) || ['Other'])[0];
  // Cash-advance apps: borrowing and paying it straight back cancels out; only their fees are real spending.
  const ADVANCE = /\b(dave|extracash|brigit|floatme|earnin|cleo|empower|klover|moneylion|instacash|mypay|albert|b9|grid)\b/i;
  const REPAY = /repaid|repayment|paid back|settle[ds]?|settlement|advance (payment|collected)|payment (received|processed|collected)|withdrawn|we collected/i;
  const FEEWORD = /membership|monthly fee|subscription|express|instant|transfer fee|\bfee\b|\btip\b/i;
  const providerOf = (text) => { const m = String(text || '').match(ADVANCE); if (!m) return ''; const p = m[1].toLowerCase(); return p === 'extracash' ? 'dave' : p; };
  // Older versions lumped advances and loans together; advance repayments now don't count as spending.
  for (const x of state.spend) {
    if (x.cat !== 'Loans & advances') continue;
    const prov = providerOf(x.what);
    if (prov && /repaid|paid back|settle/i.test(x.what)) { x.cat = 'Advance paid back'; x.repaid = true; x.provider = prov; }
    else x.cat = prov ? 'Advance & app fees' : /flex|rent/i.test(x.what) ? 'Rent & housing' : 'Loans & payment plans';
  }        // money coming in: { id, date, amount, what, kind: 'earned' | 'borrowed', key }
  const OUT = /receipt|total|you (spent|paid)|purchase|charged|payment (of|was|has been|received|processed|successful|confirmed)|withdrawn|repaid|repayment|installment|debit|deposit (successful|receipt)|order (confirmation|receipt)|transaction|is paid|has been paid|thanks for (tipping|ordering)|has settled|settled|(we|was|were) collected/i;
  const IN = /you (received|got paid|were paid)|deposited (in)?to your|refund|cash ?back|is on the way to your|direct deposit|payday|(advance|extracash).{0,40}(on the way|sent|approved|is here|arriv)|funds to spend|money misses you|you have (cash|funds)/i;
  const LATER = /will be (charged|withdrawn)|set to renew|upcoming|reminder|payment date|bill is (ready|available)|due on/i;
  /** One notification → a spend { date, amount, what, cat } or null (not money going out, or no amount). */
  function parseSpend(n) {
    const title = String(n.title || ''), text = String(n.text || '');
    const all = `${title} ${text}`;
    if (!OUT.test(all) || IN.test(all) || (LATER.test(all) && !/\b(paid|charged|withdrawn|receipt)\b/i.test(all))) return null;
    if (PROMO.test(all) && !/receipt|total|charged|withdrawn|paid|repaid|deposit successful/i.test(all)) return null;
    const am = all.match(/(?:total|amount paid|payment total|you (?:spent|paid)|charged|fee of|withdrawn|deposit successful)[^$]{0,30}\$\s?([\d,]+(?:\.\d{2})?)/i) || all.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
    const amount = am ? Number(am[1].replace(/,/g, '')) : 0;
    if (!amount || amount > 20000) return null;
    let what = '';
    const rf = all.match(/receipt for ([A-Z][^(.\n]{1,30}?)\s*(?:\(|\.|$)/);
    const bare = all.replace(/\$\s?[\d,]+(?:\.\d{2})?/g, '$');
    const at = bare.match(/\b(?:spent|paid|purchase|payment)[^.\n]{0,25}\b(?:at|to) ([A-Z][\w&'. -]{2,30}?)(?:\s+(?:on|for|with|using)\b|[.,]|$)/);
    if (rf) what = rf[1].trim() + (/uber eats/i.test(all) ? ' (Uber Eats)' : /doordash/i.test(all) ? ' (DoorDash)' : '');
    else if (at && !/gmail|mail/i.test(n.pkg || '')) what = at[1].trim();
    else what = cleanName(/gmail|mail|outlook|yahoo/i.test(`${n.pkg} ${n.app}`) ? title : (title || n.app));
    if (!what) what = n.app || 'Something';
    const tracked = state.bills.find((b) => sameName(b.name, what));
    const cat = catOf(`${what} ${all}`) === 'Other' && tracked ? (tracked.kind === 'bill' ? 'Bills & utilities' : 'Subscriptions') : catOf(`${what} ${title} ${text.slice(0, 160)}`);
    const prov = providerOf(`${what} ${all}`);
    if (prov && REPAY.test(all) && !/membership fee|monthly fee|subscription fee/i.test(all)) return { date: dateKey(new Date(n.ts || Date.now())), amount, what: what.slice(0, 40), repaid: true, provider: prov, key: n.key || '' };
    return { date: dateKey(new Date(n.ts || Date.now())), amount, what: what.slice(0, 40), cat: prov && FEEWORD.test(all) ? 'Advance & app fees' : cat, key: n.key || '' };
  }
  /** What's still owed to an advance app: borrowed in the last 60 days minus what's been paid back. */
  function owedTo(prov, upTo = today()) {
    if (!prov) return 0;
    const from = addDays(upTo, -60);
    const borrowed = state.income.filter((x) => x.kind === 'borrowed' && x.date >= from && x.date <= upTo && providerOf(x.what) === prov).reduce((a, x) => a + x.amount, 0);
    const back = state.spend.filter((x) => x.repaid && x.date >= from && x.date <= upTo && x.provider === prov).reduce((a, x) => a + x.amount, 0);
    return Math.max(0, Math.round((borrowed - back) * 100) / 100);
  }
  function logSpend(x, quiet) {
    // Paying back an advance: the part that covers what you borrowed isn't spending; anything above it is the fee.
    if (x && x.repaid) {
      if (x.key && state.spend.some((s) => s.key === x.key || s.key === `${x.key}:fee`)) return false;
      if (state.spend.some((s) => s.repaid && s.date === x.date && s.what.toLowerCase() === String(x.what).toLowerCase() && (Math.abs(s.amount - x.amount) < 0.005 || state.spend.some((f) => f.key && f.key === `${s.key}:fee` && Math.abs(s.amount + f.amount - x.amount) < 0.005)))) return false;
      const owed = owedTo(x.provider, x.date);
      const principal = owed > 0 ? Math.min(x.amount, owed) : x.amount;
      const fee = Math.round((x.amount - principal) * 100) / 100;
      state.spend.push({ id: uid(), date: x.date, amount: Math.round(principal * 100) / 100, what: x.what, cat: 'Advance paid back', repaid: true, provider: x.provider, key: x.key || '' });
      if (fee > 0.004) state.spend.push({ id: uid(), date: x.date, amount: fee, what: `${x.what} fee`, cat: 'Advance & app fees', provider: x.provider, key: x.key ? `${x.key}:fee` : '' });
      if (!quiet) { save(); render(); }
      return true;
    }
    if (!x || !x.amount) return false;
    if (x.key && state.spend.some((s) => s.key === x.key)) return false;
    if (state.spend.some((s) => s.date === x.date && Math.abs(s.amount - x.amount) < 0.005 && s.what.toLowerCase() === x.what.toLowerCase())) return false;
    state.spend.push({ id: uid(), date: x.date, amount: Math.round(x.amount * 100) / 100, what: x.what, cat: x.cat || catOf(x.what), key: x.key || '' });
    if (state.spend.length > 3000) state.spend.splice(0, state.spend.length - 3000);
    if (!quiet) { save(); render(); }
    return true;
  }
  let spendMonth = today().slice(0, 7);
  const monthName = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString([], { month: 'long', year: y === new Date().getFullYear() ? undefined : 'numeric' }); };
  function monthTotals(m) {
    const list = state.spend.filter((x) => x.date.startsWith(m) && !x.repaid);
    const by = {};
    for (const x of list) by[x.cat] = (by[x.cat] || 0) + x.amount;
    return { list, total: list.reduce((a, x) => a + x.amount, 0), cats: Object.entries(by).sort((a, b) => b[1] - a[1]) };
  }
  function renderSpend() {
    const box = $('#spend-card');
    if (!box) return;
    const { list, total, cats } = monthTotals(spendMonth);
    $('#spend-month').textContent = monthName(spendMonth);
    $('#spend-total').textContent = money(total);
    $('#spend-next').disabled = spendMonth >= today().slice(0, 7);
    const ul = $('#spend-cats');
    ul.textContent = '';
    if (!list.length) ul.append(el('p', 'muted small', 'Nothing logged this month yet. Receipts and payments from your email notifications show up here, or say "I spent 20 on gas".'));
    const max = cats.length ? cats[0][1] : 1;
    for (const [c, v] of cats) {
      const row = el('div', `spend-cat${c === 'Loans & payment plans' || c === 'Advance & app fees' ? ' loan' : ''}`);
      const top = el('div', 'spend-cat-top');
      top.append(el('span', '', c), el('b', '', money(v)));
      const bar = el('div', 'spend-bar'); const fill = el('i'); fill.style.width = `${Math.max(4, (v / max) * 100)}%`; bar.append(fill);
      row.append(top, bar);
      ul.append(row);
    }
    const rec = $('#spend-recent');
    rec.textContent = '';
    const ins = state.income.filter((x) => x.date.startsWith(spendMonth)).map((x) => ({ ...x, isIn: true }))
      .concat(state.spend.filter((x) => x.repaid && x.date.startsWith(spendMonth)));
    for (const x of list.concat(ins).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)) {
      const r = el('button', `row-item spend-row${x.isIn ? ' in' : ''}`);
      r.type = 'button'; r.dataset[x.isIn ? 'income' : 'spend'] = x.id;
      const main = el('div', 'ri-main');
      main.append(el('div', 'ri-title', x.what));
      main.append(el('div', 'ri-meta', `${short(x.date)} · ${x.isIn ? (x.kind === 'borrowed' ? 'Borrowed' : x.kind === 'early' ? 'Early pay (part of a paycheck)' : 'Money in') : x.repaid ? 'Advance paid back (not counted)' : x.cat}`));
      const amt = el('div', 'bill-amt'); amt.append(el('b', x.isIn ? (x.kind === 'borrowed' ? 'borrow' : 'gain') : x.repaid ? 'muted' : '', `${x.isIn ? '+' : x.repaid ? '↩ ' : ''}${money(x.amount)}`));
      r.append(main, amt);
      rec.append(r);
    }
    $('#spend-recent-wrap').hidden = !list.length && !ins.length;
    renderFlow();
  }
  $('#spend-prev').addEventListener('click', () => { const [y, m] = spendMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); spendMonth = dateKey(d).slice(0, 7); renderSpend(); });
  $('#spend-next').addEventListener('click', () => { const [y, m] = spendMonth.split('-').map(Number); const d = new Date(y, m, 1); spendMonth = dateKey(d).slice(0, 7); renderSpend(); });
  $('#spend-recent').addEventListener('click', async (e) => {
    const ri = e.target.closest('[data-income]');
    if (ri) {
      const x = state.income.find((y) => y.id === ri.dataset.income);
      if (x && await ctx.ask(`Remove “${x.what}” (+${money(x.amount)}, ${short(x.date)})?`)) { state.income = state.income.filter((y) => y !== x); save(); renderSpend(); }
      return;
    }
    const r = e.target.closest('[data-spend]');
    if (!r) return;
    const x = state.spend.find((y) => y.id === r.dataset.spend);
    if (x && await ctx.ask(`Remove “${x.what}” (${money(x.amount)}, ${short(x.date)}) from your spending?`)) { state.spend = state.spend.filter((y) => y !== x); save(); renderSpend(); }
  });
  // ---------- money in: pay, transfers, and borrowed money ----------
  const PAYIN = /you got paid|your money is on its way|direct deposit|payroll|paycheck|pay ?day is here|you('ve)? received|sent you|deposit(ed)? (of|into|to) your|money (has )?arrived|transfer (from|received)|extracash.{0,40}(on the way|sent|arriv)|advance.{0,30}(sent|approved|on the way|deposited|arriv)|loan (was )?(funded|disbursed|deposited)|mypay.{0,30}(sent|on the way|deposited)/i;
  const BORROW = /extracash|advance|mypay|loan (was )?(funded|disbursed|deposited)|\b(dave|brigit|floatme|earnin|klover|cleo|empower|possible|solo ?funds|klarna|afterpay|affirm)\b/i;
  const NOT_IN = /offer|bonus|earn a \$|\$\d+ thank you|could get|might qualify|pre-?qualif|eligible|up to \$|money misses you|funds to spend|you have (cash|funds)|repaid|has been repaid|settle/i;
  function parseIncome(n) {
    const title = String(n.title || ''), text = String(n.text || '');
    const all = `${title} ${text}`;
    if (!PAYIN.test(all) || NOT_IN.test(all)) return null;
    const am = all.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
    const amount = am ? Number(am[1].replace(/,/g, '')) : 0;
    if (!amount || amount > 50000) return null;
    let what = cleanName(/gmail|mail|outlook|yahoo/i.test(`${n.pkg} ${n.app}`) ? title : (title || n.app)) || n.app || 'Money in';
    const from = text.match(/^\W*(\w[\w&'. -]{0,25}?) sent you/m) || text.match(/(\w[\w&'.-]{1,25}(?: \w[\w&'.-]{1,25})?) sent you/);
    if (from) what = from[1].trim();
    return { date: dateKey(new Date(n.ts || Date.now())), amount, what: what.slice(0, 40), kind: BORROW.test(all) ? 'borrowed' : 'earned', key: n.key || '' };
  }
  function logIncome(x, quiet) {
    if (!x || !x.amount) return false;
    if (x.key && state.income.some((s) => s.key === x.key)) return false;
    if (state.income.some((s) => s.date === x.date && Math.abs(s.amount - x.amount) < 0.005 && s.what.toLowerCase() === x.what.toLowerCase())) return false;
    state.income.push({ id: uid(), date: x.date, amount: Math.round(x.amount * 100) / 100, what: x.what, kind: x.kind === 'borrowed' ? 'borrowed' : x.kind === 'early' || EARLY.test(x.what) ? 'early' : 'earned', key: x.key || '' });
    if (state.income.length > 2000) state.income.splice(0, state.income.length - 2000);
    if (!quiet) { save(); render(); }
    return true;
  }
  // ---------- take-home pay: paydays are income; early-pay pulls (DailyPay…) are part of the paycheck ----------
  const PAY_EVERY = { weekly: 'every week', biweekly: 'every 2 weeks', semimonthly: 'twice a month (15th & last day)', monthly: 'once a month' };
  const payCfg = () => { const p = state.settings.pay; return p && Number(p.monthly) > 0 && p.anchor ? p : null; };
  const perCheck = (p) => (p.every === 'weekly' ? (p.monthly * 12) / 52 : p.every === 'semimonthly' ? p.monthly / 2 : p.every === 'monthly' ? p.monthly : (p.monthly * 12) / 26);
  /** Payday dates in month m (YYYY-MM). */
  function paydaysIn(m) {
    const p = payCfg();
    if (!p) return [];
    // Only from when you started tracking (first logged money or the payday you gave), never into earlier blank months.
    const start = [p.anchor, ...state.income.map((x) => x.date), ...state.spend.map((x) => x.date)].sort()[0].slice(0, 7);
    if (m < start) return [];
    const [y, mo] = m.split('-').map(Number);
    const first = dateKey(new Date(y, mo - 1, 1)), last = dateKey(new Date(y, mo, 0));
    if (p.every === 'semimonthly') return [dateKey(new Date(y, mo - 1, 15)), last];
    if (p.every === 'monthly') { const d = Math.min(Number(p.anchor.slice(8, 10)), Number(last.slice(8, 10))); return [`${m}-${String(d).padStart(2, '0')}`]; }
    const step = p.every === 'weekly' ? 7 : 14;
    let k = p.anchor;
    while (k > first) k = addDays(k, -step);
    while (k < first) k = addDays(k, step);
    const out = [];
    for (; k <= last; k = addDays(k, step)) out.push(k);
    return out;
  }
  const EARLY = /dailypay|daily pay|payactiv|earned wage|instant pay|branch app|even app|rain app|clair|tapcheck|zayzoon/i;
  /** { earned, borrowed, spent, net } for a month: net = earned − spent (borrowed money doesn't count as gaining). */
  function monthFlow(m) {
    const inc = state.income.filter((x) => x.date.startsWith(m));
    const p = payCfg();
    const days = paydaysIn(m), t = today();
    const earlyIn = inc.filter((x) => x.kind === 'early' || EARLY.test(x.what)).reduce((a, x) => a + x.amount, 0);
    const paid = days.filter((d) => d <= t);
    // With take-home pay set, paydays are the income and early-pay pulls are just part of them (not added twice).
    const other = inc.filter((x) => x.kind !== 'borrowed' && !(p && (x.kind === 'early' || EARLY.test(x.what)))).reduce((a, x) => a + x.amount, 0);
    const earned = p ? Math.max(paid.length * perCheck(p), earlyIn) + other : inc.filter((x) => x.kind !== 'borrowed').reduce((a, x) => a + x.amount, 0);
    const expected = p ? days.length * perCheck(p) + other : 0;
    const early = inc.filter((x) => x.kind === 'early' || (p && EARLY.test(x.what))).reduce((a, x) => a + x.amount, 0);
    const borrowed = inc.filter((x) => x.kind === 'borrowed').reduce((a, x) => a + x.amount, 0);
    const spent = monthTotals(m).total;
    const repaid = state.spend.filter((x) => x.repaid && x.date.startsWith(m)).reduce((a, x) => a + x.amount, 0);
    const fees = state.spend.filter((x) => !x.repaid && x.cat === 'Advance & app fees' && x.date.startsWith(m)).reduce((a, x) => a + x.amount, 0);
    return { earned, borrowed, repaid, fees, spent, net: earned - spent, expected, paydays: days, paid, early };
  }
  const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
  function renderFlow() {
    const f = monthFlow(spendMonth);
    $('#flow-earned').textContent = money(f.earned);
    $('#flow-spent').textContent = money(f.spent);
    const net = $('#flow-net');
    net.textContent = signed(f.net);
    net.className = f.net >= 0 ? 'gain' : 'loss';
    const isNow = spendMonth === today().slice(0, 7);
    $('#flow-verdict').textContent = !f.earned && !f.spent ? 'Nothing logged for this month yet.'
      : f.net >= 0 ? `You ${isNow ? 'are' : 'were'} ahead by ${money(f.net)}${isNow ? ' so far' : ''}.`
        : `You ${isNow ? 'are' : 'were'} short by ${money(-f.net)}${isNow ? ' so far' : ''}: more went out than you earned.`;
    const left = f.paydays.length - f.paid.length;
    if (isNow && left > 0) $('#flow-verdict').textContent += ` ${left} payday${left > 1 ? 's' : ''} still to come this month.`;
    const owed = ['dave', 'brigit', 'floatme', 'earnin', 'cleo', 'empower', 'klover', 'moneylion', 'mypay', 'albert'].reduce((a, p) => a + owedTo(p), 0);
    const pc = payCfg();
    $('#flow-pay').textContent = pc
      ? `Paydays this month: ${f.paydays.map((d) => `${short(d)}${d <= today() ? ' ✓' : ''}`).join(', ')} (${money(perCheck(pc))} each).${f.paydays.length > f.paid.length ? ` Expected by month end: ${money(f.expected)}.` : ''}${f.early ? ` ${money(f.early)} of it came early through DailyPay.` : ''}`
      : 'Set your take-home pay below so paydays count as money in.';
    $('#flow-borrowed').hidden = !f.borrowed && !f.repaid && !f.fees;
    $('#flow-borrowed').textContent = [
      f.borrowed || f.repaid ? `Advances & borrowing: ${money(f.borrowed)} borrowed, ${money(f.repaid)} paid back. Neither counts as money in or out.` : '',
      f.fees ? `The fees (${money(f.fees)}) do count: that's what the advances actually cost you.` : '',
      spendMonth === today().slice(0, 7) && owed > 0.004 ? `Still owed on advances: ${money(owed)}.` : '',
    ].filter(Boolean).join(' ');
    // last 6 months
    const box = $('#flow-months');
    box.textContent = '';
    const months = [];
    const [y, mo] = today().slice(0, 7).split('-').map(Number);
    for (let i = 5; i >= 0; i--) months.push(dateKey(new Date(y, mo - 1 - i, 1)).slice(0, 7));
    const rows = months.map((m) => [m, monthFlow(m)]).filter(([, x]) => x.earned || x.spent);
    $('#flow-months-wrap').hidden = rows.length < 2;
    const max = Math.max(1, ...rows.map(([, x]) => Math.abs(x.net)));
    for (const [m, x] of rows) {
      const r = el('div', 'flow-row');
      r.append(el('span', 'flow-m', monthName(m).split(' ')[0].slice(0, 3)));
      const bar = el('div', 'flow-bar');
      const fill = el('i', x.net >= 0 ? 'gain' : 'loss'); fill.style.width = `${Math.max(3, (Math.abs(x.net) / max) * 100)}%`;
      bar.append(fill);
      r.append(bar, el('b', x.net >= 0 ? 'gain' : 'loss', signed(x.net)));
      box.append(r);
    }
  }
  function flowSummary(m = today().slice(0, 7)) {
    const f = monthFlow(m);
    if (!f.earned && !f.spent) return '';
    return `${monthName(m)}: earned ${money(f.earned)}, spent ${money(f.spent)}, net ${signed(f.net)}${f.borrowed ? `, borrowed ${money(f.borrowed)}` : ''}.`;
  }
  function spendSummary(m = today().slice(0, 7)) {
    const { total, cats } = monthTotals(m);
    if (!total) return '';
    return `Spending in ${monthName(m)} so far: ${money(total)} (${cats.map(([c, v]) => `${c} ${money(v)}`).join(', ')}).`;
  }

  // ---------- chat & AI ----------
  function match(q) {
    const s = String(q || '').toLowerCase().trim();
    return state.bills.find((b) => b.name.toLowerCase() === s) || state.bills.find((b) => b.name.toLowerCase().includes(s) || s.includes(b.name.toLowerCase()));
  }
  function summary() {
    const pc = payCfg();
    const sp = [pc ? `Take-home pay: ${money(pc.monthly)}/month, ${PAY_EVERY[pc.every]} (${money(perCheck(pc))} per paycheck).` : '', flowSummary(), spendSummary()].filter(Boolean).join(' ');
    if (!state.bills.length) return sp;
    const act = active();
    return `Bills & subscriptions (${money(act.reduce((s, b) => s + monthly(b), 0))}/month): ${act.map((b) => `${b.name} ${money(b.amount)}/${b.cycle}${b.next ? `, ${b.autopay ? 'renews' : 'due'} ${b.next}` : ''}${b.status === 'cancelling' ? ', wants to cancel' : ''}${b.autopay ? '' : ', paid manually'}`).join('; ')}.${state.bills.some((b) => b.status === 'cancelled') ? ` Cancelled: ${state.bills.filter((b) => b.status === 'cancelled').map((b) => b.name).join(', ')}.` : ''}${sp ? ` ${sp}` : ''}`;
  }
  /** Local commands (no AI needed): "cancel netflix", "what subscriptions do I have". */
  function handle(text) {
    const t = String(text || '').trim();
    let m = t.match(/^(?:help me |i want to |can you )?cancel (?:my )?(.+?)(?: subscription| membership)?[.!?]*$/i);
    if (m) {
      const b = match(m[1]);
      if (b) { cancelHelp(b); return [`Here's how to cancel ${b.name}. Open its page, do the last tap there, then tap "I cancelled it" so I stop counting it.`]; }
    }
    m = t.match(/^(?:i )?(?:just )?(?:spent|paid) \$?(\d+(?:\.\d{1,2})?)(?: dollars| bucks)? (?:on|for|at|to) (.+?)[.!]*$/i);
    if (m) {
      const x = { date: today(), amount: Number(m[1]), what: m[2].replace(/^(some|a|an|the)\s+/i, '').replace(/^\w/, (c) => c.toUpperCase()) };
      x.cat = catOf(x.what);
      logSpend(x);
      return [`Logged ${money(x.amount)} for ${x.what} (${x.cat}). ${spendSummary()}`];
    }
    m = t.match(/^(?:i )?(?:make|take home|bring home|earn) \$?([\d,]+(?:\.\d{1,2})?)(?: dollars| bucks)? (?:a|per|every) month(?: after taxes)?(?:,? (?:paid )?(weekly|every week|every (?:two|2) weeks|biweekly|twice a month|monthly))?/i);
    if (m) {
      const monthly = Number(m[1].replace(/,/g, ''));
      const every = !m[2] ? (state.settings.pay && state.settings.pay.every) || 'biweekly' : /twice/i.test(m[2]) ? 'semimonthly' : /two|2|bi/i.test(m[2]) ? 'biweekly' : /month/i.test(m[2]) ? 'monthly' : 'weekly';
      const anchor = (state.settings.pay && state.settings.pay.anchor) || '';
      state.settings.pay = { monthly, every, anchor };
      save(); render();
      return [anchor ? `Got it: ${money(monthly)} a month take-home, ${PAY_EVERY[every]}. Paydays now count as money in.` : `Got it: ${money(monthly)} a month. One more thing: open More → Money → Overview and put in one payday date, so I know which days you get paid.`];
    }
    m = t.match(/^(?:i )?(?:just )?(?:got paid|was paid|earned|made|got) \$?(\d+(?:\.\d{1,2})?)(?: dollars| bucks)?(?: (?:from|at|for) (.+?))?[.!]*$/i);
    if (m && !/\b(spent|paid for)\b/i.test(t)) {
      const x = { date: today(), amount: Number(m[1]), what: m[2] ? m[2].replace(/^\w/, (c) => c.toUpperCase()) : 'Pay', kind: 'earned' };
      logIncome(x);
      return [`Got it: +${money(x.amount)}. ${flowSummary()}`];
    }
    m = t.match(/^(?:i )?(?:just )?(?:paid back|repaid|paid off) \$?(\d+(?:\.\d{1,2})?)(?: dollars| bucks)?(?: (?:to|on) (.+?))?[.!]*$/i);
    if (m) {
      const what = m[2] ? m[2].replace(/^\w/, (c) => c.toUpperCase()) : 'Advance';
      const prov = providerOf(what);
      if (prov || !m[2]) {
        logSpend({ date: today(), amount: Number(m[1]), what, repaid: true, provider: prov });
        return [`Logged: paid back ${money(Number(m[1]))}${m[2] ? ` to ${what}` : ''}. That cancels out what you borrowed, so it isn't counted as spending; only fees are.`];
      }
      const x = { date: today(), amount: Number(m[1]), what, cat: catOf(what) === 'Other' ? 'Loans & payment plans' : catOf(what) };
      logSpend(x);
      return [`Logged ${money(x.amount)} to ${what} (${x.cat}).`];
    }
    m = t.match(/^(?:i )?(?:just )?borrowed \$?(\d+(?:\.\d{1,2})?)(?: (?:from|on|with) (.+?))?[.!]*$/i);
    if (m) {
      const x = { date: today(), amount: Number(m[1]), what: m[2] ? m[2].replace(/^\w/, (c) => c.toUpperCase()) : 'Borrowed', kind: 'borrowed' };
      logIncome(x);
      return [`Logged ${money(x.amount)} borrowed${m[2] ? ` from ${x.what}` : ''}. It's tracked separately from what you earn, since it has to be paid back.`];
    }
    if (/\b(am i (losing|making|gaining) money|(losing|gaining|making) money|my net|cash ?flow|money in (and|vs\.?) (out|money out)|how am i doing (with|on) money|am i (ahead|behind|broke))\b/i.test(t)) {
      const now = today().slice(0, 7), f = monthFlow(now);
      const [y, mo] = now.split('-').map(Number);
      const prev = dateKey(new Date(y, mo - 2, 1)).slice(0, 7), p = monthFlow(prev);
      if (!f.earned && !f.spent && !p.earned && !p.spent) return ['I don\'t have your money in or out yet. Turn on "Watch my notifications" in More → Money, or tell me "I got paid 850" and "I spent 20 on gas".'];
      return [`${monthName(now)} so far: earned ${money(f.earned)}, spent ${money(f.spent)}, so ${f.net >= 0 ? `you're ahead ${money(f.net)}` : `you're short ${money(-f.net)}`}.${f.borrowed || f.repaid ? ` Advances: borrowed ${money(f.borrowed)}, paid back ${money(f.repaid)} (not counted either way)${f.fees ? `; their fees, ${money(f.fees)}, are counted` : ''}.` : ''}${p.earned || p.spent ? `\nLast month (${monthName(prev)}): ${signed(p.net)} (earned ${money(p.earned)}, spent ${money(p.spent)}${p.borrowed ? `, borrowed ${money(p.borrowed)}` : ''}).` : ''}`];
    }
    if (/\b(how much (did|have) i (spent|spend)|my (expenses|spending)|where (did|does) my money go|what (did|have) i spen[dt])\b/i.test(t)) {
      const { total, cats } = monthTotals(today().slice(0, 7));
      if (!total) return ['Nothing logged this month yet. Turn on "Watch my email notifications" in More → Money, or tell me "I spent 20 on gas".'];
      const loan = cats.filter(([c]) => c === 'Loans & payment plans' || c === 'Advance & app fees').reduce((a, [, v]) => a + v, 0);
      return [`This month you've spent ${money(total)}:\n${cats.map(([c, v]) => `• ${c}: ${money(v)}`).join('\n')}${loan ? `\n\n${money(loan)} of that went to loans, payment plans and advance fees.` : ''}`];
    }
    if (/\b(what|which|how much|list)\b.*\b(subscriptions?|bills?)\b/i.test(t) && state.bills.length) {
      const act = active();
      return [`You're paying ${money(act.reduce((s, b) => s + monthly(b), 0))} a month:\n${act.sort((a, b) => (a.next || '9').localeCompare(b.next || '9')).map((b) => `• ${b.name}: ${money(b.amount)}/${b.cycle === 'month' ? 'mo' : b.cycle}${b.next ? ` (${b.autopay ? 'renews' : 'due'} ${when(b.next)})` : ''}`).join('\n')}`];
    }
    return null;
  }
  roll();
  return { items, sync, render, add, importText, cancelHelp, summary, handle, open, match, markPaid, poll, parseNote, readNotes, parseSpend, logSpend, spendSummary, parseIncome, logIncome, monthFlow, looksLikeList, importShared, showPane };
};
