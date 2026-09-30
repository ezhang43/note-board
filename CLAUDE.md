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
- `src/store/` — the single board state object, the change function, saving and loading.
- `src/components/` — React components. They display state and call store actions; no geometry or rules logic inside them.
- `e2e/` — Playwright tests of real flows in a browser.

## Build rules

1. **One source of truth.** All board data (name, cards, columns, items, positions, sizes, colours, snap setting) lives in one state object. Undo, copy-paste and saving all work on that object. View state (pan, zoom, tool, selection, open menus) is kept separate and is not undoable.
2. **Small steps.** Build one step of the spec's build order at a time. Do not start the next step until the owner says OK.
3. **Tests pass first.** `npm test` and `npm run test:e2e` both pass before a step is reported done. Logic that the spec names (overlap, snapping, checklist moves, undo) always gets unit tests.
4. **No surprises.** Nothing that isn't in `SPEC.md`. If the spec is unclear or silent, ask instead of guessing; record the answer under "Decisions" below.
5. **Changelog.** Add a short, plain-English entry to `CHANGELOG.md` for every step.
6. **Look.** Use the colours, sizes and states in the spec's "Look and feel" section, defined once as CSS variables. No focus rectangles on text fields; buttons keep a keyboard focus ring. Cursor stays the normal arrow on the canvas and blocks.
7. **Keyboard.** Block shortcuts don't fire while typing in a text field; undo/redo always do.

## Commands

- `npm install` then `npx playwright install chromium` (once)
- `npm run dev` — run the app at http://localhost:5173
- `npm test` — unit tests
- `npm run test:e2e` — browser tests
- `npm run typecheck` / `npm run build`

## Decisions

- 2026-10-01: Stack as above (spec default, no alternative). localStorage over IndexedDB: the board is small and synchronous saving is simpler and easier to test.
- 2026-10-01: Clicking the zoom percentage or Ctrl+0 resets to 100% around the centre of the screen (not back to the board's top-left like the prototype).
- 2026-10-01: Toolbar buttons for later steps are shown from step 1 but do nothing until their step (Undo/Redo/Colour faded).
- 2026-10-01 (step 2): New loose cards and new columns appear at the free spot nearest the middle of the screen.
- 2026-10-01 (step 2): A card drops into a column when the pointer is over the column (or up to 60px below it), as in the prototype.
- 2026-10-01 (step 2): Text on cards is always black (#1F1D1A) whatever the card colour, including done items, the link address and the "Open …" button. The palette's Text colours are not used for card text.
- 2026-10-01: Ctrl+= / Ctrl+− / Ctrl+0 also work while typing, so the browser never zooms the whole page instead. Pan and zoom are remembered between visits; the tool always starts as Hand.
