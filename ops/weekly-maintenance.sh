#!/bin/bash
# Weekly maintenance: keep extractor tools current, rotate logs, clean caches.
# Runs under launchd (com.eoin.weekly-maintenance). Reports to Telegram.
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH
BREW=/opt/homebrew/bin/brew
NOTIFY=~/bin/notify
LOG=~/claude-tools/maintenance.log
exec >> "$LOG" 2>&1
echo "=== maintenance $(date) ==="

report=""

# --- 1. Tools that break when upstream sites change --------------------------
# yt-dlp is the critical one: Instagram/YouTube extractors break every few weeks
# and a stale binary fails silently inside the ingest pipeline.
before=$($BREW list --versions yt-dlp 2>/dev/null | awk "{print \$2}")
$BREW update
$BREW upgrade yt-dlp ffmpeg
after=$($BREW list --versions yt-dlp 2>/dev/null | awk "{print \$2}")
if [ "$before" != "$after" ]; then
  report="${report}yt-dlp ${before} -> ${after}"$n
fi

# --- 2. Smoke-test the extractors actually work ------------------------------
# A version bump is not proof; verify one public URL per platform.
fails=""
check() {  # check <label> <url>
  if ! timeout 90 yt-dlp --skip-download --no-playlist --no-warnings -O "%(title)s" "$2" >/dev/null 2>&1; then
    fails="${fails}${1} "
  fi
}
check YouTube   "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
check Instagram "https://www.instagram.com/reel/DX7SEv7sGrI/"
[ -n "$fails" ] && report="${report}EXTRACTOR FAILING: ${fails}"$n

# --- 3. Rotate fat logs (keep last 2000 lines) -------------------------------
for f in ~/claude-tools/telegram-bot/listener.log ~/projects/ait/server.log "$LOG"; do
  [ -f "$f" ] || continue
  sz=$(du -m "$f" | cut -f1)
  if [ "$sz" -ge 5 ]; then
    tail -2000 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    report="${report}rotated $(basename "$f") (was ${sz}MB)"$n
  fi
done

# --- 4. Reclaim disk ---------------------------------------------------------
freed=$($BREW cleanup --prune=30 2>&1 | grep -o "freed [0-9.]*[A-Z]*B" | tail -1)
[ -n "$freed" ] && report="${report}brew cleanup ${freed}"$n

# --- 5. Report ---------------------------------------------------------------
if [ -n "$fails" ]; then
  $NOTIFY "Mini maintenance NEEDS ATTENTION:
${report}"
elif [ -n "$report" ]; then
  $NOTIFY "Mini weekly maintenance:
${report}"
else
  echo "nothing to report"
fi
echo "=== done $(date) ==="
