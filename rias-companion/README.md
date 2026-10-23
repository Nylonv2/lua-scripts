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
