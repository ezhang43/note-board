## Unified per-board undo histories and commits (2026-11-23)

- Kept every board’s undo history — including the currently open board — in a single map in `src/store/core.ts`, removing the duplicate history-swapping logic on board switches and remote replacements.
- Collapsed the three separate board commit paths (`commit`, `commitTo`, `commitOn`) into one `commitBoard` path and the two undo paths (`stepOpen`, `undoOn`) into one `undoOn` path, keeping the app state shape, undo/redo behavior, locked-board announcements, and saved boards unchanged.
- Stopped no-op commits on non-open boards from notifying store subscribers when nothing changed.
