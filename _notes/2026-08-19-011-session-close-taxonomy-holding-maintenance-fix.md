# 2026-08-19 — 011 — Session close: taxonomy holding, maintenance trigger fixed

Closing note for the session that ran 4–19 Aug. Detail lives in notes 009 and
010; this records what has happened *since*, and what the next session should
pick up.

## The taxonomy has held
~44 links have been ingested by the bot since the migration. Current state:

- **202 entries, 0 outside the taxonomy, 0 coercions** (`category_suggested`
  is empty on every entry — the model has not once tried to invent a category).
- Still exactly 20 categories. No drift.
- **Non-AI content is now the majority: 104 of 202.** The "I save more than AI
  stuff" framing was correct, and the flat 20-value taxonomy is carrying it.

`node normalize-categories.mjs` reports clean. That is the check to run first if
categories ever look wrong again.

## Fixed this session: the weekly maintenance had never run
Note 009 set up `com.eoin.weekly-maintenance` on `StartCalendarInterval`
(Mondays 07:30). Two Mondays passed and `launchctl print` showed **`runs = 0`** —
it never fired once. The mini does not sleep (`pmset sleep 0`), so that was not
the cause; a calendar-triggered *GUI-domain* agent is unreliable on a machine
that is only ever reached over SSH.

- Verified the job itself was sound by forcing it: `launchctl kickstart -k` →
  `runs = 1`, exit 0, and it upgraded ffmpeg 8.1.2_1 → 9.0.1.
- **Switched the trigger to `StartInterval` (604800s / 7 days)**, which is not
  tied to a GUI session and which launchd catches up after downtime. Re-bootstrapped
  and confirmed `run interval = 604800 seconds`.

Lesson worth keeping: *loaded* is not *running*. Check `runs =` on any launchd
job before believing it is automated.

## Mini automation is now version-controlled
The maintenance script and plist only existed on the mini, so they would have
died with it. Copied into **`ops/`** with a README mapping each file to its path
on the mini. Editing them in the repo does **not** update the mini — copy across
and re-bootstrap.

## Done while the session ran (elsewhere)
Another session fixed a **path traversal that served `.env` to the public
internet** (`8dd5d22`, written up in `2026-08-18-001-path-traversal-fix.md`).
Unrelated to this work, but it means `.env` was exposed — assume the keys in it
were public and rotate `ANTHROPIC_API_KEY` / `TWELVELABS_API_KEY` if that has not
already been done.

## Open for next session
1. **Stale enums** — `mcp-server.mjs:40`, `query.mjs`, `docs/index.html` and
   `CLAUDE.md` still hardcode the original 9–10 value enum. They should read
   `data/categories.json`, which is the single source of truth. `docs/index.html`
   is a second, older UI on GitHub Pages and is category-driven, so it benefits
   most.
2. **3 duplicate OpenClaw entries** — never deduped.
3. **Non-tool entries** — many entries are video *topics*, not tools, and would
   fail the ingest evaluation gate in CLAUDE.md. No decision taken on purging;
   this is Eoin's call, not a cleanup to do unilaterally.
4. **Unsupervised services** — both the Telegram listener and the ait web server
   run manually-started and orphaned to launchd (the listener's own plist sits in
   `~/Library/LaunchAgents/disabled/`, which looks deliberate). Nothing restarts
   either if it dies. The listener also logs to `/private/tmp`, which macOS
   purges, so bot history is not durable.
5. **`failed-ingests.txt`** holds 1 genuinely private Instagram post. Replay the
   queue any time with `ait retryfailed` in Telegram.
6. **Note numbering** — `2026-08-18-001-path-traversal-fix.md` restarted the NNN
   counter instead of continuing (should have been 011). This note takes 011.

## Standing gotcha
The bot ingests continuously, so any long job touching `data/tools.json` **will**
hit a merge conflict. Resolve by taking the remote (the bot's new entries) and
re-running `normalize-categories.mjs` — never by keeping the local copy, which
silently drops whatever was ingested meanwhile.
