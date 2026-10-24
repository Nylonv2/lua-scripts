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
- You have tools to add reminders, add work shifts, log food and water, and mark today's tasks done, and to take things back: delete_reminder, delete_food_log, remove_water, delete_work_shift, and undo (undo the last thing you added, or bring back the last thing deleted). Delete only what they ask for; if it's unclear which one, ask. After deleting, say what you removed and that they can say "bring it back". Use them when the user asks, or clearly implies it ("I just had a sandwich" means log it; "remind me at 5 to call mom" means add a reminder). Then confirm in character, briefly.
- You're also their phone assistant: set_timer for timers, add_reminder for alarms and wake-ups, phone_control for volume, flashlight, Do Not Disturb, opening apps, calls, texts, directions and reading notifications, and draft_email to write emails for them (in their voice, not yours; they tap Send). Act when asked, then confirm in one short line (they may be listening, not reading).
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
  const PHONE_ACTIONS = ['volume_up', 'volume_down', 'volume_set', 'mute', 'unmute',
    'flashlight_on', 'flashlight_off', 'dnd_on', 'dnd_off', 'open_app', 'call', 'text', 'directions',
    'read_notifications', 'cancel_timers', 'timer_status'];
  const TOOLS = [
    {
      name: 'set_timer',
      description: 'Start a countdown timer. It rings like an alarm when done, even if the app is closed.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          minutes: { type: 'number', description: 'Length in minutes (0.5 = 30 seconds, 90 = an hour and a half)' },
          label: { type: 'string', description: 'What it\'s for, e.g. "pasta", or empty string' },
        },
        required: ['minutes', 'label'],
      },
    },
    {
      name: 'delete_reminder',
      description: 'Delete one of the user\'s reminders (from the list in the app context), or skip a repeating one for a single day. If the result says it\'s ambiguous, ask which one.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['title', 'date', 'only_today'],
        properties: {
          title: { type: 'string', description: 'The reminder\'s title or part of it, e.g. "gym" or "call mom"' },
          date: nullable({ type: 'string', description: 'YYYY-MM-DD if they mean a specific day, else null' }),
          only_today: { type: 'boolean', description: 'true to skip a repeating reminder just for that day (or today) instead of deleting it' },
        },
      },
    },
    {
      name: 'delete_food_log',
      description: 'Remove something from the user\'s food diary (most recent match, looking back a few days unless a date is given).',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['food', 'date'],
        properties: { food: { type: 'string', description: 'The food as logged, e.g. "burger"' }, date: nullable({ type: 'string', description: 'YYYY-MM-DD or null' }) },
      },
    },
    {
      name: 'remove_water',
      description: 'Take glasses of water off today\'s count (e.g. when one was logged by mistake).',
      strict: true,
      input_schema: { type: 'object', additionalProperties: false, required: ['glasses'], properties: { glasses: { type: 'integer' } } },
    },
    {
      name: 'delete_work_shift',
      description: 'Remove a work shift: a one-off shift on a date, just one day of a weekly shift, or (whole_schedule) the whole weekly shift.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['date', 'label', 'whole_schedule'],
        properties: {
          date: nullable({ type: 'string', description: 'YYYY-MM-DD of the shift, or null with whole_schedule' }),
          label: nullable({ type: 'string', description: 'Job name if they have more than one, else null' }),
          whole_schedule: { type: 'boolean' },
        },
      },
    },
    {
      name: 'undo',
      description: 'Undo the last thing you added for the user (reminder, food log, water, shift), or bring back the last thing that was deleted.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['what'],
        properties: { what: { type: 'string', enum: ['undo_last_added', 'restore_last_deleted'] } },
      },
    },
    {
      name: 'draft_email',
      description: 'Write an email for the user and open it in their email app, ready to send; they check it and tap Send themselves. Write it AS THE USER (first person, their normal tone, clear and natural), not as Rias. End with a sign-off such as "Thanks," on its own line; the app adds their name. If you don\'t know who it\'s to or what it should say, ask first instead of guessing.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          to: { type: 'string', description: 'An email address, or a contact\'s name as the user said it (e.g. "Mike", "my boss" only if that\'s a saved contact name). Empty string if unknown.' },
          subject: { type: 'string', description: 'Short, specific subject line' },
          body: { type: 'string', description: 'The email text, starting with a greeting like "Hi Mike," and ending with a sign-off line, without the user\'s name' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    {
      name: 'phone_control',
      description: 'Do something on the user\'s phone: volume, flashlight, Do Not Disturb, open an app, call or text a contact, get directions, read their new notifications, or cancel/check timers. Returns what happened in "said"; tell them in character, briefly.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: PHONE_ACTIONS },
          value: { type: 'string', description: 'Volume percent 0-100 (volume_set), app name (open_app), contact name or number (call, text), place (directions) or timer label (cancel_timers, optional). Empty string if not needed.' },
          message: nullable({ type: 'string', description: 'For text: the message to send. Otherwise null.' }),
        },
        required: ['action', 'value', 'message'],
      },
    },
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
        case 'set_timer': return ctx.tools.setTimer(input);
        case 'phone_control': return ctx.tools.phone(input);
        case 'draft_email': return ctx.tools.email(input);
        case 'delete_reminder': return ctx.tools.deleteReminder(input);
        case 'delete_food_log': return ctx.tools.deleteFood(input);
        case 'remove_water': return ctx.tools.removeWater(input);
        case 'delete_work_shift': return ctx.tools.deleteShift(input);
        case 'undo': return ctx.tools.undo(input);
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

  // ---------- Business assistant: finding clients and writing outreach emails ----------
  const profileText = (pr) => [
    `Videographer: ${pr.name || 'the user'}${pr.business ? ` (${pr.business})` : ''}`,
    pr.services && pr.services.length ? `Shoots: ${pr.services.join(', ')}` : '',
    pr.clients ? `Ideal clients: ${pr.clients}` : '',
    pr.area ? `Area: ${pr.area}` : '',
    pr.portfolio ? `Portfolio: ${pr.portfolio}` : '',
    pr.prices ? `Prices: ${pr.prices}` : '',
    pr.pitch ? `What makes them different / notes: ${pr.pitch}` : '',
  ].filter(Boolean).join('\n');

  const CLIENT_PROPS = {
    name: { type: 'string', description: 'Business name' },
    type: { type: 'string', description: 'What kind of business, e.g. "Wedding venue", "Real estate agent"' },
    city: { type: 'string' },
    website: { type: 'string', description: 'Homepage URL, or empty string' },
    email: { type: 'string', description: 'A public contact email shown on their website or listing, or empty string. Never guess or make one up.' },
    phone: { type: 'string', description: 'Public phone number, or empty string' },
    reason: { type: 'string', description: 'One short sentence: why they could use video from this videographer, based on something specific you saw' },
  };
  const SAVE_CLIENTS = {
    name: 'save_clients',
    description: 'Save the potential clients you found. Call it once, at the end, with all of them.',
    strict: true,
    input_schema: {
      type: 'object', additionalProperties: false, required: ['clients'],
      properties: { clients: { type: 'array', items: { type: 'object', additionalProperties: false, required: Object.keys(CLIENT_PROPS), properties: CLIENT_PROPS } } },
    },
  };
  const findPrompt = ({ profile, kind, area, count, exclude }) => `You are researching potential clients for a freelance videographer.

${profileText(profile)}

Find ${count} real, currently operating ${kind || 'businesses that would hire a videographer'} in or near ${area || profile.area || 'their area'} that are good prospects for this videographer.
- Prefer ones with a clear reason to want video: no or outdated video on their website or social pages, a new opening or location, regular events, listings or launches, an active social presence that would benefit from video.
- Search the web, then open their websites (especially contact / about pages) to find a public contact email. Use only emails you actually saw; if there's none, leave it empty. Never guess an address.
- Skip big national chains and anyone in this list (already saved): ${exclude.length ? exclude.join('; ') : 'none'}.
- When you're done, call save_clients once with everyone you found (fewer than ${count} is fine if you can't find enough good ones). Don't write anything else.`;

  // Claude: web search + web fetch on Anthropic's side, results come back through save_clients.
  async function findClientsClaude(opts) {
    const api = getClient();
    if (!api) return { error: 'Add your Claude key in Settings → Rias\'s mind first.' };
    const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
    const basic = model === 'claude-haiku-5-5';
    const messages = [{ role: 'user', content: findPrompt(opts) }];
    const params = {
      model,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      tools: [
        { type: basic ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: Math.min(12, 4 + Math.ceil(opts.count / 2)) },
        { type: basic ? 'web_fetch_20250910' : 'web_fetch_20260209', name: 'web_fetch', max_uses: Math.min(20, opts.count + 4), max_content_tokens: 6000 },
        SAVE_CLIENTS,
      ],
      messages,
    };
    if (MODELS[model].fallbacks) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    try {
      for (let step = 0; step < 8; step++) {
        const stream = MODELS[model].fallbacks ? api.beta.messages.stream(params) : api.messages.stream(params);
        const res = await stream.finalMessage();
        if (ctx.onUsage) ctx.onUsage(res.model || model, res.usage);
        if (res.stop_reason === 'refusal') return { error: 'The search was declined. Try describing the clients differently.' };
        const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'save_clients');
        if (call) return { clients: (call.input && call.input.clients) || [] };
        if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
        if (res.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: echoable(res.content) },
            { role: 'user', content: res.content.filter((b) => b.type === 'tool_use').map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Unknown tool. Use save_clients.', is_error: true })) });
          continue;
        }
        // Finished without saving: ask once more for the list.
        messages.push({ role: 'assistant', content: echoable(res.content) }, { role: 'user', content: 'Now call save_clients with everyone you found.' });
      }
      return { error: 'The search took too long. Try asking for fewer clients.' };
    } catch (e) {
      const A = window.Anthropic;
      if (e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) return { error: 'Your Claude API key was rejected. Check it in Settings → Rias\'s mind.' };
      if (e instanceof A.RateLimitError) return { error: 'Claude is rate-limiting your key right now. Try again in a minute.' };
      if (e instanceof A.BadRequestError) return { error: `Claude couldn't run the search (${e.message}).` };
      return { error: 'Couldn\'t reach Claude. Check your internet and try again.' };
    }
  }

  // Gemini: Google Search grounding; the list comes back as JSON in the text.
  async function findClientsGemini(opts) {
    const model = await geminiModel();
    const prompt = `${findPrompt(opts).replace(/- When you're done, call save_clients[^\n]*/, '')}
- Reply with only a JSON array, no other text. Each item: {"name","type","city","website","email","phone","reason"} (use "" when unknown).`;
    const data = await gemini(`models/${model}:generateContent`, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 8192 },
    });
    if (data.error) return { error: data.error };
    const text = ((((data.candidates || [])[0] || {}).content || {}).parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    const json = (text.match(/\[[\s\S]*\]/) || [])[0];
    try { return { clients: JSON.parse(json) }; } catch { return { error: 'Gemini didn\'t return a usable list. Try again, or use Claude for better searches.' }; }
  }

  /** { profile, kind, area, count, exclude: [names] } → { clients: [...] } or { error }. */
  async function findClients(opts) {
    if (!enabled()) return { error: 'Turn on her AI first (Settings → Rias\'s mind).' };
    const clean = (c) => Object.fromEntries(Object.keys(CLIENT_PROPS).map((k) => [k, String((c && c[k]) || '').trim()]));
    let res;
    try {
      res = provider() === 'gemini' ? await findClientsGemini(opts) : await findClientsClaude(opts);
    } catch (e) {
      res = { error: e && e.status === 429 ? 'Gemini\'s free limit is used up for now. Try again later, or use Claude.' : 'Couldn\'t reach Gemini. Check your internet and key.' };
    }
    if (res.clients) res.clients = res.clients.map(clean).filter((c) => c.name)
      // Only keep emails that look real.
      .map((c) => ({ ...c, email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c.email) ? c.email : '' }));
    return res;
  }

  const EMAIL_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['subject', 'body'],
    properties: { subject: { type: 'string' }, body: { type: 'string' } },
  };
  const outreachPrompt = ({ profile, client, followUp, previous, tweak }) => `Write a ${followUp ? 'short follow-up to a cold email' : 'cold outreach email'} from a freelance videographer to a potential client.

About the videographer:
${profileText(profile)}
Tone: ${profile.tone || 'friendly and professional'}

The potential client:
${client.name} (${client.type || 'business'}${client.city ? `, ${client.city}` : ''})${client.website ? `\nWebsite: ${client.website}` : ''}
Why they might want video: ${client.reason || 'not known'}${client.notes ? `\nNotes: ${client.notes}` : ''}
${followUp && previous ? `\nThe first email (sent ${previous.when}):\nSubject: ${previous.subject}\n${previous.body}\n` : ''}
Rules:
- Write as the videographer, in the first person. Sound like a real person, not a template or an ad. No hype words, no fake urgency, no exaggeration.
- ${followUp ? '2 to 4 sentences: a friendly nudge that adds one small new idea or reason, not a repeat.' : 'Under 120 words. Open with something specific about them (from the reason above), say what you could make for them and the benefit in one or two sentences, mention the portfolio link once if there is one, and end with one easy ask (a quick call or a reply).'}
- An honest, specific subject line (no clickbait, no "Re:" unless it's a follow-up to the same thread).
- Greeting with their business name or "Hi there" if no person is known.
- End with one short line letting them opt out, like "If it's not a fit, just let me know and I won't follow up." Then a sign-off line like "Thanks," on its own line. Don't add a name or signature; the app adds it.${tweak ? `\n- Change requested: ${tweak}` : ''}`;

  /** { profile, client, followUp, previous, tweak } → { subject, body } or { error }. */
  async function writeOutreach(opts) {
    if (!enabled()) return { error: 'no-ai' };
    try {
      if (provider() === 'gemini') {
        const model = await geminiModel();
        const data = await gemini(`models/${model}:generateContent`, {
          contents: [{ role: 'user', parts: [{ text: outreachPrompt(opts) }] }],
          generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: geminiSchema(EMAIL_SCHEMA) },
        });
        if (data.error) return { error: data.error };
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        return JSON.parse(parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(''));
      }
      const api = getClient();
      if (!api) return { error: 'Add your Claude key first.' };
      const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
      const res = await api.messages.create({
        model,
        max_tokens: 3000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: EMAIL_SCHEMA } },
        messages: [{ role: 'user', content: outreachPrompt(opts) }],
      });
      if (ctx.onUsage) ctx.onUsage(res.model || model, res.usage);
      if (res.stop_reason === 'refusal') return { error: 'That email request was declined.' };
      return JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    } catch (e) {
      return { error: 'Couldn\'t write the email just now. Check your internet and try again.' };
    }
  }

  // ---------- Reply helper: suggest replies to a text (the user always sends it themselves) ----------
  const REPLIES_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['replies'],
    properties: { replies: { type: 'array', items: { type: 'string' }, description: 'Exactly 3 different reply options' } },
  };
  const repliesPrompt = ({ who, app, thread, instruction, tone, me, facts }) => `Suggest 3 replies the user could send in a text conversation. Write them AS THE USER (first person), in a natural texting style: short, casual, like a real person, matching the vibe of the conversation. Not as an AI or assistant, and not as Rias.

The user: ${me || 'the user'}${facts ? `\nThings to know about the user: ${facts}` : ''}
Chat with: ${who || 'someone'}${app ? ` (on ${app})` : ''}
Recent messages, oldest first ("Me" is the user):
${thread.map((m) => `${m.from || who}: ${m.text}`).join('\n')}

${instruction ? `What the user wants to say: ${instruction}\n` : ''}${tone ? `Tone: ${tone}\n` : ''}Rules:
- Reply to their latest message. Each option should take a different approach (e.g. yes / maybe / no, or warm / quick / playful), unless the user said exactly what to say, then give 3 phrasings of it.
- Keep each under 40 words. Plain text, no quotes around them, no labels. Emoji only if the conversation uses them.
- Never invent plans, facts, times or promises the user didn't give. If a detail is needed (like a time), keep it general or ask.`;

  /** { who, app, thread: [{from, text}], instruction, tone, me, facts } → { replies: [3] } or { error }. */
  async function suggestReplies(opts) {
    if (!enabled()) return { error: 'no-ai' };
    try {
      let out;
      if (provider() === 'gemini') {
        const model = await geminiModel();
        const data = await gemini(`models/${model}:generateContent`, {
          contents: [{ role: 'user', parts: [{ text: repliesPrompt(opts) }] }],
          generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json', responseSchema: geminiSchema(REPLIES_SCHEMA) },
        });
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        out = JSON.parse(parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(''));
      } else {
        const api = getClient();
        if (!api) return { error: 'Add your Claude key first.' };
        const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
        const res = await api.messages.create({
          model,
          max_tokens: 1500,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLIES_SCHEMA } },
          messages: [{ role: 'user', content: repliesPrompt(opts) }],
        });
        if (ctx.onUsage) ctx.onUsage(res.model || model, res.usage);
        if (res.stop_reason === 'refusal') return { error: 'I can\'t help with that one.' };
        out = JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
      }
      return { replies: (out.replies || []).map((r) => String(r).trim().replace(/^["“]|["”]$/g, '')).filter(Boolean).slice(0, 3) };
    } catch {
      return { error: 'Couldn\'t come up with replies just now. Check your internet and try again.' };
    }
  }

  // ---------- Live translator ----------
  const translatePrompt = ({ text, from, to, context }) => `You are a live interpreter helping two people talk face to face. Translate what was said from ${from} into ${to}.
- Natural, everyday spoken ${to}, the way a fluent local would say it. Keep the meaning, tone and politeness level.
- If the speech-to-text looks slightly wrong, translate what they most likely meant.
- Output only the translation: no quotes, notes, romanization or explanations.${context ? `\n\nRecent conversation, for context only:\n${context}` : ''}

What was said (${from}):
${text}`;

  /** { text, from, to, context } → { text } or { error }. Language names in English, e.g. "Spanish (Mexico)". */
  async function translate(opts) {
    if (!enabled()) return { error: 'no-ai' };
    try {
      let out = '';
      if (provider() === 'gemini') {
        const model = await geminiModel();
        const data = await gemini(`models/${model}:generateContent`, {
          contents: [{ role: 'user', parts: [{ text: translatePrompt(opts) }] }],
          generationConfig: { maxOutputTokens: 1024 },
        });
        out = ((((data.candidates || [])[0] || {}).content || {}).parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      } else {
        const api = getClient();
        if (!api) return { error: 'Add your Claude key first.' };
        const model = ctx.state.ai.model in MODELS ? ctx.state.ai.model : 'claude-opus-5-5';
        const res = await api.messages.create({
          model, max_tokens: 1000, output_config: { effort: 'low' },
          messages: [{ role: 'user', content: translatePrompt(opts) }],
        });
        if (ctx.onUsage) ctx.onUsage(res.model || model, res.usage);
        if (res.stop_reason === 'refusal') return { error: 'I can\'t translate that one.' };
        out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      }
      out = out.trim().replace(/^["“]|["”]$/g, '');
      return out ? { text: out } : { error: 'The translation came back empty. Try again.' };
    } catch (e) {
      return { error: e && e.status === 429 ? 'The AI is rate-limited right now. Try again in a moment.' : 'Couldn\'t translate just now. Check your internet.' };
    }
  }

  return { enabled, reply, test, provider, estimate, findClients, writeOutreach, suggestReplies, translate };
};
