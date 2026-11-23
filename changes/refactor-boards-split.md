## Split side-panel store actions out of boards.ts (2026-11-23)

- Behind the scenes: moved the Journal, Habits, and Main checklist side-panel store actions out of `src/store/actions/boards.ts` into their own focused files (`journal.ts`, `habits.ts`, and `checklistPanel.ts`), leaving `boards.ts` focused on board creation, navigation, deletion, and version restore.
- Nothing changes in how the app works, saves, syncs, or handles undo.
