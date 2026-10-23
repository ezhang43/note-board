## Tidy-up in the saving, sync and connector code (2026-10-23)

- The Claude connector's "permission denied" message no longer mentions an invite list (there isn't one: any Google account can sign in). It now asks whether this is the Google account that has these boards; a refused save also says nothing was changed.
- Small wording fixes in the connector's instructions (`mcp/README.md`): "authorized", this project keeps Claude Code out of the sign-in folder on Windows and Mac alike (with the setting to add elsewhere for both), and two files it didn't list.
- Removed a store function only tests used (`replaceBoard`); those four tests now go through the path the app really takes when the online copy arrives. Removed names that were shared between files but only used inside their own, and a stale comment about the Hand tool.
- Nothing changes in how the app works or saves.
