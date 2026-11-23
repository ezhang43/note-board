## Clean up keyboard shortcuts and undo routing (2026-11-23)

- Merged the duplicated checklist keyboard shortcut code for board checklists and the Checklist panel into one shared helper, keeping all existing keyboard behavior unchanged.
- Extracted the undo and redo router (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`) into a clear helper covering the open board, Checklist, Completed, Journal, Habits, and Google Calendar panels.
- Added unit tests covering every undo routing branch and shared checklist shortcut path.
