# Changelog

## Step 2 — Cards and columns (2026-10-01)

- Add Note (butter), To-do list (mint), Link (sky) and New column from the toolbar. New blocks appear in the middle of the screen, never on top of other blocks, and are selected.
- With a column selected, a new card goes at the end of it; with a card inside a column selected, directly below that card.
- Notes grow as you type. Links have a title, an address and an "Open <domain>" button that opens a new tab. A new to-do list is titled "New list" with one blank item, cursor in it; items can be typed and ticked, and the header shows "1/3 done".
- Click a block to select it (teal outline); click empty board or press Escape to clear.
- Drag any blank part of a card or column to move it (starts after a 5px nudge). Drop a card on a column to put it there at the pointer; the column opens if collapsed. Drag a card out of a column to make it loose. Moves land on the 20px grid when snapping is on.
- Collapse arrow on cards (one-line preview) and columns (hides cards).
- Colour button recolours the selected block from 8 swatches; faded when nothing is selected. Card text stays black whatever the colour.
- Card × deletes it. Column × asks "Delete '…'?" first, then deletes the column and its cards.
- Everything is saved in the browser; boards saved by step 1 are kept.
- Not yet: blocks you drop yourself can still overlap (step 3), resizing (step 3), multi-select / Delete key / copy-paste / undo (step 4), full checklist editing (step 5).

## Step 1 — Canvas, toolbar, pan and zoom, grid, saving (2026-10-01)

- Project set up: TypeScript + React + Vite, Vitest unit tests, Playwright browser tests.
- Full toolbar in spec order. Board name is editable and its box fits the text.
- Hand / Select tool toggle (buttons, H and V keys). Select's rectangle comes in step 4.
- Endless dotted 20px grid. Dots fade when Snap to grid is off (block realignment comes in step 3).
- Pan: drag empty space with Hand, or scroll / swipe with either tool.
- Zoom 30–250%: Ctrl+scroll or pinch at the cursor, Ctrl+= / Ctrl+− / Ctrl+0, and the − · % · + control. Reset keeps the middle of the screen in place.
- Board name and snap setting save instantly; pan and zoom save a moment after you stop. Damaged saved data starts a fresh board.
- Not working yet, by design: Undo, Redo and Colour (shown faded), and the Add buttons (step 2).
