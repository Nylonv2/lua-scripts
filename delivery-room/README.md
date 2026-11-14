# Delivery Room Plan

A small phone app for a shoe-store delivery: photograph the **Delivery Notifications** screen (SKU Summary tab)
and it builds a plan of what's arriving and what needs room.

- **Scan a delivery**: pick up to 8 photos (scroll and shoot until every row is covered). Claude reads every row,
  merges rows that appear in more than one photo, and shows what it found before anything is replaced.
- **The plan**: units arriving, already in store and total after; the five styles that need the most room;
  department filters; one card per SKU with a *Room made* tick.
- **Flags**: *New, needs a spot* (none in store now) and *Check count* (a number the scan couldn't read).
- **Find shoe photos**: Claude searches the web (the API's web search tool) for each shoe's product page, and the
  app saves the picture that page names for link previews. Pictures found this way are marked *AI* with a link to
  the page they came from, since a look-alike is possible; replace or remove any that don't match. In the Android
  app the phone fetches the product page itself; in a plain browser most sites refuse, so it works best in the app.
- **Your own photos**: tap a drawing to add a photo; *See photos* opens an image search.
- **Paste a list** (button on the main screen) instead of scanning: paste text, read the clipboard, or open a
  text file. One shoe per line: `Dept | SKU | Brand | Style | Pattern | Color | Type | arriving | in store`.
  On Android a list can also be shared to the app, or a `.txt` file opened with it.

## AI

Photos are read with **your own Claude API key** (Settings; get one at console.anthropic.com). The app calls the
Claude Messages API directly from the phone through the official SDK (`vendor/anthropic-sdk.js`), streamed, with
adaptive thinking; photo lookups add the web search tool, five shoes per request. Default model `claude-opus-5-5`; Sonnet and Haiku can be chosen for cheaper scans. The key, the
list, the ticks and the photos are stored on the phone only; the key is sent only to Anthropic.

## Install

- **Android**: install `DeliveryRoomPlan.apk` from the repo root (allow installs from your browser/files app).
- **Any browser**: serve this folder (`python3 -m http.server`) and open it; it can be added to the home screen.

## Build

`bash android/build_apk.sh` writes `../DeliveryRoomPlan.apk`. Needs Java 17+ and network access for the build tools.

Files: `index.html` (page and styles), `app.js` (everything else), `android/` (a thin WebView shell).
