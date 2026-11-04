# Rias Companion

A personal assistant for your day, with an optional **Rias mode** where Rias Gremory looks after you. It reminds you of your routine, keeps your work schedule and food diary, talks with
you (by text or voice), wakes you up, and works as your phone's assistant. Everything stays on your phone.

*An unofficial fan project, not affiliated with the High School DxD rights holders. Rias is an original drawing and her
lines are original writing; no official art or script is used.*

---

## Get started

### Install (Android)

1. Download **`RiasCompanion.apk`** from the top of this repo and open it on your phone.
2. Android asks to allow installing apps from your browser or Files app: allow it once, then tap **Install**.
   Play Protect may warn that the app is unknown; that's because it isn't from the Play Store. Tap **Install anyway**.
3. Open Rias, tell her your name, wake-up time and bedtime. She builds a daily routine for you.

Updates: the app checks once a day and shows an **Update** card on Home when a new version is out (or tap
*Check for updates* in Settings → Backup & data). Updating keeps all your data.

### Make sure reminders reach you

Open **Settings → Reminders & alarms**. The **pop-up check** lists everything Android needs (notifications, pop-up
alerts, *Appear on top*, full screen over the lock screen, no battery sleep, exact alarms), each with a **Fix**
button. Fix everything there once and reminders work even with the app closed.

If notifications stop on Samsung, Xiaomi or OnePlus phones: Settings → Apps → Rias → Battery → **Unrestricted**.

### Without Android

`RiasCompanion.html` is the whole app in one file: open it in Chrome, Safari or Edge. It can also be hosted (for example
on GitHub Pages) and installed from the browser (*Add to Home screen*). Web versions can't ring alarms while closed,
can't use the widgets or the phone assistant, and only notify while the browser has the app open.

---

## The app

Five tabs at the bottom: **Today**, **Plan**, **Chat**, **Track** (food & water, work) and **More** (find clients,
translator, settings, backup).

### Today
A greeting, her line for the moment (in Rias mode next to a small animated Rias), the big **Up next** card with a
**Done ✓** button, the next few things coming up, and today's progress, water, food and work at a glance.

### Chat
Talk to her by typing, with 🎙, or by sending a photo (📷). Without AI she has hundreds of written lines; with AI on
(see *Her AI*) she writes her own replies, remembers your life, and does things for you: "remind me at 5 to call mom",
"I work Saturday 10 to 6", "I just had a burger", "set a timer for 10 minutes".

### Plan
Five views at the top: **Today**, **To-do**, **Chores**, **Goals** and **Month**.

**Today:** use **‹ ›** next to the date to look at any upcoming day ("← Back to today" returns); the button becomes **Plan tomorrow / Plan Saturday…** and builds that whole day. Today's routine grouped by morning, afternoon, evening and night, plus work shifts and phone-calendar events. Swipe right
for done, left for snooze or delete. **＋ New reminder** sets the time, repeat (once, daily, weekdays, weekends, picked
days, or every so often during the day), type, sound and whether it pops up like an alarm. **Month** shows a calendar of
how each day went; tap a day to see it, add a reminder for that date, or edit one. For today and upcoming days, **Open this day** shows it in Today and **⏱ Plan this day** plans it. In the chat, "plan Friday" works too.

**To-do:** your to-do list. Add things with a deadline, how long they take and whether they're important ("Finish the
edit by Friday (2h)", or just tell her in the chat). She **fits each to-do into your free time** around work, meals,
calendar events and your goals, puts it in Today like a reminder, and pings you when it's time. **⏱ Plan my day**
builds your whole day: around your work (including the commute), calendar and reminders she adds the
**daily essentials** you're missing (morning routine, breakfast, lunch, dinner, a focus block for what you've been putting off,
movement, daylight, a 15-minute tidy-up, winding down), fits in your to-dos and goal sessions, and reminds you
at each one. Anything you already have a reminder for at a time you're free isn't added twice, and nothing lands during a
shift. **With her AI on (your Claude key, or Gemini), Claude makes up the day itself:** the app sends it your
shifts (with commute), calendar, reminders, to-dos with deadlines, goals, the essentials you picked and what she knows
about you; Claude lays out the day with its own block titles and a short note, and the app checks every block (nothing
during work or in the past, no overlaps, only your real to-dos and goals) before scheduling it. Each plan is one
request (roughly 1–4 cents with Opus, less with Sonnet; it shows in the cost meter). If AI is off or it can't answer, the
built-in planner does it. Find it on Today ("Want me to plan your day?"), at the top of Plan → Today, or just say "plan my day". Choose
the essentials, or have it done automatically every morning, in Settings → Your day → Planning. To-dos due soon
always get time; the rest are spread out (up to 3 hours a day, changeable).

