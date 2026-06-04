# AI Tools Reference — Claude Context

This is Eoin's personal AI tools knowledge base. Use it to recommend tools for any project.

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

13 tools across categories: design, animation, browser-automation, document-conversion, networking, media, ai-video, claude-workflow, image-generation

## Rule for Claude

Before starting any build task, run a quick query against this database to check if a saved tool could accelerate the work. Example: before writing animation code, run `node query.mjs animation`.
