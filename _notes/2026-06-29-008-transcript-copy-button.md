# 2026-06-29 — 008 — Transcript panel "Copy text" button

## What
Added a **⧉ Copy text** button to the transcript reader panel header (the popup
that opens when you click a transcript row) so the whole transcript can be grabbed
without hand-selecting.

## How
- `app.html`: button in `.panel-head` (next to ✕) + a `copyPanel(btn)` function
  using the Clipboard API on `#p-body` text, with a select-the-text (range)
  fallback if clipboard is blocked. Shows "Copied ✓" for 1.4s.

## Deploy
- Commit `57cc52d` on `main`, pushed. Mini: `ssh mini "cd ~/projects/ait && git pull"`
  (server reads app.html per-request, no restart). Verified live on ait.jambles.com.

## Context
Earlier this session (note 007) fixed the top-right search jumping to Tools. ait
serves from the mini at `~/projects/ait` (launchd, :3333) → ait.jambles.com.