**Every day planned for what it is:** work days stay light around the shift, days off get two focus blocks and the
bigger jobs. **Workouts** follow a real program (Settings → Your day → Planning: how many a week, push/pull/legs,
upper/lower, full body, home, running or a mix; morning, after work or evening; travel to the gym): sessions rotate,
rest days fall in between when the week allows, rest days get a different kind of movement (a walk, mobility, a bike
ride, yoga), and runs move indoors when rain is forecast. **Weekly jobs** land on the right day: groceries on your first
day off, errands on the next, meal prep (after groceries), a budget check and a weekly review on Sunday; missed ones carry
over. **Extras** rotate in so days don't repeat (stretch, learn a skill, hobby time, read, journal), more on days off, plus
getting tomorrow ready (clothes, bag, lunch) the evening before a work day. Busy days drop extras to stay doable.

**Built to beat procrastination:** every to-do gets a tiny **first step** that takes under two minutes (Claude writes
one, or add your own), and every reminder leads with it. Ten minutes into a block that isn't done she nudges you with
that first step; long blocks are broken into **25-minute sprints** with 5-minute breaks. Anything you put off (skipped,
snoozed or unfinished at the check-in) is counted: it's planned **first thing** the next day ("⭐ First thing"), and once
it's been pushed twice it shrinks to a 25-minute **"Just start"** block, and the evening check-in says honestly what keeps
getting pushed. A daily **tidy-up** is part of every planned day; the planner never adds tasks about texting or checking
in with people. Turn the nudges and sprints on or off in Settings → Your day → Planning.

**Chores:** recurring housework that she holds you to. **Starter chores** adds dishes, counters, trash, vacuuming,
laundry, the bathroom, sheets, the fridge and a weekly **deep clean that rotates** kitchen → bathroom → bedroom → living
room (edit or delete any). Each repeats on its own schedule; when one is due it's planned into your day with a tiny first
step ("fill the sink with hot soapy water"). If it doesn't happen it **stays overdue** ("Dishes · 2 days overdue"), comes
back the next day, earlier each time it's skipped, and the evening check-in calls it out (with an "I did it" button) until
it's done. Say "I did the dishes" or tap ✓. For one you've let slide, open it and turn on *Haven't done it in a while:
put it on today*.

**Bills & subscriptions (More → Tools):** everything you pay, with the monthly and yearly total and what's coming up
in the next 7 days. Add one at a time, say "add Netflix 15.49 a month, renews the 12th" (with Claude on), or paste a list
with **Import** (`Name | amount | month | next date | bill or sub | autopay`). Bills you pay yourself show up on your
plan two days before they're due ("Pay Rent · due tomorrow"), and ticking it marks it paid and moves it to next month.
Autopay ones just roll forward on their date.
**Cancelling:** tap one → *Cancel this…*. Rias can't sign in to your accounts, so she gets you to the last tap. She
opens that service's cancel or account page (Netflix, Spotify, YouTube, Disney+, Hulu, Prime, Apple, Claude, Xbox,
Nintendo, iRacing and more), Google Play or Apple subscriptions, or shows the steps for app-only ones (Uber One,
FloatMe, Flex, Dave, Brigit, Xfinity). She can also write a cancellation email in your mail app, which you send
yourself. *Not now: remind me before it renews* puts "Cancel X before it renews" on your plan two days before the
charge. *I cancelled it* stops counting it, keeps your access-until date, and shows what you're saving each month. In
chat, try "cancel netflix" or "what subscriptions do I have".

