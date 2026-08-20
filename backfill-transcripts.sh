#!/bin/bash
#
# Give every already-saved post the transcript it never had.
#
# Everything archived before transcription existed was catalogued from its title
# and post text alone. This walks the archive oldest-first and re-ingests each
# entry with --update, so the record gains what was actually said without losing
# the date it was originally saved.
#
# Safe to stop and re-run: entries that already have a transcript are skipped.
#
#   bash backfill-transcripts.sh          # everything still missing one
#   bash backfill-transcripts.sh 20       # just the next 20
set -u
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/Users/ai-code/.nvm/versions/node/v24.16.0/bin:$PATH"

# By default, only posts with no transcript at all.
#   --from-captions   also redo posts whose transcript came from captions
#                     rather than from the audio. Those were built from
#                     YouTube's ASR, which is worse than Whisper.
MODE=missing
if [ "${1:-}" = "--from-captions" ]; then MODE=captions; shift; fi
LIMIT="${1:-9999}"
LOG="data/maintenance/backfill-$(date +%Y%m%d-%H%M%S).log"
mkdir -p data/maintenance

# A plain file, not a bash array: macOS ships bash 3.2, which has no mapfile.
# The first run of this script died on exactly that and transcribed nothing.
QUEUE=$(mktemp)
trap 'rm -f "$QUEUE"' EXIT
MODE="$MODE" python3 -c "
import json, os
mode = os.environ['MODE']
for e in json.load(open('data/tools.json')):
    s = e.get('source') or ''
    if not s.startswith('http'): continue
    from_audio = e.get('transcribed') or e.get('transcript_source') == 'whisper large-v3'
    if from_audio: continue
    has_any = e.get('transcriptSlug') or e.get('transcribed')
    if mode == 'missing' and has_any: continue
    print(s)
" > "$QUEUE"

TOTAL=$(grep -c . "$QUEUE" || echo 0)
if [ "$MODE" = captions ]; then
  echo "$TOTAL entries are not transcribed from audio. Doing up to $LIMIT." | tee -a "$LOG"
else
  echo "$TOTAL entries have no transcript. Doing up to $LIMIT." | tee -a "$LOG"
fi

DONE=0 OK=0 FAIL=0
while IFS= read -r URL; do
  [ -z "$URL" ] && continue
  [ "$DONE" -ge "$LIMIT" ] && break
  DONE=$((DONE + 1))
  echo "[$DONE/$TOTAL] $URL" | tee -a "$LOG"
  if node --env-file=.env ingest.mjs "$URL" --fast --auto --update >> "$LOG" 2>&1; then
    OK=$((OK + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  failed - left as it was" | tee -a "$LOG"
  fi
  # The mini is also serving five sites and running Verbatim. Transcription is
  # the heaviest thing on it, so leave the machine some room between posts.
  sleep 3
done < "$QUEUE"

echo "Done: $OK updated, $FAIL failed, $((TOTAL - DONE)) still to do." | tee -a "$LOG"

if command -v notify >/dev/null 2>&1; then
  notify "Research archive: transcribed $OK of $DONE posts. $((TOTAL - DONE)) remaining."
fi
