# AI Tools Reference — Claude Context

This is Eoin's personal AI tools knowledge base. Use it to recommend tools for any project.

## Start of Every Session
1. Run `git pull` to get the latest code before doing anything
2. Check `data/tools.json` for current tool count

## How to query

```bash
# Search for tools matching keywords
node query.mjs "animation react"
node query.mjs "browser automation"
node query.mjs "design ui"

# Filter by tag or category
node query.mjs --tag claude-code
node query.mjs --category design

# List everything
node query.mjs --all
```

## How to add a new tool

### Automated (YouTube Shorts pipeline)

```bash
node ingest.mjs <youtube-url>         # full pipeline: yt-dlp + TwelveLabs + Claude API
node ingest.mjs <youtube-url> --fast  # skip TwelveLabs, use captions only
```

Requires `ANTHROPIC_API_KEY` set in environment. `TWELVELABS_API_KEY` already set on MBP.

### Manual

Edit `data/tools.json` and add an entry with this structure:

```json
{
  "id": "unique-slug",
  "name": "Tool Name",
  "category": "design|animation|browser-automation|document-conversion|networking|media|ai-video|claude-workflow|image-generation|other",
  "type": "claude-code-skill|npm-package|python-package|cli-tool|api-service|component-library|reference-database|vpn-mesh|other",
  "description": "What it does and why it's useful.",
  "install": "install command",
  "works_with": ["claude-code", "react", "next-js"],
  "use_cases": ["specific use case 1", "specific use case 2"],
  "tags": ["tag1", "tag2"],
  "link": "https://...",
  "screenshot": "screenshots/filename.jpeg",
  "status": "available|installed-globally-mbp|installed-in-jambles|available-as-mcp",
  "notes": "Any important notes",
  "added": "2026-06",
  "source": "https://youtube.com/..."
}
```

## Current tool count

158 entries. Categories have drifted from the enum above — see _notes/2026-08-04-009.

## Ingest evaluation gate — REQUIRED before saving any tool

Before saving anything from ingest or manual addition, verify:

1. **Is it real?** — Confirm the tool actually exists. Search for it, check the official site or repo. Do not save tools with unverified names (e.g. extracted from video captions that may be mishearing).
2. **Is it specific?** — One entry = one tool. Do not bundle multiple tools into a single entry.
3. **Is it an actual tool?** — Save installable tools, APIs, libraries, CLIs, and services. Skip general tips, opinions, news, or "lists of things to try."
4. **Is it safe?** — Check for red flags: unknown publisher, no GitHub/official site, requests unusual permissions, harvests data. If uncertain, do not save.

If a video mentions multiple tools, evaluate and add each one individually, skipping any that fail the above checks.

## Rule for Claude

Before starting any build task, run a quick query against this database to check if a saved tool could accelerate the work. Example: before writing animation code, run `node query.mjs animation`.
