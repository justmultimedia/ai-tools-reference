#!/bin/bash
# Backfill Instagram links that failed while yt-dlp was stale.
cd ~/projects/ait
NODE=/Users/ai-code/.nvm/versions/node/v24.16.0/bin/node
export PATH=/opt/homebrew/bin:$PATH
LIST=${1:-/tmp/ig_backfill.txt}
ok=0; fail=0
: > /tmp/ig_backfill_failed.txt
while IFS= read -r url; do
  [ -z "$url" ] && continue
  echo "=== $url"
  if $NODE --env-file=.env ingest.mjs "$url" --fast --auto > /tmp/ig_one.log 2>&1; then
    if grep -q "^Added " /tmp/ig_one.log; then
      ok=$((ok+1)); grep "^Added " /tmp/ig_one.log
    else
      fail=$((fail+1)); echo "$url" >> /tmp/ig_backfill_failed.txt; tail -3 /tmp/ig_one.log
    fi
  else
    fail=$((fail+1)); echo "$url" >> /tmp/ig_backfill_failed.txt; tail -3 /tmp/ig_one.log
  fi
  sleep 6
done < "$LIST"
echo "BACKFILL DONE ok=$ok fail=$fail"
git add data/tools.json data/transcripts screenshots 2>/dev/null
git commit -m "backfill: Instagram links that failed on stale yt-dlp ($ok added)" 2>&1 | tail -2
git push 2>&1 | tail -2
