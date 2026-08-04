# 2026-08-04 — 009 — Instagram ingest failures + mini auto-maintenance

## Problem
Instagram links posted to the Telegram bot never appeared on ait.jambles.com.

## Diagnosis
Telegram was **not** at fault. The listener extracted the URL and launched the
ingest correctly every time — `listener.log` showed `ait ingest: <ig-url>` followed
by `ait: subprocess done rc=1` for every Instagram link, while YouTube links
returned `rc=0`. The failure was inside `ingest.mjs` → `yt-dlp`.

Two separate causes:

1. **Stale yt-dlp.** Installed 2026.06.09 vs current 2026.07.04. Instagram had
   changed its API; yt-dlp returned
   `Instagram sent an empty media response` / `No csrf token`. Upgrading fixed it.
2. **Photo carousels.** Instagram `/p/` posts with `img_index` have no video
   track, so yt-dlp exits non-zero with `No video formats found!` on every slide
   — even though it has *already written* the `.info.json` containing the post
   description, which is all the ingest actually needs.

## Fixes
- `brew upgrade yt-dlp` (2026.06.09 → 2026.07.04) and `ffmpeg` (8.1.1 → 8.1.2_1).
- `ingest.mjs` `fetchMetadata()`: added `--ignore-errors` and wrapped `execSync`
  so a non-zero exit is only fatal when **no** `.info.json` was produced.
  Commit `ec3645c`.
- Backfilled every previously failed link via `backfill-ig.sh`:
  **45 of 46 recovered** (commits `db21521`, `9f0b3f4`).
  1 genuinely unavailable (`/p/Dah1bsLkscz/` — needs a logged-in session);
  it sits in the retry queue.
- Result: **158 entries, 51 from Instagram** (was 1). Verified live on
  ait.jambles.com `/api/tools`.

## Preventing recurrence (the real fix)
Three layers, all on the mini:

1. **`~/bin/weekly-maintenance.sh`** + `com.eoin.weekly-maintenance.plist`
   (launchd, Mondays 07:30). It upgrades `yt-dlp`/`ffmpeg`, then **smoke-tests
   one public YouTube and one public Instagram URL** — a version bump alone is
   not proof the extractor works. Rotates fat logs to the last 2000 lines and
   runs `brew cleanup --prune=30`. Reports via Telegram, and shouts
   `NEEDS ATTENTION` if a smoke test fails.
2. **Self-healing retry** in `listener.py`: a new `STALE_EXTRACTOR` regex matches
   the "downloader is out of date" signatures. On a match the bot runs
   `brew upgrade yt-dlp` and retries the ingest once, automatically.
3. **Failure queue** — failures previously scrolled past in a generic message.
   They now append to `failed-ingests.txt`, and the reply is an explicit
   `INGEST FAILED`. Send `ait retryfailed` in Telegram to replay the whole queue.

Backup of the pre-patch listener: `listener.py.bak-20260804`.

## Also found (not fixed)
- **Category sprawl.** `data/tools.json` now has ~85 freeform categories
  (`gardening tips`, `music production history`, `personal finance & taxation`
  vs `personal finance & tax planning`) instead of the fixed enum in CLAUDE.md.
  Auto-ingest invents a new one per video.
- Many entries are video *topics*, not tools — they would fail the "Ingest
  evaluation gate" now in CLAUDE.md. That gate is still uncommitted locally.
- `CLAUDE.md` still says "13 tools" under *Current tool count*.
- `listener.log` showed a long run of `HTTP Error 409: Conflict` — two listeners
  polling `getUpdates` at once. Only one runs now, but nothing prevents a repeat.

## Next
- Decide on category cleanup: map the ~85 freeform values back to the enum, and
  purge non-tool entries.
- Commit the CLAUDE.md ingest gate + notes 004/007/008 (still untracked).
