## More safety tests (2026-10-21)

- **No change to how the app works.** About 80 new automated tests that pin down behavior which already works but had no test: layout when snapping is off, moving checklist items when the target was deleted on another device, importing and "Download as text" edge cases, backup and restore, the order in which the board tidies itself, undo depth, and that every saved field survives a save and reload.
- Two browser checks: a note typed or a board renamed just before a reload is kept, and undo stays on its own board. A third checks that a backup of two boards holds both and restores both.
