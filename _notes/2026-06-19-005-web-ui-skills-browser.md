# 2026-06-19 — Web UI, Skills Browser, Auto-Refresh

## What was done

### Web UI (server.mjs + app.html)
- Complete redesign: dark dashboard with stat cards in header (Tools / Transcripts / Screenshots / Categories / Live Skills)
- Clicking a stat card switches to that section — Skills is now the default landing view
- **Fixed root bug**: `Promise.all` was crashing silently because `/api/screenshots` returned empty. Changed to independent fetches with `.catch(()=>[])` so one failure can't break the page
- Added **auto-refresh every 8 seconds**: polls `/api/stats`, re-fetches and re-renders if counts changed, shows a toast notification
- Fixed **Copy buttons**: `navigator.clipboard` is blocked on HTTP (non-localhost). Added `fallbackCopy()` using `document.execCommand('copy')` via hidden textarea — works on plain HTTP

### Skills Browser (live from skills.sh)
- New section in the UI: fetches top 100 skills from skills.sh registry on load
- Server proxies `https://skills.sh/api/search?q=<term>` to avoid CORS; 10-minute cache
- Default seeds from 6 queries (design, claude, browser, image, video, code), merged and sorted by installs
- **Rank numbers** with colour coding: gold #1, teal top 3, purple top 10, grey rest
- **Descriptions**: server fetches `SKILL.md` from GitHub for each skill, parses YAML frontmatter `description:` field; 24h cache. First load takes ~10-15s, then instant
- Live search box filters via the same API proxy
- Install command shown with working Copy button
- Link to skills.sh page for each skill

### Screenshot API fix
- `/api/screenshots` now checks both `screenshots/` and `data/screenshots/` directories
- Returns `[]` (not empty body) if neither exists — was crashing the Promise.all on load

### launchd plist
- `com.eoin.ait-server.plist` written and installed at `~/Library/LaunchAgents/` on Mac mini
- Server will auto-start on next Mac mini reboot (can't load via SSH — needs GUI session)

## Skills API discovered
- Endpoint: `https://skills.sh/api/search?q=<term>&limit=50`
- Returns: `{id, name, installs, source, skillId}`
- SKILL.md pattern: `https://raw.githubusercontent.com/{owner}/{repo}/main/skills/{skillId}/SKILL.md`
- No public "top skills" endpoint — seed from multiple queries and merge by installs

## What comes next
- Skills sync between MacBook and Mac mini (see below)
- Test ait screenshot pipeline end-to-end (photo was received, tool added, but Claude response was confusing)
- `code go live` Telegram command (staging → main for mc project)
- Jambles dashboard
