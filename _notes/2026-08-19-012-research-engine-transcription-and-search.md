# 2026-08-19 — 012 — The research engine: transcription, local cataloguing, search

## Date
2026-08-19

## What was done

**The archive can hear now.** This is the change the project has been missing
since June. Instagram and Facebook publish no caption track, and the Telegram
bot passed `--fast` on every ingest, which disabled TwelveLabs — so both routes
to understanding a video were off. Every reel had been catalogued from its title
and post text alone. That is why so many entries read *"the specific subject
matter cannot be determined without viewing the content."* Nothing had ever
listened to them.

Pipeline is now: captions if published → otherwise Whisper on the mini →
TwelveLabs only when nothing was said. Proved end to end on a real reel: 2622
characters of speech from 150 seconds of audio, in about 25 seconds.

**Cataloguing moved off the API.** Qwen 2.5 7B via Ollama, already running
locally for Verbatim, now does the structured extraction. It was one Claude API
call per link before. Free, local, nothing leaves the house. The API remains as
a fallback when the local model is unavailable or returns something unusable —
and a category outside the closed taxonomy counts as unusable, rather than being
quietly coerced.

**research.jambles.com**, password-gated, opening on a search across every
transcript. `ait.jambles.com` keeps its browsable grid and every old link still
works — one server, two front doors, chosen by hostname. Results are ranked by
mention count and carry the sentence that matched, with the term highlighted, so
relevance is judgeable without opening anything.

**A bare link now goes to the archive.** No prefix. Eoin sends a YouTube,
Instagram or Facebook link with nothing else far more often than he does
anything else. A two-letter project code still wins, so every other project is
reachable exactly as before. `res` and `research` also answer to this archive.

**Newest first, with real dates.** Cards rendered in raw array order and ingest
appends, so the top of the page was permanently the oldest entries and anything
saved today landed ~200 cards down. It looked exactly like nothing had been
archived. Every entry's save date was recovered from the commit that introduced
it — 208 of 208, none invented — and new entries carry a full `ingested_at`.

## Decisions

**Transcript first, everywhere.** The extraction prompt puts what was said above
the title and post text, because titles are marketing and post text is often
absent. Entries record how they were arrived at (`transcribed`,
`transcript_note`), so a description built from a transcript never looks like a
guess from a caption.

**The category list needed definitions, not just slugs.** A bare enum put a
video about central bank digital currencies in `ai-productivity` because it
mentioned technology. Each category now carries a one-line definition and the
prompt says to categorise by subject matter, not by any technology mentioned in
passing. It got `personal-finance` on the retry.

**Clean transcripts at read time, not by rewriting files.** Fixing the stored
files while a backfill was running against them would have raced. Same cleaning
applies on read, so old files are correct immediately.

## Things that turned out to be broken

- **Rollup captions.** YouTube auto-captions repeat the previous line with one
  more word appended, so stored transcripts said everything two or three times:
  *"People seem to think that you couldn't People seem to think that you
  couldn't People seem to think..."* Fixed in the parser and at read time.
- **HTML entities** in captions rendered as literal `&gt;&gt;` mid-sentence.
- **Transcripts did not match their entries.** The filename derives from
  whatever URL was passed at ingest — sometimes with an `?igsh=` tracking
  parameter — so posts transcribed today appeared in search with no title,
  category or date.
- **The gate hid which site was asked for.** `proxy.mjs` rewrote Host to
  localhost, so research.jambles.com served the ait page. It now forwards
  `x-forwarded-host`.
- **Entries from the local model had no `id`**, and dedupe matched on that id,
  so re-ingesting a post added a second copy. It now matches on the link — but
  only when the source really is a URL, because screenshot-ingested entries all
  carry the source `"screenshot"` and keying on that collapsed four unrelated
  entries. Caught before it was committed; nothing was lost.
- **The backfill script died on its first line.** `mapfile` does not exist in
  the mini's bash 3.2. It reported that it had started and transcribed nothing.
- **The Telegram listener was supervised by nothing**, and the copy in
  `Mac & Claude Integration` was 72 lines behind the running one. The live
  version is now the committed one, under launchd.

## What comes next
- Finish the backfill (189 posts had no transcript at the start of the day).
- Ask the archive questions rather than only searching it — the transcripts are
  now good enough to answer "what have I saved about X" through Claude.
- Telegram should reply saying which category a post was filed under. A request
  to file something under "Neurodiversity" was silently dropped, because the
  listener reads the URL and ignores the rest of the message.
- One duplicate link remains in the data from before dedupe was fixed.
