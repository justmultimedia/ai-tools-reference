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

## Context: this project is moving (recorded 19 Aug)
Eoin: **ait is being folded into the justmultimedia.com project and becoming
`research.jambles.com`, as part of a wider system.**

Consistent with that, the mini now runs a cluster of `com.jambles.*` launchd
agents that did not exist when notes 009/010 were written:

| agent | working dir |
|---|---|
| `mission-control`, `junction-proxy`, `research-proxy` | `~/projects/status` |
| `verbatim` | `~/projects/yt` |
| `control-agent`, `nightly`, `ollama`, `yt-transcript`, `yt-maintenance` | — |

Two things that follow, for whoever picks this up:

1. **ait itself is still not supervised.** Nothing under `~/Library/LaunchAgents`
   references `~/projects/ait`. Its web server and the Telegram listener both
   started at boot (18 Aug 11:29) by some other mechanism, and nothing restarts
   them if they die. That was a tolerable wart for a personal tool; it is worth
   fixing before ait becomes `research.jambles.com` and other services depend on
   it. The `com.jambles.*` agents are the pattern to copy.
2. `~/projects/status/server.mjs` shares a filename with ait's. When checking
   processes, match on **working directory**, not the command string — `ps` shows
   both as `node server.mjs` and they are easy to mistake for a duplicate.

Recent commits show ingest has moved to a **local model** ("Tell the local model
what each category means", "Entries from the local model had no id"). The closed
taxonomy in `data/categories.json` still applies — whatever drives ingest must
keep reading it, or the sprawl returns. As of this note it is holding: 208
entries, 0 outside the taxonomy.

## In-flight work at session close — NOT committed
Two pieces of unfinished work were sitting in working trees when this session
closed. Both are left **uncommitted on purpose** — they are another session's
work-in-progress and not mine to declare finished. Neither is lost; both are on
disk. Do not blow either away with a `checkout`/`reset` before reading them.

**Laptop — `server.mjs`, +97 lines, uncommitted.** A transcript search endpoint:
full-text search across the archive returning the surrounding sentence as proof,
with an in-memory index cached against the newest transcript file. Its own
comment makes the case well: *titles and captions are marketing, the transcript
is the content*. Looks close to complete; needs a read, a test and a commit.

**Mini — a transcript backfill, uncommitted.** ~110 modified and ~70 new
transcript files plus `data/tools.json`, from commits `bc056f8` ("Backfill
transcripts into posts saved before transcription existed") and `5a2f962`
("Backfill died immediately: macOS bash has no mapfile" — i.e. it needed a
second pass). No backfill process is still running. So this is a **completed run
whose output was never committed**. Review and commit it on the mini, or the next
`git pull` there will conflict against every one of those files.

Order matters: commit the mini's backfill output first (it is the bigger, more
conflict-prone tree), then the laptop's `server.mjs`.

## Data state at close
208 entries, 0 outside the taxonomy, 20 categories, 0 coercions.
`node normalize-categories.mjs` reports clean.

## Standing gotcha
The bot ingests continuously, so any long job touching `data/tools.json` **will**
hit a merge conflict. Resolve by taking the remote (the bot's new entries) and
re-running `normalize-categories.mjs` — never by keeping the local copy, which
silently drops whatever was ingested meanwhile.
