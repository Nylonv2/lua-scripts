# Rias Companion

A phone companion app for daily reminders and routine check-ins, with Rias Gremory
(High School DxD) as your guide. It's a Progressive Web App: no app store, no build
step. You install it from your phone's browser.

## What it does

- **Chat with Rias.** She greets you each morning with the day's plan, pings you when
  it's time for each part of your routine, and reacts when you tap **Done**, **Snooze**
  or **Skip**. You can also type to her ("what should I do now?", "I'm tired",
  "today's plan", "done", ...).
- **A daily routine built for you.** It's generated from your wake-up and bed times:
  water, hygiene, meals, a focus block, breaks, a walk, a social check-in, wind-down
  and lights out. Edit, delete or add anything in the **Today** tab. Items can repeat
  every day, on weekdays, on weekends, or happen once.
- **Check-ins.** If she's been quiet for a while (1–3 hours, you choose), she checks
  on you: posture, water, breathing, how your day is going. She stays quiet outside
  your waking hours.
- **Progress.** A completion ring for today, plus a streak of days with at least 60%
  of your tasks done.
- **Private.** Everything is stored on your phone (localStorage). There's no server
  and no account.

## Android app (recommended)

Download **`RiasCompanion.apk`** from the top of the repo and open it on your phone.
Android will ask you to allow installing apps from your browser or Files app; allow it
once, then tap **Install**. Play Protect may warn that the app is unknown or built for an
older Android version. That's because it's a personal app that isn't from the Play
Store. Tap **Install anyway**.

In the app, every reminder and check-in for the next 7 days is handed to Android's alarm
system, so Rias pings you even when the app is closed or the phone has restarted. Open
the app at least once a week so she can plan the next week.

If notifications stop arriving, open **Settings → Apps → Rias → Battery** and choose
**Unrestricted**. Samsung, Xiaomi, OnePlus and some other phones put unused apps to
sleep unless you do this.

To rebuild the APK after changing the app, run `android/build_apk.sh` (needs Java 17+).

## Quickest way to open it

Download **`RiasCompanion.html`** from the top of the repo and open it in Chrome, Safari or Edge. It's the whole app in
one file, so nothing else is needed. Notifications and "install as an app" don't work
this way. Use the phone setup below for those.

`RiasCompanion.html` is generated from the other files. After changing them, rebuild it with
`python3 build_standalone.py`.

## Put it on your phone

The app has to be served over HTTPS so notifications and installing work. The
easiest free option is GitHub Pages:

1. On GitHub, open the repo → **Settings → Pages**. Choose **Deploy from a branch**
   and pick the branch and `/ (root)`.
2. After a minute, open `https://<your-username>.github.io/<repo>/rias-companion/`
   on your phone.
3. Install it:
   - **Android (Chrome):** menu ⋮ → **Add to Home screen / Install app**.
   - **iPhone (Safari):** Share → **Add to Home Screen**. On iOS, notifications only
     work from the installed Home Screen app (iOS 16.4+).
4. Open it, tell Rias your name and schedule, then go to **Settings → Allow
   notifications**.

To try it on a computer, run `python3 -m http.server` inside this folder and open
http://localhost:8000.

## Getting around

The phone's **back** button closes pop-ups first, then returns to Home; on Home it puts the app in the background
(so reminders keep running). Tapping Rias's name at the top also goes Home.

## Home

