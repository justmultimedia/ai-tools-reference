# 2026-06-19-004 — AI Honeycove Ingest & Pipeline Setup

## Date
2026-06-19

## What was done
- Set up ANTHROPIC_API_KEY for the first time — pipeline now fully operational
- Ran ingest pipeline on AI Honeycove YouTube Shorts channel (@ai.honeycove)
- Added 3 verified tools from the channel (Clerk, AirLLM, OpenClaw)
- Removed Okara at Eoin's request
- Fixed JSON syntax error (trailing comma left from earlier deletion)
- Added ingest evaluation gate to CLAUDE.md

## Tools added (19 total)
- **Clerk** — drop-in authentication for web apps (clerk.com)
- **AirLLM** — run 70B LLMs on 4GB GPU via layer-streaming (pip install airllm)
- **OpenClaw** — always-on Claude agent with WhatsApp control, 68K GitHub stars (openclaw.ai)

## Tools removed
- Okara (AI CMO marketing platform) — removed at Eoin's request

## Rules established
New evaluation gate added to CLAUDE.md — before saving any tool:
1. Must be a real, verifiable tool (check official site or GitHub)
2. One entry per tool — no bundles
3. Must be an actual installable/usable tool, not news or tips
4. Basic security check — known publisher, has official site/repo

## API key setup
- New ANTHROPIC_API_KEY created specifically for MBP / AI Tools Project
- Previous mac mini key was exposed in chat — advised to rotate it
- Key must be set per-session via `! export ANTHROPIC_API_KEY=...` (does not persist across Claude Code sessions)
- TODO: add key to shell profile so it persists

## Ingest pipeline notes
- `--fast` mode (captions only, no TwelveLabs) works well for Shorts
- Full pipeline requires TwelveLabs key (already set) + ANTHROPIC_API_KEY
- Batch ingest pattern: `echo "y" | ANTHROPIC_API_KEY=... node ingest.mjs <url> --fast`
- Channel video list: `yt-dlp --flat-playlist --print "%(title)s | %(url)s" <channel_url>`

## AI Honeycove channel
- Channel: youtube.com/@ai.honeycove
- Good source for AI tools — filter for actual tools, skip robotics/physics/news
- Remaining candidates to evaluate: Find Council skill, KIMI K2.6, Nano Banana prompt library
- Full channel list pulled — ~50 Shorts, ~15 relevant to AI tools

## What comes next
- Add ANTHROPIC_API_KEY to shell profile for persistence
- Continue ingesting remaining AI Honeycove candidates
- Individually verify Google tools from the earlier Short (NotebookLM, Gemini Canvas, Stitch, etc.)
- Consider ingesting other trusted AI channels
