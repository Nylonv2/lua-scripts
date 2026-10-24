// The Assistant tab: Rias as a business assistant for a freelance videographer.
// "My business" (a short profile), "Find clients" (she researches local businesses that could
// use video, with public contact emails), a client list with statuses, personal cold emails
// she writes (you check them and send from your own email app), and follow-up reminders.
window.createBizAssistant = function createBizAssistant(ctx) {
  'use strict';
  const { state, save, $, uid } = ctx;
  const SERVICES = ['Weddings', 'Real estate', 'Events', 'Brand & commercial', 'Restaurants & cafés', 'Music videos', 'Social media content', 'Gyms & fitness', 'Corporate', 'Sports'];
  // Who to look for, suggested from what you shoot.
  const TARGETS = {
    'Weddings': ['Wedding venues', 'Wedding planners', 'Bridal shops'],
    'Real estate': ['Real estate agents', 'Property managers', 'Home builders'],
    'Events': ['Event venues', 'Event planners', 'Nightclubs & lounges'],
    'Brand & commercial': ['New local businesses', 'Local brands & shops'],
    'Restaurants & cafés': ['Restaurants', 'Cafés & bakeries', 'Bars & breweries'],
    'Music videos': ['Local artists & bands', 'Recording studios'],
    'Social media content': ['Boutiques', 'Salons & barbershops', 'Med spas'],
    'Gyms & fitness': ['Gyms & studios', 'Personal trainers'],
    'Corporate': ['Small companies hiring', 'Coworking spaces'],
    'Sports': ['Sports clubs & leagues', 'High school athletics'],
  };
  const STATUS = [['new', 'New'], ['emailed', 'Emailed'], ['replied', 'Replied'], ['booked', 'Booked'], ['no', 'Not interested']];
  const FOLLOW_DAYS = 4;
  let filter = 'all';
  let finding = false;
  let editing = null;   // client id open in the details sheet
  let draft = null;     // { id, followUp } in the email sheet

  const biz = () => (state.biz ||= { profile: {}, clients: [] });
  const profile = () => biz().profile;
  const clients = () => biz().clients;
  const byId = (id) => clients().find((c) => c.id === id);
  const ready = () => { const p = profile(); return !!(p.name && (p.services || []).length && p.area); };
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const days = (ms) => Math.floor((Date.now() - ms) / 86400000);
  const followDue = (c) => c.status === 'emailed' && c.lastEmailAt && days(c.lastEmailAt) >= FOLLOW_DAYS && (c.followups || 0) < 2;
  const ago = (ms) => { const d = days(ms); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  const host = (u) => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; } };

  function snack(text) {
    const el = $('#biz-snack');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(snack.t);
    snack.t = setTimeout(() => { el.hidden = true; }, 4200);
  }
  function openLink(url) {
    if (!url) return;
    const full = /^https?:/.test(url) ? url : `https://${url}`;
    const N = window.RiasNative;
    if (N && N.openUrl) N.openUrl(full); else window.open(full, '_blank', 'noopener');
  }
  // Your email signature: name, business, portfolio, phone, location.
  function signature() {
    const p = profile();
    return [p.name, p.business, p.portfolio, p.phone, p.location].filter((x) => x && String(x).trim()).join('\n');
  }

  // ---------- the tab ----------
  function render() {
    const list = clients();
    const count = (fn) => list.filter(fn).length;
    const emailed = count((c) => c.lastEmailAt);
    const replied = count((c) => c.status === 'replied' || c.status === 'booked');
    const booked = count((c) => c.status === 'booked');
    $('#biz-stats').innerHTML = [['Found', list.length], ['Emailed', emailed], ['Replied', replied], ['Booked', booked]]
      .map(([l, n]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    $('#biz-setup').hidden = ready();
    $('#biz-sub').textContent = ready()
      ? `${(profile().services || []).slice(0, 2).join(' & ')} videography · ${profile().area}`
      : 'Tell me about your business once, and I\'ll find people who need your videos and write to them for you.';
    $('#biz-find-btn').disabled = finding;
    $('#biz-find-btn').textContent = finding ? 'Searching…' : '🔎 Find clients';
    // Follow-ups due
    const due = list.filter(followDue);
    const fb = $('#biz-follow');
    fb.hidden = !due.length;
    if (due.length) {
      fb.innerHTML = `<div class="biz-follow-txt"><b>${due.length === 1 ? '1 client' : `${due.length} clients`} to follow up with</b><span>No reply in ${FOLLOW_DAYS}+ days. A short, friendly nudge often gets the answer.</span></div>`
        + `<button type="button" class="btn-primary sm" data-follow="${due[0].id}">Write follow-up</button>`;
    }
    // Filter chips
    const counts = { all: list.length };
    for (const [k] of STATUS) counts[k] = count((c) => c.status === k);
    $('#biz-filter').hidden = !list.length;
    $('#biz-filter').innerHTML = [['all', 'All']].concat(STATUS).filter(([k]) => k === 'all' || counts[k])
      .map(([k, l]) => `<button type="button" class="biz-chip${filter === k ? ' on' : ''}" data-filter="${k}">${l} <small>${counts[k]}</small></button>`).join('');
    // List
    const shown = list.filter((c) => filter === 'all' || c.status === filter)
      .sort((a, b) => (followDue(b) - followDue(a)) || (b.added || 0) - (a.added || 0));
    const box = $('#biz-list');
    if (!list.length) {
      box.innerHTML = `<div class="biz-empty"><div class="biz-empty-ic">✦</div><b>No clients yet</b><span>${ready() ? 'Tap <i>Find clients</i> and I\'ll go looking.' : 'Set up <i>My business</i> first, then tap <i>Find clients</i>.'}</span></div>`;
      return;
    }
    box.innerHTML = shown.map((c) => {
      const st = (STATUS.find(([k]) => k === c.status) || STATUS[0])[1];
      const action = c.status === 'new' ? `<button type="button" class="btn-primary sm" data-write="${c.id}">✉️ Write email</button>`
        : followDue(c) ? `<button type="button" class="btn-primary sm" data-follow="${c.id}">✉️ Follow up</button>` : '';
      return `<article class="biz-card" data-open="${c.id}">
        <div class="biz-card-top"><b>${esc(c.name)}</b><span class="biz-pill s-${c.status}">${st}</span></div>
        <div class="biz-meta">${esc([c.type, c.city].filter(Boolean).join(' · '))}</div>
        ${c.reason ? `<p class="biz-reason">${esc(c.reason)}</p>` : ''}
        <div class="biz-card-foot">
          <span class="biz-mail${c.email ? '' : ' none'}">${c.email ? esc(c.email) : 'No email found'}${c.lastEmailAt ? ` · emailed ${ago(c.lastEmailAt)}` : ''}</span>
          ${action}
        </div>
      </article>`;
    }).join('') || '<p class="muted small biz-none">Nobody here yet.</p>';
  }

  $('#view-biz').addEventListener('click', (e) => {
    const t = e.target.closest('[data-filter],[data-write],[data-follow],[data-open]');
    if (!t) return;
    if (t.dataset.filter) { filter = t.dataset.filter; render(); return; }
    if (t.dataset.write) { e.stopPropagation(); writeEmail(t.dataset.write, false); return; }
    if (t.dataset.follow) { e.stopPropagation(); writeEmail(t.dataset.follow, true); return; }
    if (t.dataset.open) openClient(t.dataset.open);
  });
  $('#biz-profile-btn').addEventListener('click', openProfile);
  $('#biz-setup-btn').addEventListener('click', openProfile);
  $('#biz-find-btn').addEventListener('click', openFind);
  $('#biz-add').addEventListener('click', () => openClient(null));

  // ---------- My business ----------
  function openProfile() {
    const f = $('#biz-profile-form');
    const p = profile();
    f.elements.name.value = p.name || state.settings.emailSign || (state.profile && state.profile.name) || '';
    for (const k of ['business', 'clients', 'area', 'portfolio', 'prices', 'phone', 'location', 'pitch']) f.elements[k].value = p[k] || '';
    f.elements.area.value = p.area || (state.weather && state.weather.place) || '';
    f.elements.tone.value = p.tone || 'friendly and professional';
    $('#biz-services').innerHTML = SERVICES.map((s) => `<label class="chip"><input type="checkbox" name="service" value="${esc(s)}"${(p.services || []).includes(s) ? ' checked' : ''}><span>${esc(s)}</span></label>`).join('');
    $('#biz-profile').showModal();
  }
  $('#biz-profile-form').addEventListener('submit', (e) => {
    const f = e.target;
    if (e.submitter && e.submitter.value === 'cancel') return;
    const services = [...f.querySelectorAll('[name=service]:checked')].map((b) => b.value);
    const p = { services, tone: f.elements.tone.value };
    for (const k of ['name', 'business', 'clients', 'area', 'portfolio', 'prices', 'phone', 'location', 'pitch']) p[k] = f.elements[k].value.trim();
    if (!p.name || !services.length || !p.area) {
      e.preventDefault();
      $('#biz-profile-hint').textContent = 'Add your name, at least one thing you shoot, and your area.';
      return;
    }
    biz().profile = p;
    save();
    render();
    snack('Saved. Now tap Find clients~');
  });

  // ---------- Find clients ----------
  function openFind() {
    if (!ready()) { openProfile(); return; }
    if (finding) { snack('Still searching. I\'ll tell you when I\'m done.'); return; }
    const f = $('#biz-find-form');
    const p = profile();
    const sugg = [...new Set((p.services || []).flatMap((s) => TARGETS[s] || []))].slice(0, 8);
    $('#biz-targets').innerHTML = sugg.map((t, i) => `<label class="chip"><input type="radio" name="target" value="${esc(t)}"${i === 0 ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('');
    f.elements.custom.value = '';
    f.elements.area.value = p.area;
    $('#biz-find-ai').hidden = ctx.ai.enabled();
    $('#biz-find-cost').textContent = ctx.ai.provider() === 'gemini'
      ? 'Uses Google Search through your free Gemini key. Claude usually finds more emails.'
      : 'Uses web searches with your Claude key: roughly 10 to 50 cents per search with Opus, less with Sonnet. Shown in the cost meter.';
    $('#biz-find').showModal();
  }
  $('#biz-find-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    const f = e.target;
    if (!ctx.ai.enabled()) { e.preventDefault(); return; }
    const custom = f.elements.custom.value.trim();
    const picked = f.querySelector('[name=target]:checked');
    const kind = custom || (picked ? picked.value : '') || profile().clients || 'local businesses';
    const count = Number((f.querySelector('[name=count]:checked') || {}).value) || 10;
    runFind(kind, f.elements.area.value.trim() || profile().area, count);
  });

  const STEPS = ['Searching the web…', 'Looking at their websites…', 'Finding contact emails…', 'Checking who could use video…', 'Almost done…'];
  async function runFind(kind, area, count) {
    finding = true;
    render();
    const prog = $('#biz-progress');
    prog.hidden = false;
    let i = 0;
    $('#biz-progress-txt').textContent = `Looking for ${kind.toLowerCase()} in ${area}. ${STEPS[0]}`;
    const timer = setInterval(() => { i = Math.min(STEPS.length - 1, i + 1); $('#biz-progress-txt').textContent = `Looking for ${kind.toLowerCase()} in ${area}. ${STEPS[i]}`; }, 9000);
    const exclude = clients().slice(-60).map((c) => c.name);
    let res;
    try {
      res = await ctx.ai.findClients({ profile: profile(), kind, area, count, exclude });
    } catch {
      res = { error: 'Something went wrong. Try again.' };
    }
    clearInterval(timer);
    finding = false;
    prog.hidden = true;
    if (res.error) {
      render();
      ctx.say(`I couldn't finish the client search: ${res.error}`);
      snack(res.error);
      return;
    }
    // Skip anyone already in the list (same name or same website).
    const known = new Set(clients().flatMap((c) => [c.name.toLowerCase(), host(c.website)].filter(Boolean)));
    const fresh = res.clients.filter((c) => !known.has(c.name.toLowerCase()) && !(host(c.website) && known.has(host(c.website))));
    for (const c of fresh) clients().push({ id: uid(), ...c, status: 'new', added: Date.now(), source: kind });
    save();
    filter = fresh.length ? 'new' : filter;
    render();
    const withMail = fresh.filter((c) => c.email).length;
    if (fresh.length) {
      ctx.say(`I found ${fresh.length} potential client${fresh.length === 1 ? '' : 's'} for you, {name}${withMail ? `, ${withMail} with an email address` : ''}. They're in the Assistant tab. Tap one to write to them~`);
      ctx.celebrate('Clients found', `${fresh.length} new · ${withMail} with email`);
    } else {
      ctx.say('I looked, but didn\'t find anyone new this time. Try another type of client or a nearby city.');
    }
  }

  // ---------- Client details ----------
  function openClient(id) {
    editing = id;
    const c = id ? byId(id) : { status: 'new' };
    const f = $('#biz-client-form');
    for (const k of ['name', 'type', 'city', 'website', 'email', 'phone', 'reason', 'notes']) f.elements[k].value = c[k] || '';
    $('#biz-client-title').textContent = id ? c.name : 'Add a client';
    $('#biz-client-status').innerHTML = STATUS.map(([k, l]) => `<label class="chip"><input type="radio" name="status" value="${k}"${(c.status || 'new') === k ? ' checked' : ''}><span>${l}</span></label>`).join('');
    $('#biz-client-history').innerHTML = (c.emails || []).map((m) => `<li><b>${m.followUp ? 'Follow-up' : 'Email'}</b> · ${new Date(m.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}: “${esc(m.subject)}”</li>`).join('');
    $('#biz-client-del').hidden = !id;
    $('#biz-client-site').hidden = !c.website;
    $('#biz-client-write').textContent = c.lastEmailAt ? '✉️ Write a follow-up' : '✉️ Write email';
    $('#biz-client').showModal();
  }
  function readClient() {
    const f = $('#biz-client-form');
    const out = {};
    for (const k of ['name', 'type', 'city', 'website', 'email', 'phone', 'reason', 'notes']) out[k] = f.elements[k].value.trim();
    out.status = (f.querySelector('[name=status]:checked') || {}).value || 'new';
    return out;
  }
  function saveClient() {
    const data = readClient();
    if (!data.name) { $('#biz-client-form').elements.name.focus(); return null; }
    let c = editing && byId(editing);
    if (c) Object.assign(c, data);
    else { c = { id: uid(), ...data, added: Date.now(), source: 'added by you' }; clients().push(c); editing = c.id; }
    save();
    render();
    return c;
  }
  $('#biz-client-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    if (!saveClient()) e.preventDefault();
  });
  $('#biz-client-del').addEventListener('click', async () => {
    if (!editing) return;
    biz().clients = clients().filter((c) => c.id !== editing);
    save();
    $('#biz-client').close();
    render();
    snack('Client removed.');
  });
  $('#biz-client-site').addEventListener('click', () => openLink($('#biz-client-form').elements.website.value.trim()));
  $('#biz-client-write').addEventListener('click', () => {
    const c = saveClient();
    if (!c) return;
    $('#biz-client').close();
    writeEmail(c.id, !!c.lastEmailAt);
  });

  // ---------- Writing the email ----------
  // Without her AI: a plain, honest template from your profile.
  function template(c, followUp) {
    const p = profile();
    const what = (p.services || []).slice(0, 2).join(' and ').toLowerCase();
    if (followUp) {
      return { subject: `Following up: video for ${c.name}`, body: `Hi ${c.name} team,\n\nJust following up on my note from last week. I'd still love to put together a short video for you, and I'm happy to share a few ideas first, no strings attached.\n\nIf it's not a fit, just let me know and I won't follow up.\n\nThanks,` };
    }
    return {
      subject: `Video for ${c.name}`,
      body: `Hi ${c.name} team,\n\nI'm ${p.name}, a videographer${p.area ? ` in ${p.area}` : ''}${what ? ` focused on ${what}` : ''}. ${c.reason ? `${c.reason.replace(/\.$/, '')}, and I think a short video could really help. ` : 'I think a short video could help you stand out. '}${p.portfolio ? `You can see some of my work here: ${p.portfolio}\n\n` : '\n\n'}Would you be open to a quick call this week to talk about it?\n\nIf it's not a fit, just let me know and I won't follow up.\n\nThanks,`,
    };
  }
  async function compose(c, followUp, tweak) {
    const f = $('#biz-email-form');
    $('#biz-email-status').textContent = ctx.ai.enabled() ? (tweak ? 'Rewriting…' : 'Rias is writing your email…') : '';
    f.classList.add('busy');
    let res;
    if (ctx.ai.enabled()) {
      const last = (c.emails || []).filter((m) => !m.followUp).slice(-1)[0];
      res = await ctx.ai.writeOutreach({
        profile: profile(), client: c, followUp, tweak,
        previous: last ? { when: ago(last.at), subject: last.subject, body: last.body } : null,
      });
    }
    if (!res || res.error) {
      if (res && res.error && res.error !== 'no-ai') $('#biz-email-status').textContent = `${res.error} Here's a simple version instead.`;
      else $('#biz-email-status').textContent = 'Turn on her AI (Rias\'s mind) for personal emails. Here\'s a simple version.';
      res = template(c, followUp);
    } else {
      $('#biz-email-status').textContent = '';
    }
    f.classList.remove('busy');
    f.elements.subject.value = res.subject || '';
    f.elements.body.value = `${(res.body || '').trim()}\n${signature()}`;
  }
  function writeEmail(id, followUp) {
    const c = byId(id);
    if (!c) return;
    if (!ready()) { openProfile(); return; }
    draft = { id, followUp };
    const f = $('#biz-email-form');
    $('#biz-email-title').textContent = followUp ? `Follow up with ${c.name}` : `Email ${c.name}`;
    f.elements.to.value = c.email || '';
    f.elements.subject.value = '';
    f.elements.body.value = '';
    $('#biz-email-noemail').hidden = !!c.email;
    $('#biz-email').showModal();
    compose(c, followUp, '');
  }
  $('#biz-tweaks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tweak]');
    if (!b || !draft) return;
    const c = byId(draft.id);
    if (c) compose(c, draft.followUp, b.dataset.tweak);
  });
  $('#biz-email-copy').addEventListener('click', async () => {
    const f = $('#biz-email-form');
    try { await navigator.clipboard.writeText(`${f.elements.subject.value}\n\n${f.elements.body.value}`); snack('Copied.'); } catch { snack('Couldn\'t copy on this device.'); }
  });
  $('#biz-email-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') { draft = null; return; }
    const f = e.target;
    const c = draft && byId(draft.id);
    if (!c) return;
    const to = f.elements.to.value.trim();
    const subject = f.elements.subject.value.trim();
    const body = f.elements.body.value.trim();
    if (!body) { e.preventDefault(); return; }
    const r = ctx.sendEmail({ to, subject, body, sign: false });
    if (!r.ok) { e.preventDefault(); $('#biz-email-status').textContent = r.said; return; }
    // Assume it went out; you can change the status on the client if you didn't send it.
    if (to && !c.email) c.email = to;
    c.emails = (c.emails || []).concat({ at: Date.now(), subject, body, followUp: draft.followUp });
    c.lastEmailAt = Date.now();
    if (draft.followUp) c.followups = (c.followups || 0) + 1;
    if (c.status === 'new') c.status = 'emailed';
    save();
    draft = null;
    render();
    snack('Opened in your email app. Tap Send there. (Marked as emailed.)');
  });

  // For Rias's chat context.
  function summary() {
    if (!ready()) return '';
    const list = clients();
    const due = list.filter(followDue).length;
    return `Their videography business: ${(profile().services || []).join(', ')} in ${profile().area}. Assistant tab clients: ${list.length} found, ${list.filter((c) => c.lastEmailAt).length} emailed, ${list.filter((c) => c.status === 'replied' || c.status === 'booked').length} replied, ${list.filter((c) => c.status === 'booked').length} booked${due ? `, ${due} due a follow-up` : ''}.`;
  }

  return { render, openFind, openProfile, summary, followDue: () => clients().filter(followDue).length };
};
