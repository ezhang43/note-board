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
8. **Spec stays current.** Whenever the owner asks for a new feature or change, or a decision is recorded below, update `SPEC.md` in the same commit so it always describes the app as built. No need to ask first.

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
- 2026-10-01 (step 3): Resize limits follow the prototype: cards 200–640 wide, columns 240–640 wide, heights 100–700. When clearing overlaps, the block that just moved/grew/was resized stays put, then columns, then loose cards move out of the way.
- 2026-10-01 (step 4): Pasted blocks keep their spot and whatever they would cover moves (spec wording). The prototype did the opposite (the pasted copy moved away); flip by making pasted ids non-anchors in `placeCopies`.
- 2026-10-01 (step 4): A card copied from inside a column is pasted back into that column, right below the original (as in the prototype). Ctrl+D duplicates without replacing what Ctrl+C copied.
- 2026-10-01 (step 4): Several selected blocks dragged together don't drop into columns and show no landing outline; after the drop, anything they cover moves.
- 2026-10-01 (step 4): Delete with several columns selected asks "Delete N columns?" on the first selected column.
- 2026-10-01 (step 4): Automatic overlap clean-up is part of the change that caused it, not a separate undo step. Undo covers board data only (not pan, zoom, tool or selection).
- 2026-10-01 (step 5): Behaviour follows the prototype where the spec is silent: Enter adds the new item after the current one's sub-items; a top-level item only nests (Tab) under an item in the same section (open or completed); nesting by drag puts items first under the target.
- 2026-10-01 (step 5): Dropping dragged items back onto themselves does nothing (the prototype appended them to the end of their list). An item drag starts after a 5px nudge, like block drags.
- 2026-10-01 (step 5): A new list made by dropping items on the board keeps its spot; anything under it moves out of the way. Whether "Completed" is open is saved per list.
- 2026-10-01 (owner request, beyond the spec): Add Note / To-do list / Link can be dragged from the toolbar onto the board, and so can New column. The new block appears at the nearest free spot to the pointer; a new card over a column goes into it (a new column never does).
- 2026-10-01 (owner request, changes the spec): The trash can shows on hover for every checklist item, not only completed ones.
- 2026-10-01 (owner rule, beyond the spec): Deleting a blank checklist item (trash, Backspace, Delete) keeps its sub-items when any of them has text: they move up one level into its place. Otherwise, and for items with text, everything under the item is deleted. Cut (Ctrl+X) always removes sub-items, since they were copied with the parent. Backspace therefore now works in a blank item with sub-items.
- 2026-10-01 (owner request, beyond the spec): Up / Down arrows move between checklist items in the same list (Up → end of the item above, Down → start of the item below), only from an item's top / bottom line so multi-line items still move line by line. Shift+arrows keep selecting text. Hidden completed items are skipped.
- 2026-10-01 (owner request, beyond the spec): "Scrolling" between cards was taken to mean the arrow keys. Up / Down move through all of a card's text fields and, inside a column, on into the next card (selecting it); collapsed cards are skipped; loose cards don't continue to other cards. Alt + arrows (changed from Ctrl + arrows at the owner's request, so Ctrl + arrows keep moving word by word in text) jump to the nearest card in that direction by on-screen position, select it, focus its first field (cursor at the end) and pan it into view. With nothing selected they start from the card nearest the middle of the screen. Alt + arrows are always used by the board, so Alt + ← / → never trigger the browser's Back / Forward.
- 2026-10-01 (owner request: snapping felt rigid): Snapping is applied where a block lands, not while it moves. During a drag the block follows the pointer exactly and the landing outline shows the snapped, free spot; during a resize the drawn size follows the pointer (`liveW`/`liveH`) and the label shows the snapped size; size matches still click in live. Loose blocks and columns glide (160ms) to new positions and sizes, except while following the pointer; no gliding with prefers-reduced-motion. Browser tests run with reduced motion, apart from `e2e/extras-smooth.spec.ts`.
- 2026-10-01 (owner request, changes the spec): The dragged block takes priority. Instead of landing at the nearest free spot (spec), it lands on the grid spot under the pointer and the blocks in its way move to the nearest free spot; the move is previewed live (`Drag.bumped`) and the drop commits exactly that preview (`dropResult` in the store). Exception: a single dragged card never pushes columns (they are anchored), so dragging a card towards a column still drops it in; over a column without dropping in, the card takes the nearest free spot. Group drags and column drags push everything. New blocks from the toolbar still go to the nearest free spot.
- 2026-10-01: Owner approved committing each step on branch `build/v1` and continuing through step 5 without pausing for manual checks.
- 2026-10-01: Ctrl+= / Ctrl+− / Ctrl+0 also work while typing, so the browser never zooms the whole page instead. Pan and zoom are remembered between visits; the tool always starts as Hand.
- 2026-10-01 (owner request): Repo made public and published on GitHub Pages (https://ezhang43.github.io/note-board/) by `.github/workflows/deploy.yml` on every push to `build/v1` (unit tests must pass). Vite's `base` is `/note-board/` for builds only. When work moves to `main`, change the workflow branch and the `github-pages` environment's allowed branches.
- 2026-10-01 (owner request, beyond the spec): The published site syncs the board through Firebase (project `note-board-a672a`): Google sign-in, one Firestore document `boards/{uid}` holding the same JSON as localStorage. Only `ezhang43@gmail.com` may read/write (`firestore.rules`, pasted into the Firebase console by the owner; not deployed from here). Signed out, the site shows only a sign-in screen. First sign-in: the online board wins; if there is none, this device's board is uploaded. Afterwards the most recent change wins; a change from another device resets undo and waits for any drag to finish (`src/store/sync.ts`). Sync is on only when `VITE_SYNC=on` (`.env.production`), so dev and tests stay local-only. A service worker (`public/sw.js`) lets the published page open offline; Firestore's offline cache keeps the data.
- 2026-10-02 (owner request, beyond the spec): Import a Milanote board exported as Markdown (Import button; parser in `src/model/milanote.ts`). Owner's answers: a heading is a to-do list title (an empty heading is an empty list), a blank line between items starts a new untitled list, cards go loose in a tidy grid (no columns can be recovered from the flat export), imports add to the current board. My calls: the "# board name" line is ignored; text under a heading is a note starting with the heading; a lone web address is a link card; layout is 4 lanes (shortest lane first), re-tidied once real heights are known; imported cards are selected and one undo removes them. The owner's real export stays out of git (public repo); tests use `e2e/fixtures/milanote-sample.md`.
- 2026-10-02 (owner request, beyond the spec): "Windows app" done as an installable web app (manifest + icons in `public/`), not Tauri/Electron: no change to sign-in or sync, updates come with the site. Icon PNGs are made from `public/icon.svg` by `node scripts/make-icons.mjs`.
