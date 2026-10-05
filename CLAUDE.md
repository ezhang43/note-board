# Note Board — rules for Claude Code

`SPEC.md` is the source of truth. `note-board-prototype-reference.html` shows look and behaviour only: never copy its structure or code. Where they disagree, the spec wins.

## Owner and review

The owner reads code at a beginner level and does not review it line by line. Every change must be provable by automated tests and by a short click-through the owner can do. After each step, report: what was built, how to run it, and exactly what to click to check it.

## Stack (decided)

- TypeScript (strict), React 19, Vite. npm as package manager.
- No state library. Board data is changed only by pure functions in `src/model/`; React reads it through one small store.
- Saving: `localStorage`, key `note-board:v1`, as versioned JSON. Loaded on start, written after every change (debounced slightly). Bad or missing data falls back to a fresh board rather than crashing.
- Tests: Vitest for logic (`src/**/*.test.ts`), Playwright (Chromium) for browser flows (`e2e/`).
- Font: IBM Plex Sans 400/500/600 from Google Fonts.

## Code layout

- `src/model/` — types, constants (grid 20, zoom 30–250%, palette) and pure functions: no React, no DOM. All logic tests live here.
- `src/store/` — the single board state object, the change function, saving and loading. `core.ts` holds state, saving, undo, `commit` and the settle queue; actions live in `actions/` (blocks, gestures, checklist) and get the core through a `StoreContext`; `store.ts` puts them together.
- `src/components/` — React components. They display state and call store actions; no geometry or rules logic inside them.
- `e2e/` — Playwright tests of real flows in a browser.

## Build rules

1. **One source of truth.** All board data (name, cards, columns, items, positions, sizes, colours, snap setting) lives in one state object. Undo, copy-paste and saving all work on that object. View state (pan, zoom, tool, selection, open menus) is kept separate and is not undoable.
2. **Small steps.** Build one step of the spec's build order at a time. Do not start the next step until the owner says OK.
3. **Tests pass first.** `npm test` and `npm run test:e2e` both pass before a step is reported done. Logic that the spec names (overlap, snapping, checklist moves, undo) always gets unit tests. Write the tests before the code: write the unit and browser tests for a change, run them and see them fail, then implement until they pass.
4. **No surprises.** Nothing that isn't in `SPEC.md`. If the spec is unclear or silent, ask instead of guessing; record the answer in `docs/decisions.md`. Exception (owner rule, 2026-10-04): when a question comes up while building, go ahead with the recommended option instead of asking, and list those calls in the report.
5. **Changelog.** Add a short, plain-English entry to `CHANGELOG.md` for every step.
6. **Look.** Use the colours, sizes and states in the spec's "Look and feel" section, defined once as CSS variables. No focus rectangles on text fields; buttons keep a keyboard focus ring. Cursor stays the normal arrow on the canvas and blocks, except the Hand tool's glove over empty board (owner request, 2026-10-03).
7. **Keyboard.** Block shortcuts don't fire while typing in a text field; undo/redo always do.
8. **Spec stays current.** Whenever the owner asks for a new feature or change, or a decision is recorded in `docs/decisions.md`, update `SPEC.md` in the same commit so it always describes the app as built. No need to ask first.
9. **One way onto the live branch.** Work lands on `build/v1`; the published site is built from `main`, which is moved up to `build/v1` (`git push origin build/v1:main`, a fast-forward) when the owner says "publish", or automatically for low-risk pull requests (below). Only the **main session** pushes straight to `build/v1` or `main`: the one running on the owner's Windows computer in `C:\Users\ezhan\Projects\note-board`. Every other session (a cloud session, a worktree, another computer) works on its own branch named for the job (for example `phone-layout`), never pushes to `build/v1`, and finishes by opening a pull request into `build/v1` and giving the owner its link. Pushing a branch or opening a pull request does not change the live site; merging a low-risk one into `build/v1` does, once its tests pass (auto-publish, below).
   - Every pull request into `build/v1` is tested automatically on GitHub (`.github/workflows/checks.yml`, check "All tests": typecheck, unit tests, browser tests). It can't be merged until that passes.
   - Low-risk pull requests are merged by the session that opened them, without asking: it watches the pull request, fixes it if "All tests" fails, and merges it (merge commit) once "All tests" passes. It may turn on GitHub's auto-merge instead, but GitHub often refuses that while the tests are still running, so merging itself is the usual way. GitHub won't merge anything with failing tests. If the session can't merge, say so and give the owner the link.
   - **Auto-publish:** after "All tests" passes on a push to `build/v1`, the Publish job in `checks.yml` fast-forwards `main` and starts the Pages deploy, but only when every change `main` lacks is a merged pull request into `build/v1` that isn't labelled `high-risk` and changes no saving / sync / undo / deleting file (the list is in `scripts/publish-rules.mjs`; test files don't count). A commit pushed straight to `build/v1`, or any risky pull request, holds everything after it back until the owner says "publish".
   - The session that opens a pull request touching saving, sync, undo or deleting (the `high` review level in rule 10) adds the `high-risk` label when opening it (`gh pr create --label high-risk`). Such pull requests do not get auto-merge. They wait for the owner, who asks the main session to check them: fetch it, combine it with the latest `build/v1`, run `npm run typecheck`, `npm test` and `npm run test:e2e` on the result, and report in plain words what it changes, whether it clashes with anything, and whether it is safe to merge. Merge only when the owner says so.
   - The main session fetches before it starts work and before it pushes, so it never builds on or overwrites an out-of-date copy.
10. **Code review before it goes live.** Once a change passes both test suites, run the `code-review` skill on it before pushing (or before reporting a pull request as ready). Fix what it confirms, tests first as in rule 3, and run the tests again. In the report, say what the review found and what was fixed or left alone, and why. Match the review to the change, to keep token use down: a tiny fix (a style tweak or one small behaviour) gets a light review (`low`) or none; a normal feature gets a standard one (`medium`); anything touching saving, sync, undo or deleting gets a thorough one (`high`), since bugs there can lose the owner's data. Changes to wording or documents alone skip it. Say in the report which level ran. When checking another session's pull request (rule 9), review it the same way, and report its findings instead of fixing them unless the owner says so.

## Commands

- `npm install` then `npx playwright install chromium` (once)
- `npm run dev` — run the app at http://localhost:5173
- `npm test` — unit tests
- `npm run test:e2e` — browser tests
- `npm run typecheck` / `npm run build`
- `node scripts/claude-hooks.mjs level` — does the current change touch a risky file (picks the review level)

## Claude helpers

- `/finish-step` — the end-of-step routine (rules 3, 5, 8, 9, 10, a security check for sign-in, sync, sharing, imports and links, and the report), in order. Use it to finish every step.
- `/check-pr <number>` — rule 9's check of another session's pull request. Reports; never merges.
- `spec-checker` subagent — compares a change with `SPEC.md` and `docs/decisions.md`; `/finish-step` calls it.
- Hooks in `.claude/settings.json` (code in `scripts/claude-hooks.mjs`): a reminder before editing a risky file, and a type check after editing a `.ts`/`.tsx` file.

## Decisions

Past decisions, with dates and reasons, are in `docs/decisions.md`. Read it when the spec is silent or unclear, or before changing how something already works, so settled questions are not reopened. Add new decisions to the end of that file.
