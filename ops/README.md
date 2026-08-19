# Mini ops files

Copies of the automation that runs on the mini, kept here so it survives the machine.

| file | lives on mini at | purpose |
|---|---|---|
| `weekly-maintenance.sh` | `~/bin/` | upgrades yt-dlp/ffmpeg, smoke-tests the extractors against a real YouTube + Instagram URL, rotates fat logs, `brew cleanup`. Telegrams the result. |
| `com.eoin.weekly-maintenance.plist` | `~/Library/LaunchAgents/` | runs the above every 7 days (`StartInterval`). |
| `backfill-ig.sh` | `~/projects/ait/` | replays a list of URLs through `ingest.mjs`; used after an extractor outage. |

Editing these here does NOT update the mini — copy them across, then
`launchctl bootout` + `bootstrap` the plist if it changed.
