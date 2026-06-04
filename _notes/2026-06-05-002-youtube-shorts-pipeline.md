# 2026-06-05-002 — YouTube Shorts Automation Pipeline

## Date
2026-06-05

## What was done
- Built automated pipeline to ingest YouTube Shorts into tools.json
- Created: package.json, .gitignore, ingest.mjs, .env.example
- Installed @anthropic-ai/sdk

## Pipeline architecture
yt-dlp (metadata + captions) → TwelveLabs (video analysis) → Claude API (structured extraction) → tools.json

1. `node ingest.mjs <youtube-url>` — full pipeline (TwelveLabs video analysis)
2. `node ingest.mjs <youtube-url> --fast` — skip video upload, use captions only

## TwelveLabs integration
- API key already set in environment (TWELVELABS_API_KEY)
- Creates/reuses index "ai-tools-shorts" with pegasus1.2 model
- Uploads video → polls until ready → generates analysis with custom prompt

## Claude API integration
- Requires ANTHROPIC_API_KEY (not yet set in environment)
- Uses claude-sonnet-4-6 for structured JSON extraction
- Extracts: id, name, category, type, description, install, works_with, use_cases, tags, link, status, notes

## Environment variables needed
- ANTHROPIC_API_KEY — get from console.anthropic.com
- TWELVELABS_API_KEY — already set

## Decisions made
- Default includes TwelveLabs video analysis (most accurate for visual demos)
- --fast flag for quick runs using captions only
- Interactive confirm before saving (y/e/n)
- source field added to tools.json entries (YouTube URL for traceability)
- Duplicate ID check before saving

## What comes next
- User needs to set ANTHROPIC_API_KEY
- Test pipeline with a real YouTube Short
- Optionally add RSS channel monitoring for fully automated (zero-touch) capture