**iPhone-style look:** grouped inset lists, large titles that shrink into a frosted bar as you scroll, a frosted tab
bar whose icons fill in when selected, iOS switches, segmented controls, pull-up sheets, notification-style banners
and Messages-style chat bubbles. It uses Apple's system colors (the theme picks the accent: pink, purple, indigo or
orange; Discreet mode is blue), the Inter font, Phosphor icons and small Motion animations (rows rising in, a pop when
you tick something off). **Settings → Look → Appearance:** Automatic (follows your phone's light or dark mode), Light or
Dark. The Classic Rias look is still there in Look & app style.

**Help with doomscrolling and putting things off (based on research):**
- **Pause before scrolling** (Android): pick the apps (TikTok, Instagram, YouTube, Reddit, X…) in Settings → Day →
  *Pause before scrolling*, then allow "Rias: pause before scrolling apps" in Android's Accessibility settings (the
  button takes you there). Opening one of those apps shows a short pause first: a big **Close it** button and what's on
  your plan right now (or next). After the pause, **Open anyway** works and leaves that app alone for a while. It only
  notices which app opens and never reads your screen. (In a 280-person study of this kind of pause, people closed the
  app about a third of the time and opened it less over the weeks. The easy way out mattered most.)
- **Right after…** (if-then plans): give a to-do or chore a cue, like "dinner", "I get home from work" or "the gym",
  and it's planned straight after that happens. You can also just say "fold the laundry after dinner". The block shows
  "↪ After dinner", and the reminder starts with "After dinner, so now: …".
- **Save something you enjoy for what you put off**: Settings → Day lists a treat for chores, workouts, focus blocks
  and errands, and any single task can have its own. Those blocks show "▶ your podcast" and the reminder tells you to
  put it on. (Saving audiobooks for the gym got people there more often.)
- **No guilt, just a fix:** when something keeps sliding, the check-in doesn't count it against you. It asks what's in
  the way: **Too big** shrinks it to the first piece, **Boring** pairs it with a treat, and **Not sure how to start**
  opens it so you can write the very first step.

**Plan a whole week:** in **Month**, every week row has its own **⏱ Plan** button on the right. Tap it to see that
week (each day, work or day off, planned or not), then **Plan this week**. She plans every day that's left, in order,
so workouts, chores, weekly jobs and to-dos are spread across the week instead of piled on one day. With your Claude key
on, Claude plans each day. Afterwards the button shows ✓, she sends a day-by-day summary, and tapping a day opens it.
You can also just say "plan my week" or "plan next week".

**Chores that make sense (not the same list every day):** dishes and counters only come up when there's something to
clean. If you log food, she counts meals eaten at home since you last did them; takeout, delivery, "from Chipotle" or
"ate out" don't count. So doing the dishes last night and eating out today means no dishes. A dinner you cooked puts
them on tonight, right after dinner, never the next morning. If you don't log food, she does a quick sink check every
couple of days. Dishes, counters and trash go in the **evening**. Bigger jobs (laundry, vacuuming, bathroom, sheets,
fridge, deep clean) **wait for your next day off** when one is coming up soon, as long as that doesn't let them slide
more than a day. At the check-in you can tap **Nothing to wash**, or say "no dishes" or "I ate out", to clear it without
it counting as putting it off. Dishes left two nights in a row move to the morning, so they get done before your day starts.

