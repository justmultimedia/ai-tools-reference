#!/bin/bash
#
# What the dashboard needs to know about the archive, beyond "the port answers".
#
# ait returned 200 throughout, so it looked healthy while Eoin could not find
# his latest posts. What actually matters is whether new entries are still
# arriving, and whether any were rejected.
#
# One line per check:  name|ok|stale|fail|detail
set -u
cd "$(dirname "$0")/.." || exit 0

TOOLS=data/tools.json
if [ ! -f "$TOOLS" ]; then
  echo "archive|fail|data/tools.json missing"
  exit 0
fi

AGE_H=$(( ( $(date +%s) - $(stat -f %m "$TOOLS") ) / 3600 ))
COUNT=$(python3 -c "import json;print(len(json.load(open('$TOOLS'))))" 2>/dev/null || echo 0)

# Nothing new for a fortnight is worth a look, but not an alarm: Eoin archives
# in bursts and a quiet week is normal, not a fault.
STATUS=ok
[ "$AGE_H" -gt 336 ] && STATUS=stale
echo "archive|$STATUS|${COUNT} entries, newest ${AGE_H}h ago"

# Posts that could not be fetched at all. These never reach the site and there
# is nothing on the page to reveal that they are missing.
FAILED=failed-ingests.txt
if [ -f "$FAILED" ]; then
  N=$(grep -c . "$FAILED" 2>/dev/null || echo 0)
  [ "${N:-0}" -gt 0 ] && echo "failed-ingests|fail|${N} post(s) never archived - see failed-ingests.txt" \
                      || echo "failed-ingests|ok|none"
fi
