# 2026-06-26 — 006: Fix unclickable list rows (apostrophe in onclick)

## Symptom
On ait.jambles.com the top banner (stat cards) clicked fine, but the list rows
underneath did nothing — clicking a transcript/tool/skill row had no effect.

## Root cause — inline-onclick escaping bug (NOT layout/overlay)
Rows are built with interpolated inline handlers, e.g.:
`onclick="openT(null,'${t.slug}','${x(t.title)}')"`
The escape helper `x()` (textContent→innerHTML) escapes `& < >` but **not apostrophes
or quotes**. So a title containing `'` broke the generated JS:
- First transcript was literally **"Claude Grades Itself Until It's Perfect"**.
- Produced `openT(null,'slug','Claude Grades Itself Until It's Perfect')` — the `'` in
  "It's" closes the JS string early → `SyntaxError: missing ) after argument list` →
  the handler silently fails → row "doesn't click".
- The **banner kept working** because `showSection('transcripts',this)` has no user data
  interpolated, so it never breaks. Any item with `'` or `"` in its name was dead.

Diagnosis was done with headless Playwright against the live site (not guesswork):
clicking the row produced a `pageerror` and the overlay never opened; `node --check` on
the *static* script passed, proving the error was in *generated* code.

## Fix
Added a dedicated escaper next to `x()`:
```js
function jsq(s){ return String(s==null?'':s)
  .replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/\r?\n/g,'\\n') }
```
Safe for a single-quoted JS string inside a double-quoted HTML attribute. Applied to
**every** interpolated onclick: transcripts row, tool `cardHTML` (toggle + view-transcript
link), tool/skill copy buttons, category filter chips, and screenshots (also switched
screenshot src/onclick to `encodeURIComponent`). Replaced the old ad-hoc
`.replace(/'/g,"\\'")` one-offs.

## Verified (live, headless)
Clicking "…It's Perfect" now opens the panel: `overlay none -> grid`,
`title="Claude Grades Itself Until It's Perfect"`, zero JS errors. Tool cards expand.

## Deploy
- Commit `3ccd1d0` on `main`, pushed (had to stash an unrelated CLAUDE.md edit + rebase
  over a remote ait push first).
- Deployed to mini: `cd ~/projects/ait && git pull` (fast-forward). Server reads app.html
  per-request with no-cache headers, so no restart needed; mini md5 == local md5.

## Next / watch-for
- Same class of bug will reappear if any NEW inline `onclick` interpolates user data
  without `jsq()`. Better long-term: switch to event delegation + `data-` attributes so no
  user text is ever placed in JS source. Not done — current fix is consistent with the
  existing inline-handler style.
- User should hard-refresh once; no-cache headers should make that unnecessary going forward.
