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
- **Today**: your routine plus work shifts and phone-calendar events, with a progress ring and streak.
- **Food**: a food diary (breakfast, lunch, dinner, snacks, each marked healthy / normal / treat), a water tracker
  with a daily goal, and a diary streak. After a meal reminder, Rias asks what you had; at 9 PM she nudges you if
  dinner isn't logged, and at 3 PM if you're behind on water.
- **Work**: weekly or one-off shifts (overnight shifts work too), a 7-day overview with total hours, and a
  "remind me to leave" time. Rias reminds you when to leave, when the shift starts, and when it ends.
- **Settings** (⚙ at the top): name and times, what Rias calls you, her voice, her AI, phone calendar, food reminders, check-ins.

## Pop-ups

- **Reminder pop-up (alarm style):** when a reminder is due, a card pops up in the middle of the screen with her
  picture, the time, the reminder and *Done ✓ / Snooze 10 min / Dismiss*, with a buzz and chime. With the app
  closed, the Android app uses full-screen alarm notifications: the screen turns on and the same card appears over
  the lock screen (while you're using the phone, Android shows a pop-up notification instead; tap it for the card).
  Buttons tapped there are applied the next time the app opens. On Android 14+, allow it once under
  **Settings → Notifications → Allow pop-ups over the lock screen**. Turn it off with *Reminders pop up in the
  middle of the screen*.
- **Choose which reminders pop up:** under *Which reminders pop up like an alarm*, tick the reminder types that get
  the big pop-up (default: wake up, medication, work shifts, phone calendar, sleep, other); the rest arrive as
  normal notifications. When adding or editing a reminder, *When it's due* overrides it for that one reminder.
  Alarm reminders show ⏰ in Today.
- **Test them:** *Try them out* → ⏰ Pop-up (shows the card now), 🔒 Lock screen (Android app: fires in 10 seconds,
  so lock your phone first), 💬 Banner.
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

## Phone calendar

In the Android app, **Settings → Phone calendar** shows events from Samsung Calendar and Google Calendar in Today
(all-day events at the top) and Rias reminds you at their start time. Android doesn't let other apps read
Samsung's separate *Reminder* app, so for reminders made outside Rias, add them as calendar events, or just tell
Rias (with AI on) and she'll add them herself.

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
