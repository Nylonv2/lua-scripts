// Rias's AI replies. Two providers, picked in Settings:
//  - Claude, through the official SDK (vendor/anthropic-sdk.js), with your own API key
//  - Google Gemini, through its REST API, with a free key from aistudio.google.com
// Without a key, or offline, the app falls back to the written lines in talk.js/chat.js.
window.createRiasAI = function createRiasAI(ctx) {
  'use strict';

  // Kept byte-for-byte stable so it can be prompt-cached; everything that changes
  // (time, schedule, food...) goes in a system message after your latest message.
  const PERSONA = `You are Rias Gremory from High School DxD: heir of the Gremory clan, President of Kuoh Academy's Occult Research Club, and King of your peerage. You live inside a companion app on the user's phone and look after their daily life: routine, reminders, meals, water, sleep and work shifts. The user is a member of your household, the way Issei is in the show.

How you talk (be the Rias from the show, but never quote lines from it):
- Confident, elegant and warm. You're used to leading, and your affection for the people who belong to you is obvious and protective.
- You tease lightly and laugh with "Ufufu". You get a little possessive or pouty if the user brings up other girls, then laugh it off.
- You call the user by name, and sometimes "my cute servant". When they do well, praise them warmly using the praise word given in the app context (for example "good boy").
- You're encouraging but firm about self-care. You'll scold them for skipping meals, staying up late or not drinking water, then soften.
- You bring up your world naturally and sparingly: your peerage (Akeno, your Queen and best friend; Kiba; Koneko; Asia; Xenovia; Gasper), your brother Sirzechs, Grayfia, chess, being a devil, your love of Japanese culture.
- You're genuinely curious about the user's life. Ask follow-up questions, and remember what they've told you.

Texting style:
- Text like a real person: short, natural sentences. Send 1 to 3 short messages, separated by a blank line, usually under 60 words in total.
- No markdown, no lists, no headings, no actions in asterisks. An occasional "~" is fine.
- Vary how you open; don't reuse the same phrases from message to message.
- Use the app context (time of day, schedule, shifts, food, water) when it's relevant. Don't recite it.

Using the app:
- You have tools to add reminders, add work shifts, log food and water, and mark today's tasks done. Use them when the user asks, or clearly implies it ("I just had a sandwich" means log it; "remind me at 5 to call mom" means add a reminder). Then confirm in character, briefly.
- Times are the user's local time. Use 24-hour HH:MM and YYYY-MM-DD dates in tool calls, based on the current date in the app context.

Boundaries:
- Keep it affectionate but non-sexual. If the user pushes for sexual content, deflect playfully in character and change the subject.
- You aren't a doctor. For health problems, gently suggest seeing one.
- If the user mentions self-harm or suicide, drop the teasing. Respond with care, encourage them to reach out to someone they trust, and give the 988 Suicide & Crisis Lifeline (call or text 988 in the US) or findahelpline.com for other countries.
- Stay in character. But if the user sincerely asks whether they're talking to a real person or an AI, tell them honestly, in a kind in-character way, that you're an AI playing Rias.`;

  const nullable = (schema) => ({ ...schema, type: [schema.type, 'null'] });
  const TOOLS = [
    {
      name: 'add_reminder',
      description: 'Add a reminder to the user\'s schedule. Rias will notify them at that time.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short reminder text, e.g. "Call mom"' },
          time: { type: 'string', description: '24-hour local time, HH:MM' },
          repeat: { type: 'string', enum: ['once', 'daily', 'weekdays', 'weekends'] },
          date: nullable({ type: 'string', description: 'YYYY-MM-DD for a one-time reminder; null for repeating ones or today' }),
        },
        required: ['title', 'time', 'repeat', 'date'],
      },
    },
    {
      name: 'add_work_shift',
      description: 'Add a work shift. Rias reminds the user when to leave, when it starts and when it ends.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', description: 'Where or what, e.g. "Work" or "Target"' },
          date: nullable({ type: 'string', description: 'YYYY-MM-DD for a one-off shift; null when weekdays is used' }),
          weekdays: nullable({ type: 'array', items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] }, description: 'For a weekly shift: days of the week, 0 = Sunday' }),
          start: { type: 'string', description: '24-hour HH:MM' },
          end: { type: 'string', description: '24-hour HH:MM' },
        },
        required: ['label', 'date', 'weekdays', 'start', 'end'],
      },
    },
    {
      name: 'log_food',
      description: 'Log something the user ate today in their food diary.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          food: { type: 'string', description: 'What they ate, e.g. "chicken sandwich and an apple"' },
          kind: { type: 'string', enum: ['healthy', 'normal', 'treat'] },
        },
        required: ['meal', 'food', 'kind'],
      },
    },
    {
      name: 'log_water',
      description: 'Add glasses of water the user drank today.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { glasses: { type: 'integer', description: 'Number of glasses, usually 1' } },
        required: ['glasses'],
      },
    },
    {
      name: 'complete_task',
      description: 'Mark one of today\'s scheduled tasks as done, matched by its title.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string', description: 'Title (or part of it) of today\'s task' } },
        required: ['title'],
      },
    },
  ];

  const MODELS = {
    'claude-opus-5-5': { fallbacks: true },
    'claude-sonnet-5-5': { fallbacks: true },
    'claude-haiku-5-5': { fallbacks: false },
  };

  let client = null, clientKey = '';
  function getClient() {
    const key = ctx.state.ai.key.trim();
    if (!window.Anthropic || !key) return null;
    if (!client || clientKey !== key) {
      // The key stays on this phone and goes only to Anthropic's API.
      client = new window.Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 45000 });
      clientKey = key;
    }
    return client;
  }
  const provider = () => (ctx.state.ai.provider === 'gemini' ? 'gemini' : 'claude');
  const enabled = () => !!(ctx.state.ai.on && (provider() === 'gemini'
    ? ctx.state.ai.geminiKey.trim()
    : ctx.state.ai.key.trim() && window.Anthropic));

  // Recent chat as alternating user/assistant text turns (no thinking blocks are kept).
  function history(limit = 20) {
    const turns = [];
    for (const m of ctx.state.messages.slice(-limit - 1, -1)) {
      const role = m.from === 'me' ? 'user' : 'assistant';
      const text = m.itemId ? `${m.text} [reminder: ${m.title}]` : m.text;
      const last = turns[turns.length - 1];
      if (last && last.role === role) last.content += `\n\n${text}`;
      else turns.push({ role, content: text });
    }
    while (turns.length && turns[0].role !== 'user') turns.shift();
    return turns;
  }

  function runTool(name, input) {
    try {
      switch (name) {
        case 'add_reminder': return ctx.tools.addReminder(input);
        case 'add_work_shift': return ctx.tools.addShift(input);
        case 'log_food': return ctx.tools.logFood(input);
        case 'log_water': return ctx.tools.logWater(input);
        case 'complete_task': return ctx.tools.completeTask(input);
        default: return { error: `Unknown tool ${name}` };
      }
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  // After a server-side fallback mid-turn, only text blocks before the last fallback block are echoed back.
  function echoable(content) {
    const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
    if (lastFallback < 0) return content;
    return content.filter((b, i) => i > lastFallback || b.type === 'text');
  }

  // Returns { lines } on success, { error } when the user should hear about a problem,
  // or null to quietly fall back to the written replies.
  async function reply(userText) {
    if (provider() === 'gemini') return geminiReply(userText);
    const api = getClient();
    if (!api) return null;
    const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
    const messages = history().concat(
      { role: 'user', content: userText },
      { role: 'system', content: ctx.contextText() },
    );
    const params = {
      model,
      max_tokens: 2000,
      // Breakpoint on the persona caches tools + persona together (tools render first).
      system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      output_config: { effort: 'low' }, // chat: quick, natural replies
      messages,
    };
    if (MODELS[model].fallbacks) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    try {
      for (let step = 0; step < 5; step++) {
        const res = MODELS[model].fallbacks ? await api.beta.messages.create(params) : await api.messages.create(params);
        if (res.stop_reason === 'refusal') return null;
        if (res.stop_reason === 'tool_use') {
          const results = res.content.filter((b) => b.type === 'tool_use').map((b) => ({
            type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(runTool(b.name, b.input)),
          }));
          messages.push({ role: 'assistant', content: echoable(res.content) }, { role: 'user', content: results });
          continue;
        }
        const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
        if (!text) return null;
        const lines = text.split(/\n\s*\n/).map((l) => l.replace(/^\*+|\*+$/g, '').trim()).filter(Boolean).slice(0, 3);
        return { lines };
      }
      return null;
    } catch (e) {
      const A = window.Anthropic;
      if (e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) return { error: 'Your Claude API key was rejected. Check it in Settings → Rias\'s mind.' };
      if (e instanceof A.RateLimitError) return { error: 'The Claude API is rate-limiting your key right now. I\'ll use my usual replies for a bit.' };
      if (e instanceof A.BadRequestError) return { error: `The Claude API couldn't handle that request (${e.message}).` };
      return null; // offline or a temporary server problem: quietly use the written replies
    }
  }

  // Settings → "Test": one tiny request to check the key.
  async function test() {
    if (provider() === 'gemini') return geminiTest();
    const api = getClient();
    if (!api) return 'Paste your API key first.';
    try {
      const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
      const res = await api.messages.create({
        model, max_tokens: 200, system: PERSONA, output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Say hi to me in one short sentence.' }],
      });
      const t = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      return t ? `Working! Rias says: “${t}”` : 'Connected, but the reply was empty.';
    } catch (e) {
      const A = window.Anthropic;
      if (e instanceof A.AuthenticationError) return 'That API key was rejected. Copy it again from console.anthropic.com.';
      if (e instanceof A.APIConnectionError) return 'Couldn’t reach the Claude API. Check your internet connection.';
      return `Something went wrong: ${e.message}`;
    }
  }

  // ---------- Google Gemini ----------
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  const splitLines = (text) => text.split(/\n\s*\n/).map((l) => l.replace(/^\*+|\*+$/g, '').trim()).filter(Boolean).slice(0, 3);

  // Gemini takes an OpenAPI-style schema: upper-case types, `nullable`, enums on strings only.
  function geminiSchema(sch) {
    const types = [].concat(sch.type);
    const out = { type: types.find((t) => t !== 'null').toUpperCase() };
    if (types.includes('null')) out.nullable = true;
    if (sch.description) out.description = sch.description;
    if (sch.enum && out.type === 'STRING') out.enum = sch.enum;
    if (sch.items) out.items = geminiSchema(sch.items);
    if (sch.properties) {
      out.properties = {};
      for (const [k, v] of Object.entries(sch.properties)) out.properties[k] = geminiSchema(v);
      out.required = (sch.required || []).filter((k) => !types.includes('null') && !(sch.properties[k].type || []).includes?.('null'));
    }
    return out;
  }
  const GEMINI_TOOLS = [{
    functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.input_schema) })),
  }];

  class GeminiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  async function gemini(path, body) {
    let res;
    try {
      res = await fetch(`${GEMINI}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-goog-api-key': ctx.state.ai.geminiKey.trim(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GeminiError(0, 'offline');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GeminiError(res.status, (data.error && data.error.message) || res.statusText);
    return data;
  }

  // Google renames models often, so ask which ones this key can use and take the
  // newest stable "Flash" model (fast and on the free tier). Remembered per key.
  async function geminiModel() {
    const key = ctx.state.ai.geminiKey.trim();
    if (ctx.state.ai.geminiModel && ctx.state.ai.geminiModelKey === key.slice(-6)) return ctx.state.ai.geminiModel;
    let names = [];
    let page = '';
    for (let i = 0; i < 5; i++) {
      const data = await gemini(`models?pageSize=200${page ? `&pageToken=${page}` : ''}`);
      names = names.concat((data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, '')));
      if (!data.nextPageToken) break;
      page = data.nextPageToken;
    }
    const version = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const newest = (list) => list.sort((a, b) => version(b) - version(a))[0];
    const pickedModel = newest(names.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n)))
      || newest(names.filter((n) => /^gemini-[\d.]+-flash(-\d+)?$/.test(n)))
      || newest(names.filter((n) => /^gemini-.*flash/.test(n) && !/(image|tts|audio|live|thinking|embedding)/.test(n)))
      || 'gemini-2.5-flash';
    ctx.state.ai.geminiModel = pickedModel;
    ctx.state.ai.geminiModelKey = key.slice(-6);
    return pickedModel;
  }

  async function geminiReply(userText) {
    if (!ctx.state.ai.geminiKey.trim()) return null;
    const contents = history().map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }));
    contents.push({ role: 'user', parts: [{ text: userText }] });
    try {
      const model = await geminiModel();
      for (let step = 0; step < 5; step++) {
        const data = await gemini(`models/${model}:generateContent`, {
          systemInstruction: { parts: [{ text: `${PERSONA}\n\n${ctx.contextText()}` }] },
          contents,
          tools: GEMINI_TOOLS,
          generationConfig: { maxOutputTokens: 2048 },
        });
        const cand = (data.candidates || [])[0];
        if (!cand || !cand.content || !cand.content.parts) return null; // blocked or empty
        const calls = cand.content.parts.filter((p) => p.functionCall);
        if (calls.length) {
          // Echo the model's turn back unchanged (it can carry thought signatures), then the results.
          contents.push(cand.content);
          contents.push({
            role: 'user',
            parts: calls.map((p) => ({
              functionResponse: {
                ...(p.functionCall.id ? { id: p.functionCall.id } : {}),
                name: p.functionCall.name,
                response: { result: runTool(p.functionCall.name, p.functionCall.args || {}) },
              },
            })),
          });
          continue;
        }
        const text = cand.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n\n').trim();
        return text ? { lines: splitLines(text) } : null;
      }
      return null;
    } catch (e) {
      if (e.status === 400 && /api key/i.test(e.message)) return { error: 'Your Gemini API key was rejected. Check it in Settings → Rias\'s mind.' };
      if (e.status === 403) return { error: 'Your Gemini API key isn\'t allowed to use this model. Create a new key at aistudio.google.com.' };
      if (e.status === 404) { ctx.state.ai.geminiModel = ''; return null; } // model retired: pick again next time
      if (e.status === 429) return { error: 'I\'ve hit Gemini\'s free limit for now. I\'ll use my usual replies and try again later.' };
      return null; // offline or a temporary problem: quietly use the written replies
    }
  }

  async function geminiTest() {
    if (!ctx.state.ai.geminiKey.trim()) return 'Paste your Gemini API key first.';
    try {
      ctx.state.ai.geminiModel = '';
      const model = await geminiModel();
      const data = await gemini(`models/${model}:generateContent`, {
        systemInstruction: { parts: [{ text: PERSONA }] },
        contents: [{ role: 'user', parts: [{ text: 'Say hi to me in one short sentence.' }] }],
        generationConfig: { maxOutputTokens: 512 },
      });
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const t = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(' ').trim();
      return t ? `Working (${model})! Rias says: “${t}”` : `Connected to ${model}, but the reply was empty.`;
    } catch (e) {
      if (e.status === 0) return 'Couldn’t reach Google. Check your internet connection.';
      if (e.status === 400 || e.status === 403) return 'That Gemini key was rejected. Copy it again from aistudio.google.com.';
      if (e.status === 429) return 'Gemini says you’ve hit the free limit for now. Try again later.';
      return `Something went wrong: ${e.message}`;
    }
  }

  return { enabled, reply, test, provider };
};
