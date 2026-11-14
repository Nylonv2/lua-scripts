# Delivery Room Plan

A small phone app for a shoe-store delivery: photograph the **Delivery Notifications** screen (SKU Summary tab)
and it builds a plan of what's arriving and what needs room.

- **Scan a delivery**: pick up to 12 photos, several at once or one at a time with *Add more photos* (scroll and
  shoot until every row is covered; overlap is fine). A photo picked twice is dropped, and a row that appears in
  more than one photo is counted once. Claude reads them together and shows what it found before anything changes.
- **Add to the current list**: a later scan can be merged in instead of replacing. SKUs already on the list aren't
  added twice and keep their ticks; if the two reads disagree on a count the newest numbers are used and the row is
  marked *Check count*.
- **The plan**: units arriving, already in store and total after; the five styles that need the most room;
  department filters; one card per SKU with a *Room made* tick.
- **Weeks**: every week (Sunday to Saturday) keeps its own list and ticks. The bar under the buttons shows the
  week on screen; the arrows and the menu move between weeks, and a scan or pasted list goes into the week showing.
  Opening the app in a new calendar week starts on that week.
- **Clear list**: empties the week on screen (after asking) so you can start it over. Other weeks and your own
  photos stay; pictures the app fetched for shoes on no other week are dropped, since they can be fetched again.
- **Flags**: *New, needs a spot* (none in store now) and *Check count* (a number the scan couldn't read).
- **Find shoe photos**: the app asks Rack Room Shoes' own picture server for each SKU
  (`assets.rackroomshoes.com/image/upload/.../US_01_<SKU>_01`) and saves the picture, linked to that shoe's page on
  rackroomshoes.com. No Claude key and no search are needed, and the match is exact because it is by SKU. Only
  shoes the site has no picture for fall back to Claude's web search (needs your key); those are marked *AI* with a
  link to the page they came from, since a look-alike is possible.
- **Your own photos**: tap a drawing to add a photo; *See photos* opens an image search.
- **Paste a list** (button on the main screen) instead of scanning: paste text, read the clipboard, or open a
  text file. One shoe per line: `Dept | SKU | Brand | Style | Pattern | Color | Type | arriving | in store`.
  On Android a list can also be shared to the app, or a `.txt` file opened with it.

## AI

Photos are read with **your own Claude API key** (Settings; get one at console.anthropic.com). The app calls the
Claude Messages API directly from the phone through the official SDK (`vendor/anthropic-sdk.js`), streamed, with
adaptive thinking; the fallback photo search adds the web search tool, five shoes per request. Default model `claude-opus-5-5`; Sonnet and Haiku can be chosen for cheaper scans. The key, the
list, the ticks and the photos are stored on the phone only; the key is sent only to Anthropic.

## Install

- **Android**: install `DeliveryRoomPlan.apk` from the repo root (allow installs from your browser/files app).
- **Any browser**: serve this folder (`python3 -m http.server`) and open it; it can be added to the home screen.

## Build

`bash android/build_apk.sh` writes `../DeliveryRoomPlan.apk`. Needs Java 17+ and network access for the build tools.

Files: `index.html` (page and styles), `app.js` (everything else), `android/` (a thin WebView shell).
