# 2026-08-09 — 010 — Closed category taxonomy + category-driven web UI

## Problem
`data/tools.json` had **124 distinct categories**, 109 of them holding a single
entry, with near-duplicates ("personal finance and tax advice" / "& tax planning"
/ "& taxation"). Root cause: `ingest.mjs` asked Claude for *"one descriptive
category phrase"*, so every video invented its own.

Eoin's framing: **"I save more than AI stuff"** — the library genuinely holds
music production, DIY, gardening, personal finance, psychology, climate science.
The taxonomy had to treat non-AI content as first-class, not an "other" bucket.

## What was done

### 1. Taxonomy (20 categories, closed)
5 AI categories split by *what you do with the model* (`ai-coding`,
`ai-agents-and-automation`, `ai-prompting`, `ai-models-and-apis`,
`ai-productivity`) and 14 non-AI categories split by life domain
(`music-and-audio`, `home-and-diy`, `personal-finance`, `health-and-psychology`,
`climate-and-environment`, `science-and-space`, `parenting-and-family`,
`privacy-and-security`, …). `other` holds exactly 1 entry.

- `data/categories.json` — **single source of truth** for the enum.
- `data/category-map.json` — full old→new mapping, for audit.
- Every entry keeps `category_original`, so the migration is reversible.

### 2. Stopping re-pollution (the actual fix)
Cleaning the data alone was pointless — the next ingest would re-pollute.
`ingest.mjs` now:
- injects the closed list from `categories.json` into the prompt, and
- **validates the reply**, coercing anything off-list to `other` with a loud
  warning and preserving the model's idea in `category_suggested`.

A prompt is a request, not a guarantee; the validation is what actually holds.
Verified: `"gardening tips"` → coerced, `"AI-Coding"` → normalised, empty → `other`.

### 3. `normalize-categories.mjs` (repair pass)
Entries still drift in when a machine ingests on older code, or when a merge
lands new entries beside a migration — which is exactly how two arrived. Safe,
idempotent, dry-run by default:
```
node normalize-categories.mjs           # report
node normalize-categories.mjs --write   # apply
```

### 4. Web UI (`app.html`, `server.mjs`)
- The filter bar keyed on `content_type || category`, so **the category axis was
  invisible** — only content types were browsable. Swapped the precedence for
  both filter chips and card icons.
- `ICONS` was keyed to the long-dead original enum, so cards had silently fallen
  back to a generic wrench. Remapped to all 20 taxonomy values.
- The "Categories" stat card counted `content_type` and always read ~6. It now
  counts real categories (20), and `/api/stats` gained a `categoryFingerprint`
  so an open tab notices a re-categorisation even when no entries were added.
- Guarded a stale `activeCat`: a filter held across a refresh could point at a
  category that no longer exists and silently render an **empty grid**. Also
  restores the selected chip after a background refresh (pre-existing bug).

Verified in-browser on ait.jambles.com: 20 chips with icons, category-driven.

## Deploy note
`app.html` is read per-request, but **`server.mjs` is not** — it needs a restart.
Like the Telegram listener, the ait server runs **unsupervised** (not under
launchd); restart with:
```
ssh mini 'kill <pid>; cd ~/projects/ait && nohup node server.mjs >> server.log 2>&1 &'
```

## Facebook
Not a systemic problem. `/share/v/` link `18FWVP1zRg` failed once (rc=1) and
succeeded on retry — transient. The new **failure queue caught it**, which is the
mechanism from note 009 proving itself. 6 Facebook entries now sit correctly
across `home-and-diy`, `parenting-and-family`, `health-and-psychology`,
`music-and-audio`, `personal-finance`.

## Gotcha worth remembering
The bot ingests continuously, so long-running work on `tools.json` **will**
conflict. Resolve by taking the remote (the bot's new entries) and re-running
`normalize-categories.mjs` — never by keeping the local copy, which silently
drops whatever was ingested meanwhile. This bit once: a `--theirs` checkout
during a rebase looked correct at 160 entries while the remote already had 168.

## Still open
- Stale enums remain in `mcp-server.mjs:40`, `query.mjs`, `docs/index.html` and
  `CLAUDE.md` — they should read `data/categories.json` instead of hardcoding.
- **3 separate OpenClaw entries** — likely duplicates, worth a dedupe pass.
- Many entries are video *topics*, not tools, and would fail the ingest
  evaluation gate in CLAUDE.md. No decision taken on purging them.
- `failed-ingests.txt` holds 1 genuinely private Instagram post.
- The listener and ait server both run unsupervised; the listener logs to
  `/private/tmp`, which macOS purges. See note 009.
