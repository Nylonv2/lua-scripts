# Count Prep

A small phone app for a shoe store's physical inventory: a checklist to get the store ready, and a counter for
Crocs Jibbitz, which are small, come in many designs and are slow to count by hand. The store's own scanners
still do the official count; this app only helps with the jobs around it.

## Prep tab

- A starter checklist in four areas (sales floor, backroom, accessories, paperwork), with a progress bar.
- Add your store's own jobs to any area, add new areas, and remove anything that doesn't apply.
- **Untick everything** resets it for the next inventory and keeps your list. **Restore the starter list** puts
  the original back.

## Jibbitz tab

- **Sections**: one per place Jibbitz are kept (each spinner, the wall pegs, backstock). Each design in a section
  has a big **−** and **+**, and you can type a number in. Typing a design that's already there (in any
  capitalisation) adds to that line instead of making a new one. Tick **Counted** when a section is finished.
- **Count with photos**: take photos (the camera opens straight away) or choose existing ones, up to 8 at a time.
  Claude counts the packages by design and shows the result for you to check: fix any name or number, then add it
  to the section. Designs it wasn't sure about get a **check** flag until you tap it. The same photo picked twice
  is used once, and Claude is told the design names already counted so its names match yours.
  For an exact count, take the packs off a peg and spread them flat, face up and not overlapping: packs hanging on
  a peg hide the ones behind them.
- **System count** (optional): the on-hand number from the store's report. The app shows how many short or over the
  count is.
- **All designs across sections** adds each design up over every section.
- **Share the count** shows the whole count as text to copy into a text, email or note. The app sends nothing itself.
- **Clear the count** empties it, keeping or removing the sections.

## Claude

Only counting from photos uses Claude, with **your own API key** (Settings; get one at console.anthropic.com).
The app calls the Claude Messages API directly from the phone through the official SDK (`vendor/anthropic-sdk.js`),
streamed, with adaptive thinking; all photos of one count go in one request. Default model `claude-opus-5-5`;
Sonnet and Haiku can be chosen in Settings. The key, checklist and counts stay on the phone; the key is sent only
to Anthropic.

## Files

- `index.html`, `app.js`: the whole app (works as a web page too; `sw.js` caches it for offline use).
- `android/`: a thin WebView shell. On Android 10 and later, **Take a photo** opens the camera and saves the photo
  in *Pictures/Count Prep* (a cancelled photo is deleted). `bash android/build_apk.sh` builds `../CountPrep.apk`.