The app opens on **Home**: an animated Rias (an original drawing, not art from the show) who breathes, blinks, sways
her hair and moves her mouth when she talks, in front of a slowly turning magic circle. Her face follows the moment:
happy when you finish things, worried when a reminder is waiting on you, sleepy (with z's) at night. Tap her and she
tells you something useful: what's next, a nudge about water, praise, or a check-in. When she messages you while
you're on Home, she says it in her speech bubble.

Below her: a greeting, the **next reminder** (with Done / Snooze), tiles for today's progress, water (＋ Glass),
food and work, and quick buttons to talk, speak, add a reminder or log food. Settings is the ⚙ button at the top.
To show your own picture instead of the animated Rias: **Settings → Home screen**.

## Tabs

- **Chat**: talk to Rias by typing or with 🎙.
- **Reminders**: today's reminders grouped into Morning / Afternoon / Evening / Night, with All / To do / Done
  filters, round checkboxes, *Up next* / *Missed* tags, ⏰ for alarm-style ones, and your work shifts and phone-calendar
  events alongside (connect the calendar in Settings). *New reminder* opens a bottom sheet with tap-to-pick
  repeat, type and pop-up style.
- **Food**: a food diary (breakfast, lunch, dinner, snacks, each marked healthy / normal / treat) with **calories and
  macros**: today's calories against your goal, protein / carbs / fat bars, fiber and sugar, kcal on every entry and
  meal, and a 7-day calorie chart (tap a bar for that day). Set your goals with **Goals**. Tell Rias what you ate
  ("I just had a chicken burrito and a Coke", or send a photo of your plate) and, with her AI on, she estimates the
  nutrition and logs it; in the add-food form, **✨ Ask Rias to estimate** fills the numbers, and you can always type
  or fix them yourself. Her numbers are estimates. Plus a water tracker with a daily goal and a diary streak. After a meal reminder, Rias asks what you had; at 9 PM she nudges you if
  dinner isn't logged, and at 3 PM if you're behind on water.
- **Work**: your schedule sits at the top: this week's hours and shift count, a **Next shift** card with a countdown
  (or time left while you're on shift), and a 7-day timeline with each shift's times on a 24-hour bar (today
  highlighted, days off greyed). Below are your saved shifts (weekly or one-off; overnight shifts work too) and a
  "remind me to leave" time, with the planning tools at the bottom. Rias reminds you when to leave, when the shift starts, and when it ends.
  **🗓️ Plan my week** sets a whole week on one screen: tap Start and End on each day you work and pick the time with
  the tap picker (hour, :00/:15/:30/:45, ±5 min, AM/PM; a start alone fills an end 8 hours later) and leave days off blank; ✕ clears a day, ↺ copies the day above, *Copy last week*,
  ‹ › to plan ahead, and *Repeat this every week* (starts from that week; earlier weeks keep their plan). Or paste/type your schedule: "Mon 9-5", "Tue off", "Wed-Fri 12-8",
  "Thu 7am-3:30pm" (AM/PM is guessed when left out: starts from 1 to 5 are afternoon, and the end comes after the start).
  Changing one week of a repeating schedule only changes that week.
  **📷 Photo of your schedule:** with Rias's AI on (a free Gemini key works), tap 📷 in the chat (or *Send Rias a
  photo of your schedule* on the Work tab) and pick a photo or screenshot. She reads it, finds your row by your
  name, adds each shift (re-sending the same week replaces instead of doubling), and tells you what she added.
- **Settings** (⚙ at the top): name and times, what Rias calls you, her voice, her AI, what she remembers, your day (briefing, weather, recap, sleep), phone calendar & other apps, food reminders, check-ins, backup & updates.

## Pop-ups

- **Reminder pop-up (alarm style):** when a reminder is due, a card pops up in the middle of the screen with her
  picture, the time, the reminder and *Done ✓ / Snooze 10 min / Dismiss*, with a buzz and chime. With the app
  closed, the Android app uses full-screen alarm notifications: the screen turns on and the same card appears over
  the lock screen. While you're using the phone, Android shrinks those to a small banner, so with **Appear on top**
  allowed, Rias opens the full alarm screen over whatever app is open, like a real alarm app (if Android refuses,
  the pop-up card shows in the middle of the screen instead). The notification itself also has **Done ✓** and
  **Snooze 10 min** buttons. Buttons tapped there are applied the next time the app opens. Turn it off with
  *Reminders pop up in the middle of the screen*.
- **Pop-up check:** in the Android app, **Settings → Notifications** lists what Android needs before pop-ups can show
  outside the app (notifications allowed, pop-up alerts set to sound/pop on screen, *Appear on top*, full screen over
  the lock screen, not put to sleep by battery saving, exact alarms), each with a **Fix** button that opens the
  right Android settings page. If reminders don't show up outside the app, fix everything here first.
- **The alarm card:** alarm-style reminders pop up as a holographic trading card floating in a dark, sparkling scene,
  in the app and on the Android alarm screen (over the lock screen or the app you're using). The art window shows
  the animated Rias (she smiles and talks), Rias's picture, or **your own photo** (Settings → Notifications →
  *Alarm card picture* → *Choose a photo for the card*); the photo slowly breathes and shifts, and a blurred copy
  drifts behind the card. Tilt your phone or drag the card and it turns in 3D with a rainbow holo sheen and glare;
  left alone it sways by itself. The reminder is the card's name, her line is printed like an ability, the badge
  shows the reminder type. Done, Snooze 5/10/30 and Dismiss sit under the card. *👀 Preview* shows it any time.
  (`alarm-card.js` builds the card; `alarm.html` is the Android alarm screen; the plain native screen is kept as a
  fallback.)
- **Alarm sounds** (Settings → Notifications → *Alarm sound*, tap one to hear it): six original sounds made for the
  app (🔔 Crimson Chime, 🎼 Harp, 🎶 Music Box, ✨ Magic Circle, ⏰ Classic Beep, 💗 Soft Pulse), 📱 your phone's own
  alarm sound, 🎵 any alarm/ringtone/notification sound on your phone (Android's sound picker), 🗣️ *Chime + Rias says
  it* (she reads the reminder out loud on the alarm screen, in your chosen voice), or 🔕 vibrate only. *Keep ringing
  until I answer* repeats the sound like a real alarm until you tap Done, Snooze or Dismiss; after 3 minutes it goes
  quiet but stays in your notifications. Any reminder can have its own sound (*Alarm sound* in the reminder editor).
  The sounds are synthesized from scratch by `sounds/make_sounds.py` (numpy + ffmpeg), nothing sampled. On Android
  each sound gets its own notification channel ("Reminder pop-ups · Harp"…), because Android fixes a channel's sound
  once it exists.
- **Choose which reminders pop up:** under *Which reminders pop up like an alarm*, tick the reminder types that get
  the big pop-up (default: wake up, medication, work shifts, phone calendar, sleep, other); the rest arrive as
  normal notifications. When adding or editing a reminder, *When it's due* overrides it for that one reminder.
  Alarm reminders show ⏰ in Today.
- **Test them:** *Try them out* → ⏰ Pop-up (shows the card now), 📱 Outside app (Android app: fires in 10 seconds,
  so go to your home screen, another app, or lock your phone), 💬 Banner.
- **Message banner:** other messages from Rias slide in at the top when you're on another tab. Tap to open the chat,
  swipe up to dismiss.

## Rias's picture

**Settings → Rias's picture → Choose from my photos** picks any image from your phone. It's cropped to a square,
used as her avatar in the app and shown beside her Android notifications. It's stored only on your phone (never in
this repo or uploaded anywhere). **Use the default** switches back to the crimson magic circle.

## Rias's AI (optional)

Turn on **Settings → Rias's mind (AI)** and pick a service:

- **Google Gemini (free):** at aistudio.google.com sign in with Google, tap *Get API key → Create API key*, and
  paste it in. No card needed. The free tier has daily limits, and Google may use free-tier chats to improve its
  products. The app asks Google which models your key can use and picks the newest stable Flash model.
- **Claude (paid, best conversation):** create a key at console.anthropic.com (add credit under Billing). Default
  model Claude Opus 5.5 (about 1–2 cents per message); Sonnet 5.5 and Haiku 5.5 are cheaper. Requests opt into
  Anthropic's server-side refusal fallback on Opus and Sonnet.

Tap **Test connection** to check the key. With AI on she writes her own replies in character, knows your schedule,
shifts, food and water for the day, and acts on what you say: "remind me at 5 to call mom", "I work Saturday 10 to 6",
"I just had a burger", "I drank two glasses of water", "I took my meds". Keys are stored only on your phone and sent
only to the service you picked. Without a key, or offline, she uses the written lines below.

The Claude SDK is bundled as `vendor/anthropic-sdk.js` (rebuild with `vendor/build-sdk.sh`); Gemini uses Google's
REST API directly (`ai.js`).

## Sync from your phone

**Settings → Phone calendar & other apps**:

- **Phone calendar:** *Connect* asks for calendar permission; once connected it shows how many events it found, when
  it last synced, and a *Sync now* button. If permission was denied, *Allow* asks again and a link opens Rias's page
  in Android settings. *Disconnect phone calendar* turns it off and clears the synced events.
- **Share → Rias:** in Samsung Reminder, Google Keep, Messages or any app, open a reminder and tap **Share → Rias**.
  With her AI on she creates the reminder (with the right time); without it the new-reminder sheet opens filled in
  (title and any time like "4:30pm"). Sharing a screenshot or photo sends it to her chat, so a schedule becomes shifts
  and a meal becomes a food log.

Every time box in the app opens the same tap picker, so it works the same on every phone.

## Phone calendar

In the Android app, **Connect** in **Settings → Phone calendar & other apps** shows events from Samsung Calendar and Google Calendar in Today
(all-day events at the top) and Rias reminds you at their start time. Android doesn't let other apps read
Samsung's separate *Reminder* app, so for reminders made outside Rias, add them as calendar events, or just tell
Rias (with AI on) and she'll add them herself.

## What's new in 5.0

- **Immersive alarm card:** alarm-style reminders pop up as a full-art card, the kind where the art fills the whole
  card and the character steps out of it. The scene fills the card edge to edge; the subject (the animated Rias, or the
  person in your card photo) rises over the top edge; sparkles and petals drift in front. Scene, subject and sparkles
  sit at different depths, so tilting the phone (or dragging the card, or its idle sway) looks into a small 3D world,
  under a holo sheen. The reminder and her line are printed over the bottom of the art. **Pop-out photos:** when you
  choose a card photo, the app cuts the person out of the background *on the phone* with Google's MediaPipe
  "magic touch" segmenter (`photo-cutout.js`, Apache-2.0). The engine (~13 MB) and model (~6 MB) download once from
  jsDelivr / Google's model storage the first time you make a cutout; your photo is never uploaded. Without a clear
  subject, or offline, the photo fills the card as a living photo instead. *✨ Make the photo pop out* and *Turn
  pop-out off* are in Settings → Notifications → *Alarm card picture*.
- **Her replies stream in** as she writes them (Claude), with her mouth moving; the typing dots disappear once she
  starts. Gemini replies still arrive whole.
- **The animated Rias has gestures and outfits:** she waves when you arrive, winks when she's pleased with you, and
  folds her arms when something's overdue. Outfits change by themselves: pajamas near bedtime, a coat and scarf
  when it's cold or winter, summer clothes when it's hot or summer, the school uniform otherwise (or pick one in
  Settings → Home screen → *Rias's outfit*).
- **Celebrations:** a burst of hearts, sparkles and petals with a little badge when you finish everything for the
  day, hit a streak milestone (3, 7, 14, 21, 30, 50, 100, 365 days) or reach your water goal, and Rias reacts.
- **Themes:** Crimson (Gremory red), Amethyst, Midnight blue and Royal gold (Settings → Home screen → *Theme*). The
  room, glows, buttons and alarm screen all follow; gold trim stays gold.
- **Polish:** screens glide in, buttons press in slightly, and small vibrations on taps (firmer for Done; turn off
  under *Little vibrations when I tap*).
- **Month calendar:** Reminders → *Month* shows the month as a heatmap of how much you got done each day, a gold bar
  on work days and 🌙 on nights you went to bed on time. Tap a day for its reminders (done / missed), shifts,
  calories, water, sleep and weather; future days show what's planned.
- **AI cost meter:** Settings → Rias's mind shows an estimate of this month's Claude spend (from Anthropic's list
  prices and the token counts each reply reports, web searches included) and how many requests she's made. Set a
  *Monthly limit* and, once it's reached, she quietly switches to her written replies until next month. Gemini's
  free tier counts as $0.

## The look (4.3)

The whole app shares the scene from the chat and the alarm card: a dark crimson room behind every screen with
drifting motes of light (stars at night), lit by the time of day; frosted-glass cards with a thin gold-to-crimson
edge; a slow holo-foil sweep on the cards that matter right now (*Up next* on Home, your next shift, today's
calories); gold serif labels like the alarm card; glowing crimson main buttons and a glass header and tab bar.

**Living photo (4.4):** when Home shows your picture (Settings → Home screen → *Your picture*), it's no longer a flat
circle. It stands in a gold-edged portrait window and comes alive: a WebGL shader (`living-photo.js`) treats the
middle of the picture as closer than the edges, so tilting the phone (or dragging, or an idle sway) moves the person
against the background like real depth while the frame turns in 3D. It also breathes, sways softly at the edges like
hair in a breeze, lifts a little and glows while she talks, and catches the light as it tilts. The same living photo
stands in the chat scene and fills the alarm card's art window when a photo is chosen there. Phones without WebGL
get the plain picture with a gentle float.

**Looking things up (4.5):** with her AI on, Rias has a `get_weather` tool (Open-Meteo, any city or your saved one,
today through 6 days ahead) with both Claude and Gemini, and with Claude she can also **search the web** (Anthropic's
`web_search` server tool, up to 3 searches per message) for news, scores, opening hours and other current facts. Web
searches are billed by Anthropic per search on top of tokens.

## Daily life with Rias (4.0)

- **Backup & restore** (Settings → Backup & updates): *Save backup* writes one file with everything (reminders,
  shifts, food diary, chat, sleep, what she remembers, your picture) to Google Drive, Downloads or wherever you pick.
  *Restore* reads it back on a new install or phone. API keys are never put in the file. The Android app also keeps
  a weekly automatic copy in **Downloads/RiasCompanion/rias-backup.json** (Android 10+, can be turned off).
- **Update check:** once a day the Android app compares its version with `version.json` on GitHub (written by the
  APK build). When a newer one is out, a card on Home offers **Update**: it downloads the APK in your browser, and you
  open it to install over the old one (your data stays). *Check for updates* in Settings does it on demand.
- **Things Rias remembers** (Settings): facts about your life. With her AI on she saves them herself (`remember` /
  `forget` tools) and they go into her context; without it she picks up "Remember that…", "I work at…", "My sister's
  name is…" and "My birthday is…". She brings them up in check-ins, the morning briefing and when you tap her. You can
  add or delete any of them.
- **Morning briefing:** the first time you open the app after waking, she gives you the day: shifts (and when to
  leave), reminders left, calendar events, the weather, how you slept, and something she remembers. The wake-up
  notification carries a one-line version. Weather comes from Open-Meteo (free, no key): set your city in
  **Settings → Your day with Rias**; only that city name and its coordinates are sent. Fahrenheit in the US, Celsius
  elsewhere.
- **Wind-down & sleep:** say goodnight (the 🌙 button on Home near bedtime, the *Goodnight* quick reply, or just
  "goodnight") and she notes the time, and tells you off if it's late. In the morning she asks how you slept
  (Great / Okay / Badly) and notices three late nights in a row. If you're still up 30+ minutes past bedtime she
  nudges you once.
- **Weekly recap:** Sunday evening (or Monday morning if you missed it): reminders done and your best day, water,
  calories, hours worked, bedtimes, and a verdict.
- **Home screen widget:** long-press your home screen → Widgets → Rias. It shows her picture, what's next (or
  tomorrow's first thing) and one of her lines, and refreshes on every reminder and every 30 minutes.
- **Reminders:** *Pick days* (e.g. Mon/Wed/Fri), and *During the day: every 30 min / 1–4 hours until …* (each
  occurrence can be checked off on its own). **Swipe** a reminder right to mark it done, or left for *Snooze* and
  *Delete* (*Skip* for shifts and calendar events).
- **Snooze 5 / 10 / 30 min** on the in-app pop-up, the Android alarm screen and the over-other-apps card; the
  notification has *Done*, *Snooze 10 min* and *30 min*.
- **Recent foods:** the add-food dialog shows what you've eaten lately; one tap logs it again with the same calories.
- **Night shifts** show their morning tail ("until 6:00 AM, from last night") on the next day, and the Work tab
  counts down while you're still on one.

## The chat

The Chat tab is a scene, not a chat box. Rias (the same animated Rias from Home, or your picture) walks in and
stands in the club room while you talk. Her mouth moves as she speaks, she smiles when she praises you and looks
worried when something's waiting, and she thinks (dots beside her head) while she writes. Tap her and she says
something. Her words float in front of her with no bubbles, drifting in one word at a time, and older lines fade
as they rise toward her. Your words sit on the right with a crimson line. The room's light follows the time of day:
warm morning light, afternoon sun, a red evening glow, and stars at night (she dims when she's asleep). Hearts
float up when she praises you and the screen flashes crimson at the Power of Destruction. DxD quick replies sit
above a frosted message bar with the camera and mic inside it.

## Talking to Rias (written lines)

Type or tap 🎙 and talk to her normally. She understands a few hundred everyday ways of
saying things: how you feel, what you're doing (work, school, gaming, the gym), being
home or heading out, being sick, tired, stressed or lonely, compliments, hugs, asking
about her, her peerage, her family and chess, and more. She also:

- follows up on her own questions ("How about you?" → "not great" gets a caring answer)
- remembers things you like ("I like pizza", later "what do I like?")
- tries not to repeat a line she's used recently
- sometimes answers in two or three messages, like a person texting

Her chat lines are in `talk.js`; the matching logic is in `chat.js`. Lines are original,
written in her voice rather than copied from the show.

## Voice troubleshooting

Rias speaks with your phone's text-to-speech. If she's silent, **Settings → Voice → ▶ Hear
her** shows what's wrong:

- **Silent, no message:** turn up your *media* volume while the app is open.
- **"Couldn't connect to your phone's voice engine":** install *Speech Recognition and
  Synthesis from Google* from the Play Store, choose it under Settings → Accessibility →
  Text-to-speech → Preferred engine, then close and reopen the app. (Seen on Samsung
  phones with only Samsung's engine.)
- **"Missing voice data":** download an English voice in the same Text-to-speech settings.
- **"That voice couldn't play":** pick *Automatic* or another voice; voices marked
  *online* need internet.
- **The web page / preview link doesn't speak:** some browsers and in-app viewers have no
  speech support. Use the Android app or Chrome.

For a voice closer to Rias, download Google's *English (UK)* voices, pick one under
**Her voice**, and lower the pitch slightly.

## Limits

A web app can't run while it's fully closed. Reminders and check-ins fire while the
app is open or in the background (recently used and not killed by the OS). If you
open it after a reminder's time has passed, recent items (within 45 minutes) still
ping you. Older ones show as missed in the Today tab. For alarms that are guaranteed
to go off when the phone is locked, this would need to be wrapped as a native app
(for example with Capacitor) to use scheduled local notifications.

## Customising her

All of her lines are in `dialogue.js`, grouped by situation: per task type, done,
snooze, skip, greetings, check-ins and chat replies. Edit them freely. `{name}` is
replaced with your name and `{title}` with the task name. Colours are at the top of
`style.css`.

This is an unofficial fan project, not affiliated with the High School DxD rights
holders. It uses no official artwork.
