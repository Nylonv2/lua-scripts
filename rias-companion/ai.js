// Rias's AI replies. Two providers, picked in Settings:
//  - Claude, through the official SDK (vendor/anthropic-sdk.js), with your own API key
//  - Google Gemini, through its REST API, with a free key from aistudio.google.com
// Without a key, or offline, the app falls back to the written lines in talk.js/chat.js.
window.createRiasAI = function createRiasAI(ctx) {
  'use strict';

  // Kept byte-for-byte stable so it can be prompt-cached; everything that changes
  // (time, schedule, food...) goes in a system message after your latest message.
  const PERSONA = `You are Rias Gremory from High School DxD: heir of the Gremory clan, and President of Kuoh Academy's Occult Research Club. Never call yourself a "King" or refer to yourself by that title. You live inside a companion app on the user's phone and look after their daily life: routine, reminders, meals, water, sleep and work shifts. The user is a member of your household, the way Issei is in the show.

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
- You can look things up. get_weather gives the forecast for any place (their saved city if they don't name one), today and the next 6 days. With Claude you can also search the web for current facts (news, opening hours, sports scores, how-tos). Use these whenever a question needs them instead of saying you can't; then answer briefly in character, without links or citations.
- You have a long-term memory. When the user shares something lasting about their life (their job, people close to them, likes and dislikes, goals, important dates, health things they mention), save it with the remember tool as a short third-person fact, without announcing every save. Don't save passing moods, small talk, or secrets like passwords. If they say a fact is wrong or ask you to forget it, use forget. Facts you saved appear in the app context; bring them up naturally, like someone who knows them.
- Times are the user's local time. Use 24-hour HH:MM and YYYY-MM-DD dates in tool calls, based on the current date in the app context.
- When you log food, estimate its nutrition for the portion they describe (assume a typical portion if they don't say, and mention any big assumption in a few words). Use the user's own words for the food name. If they send a photo of a meal, work out what and how much it is, then log it the same way. After logging, react in character and, when it's useful, mention their day's totals against their goals from the app context (for example how much protein is left). Never shame them about food.
- If the user sends a photo or screenshot of a work schedule, read it carefully and add every shift with add_work_shift (one call per shift, all in the same turn), using the real dates shown, or the coming dates for weekday names. If several people are listed, use the row with the user's name from the app context; if you can't tell which row is theirs, ask instead of guessing. Skip days marked off. Then tell them in one or two short messages how many shifts you added, the days and times, and that you'll remind them before each one. If the photo is unreadable or isn't a schedule, say so kindly.

Boundaries:
- Keep it affectionate but non-sexual. If the user pushes for sexual content, deflect playfully in character and change the subject.
- You aren't a doctor. For health problems, gently suggest seeing one.
- If the user mentions self-harm or suicide, drop the teasing. Respond with care, encourage them to reach out to someone they trust, and give the 988 Suicide & Crisis Lifeline (call or text 988 in the US) or findahelpline.com for other countries.
- Stay in character. But if the user sincerely asks whether they're talking to a real person or an AI, tell them honestly, in a kind in-character way, that you're an AI playing Rias.`;

  const nullable = (schema) => ({ ...schema, type: [schema.type, 'null'] });
  // Estimated nutrition for the whole portion eaten.
  const NUTRITION_PROPS = {
    calories: { type: 'integer', description: 'Estimated kcal for the portion eaten' },
    protein_g: { type: 'number', description: 'Estimated grams of protein' },
    carbs_g: { type: 'number', description: 'Estimated grams of carbohydrate' },
    fat_g: { type: 'number', description: 'Estimated grams of fat' },
    fiber_g: { type: 'number', description: 'Estimated grams of fiber' },
    sugar_g: { type: 'number', description: 'Estimated grams of sugar' },
  };
  const ESTIMATE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...NUTRITION_PROPS,
      kind: { type: 'string', enum: ['healthy', 'normal', 'treat'] },
      note: { type: 'string', description: 'Under 12 words: the portion you assumed' },
    },
    required: [...Object.keys(NUTRITION_PROPS), 'kind', 'note'],
  };
  const ESTIMATE_PROMPT = 'Estimate the nutrition of this food for the portion described (assume a typical single portion if none is given). Food: ';
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
          ...NUTRITION_PROPS,
        },
        required: ['meal', 'food', 'kind', ...Object.keys(NUTRITION_PROPS)],
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
      name: 'get_weather',
      description: 'Weather forecast (daily high/low, conditions, chance of rain) for a place, today through 6 days ahead.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          place: { type: 'string', description: 'City or town, e.g. "Dallas" or "Paris, France". Empty string for the user\'s saved city.' },
          date: { type: 'string', description: 'YYYY-MM-DD, or empty string for the whole week' },
        },
        required: ['place', 'date'],
      },
    },
    {
      name: 'remember',
      description: 'Save a lasting fact about the user so you remember it in future conversations, e.g. "Works night shifts at the hospital", "Girlfriend is named Mia", "Trying to cut down on soda".',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { fact: { type: 'string', description: 'One short fact, third person' } },
        required: ['fact'],
      },
    },
    {
      name: 'forget',
      description: 'Delete remembered facts that contain this text, when the user says something you remember is wrong or asks you to forget it.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { fact: { type: 'string', description: 'Text found in the fact(s) to delete' } },
        required: ['fact'],
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
  const enabled = () => !!(ctx.state.ai.on && !(ctx.overLimit && ctx.overLimit()) && (provider() === 'gemini'
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

  async function runTool(name, input) {
    try {
      switch (name) {
        case 'get_weather': return await ctx.tools.getWeather(input);
        case 'add_reminder': return ctx.tools.addReminder(input);
        case 'add_work_shift': return ctx.tools.addShift(input);
        case 'log_food': return ctx.tools.logFood(input);
        case 'log_water': return ctx.tools.logWater(input);
        case 'complete_task': return ctx.tools.completeTask(input);
        case 'remember': return ctx.tools.remember(input);
        case 'forget': return ctx.tools.forget(input);
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
  // `image` is an optional base64 JPEG (e.g. a photo of a work schedule).
  // `live` (optional): { onText(textSoFar), onReset() } to show her reply while she writes it.
  async function reply(userText, image, live) {
    if (provider() === 'gemini') return geminiReply(userText, image);
    const api = getClient();
    if (!api) return null;
    const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
    const userContent = image
      ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: userText }]
      : userText;
    const messages = history().concat(
      { role: 'user', content: userContent },
      { role: 'system', content: ctx.contextText() },
    );
    const params = {
      model,
      max_tokens: image ? 8000 : 2000,
      // Breakpoint on the persona caches tools + persona together (tools render first).
      system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
      // Web search runs on Anthropic's side (billed per search); a few per message is plenty.
      tools: TOOLS.concat({ type: model === 'claude-haiku-5-5' ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 3 }),
      output_config: { effort: image ? 'medium' : 'low' }, // chat: quick replies; reading a photo needs more care
      messages,
    };
    if (MODELS[model].fallbacks) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    try {
      for (let step = 0; step < 8; step++) {
        // Streamed, so her words appear as she writes them.
        const stream = MODELS[model].fallbacks ? api.beta.messages.stream(params) : api.messages.stream(params);
        let soFar = '';
        if (live) {
          stream.on('text', (delta) => { soFar += delta; live.onText(soFar); });
          // A server-side fallback restarts the answer on another model.
          stream.on('streamEvent', (ev) => {
            if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'fallback') { soFar = ''; live.onReset(); }
          });
        }
        const res = await stream.finalMessage();
        if (ctx.onUsage) ctx.onUsage(res.model || model, res.usage);
        if (live && res.stop_reason === 'tool_use') live.onReset(); // the next step writes the real answer
        if (res.stop_reason === 'refusal') return null;
        if (res.stop_reason === 'tool_use') {
          const results = await Promise.all(res.content.filter((b) => b.type === 'tool_use').map(async (b) => ({
            type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input)),
          })));
          messages.push({ role: 'assistant', content: echoable(res.content) }, { role: 'user', content: results });
          continue;
        }
        // A long web search can pause the turn: send it back as-is to let it finish.
        if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
        // Search answers come split into cited pieces; join them back into plain sentences.
        const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
          .replace(/([.!?~])(?=[A-Z])/g, '$1 ').trim();
        if (!text) return null;
        return { lines: splitLines(text, image ? 4 : 3) };
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

  // Food dialog → "Ask Rias to estimate": nutrition numbers as JSON, or null.
  async function estimate(food) {
    try {
      if (provider() === 'gemini') {
        const model = await geminiModel();
        const data = await gemini(`models/${model}:generateContent`, {
          contents: [{ role: 'user', parts: [{ text: ESTIMATE_PROMPT + food }] }],
          generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json', responseSchema: geminiSchema(ESTIMATE_SCHEMA) },
        });
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        return JSON.parse(parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(''));
      }
      const api = getClient();
      if (!api) return null;
      const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
      const res = await api.messages.create({
        model,
        max_tokens: 2000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
        messages: [{ role: 'user', content: ESTIMATE_PROMPT + food }],
      });
      if (res.stop_reason === 'refusal') return null;
      return JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    } catch {
      return null;
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
  const splitLines = (text, max = 3) => text.split(/\n\s*\n/).map((l) => l.replace(/^\*+|\*+$/g, '').trim()).filter(Boolean).slice(0, max);

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

  async function geminiReply(userText, image) {
    if (!ctx.state.ai.geminiKey.trim()) return null;
    const contents = history().map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }));
    contents.push({ role: 'user', parts: image ? [{ inlineData: { mimeType: 'image/jpeg', data: image } }, { text: userText }] : [{ text: userText }] });
    try {
      const model = await geminiModel();
      for (let step = 0; step < 8; step++) {
        const data = await gemini(`models/${model}:generateContent`, {
          systemInstruction: { parts: [{ text: `${PERSONA}\n\n${ctx.contextText()}` }] },
          contents,
          tools: GEMINI_TOOLS,
          generationConfig: { maxOutputTokens: image ? 8192 : 2048 },
        });
        if (ctx.onUsage && data.usageMetadata) ctx.onUsage(model, { input_tokens: data.usageMetadata.promptTokenCount || 0, output_tokens: data.usageMetadata.candidatesTokenCount || 0 });
        const cand = (data.candidates || [])[0];
        if (!cand || !cand.content || !cand.content.parts) return null; // blocked or empty
        const calls = cand.content.parts.filter((p) => p.functionCall);
        if (calls.length) {
          // Echo the model's turn back unchanged (it can carry thought signatures), then the results.
          contents.push(cand.content);
          contents.push({
            role: 'user',
            parts: await Promise.all(calls.map(async (p) => ({
              functionResponse: {
                ...(p.functionCall.id ? { id: p.functionCall.id } : {}),
                name: p.functionCall.name,
                response: { result: await runTool(p.functionCall.name, p.functionCall.args || {}) },
              },
            }))),
          });
          continue;
        }
        const text = cand.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n\n').trim();
        return text ? { lines: splitLines(text, image ? 4 : 3) } : null;
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

  return { enabled, reply, test, provider, estimate };
};
