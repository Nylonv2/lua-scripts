// Assistant tab → Replies: Rias suggests replies to your texts (Messages, WhatsApp, Instagram…),
// read from your notifications. She never sends anything herself: you pick a reply, then copy it
// and open the chat, or tap Send (through that app's own notification reply).
// Also owns the Replies / Clients switch at the top of the tab.
window.createReplyHelper = function createReplyHelper(ctx) {
  'use strict';
  const { state, $ } = ctx;
  const D = () => window.RiasDevice || null;
  let pane = 'msgs';
  let current = null; // the conversation open in the sheet: { key, title, app, canReply, thread, paste }
  let tone = '';

  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const when = (ts) => {
    const m = Math.round((Date.now() - ts) / 60000);
    return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : 'yesterday';
  };
  function snack(text) {
    const el = $('#biz-snack');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(snack.t);
    snack.t = setTimeout(() => { el.hidden = true; }, 3800);
  }
  function copy(text) {
    const d = D();
    if (d && d.copy) { try { return d.copy(text); } catch { /* fall through */ } }
    try { navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  // ---------- Replies / Clients switch ----------
  function setPane(p) {
    pane = p;
    for (const b of $('#biz-seg').querySelectorAll('button')) b.classList.toggle('active', b.dataset.pane === p);
    $('#pane-msgs').hidden = p !== 'msgs';
    $('#pane-clients').hidden = p !== 'clients';
    $('#pane-tr').hidden = p !== 'tr';
    if (p === 'msgs') render(); else if (p === 'tr') ctx.renderTranslate(); else ctx.renderClients();
  }
  $('#biz-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-pane]'); if (b) setPane(b.dataset.pane); });

  // ---------- recent messages ----------
  function list() {
    const d = D();
    if (!d || !d.messages) return null;
    try { return JSON.parse(d.messages()); } catch { return []; }
  }
  function allowed() {
    const d = D();
    if (!d || !d.status) return false;
    try { return !!JSON.parse(d.status()).notifications; } catch { return false; }
  }
  function render() {
    const box = $('#rp-list');
    const d = D();
    if (!d || !d.messages) {
      $('#rp-perm').hidden = true;
      box.innerHTML = '<div class="biz-empty"><div class="biz-empty-ic">💬</div><b>Paste a message to get replies</b><span>In the Android app, your new texts and messages show up here by themselves.</span></div>';
      return;
    }
    const ok = allowed();
    $('#rp-perm').hidden = ok;
    const msgs = ok ? list() || [] : [];
    if (!msgs.length) {
      box.innerHTML = ok
        ? '<div class="biz-empty"><div class="biz-empty-ic">💬</div><b>No new messages</b><span>When someone texts you, it shows up here. Or tap <i>Paste a message</i>.</span></div>'
        : '';
      return;
    }
    box.innerHTML = msgs.map((m) => {
      const name = m.convo || m.title || m.app;
      return `<button type="button" class="rp-item" data-key="${esc(m.key)}">
        <span class="rp-av">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span>
        <span class="rp-txt"><b>${esc(name)}</b><small>${esc(m.text)}</small></span>
        <span class="rp-side"><small>${when(m.ts)}</small><em>${esc(m.app)}</em></span>
      </button>`;
    }).join('');
  }
  $('#rp-list').addEventListener('click', (e) => {
    const b = e.target.closest('.rp-item');
    if (!b) return;
    const m = (list() || []).find((x) => x.key === b.dataset.key);
    if (m) openConvo(m);
  });
  $('#rp-refresh').addEventListener('click', () => { render(); snack('Up to date.'); });
  $('#rp-allow').addEventListener('click', () => { const d = D(); if (d && d.openSettings) d.openSettings('notifications'); });
  $('#rp-paste').addEventListener('click', () => openConvo(null));

  // ---------- the reply sheet ----------
  function threadOf(m) {
    const name = m.convo || m.title || 'Them';
    const hist = (m.history || []).map((h) => ({ from: h.from ? h.from : 'Me', text: h.text }));
    if (hist.length) return hist;
    return [{ from: m.title || name, text: m.text }];
  }
  function openConvo(m) {
    const f = $('#rp-form');
    f.reset();
    tone = '';
    for (const b of $('#rp-tones').querySelectorAll('button')) b.classList.remove('on');
    $('#rp-options').innerHTML = '';
    $('#rp-status').textContent = '';
    if (m) {
      current = { key: m.key, title: m.convo || m.title || m.app, app: m.app, canReply: !!m.canReply, thread: threadOf(m) };
      $('#rp-title').textContent = `Reply to ${current.title}`;
      $('#rp-paste-fields').hidden = true;
      $('#rp-thread').hidden = false;
      $('#rp-thread').innerHTML = current.thread.slice(-5).map((t) => `<div class="rp-bub${t.from === 'Me' ? ' me' : ''}"><small>${esc(t.from === 'Me' ? 'You' : t.from)}</small>${esc(t.text)}</div>`).join('');
      $('#rp-open').textContent = 'Copy & open chat';
      $('#rp-send').hidden = !current.canReply;
      $('#rp-send').textContent = `Send to ${current.title}`;
      $('#rp-note').textContent = current.canReply
        ? `Nothing is sent unless you tap Send. "Copy & open chat" opens ${current.app} so you can paste it yourself.`
        : `Copy & open chat opens ${current.app}; paste and send it there. Nothing is sent by Rias.`;
    } else {
      current = { key: null, title: '', app: '', canReply: false, thread: [], paste: true };
      $('#rp-title').textContent = 'Reply to a message';
      $('#rp-paste-fields').hidden = false;
      $('#rp-thread').hidden = true;
      $('#rp-send').hidden = true;
      $('#rp-open').textContent = 'Copy';
      $('#rp-note').textContent = 'Copy your reply, then paste it in the chat.';
    }
    $('#rp-copy').hidden = !!current.paste;
    $('#rp-suggest').hidden = false;
    $('#rp-sheet').showModal();
    // A message from the shade: suggest right away.
    if (m && ctx.ai.enabled()) suggest();
    else if (!ctx.ai.enabled()) $('#rp-status').textContent = 'Turn on her AI (Settings → Rias\'s mind) for suggested replies. You can still write one here.';
  }
  async function suggest() {
    const f = $('#rp-form');
    if (!current) return;
    let thread = current.thread;
    if (current.paste) {
      const theirs = f.elements.theirs.value.trim();
      if (!theirs) { $('#rp-status').textContent = 'Paste their message first.'; return; }
      current.title = f.elements.who.value.trim() || 'them';
      thread = [{ from: current.title, text: theirs }];
    }
    if (!ctx.ai.enabled()) { $('#rp-status').textContent = 'Turn on her AI (Settings → Rias\'s mind) for suggested replies.'; return; }
    $('#rp-status').textContent = 'Thinking of replies…';
    $('#rp-suggest').disabled = true;
    const facts = (state.memory || []).slice(-12).map((x) => x.text).join('; ');
    const res = await ctx.ai.suggestReplies({
      who: current.title, app: current.app, thread, instruction: f.elements.instruction.value.trim(), tone,
      me: state.profile ? state.profile.name : '', facts,
    });
    $('#rp-suggest').disabled = false;
    if (res.error) { $('#rp-status').textContent = res.error === 'no-ai' ? 'Turn on her AI for suggestions.' : res.error; return; }
    $('#rp-status').textContent = 'Tap one to use it (you can edit it).';
    $('#rp-options').innerHTML = res.replies.map((r) => `<button type="button" class="rp-opt">${esc(r)}</button>`).join('');
  }
  $('#rp-suggest').addEventListener('click', suggest);
  $('#rp-tones').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tone]');
    if (!b) return;
    const on = !b.classList.contains('on');
    for (const x of $('#rp-tones').querySelectorAll('button')) x.classList.remove('on');
    b.classList.toggle('on', on);
    tone = on ? b.dataset.tone : '';
    suggest();
  });
  $('#rp-options').addEventListener('click', (e) => {
    const b = e.target.closest('.rp-opt');
    if (!b) return;
    for (const x of $('#rp-options').querySelectorAll('.rp-opt')) x.classList.toggle('on', x === b);
    $('#rp-form').elements.reply.value = b.textContent;
  });
  const replyText = () => $('#rp-form').elements.reply.value.trim();
  $('#rp-copy').addEventListener('click', () => {
    if (!replyText()) { $('#rp-status').textContent = 'Pick or write a reply first.'; return; }
    snack(copy(replyText()) ? 'Copied.' : 'Couldn\'t copy on this phone.');
  });
  $('#rp-open').addEventListener('click', () => {
    const text = replyText();
    if (!text) { $('#rp-status').textContent = 'Pick or write a reply first.'; return; }
    const copied = copy(text);
    if (current.paste || !current.key) { snack(copied ? 'Copied. Paste it in the chat.' : 'Couldn\'t copy on this phone.'); return; }
    const d = D();
    const r = d && d.openChat ? String(d.openChat(current.key)) : 'gone';
    $('#rp-sheet').close();
    if (r !== 'ok') snack(`Copied. Open ${current.app} and paste it (that notification is gone).`);
    else snack('Copied. Paste it and send~');
  });
  // Only ever runs when you tap Send yourself.
  $('#rp-send').addEventListener('click', () => {
    const text = replyText();
    if (!text) { $('#rp-status').textContent = 'Pick or write a reply first.'; return; }
    const d = D();
    const r = d && d.sendReply && current.key ? String(d.sendReply(current.key, text)) : 'no-reply';
    if (r === 'ok') { $('#rp-sheet').close(); snack(`Sent to ${current.title}.`); return; }
    $('#rp-status').textContent = r === 'no-reply' ? `${current.app} doesn't allow replying from here. Use Copy & open chat.` : 'That message notification is gone, so I can\'t reply from here. Use Copy & open chat.';
  });

  /** "Help me reply to Jake": open the Replies section, and Jake's chat if it's there. */
  function helpWith(name) {
    setPane('msgs');
    const n = String(name || '').toLowerCase().trim();
    const m = n && (list() || []).find((x) => (x.convo || x.title || '').toLowerCase().includes(n));
    if (m) setTimeout(() => openConvo(m), 300);
    return !!m;
  }

  return { render, setPane, helpWith, get pane() { return pane; } };
};