**Goals:** habits and targets, like "gym 4 times a week" (she plans the sessions into free days, with rest days when
there's room) or "save $200 a month" (tell her as you go: "I saved $50"). Each goal shows this week's progress and your
streak 🔥.

**Evening check-in** (90 minutes before bed by default): she goes over what got done, moves unfinished to-dos to
tomorrow (with buttons if you did one after all), sums up your goals, and tells you how tomorrow starts.

**In your phone's calendar:** turn on Settings → Your day → *Add my plans to my phone's calendar* and planned to-dos,
goal sessions, shifts and one-time reminders also appear in Google Calendar (on your computer and watch too). She only
ever changes events she added.

**Taking things back:** tell Rias "delete my gym reminder", "skip my walk today" (just that day), "cancel my alarm",
"delete the burger I logged", "remove a glass of water", or with her AI on, "remove my Saturday shift" and anything
else in your own words. "Undo that" removes the last thing she added for you, and "bring it back" restores the last
thing deleted. If more than one reminder matches, she asks which one.

### Track
**Food & water** and **Work**, switched at the top (Track remembers which one you used last).

**Food:** a food diary with calories and macros against your goals (set them under **Goals**), a 7-day chart, recent foods, and a
water tracker. Tell Rias what you ate, or send a photo of your plate, and she logs it with estimated nutrition.

**Work:** your week at a glance, the next shift with a countdown, and reminders to leave, start and finish. **Plan my week** sets
a whole week in one screen (or paste "Mon 9-5, Tue off…"). With AI on, send a **photo of your schedule** and she adds
every shift.

### Alarms and pop-ups
Alarm-style reminders appear as a full-art card that tilts in 3D, over the lock screen or whatever app you're using,
with Done, Snooze (5 / 10 / 30) and Dismiss. Choose which reminder types pop up like this, the alarm sound (six original
sounds, your phone's sounds, vibrate only, or Rias saying it), and whether it keeps ringing until you answer.

### Your day
A **morning briefing** (shifts, reminders, calendar, weather, how you slept), check-ins when she's been quiet, a nudge
at bedtime, "goodnight" to log your sleep, and a **weekly recap** on Sunday evening. Connect your **phone calendar** to see
its events and be reminded of them. **Share → Rias** from any app turns a note or screenshot into a reminder.

### More: Find clients and Translator
Open them from **More**.

**Translate (live, face to face).** Pick your language and theirs (about 35, from Spanish and Chinese to Tagalog,
Arabic, Haitian Creole and Somali) and tap *Start translating*. The screen splits in two: the top half faces the other
person (upside down so they can read it across from you; ⇅ turns it upright), the bottom half is yours. Take turns tapping
your mic: Rias translates and **says it out loud in the other person's language**, with the text shown big and the
original underneath. 🔊 repeats it, ⌨ lets either side type. Needs her AI (Claude, or a free Gemini key) and internet; the
voices are your phone's (if a language has no voice, add it in Android Settings → Accessibility → Text-to-speech, or
just show the text). "Translator" in the chat opens it.


**Clients (find clients and email them)** turns Rias into a small office manager for your videography business:
1. **My business:** fill in once what you shoot, the clients you want, your area, portfolio, prices and how your emails
   should sound.
2. **Find clients:** pick who to look for (suggested from what you shoot, or describe them), where, and how many. She
   searches the web, checks their websites for a **publicly listed** contact email, and saves each one with *why they
   could use video*. It takes a minute or two; you can leave the screen. Needs her AI: Claude finds the most (about 10–50
   cents per search with Opus, less with Sonnet); a free Gemini key works too.
3. **Write email:** she writes a short, personal cold email in your voice, with a specific hook, your portfolio, one easy
   ask, an opt-out line and your signature. Tap *Shorter*, *More casual*, *More professional* or *New angle* to rework it,
   or edit it yourself, then **Open in email app** and tap Send. The client is marked *Emailed*.
4. **Follow up:** after 4 days with no reply she flags the client and writes a short nudge (up to two follow-ups).
5. **Track:** filter clients by New, Emailed, Replied, Booked or Not interested, add notes, add clients yourself, and see
   your totals at the top. Saying "find me some clients" in the chat opens the search.

### Standard look and Rias mode
The app opens as a **standard assistant app**: a plain slate-and-blue design, ordinary chat bubbles, and the name
"Assistant" with a plain icon on your home screen. It's fine to open anywhere.

Settings → Look & pictures → **Rias mode** turns Rias on. Every feature works the same in both styles; only the look,
voice and personality change:
- **Standard:** no character on screen. You can rename the assistant; the header, chat, notifications, widgets, alarm
  screen and home-button pop-up use that name. With AI on it answers as a friendly, neutral assistant. You can also
  keep or drop the plain home-screen icon.
- **Rias mode:** the animated Rias, her pictures, the full-art alarm card, her voice and her personality.

Both use the same clean layout. In Rias mode, **Classic Rias look** (Look & pictures) brings back the original style:
Rias full-screen on Home and in the chat, glass cards and gold lettering.

Changing the home-screen icon can take a few seconds, and you may need to add the icon to your home screen again from
the app drawer. If you used Rias before this option existed, you keep Rias mode until you turn it off.

### Widgets
Long-press your home screen → Widgets → Rias:
- **Rias** shows what's next and a line from her.
- **Rias · Chat** lets you talk to her without opening the app. Tap the bar to type (or 🎙 to speak); her answer comes
  as a notification you can **Reply** to. Her regular notifications have Reply too.

### Phone assistant
Make Rias your phone's assistant (Settings → Phone assistant → *Set up* → *Digital assistant app* → Rias). Then long-press
home and a small Rias bubble appears: talk, she answers out loud, and it disappears. Tap the bubble to stop early or
hush her. Prefer to see the words? Switch the pop-up to *Full panel*.

She can do this by voice, AI or not:
- **Timers and wake-ups:** "set a timer for 20 minutes", "how much time is left?", "wake me up at 6:30"
- **Calls, texts, directions:** "call Mom", "text Jake I'm running late" (you tap Send), "directions to Walmart"
- **Emails:** "email Mike that I'll be late tomorrow". She writes it as you (with her AI on, a proper email from whatever you
say), finds the address in your contacts, signs it (*Sign my emails as* under You) and opens your email app; you tap Send
- **Phone:** "flashlight on", "volume 40%", "turn on Do Not Disturb", "open YouTube"
- **"What did I miss?"** reads your new notifications aloud
- **Quick answers:** the time and date, "15% of 80", "tip on $45"

**Hands-free, like Siri** (Settings → Phone assistant → *Hands-free: “Hey …”*, off by default): say “Hey” and her name
(or a wake word you pick), then your question. A short buzz means she heard you; she answers out loud with nothing on
screen and no notification. If you only say the wake word, she says hello ("Yes? What do you need?") and listens for
the question. The settings show what she last heard, live, which helps if she isn't picking up her name. Listening runs on the
phone with an offline speech model (a one-time 40 MB download), so it's silent while it waits and nothing leaves the
phone until you say the wake word. Choose *Always* or *Only while charging*; always-on uses some extra battery. Android
requires a small silent "listening" notification while the microphone is on.

---

## Settings at a glance

| Section | What's in it |
|---|---|
| **You** | Your name, wake-up and bedtime, what she calls you, how your emails are signed |
| **Her voice** | Speaking out loud, phone voice or natural AI voice, pitch and speed |
| **Look & pictures** | Rias mode on/off, Classic Rias look, assistant name, theme (Crimson, Amethyst, Midnight, Gold), outfit, little vibrations, and **every picture of her**: Home & Chat, the alarm card (with an optional pop-out cutout), and the assistant pop-up |
| **Reminders & alarms** | Check-ins, notifications, the pop-up check, which reminders pop up, alarm sound, test buttons |
| **Your day** | Planning (calendar sync, evening check-in, to-do time per day), briefing, weather city, recap, wind-down, phone calendar, food & water goals |
| **Rias's mind** | AI on/off and service, monthly cost (Claude), what she remembers |
| **Phone assistant** | Home-button setup, pop-up style, permissions, hands-free “Hey …” and your wake word |
| **Backup & data** | Save / restore a backup, weekly auto backup, updates, reset |

---

## Her AI (optional)

Turn it on in **Settings → Rias's mind**:
- **Google Gemini (free):** get a key at aistudio.google.com (*Get API key → Create API key*). No card needed; the free tier
  has daily limits.
- **Claude (paid, the best conversation):** create a key at console.anthropic.com. Opus 5.5 is the default; **Sonnet 5.5**
  is faster and cheaper, **Haiku 5.5** fastest and cheapest. Claude can also search the web. The cost meter estimates
  this month's spend, and you can set a monthly limit.

Keys stay on your phone, are sent only to the service you picked, and are never put in backups.

## Her voice

- **Phone voice** (default, offline): uses your phone's speech engine. For a more natural voice, install a better engine
  such as **SherpaTTS** (free) or Google's voice data, choose it under Android Settings → Accessibility → Text-to-speech,
  then fully close and reopen Rias and pick the voice under **Her voice**. With engines like SherpaTTS keep pitch and
  speed in the middle; other values can sound robotic.
- **Kokoro (free, recommended):** a natural, human-sounding voice that runs on your phone: no key, no account, works
  offline. Choose *Kokoro* under **Her voice**, tap *Download the voice* (about 100 MB, once), pick a voice (Emma, British
  and poised, suits Rias; Bella, Isabella, Sarah, Nicole, Sky, plus male voices) and tap *▶ Hear her*. It's used everywhere
  she talks: chat, the pop-up, hands-free "Hey …" and alarms. Needs a 64-bit phone (nearly every phone from recent years).
- **Natural AI voice:** an original voice made to fit her (warm, poised, a little teasing; not a copy of any actor),
  from Google's Gemini voice service with a free Google key. Chats keep using whichever AI you chose. If it can't
  connect or the free quota runs out, she uses the phone voice.

If she's silent: turn up your *media* volume, then tap **▶ Hear her**; the message under it says what's wrong.

## Privacy

Your reminders, chat, food diary, schedule, pictures and memories are stored only on your phone. There is no account and
no server. The app only connects to: the AI service you pick (if any), Gemini's voice service (if you choose the natural
voice), GitHub once to download the Kokoro voice (if you choose it), Open-Meteo for weather (your city only), GitHub to check for updates, and, the first time you make an alarm-card
cutout, a one-time download of the cutout engine (your photo is processed on the phone, never uploaded), and, when you turn on hands-free, a one-time download of the offline speech model from alphacephei.com (listening itself stays on the phone). Notifications read by "What did I
miss?" stay on the phone. Back up your data with **Save backup** before switching phones.

