# 2026-06-28 — 007: Fix "top-right search doesn't work"

## Symptom
On ait.jambles.com, typing in the **top-right header search** (`#q`,
"Search tools, tags, descriptions…") appeared to do nothing.

## Root cause (NOT the search logic — it worked fine)
The app can open with the **Skills** section active (the Skills stat-card +
`#sec-skills` carry `class="active"` by default). The header search only
filters the **Tools** grid (`#grid` inside `#sec-tools`). So a user on the
Skills view typed into `#q`, which correctly filtered the Tools grid — but that
grid was hidden behind the Skills section, so nothing visible changed.

Confirmed with headless JS against the live DOM: with `sec-skills` active,
dispatching `input` on `#q` filtered the (hidden) grid 49→1. Search worked;
it was just invisible.

## Fix (app.html, the `#q` input listener near the bottom)
Changed `addEventListener('input', renderTools)` to also switch to the Tools
section when the user starts typing:
```js
document.getElementById('q').addEventListener('input', () => {
  const qEl = document.getElementById('q')
  if (qEl.value && !document.getElementById('sec-tools').classList.contains('active')) {
    const toolsCard = document.querySelector('.stat-card[onclick*="showSection(\'tools\'"]')
    showSection('tools', toolsCard)
  }
  renderTools()
})
```
Reuses the existing `showSection()` so the Tools stat-card + section activate
exactly as a click would.

## Verified (live, headless)
On https://ait.jambles.com after deploy: active section before = `sec-skills`;
type "browser" in `#q` → active = `sec-tools`, 5 results, first "agent-browser
(Vercel Labs)". Zero errors.

## Deploy
- Commit `bf2ca44` on `main`, pushed.
- Mini: `ssh mini "cd ~/projects/ait && git pull"` (merge — mini had local
  note-006 commit). Server reads app.html per-request with no-cache, no restart.
- Live md5 == local md5 (`3f7bb78f…`).

## Considered & reverted
Briefly tried making **Tools** the default landing section instead of Skills.
Reverted — user didn't ask for it and prefers Skills as the landing view; the
switch-on-type fix covers the actual problem from any section.

## Watch-for
The mini's `main` now has a local merge commit ahead of origin (same as note
006). Next push from laptop may need a pull/rebase on the mini first.