---

## For developers

Plain HTML/CSS/JS (no build step) in this folder, wrapped by a small Java WebView app in `android/`.

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | The app: screens, state (localStorage), reminders, settings |
| `dialogue.js`, `talk.js`, `chat.js` | Her written lines and the matching for chat without AI |
| `ai.js` | Claude (bundled SDK, streaming, tools, web search) and Gemini |
| `assistant.js` | Voice-assistant commands (timers, calls, emails, phone controls…) |
| `biz.js` | Assistant tab → Clients: business profile, client finder, outreach emails, follow-ups |
| `translate.js` | Assistant tab → Translate: the face-to-face interpreter |
| `natural-voice.js` | Gemini text-to-speech |
| `android/src/…/KokoroVoice.java`, `TarBz2.java`, `com/k2fsa/…` | Kokoro on-phone voice (sherpa-onnx engine) and its model download |
| `android/src/…/WakeService.java`, `Wake.java`, `WakeModel.java` | Hands-free "Hey …" (Vosk offline wake word) |
| `food.js`, `work.js` | Food diary, work schedule |
| `planner.js` | Plan → To-do and Goals: fitting to-dos and goal sessions into free time, streaks, the evening check-in |
| `android/src/…/CalendarSync.java` | Copies the plan into the phone's calendar |
| `rias-avatar.js`, `living-photo.js`, `alarm-card.js`, `photo-cutout.js` | Animated Rias, living photo, alarm card, on-device cutout |
| `alarm.html`, `assist.html` | The Android alarm screen and assistant pop-up |
| `android/src/…` | Native shell: scheduling, alarms, widgets, assistant, voice, reply service |
| `sounds/make_sounds.py` | Synthesizes the alarm sounds |

- Build the APK: `bash android/build_apk.sh` (needs Java 17+; downloads its tools). It also writes `version.json` for the
  update check. Bump `versionCode` / `versionName` in `android/apktool.yml`.
- Build the single-file page: `python3 build_standalone.py`.
- Try it in a browser: `python3 -m http.server` in this folder, then open http://localhost:8000.
- Her lines: `dialogue.js` (by situation; `{name}` and `{title}` are filled in) and `talk.js`.

### Credits
Kokoro-82M voice model (Apache-2.0) by hexgrad; sherpa-onnx speech engine (Apache-2.0) by k2-fsa, whose Java bindings
are included in `android/src/com/k2fsa`; Vosk offline speech recognition (Apache-2.0) by Alpha Cephei; JNA (Apache-2.0);
Phosphor Icons (MIT); the Inter typeface (SIL Open Font License 1.1) by Rasmus Andersson; Motion (MIT) by Motion Division.
The iPhone-style look follows Apple's Human Interface Guidelines, using the iOS color and spacing values from Ionic Framework (MIT).
