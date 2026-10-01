# Changelog

## Collapse puts things back (2026-10-02)

- When expanding a card or column pushes other blocks out of the way, collapsing it again moves them back to where they were. A block you've moved yourself in the meantime stays where you put it.

## Checklist keys (2026-10-02)

- Pressing Delete at the end of a checklist item pulls the item below up into it (like joining two lines). The cursor stays where the two were joined; the pulled-up item's sub-items move up a level.
- With several items selected, Tab moves them all in one level together and Shift+Tab moves them all out. They stay selected, so you can press Tab again.

## More colours and Auto-colour (2026-10-02)

- The colour menu now has 16 colours (new: Sand, Coral, Orchid, Periwinkle, Aqua, Sage, Lime, Slate), in two rows.
- New **Auto-colour** button next to Colour: one click gives every column its own, different colour (neighbouring columns get clearly different ones). Ctrl+Z undoes it.

## Cleaner cards (2026-10-02)

- Notes, to-do lists and links are now always white, loose or inside a column. Columns keep their colour.
- The Colour button now recolours columns only, and is faded unless a column is selected.
- To-do lists no longer show "3/6 done" in their header (a collapsed list shows just its title).
- A column's collapse arrow has moved to the top right, next to its ×.

## Import from Milanote (2026-10-02)

- New **Import** button at the end of the toolbar: pick a Milanote board exported as Markdown (.md) and its cards are added to your board. Nothing already on the board is changed.
- Each heading becomes a to-do list with that title (an empty heading gives an empty list); items keep their sub-items and ticks; a blank line between items starts a new untitled list; other text becomes a note, and a lone web address becomes a link card.
- Milanote's export has no positions or colours, so the cards come in tidy lanes at the top of the screen in default colours, all selected so you can drag them somewhere as a group. One Ctrl+Z removes the whole import.

## Install as an app (2026-10-02)

- The published board can be installed as an app from Edge or Chrome: it gets its own window (no address bar), a Note Board icon in the Start menu and taskbar, and opens offline. Sign-in and sync work exactly as on the website, and the app updates itself whenever the site does.
- The browser tab now shows the Note Board icon too.

## Spec brought up to date (2026-10-02)

- `SPEC.md` now describes the app as it is: sign-in, sync and offline use on the published site, dragging new blocks from the toolbar, keyboard navigation between cards, smoother snapping, the dragged block taking priority, and the checklist changes. Accounts and cloud sync are no longer listed as "not in version 1".
- From now on the spec is updated together with every new feature or decision.

## Hosting (2026-10-01)

- The board is published at https://ezhang43.github.io/note-board/. Every push to `build/v1` runs the unit tests, builds the site and publishes it.
- The published board now needs a Google sign-in and is saved to your account (Firebase), so the same board shows on your phone and laptop. Changes reach the other device within a second or two; if both are edited at once, the most recent save wins. Signing in is remembered on each device. Anyone else sees only the sign-in screen; another Google account gets "This Google account can't open this board". A Sign out button sits at the right of the toolbar.
- Works offline: once visited online, the page opens without internet, edits are kept on the device and uploaded when the connection returns.
- `npm run dev` and the tests still use the local-only board with no sign-in.

## Owner additions (2026-10-01)

- The block you drag now takes priority: it lands on the grid spot where you let go, and anything in the way slides aside to the nearest free spot (shown live while dragging). Blocks still never overlap. A dragged card never pushes a column (dropping a card on a column puts it inside); where it would cover one, the card lands beside it. Dragged columns and groups push everything.
- Smoother snapping: a dragged block now follows the pointer exactly (no 20px jumps), the dashed outline shows the grid spot it will land on, and on release it glides there. Resizing works the same way: the edge follows the pointer and eases to the grid size on release (the size label shows the final size; matching another block's size still clicks into place). Blocks pushed aside also glide. Gliding is off when the computer is set to reduce motion.
- Drag a new Note, To-do list or Link straight from the toolbar: press the Add button and drag onto the board. A dashed outline shows where the card will appear (never on top of another block); over a column it goes into the column at the pointer. A plain click still adds as before; letting go off the board adds nothing.
- Every checklist item now shows a trash can on hover, not just completed ones.
- Up / Down arrows move between checklist items, as if the list were one long text: Up goes to the end of the item above, Down to the start of the item below. Inside a multi-line item the arrows move line by line first. Items hidden in a collapsed Completed section are skipped.
- Up / Down arrows now move through every text field of a card (note text, list title and items, link title and address), and within a column carry on into the card above or below, selecting it. Collapsed cards are skipped.
- Alt + arrow keys jump to the nearest card in that direction (loose or in a column), select it and put the cursor in its first field, panning the board if the card is off-screen. Works while typing in a card or with a card selected. Ctrl + arrows keep moving word by word in text. Alt + ← / → never make the browser go back or forward a page.
- New column can be dragged from the toolbar too. It lands at the nearest free spot (never inside another column).
- Deleting a checklist item with no text (trash, Backspace or Delete) keeps its sub-items if any of them has text: they move up one level into its place, with their text and ticks. Items with text still delete everything under them, and Ctrl+X still cuts sub-items along with their parent.

## Step 5 — Checklists (2026-10-01)

- Enter adds a new item below at the same level; Tab nests an item under the one above (up to 6 levels); Shift+Tab moves it out a level; Backspace on an empty item deletes it (not the list's last item).
- Ticking a top-level item moves it, with its sub-items, into "Completed · N" at the bottom; the header collapses and expands the section. Ticking a sub-item only strikes it through.
- On hover each item shows a drag grip; completed items also show a trash can, which deletes the item and everything under it. An emptied list gets a blank item.
- Drag an item by its grip (it takes its sub-items): before or after another item (teal line), nested under one (drop slightly to the right; teal tint), into another list, or onto empty list space to add it at the end. Dropping on empty board (or a note, link or column) makes a new "New list" there in the source list's colour.
- Select several items by holding the mouse on one and dragging over others, or with Shift+click. Selected items are highlighted. Then Delete/Backspace removes them all, ticking one ticks them all, trash deletes them all, dragging one moves them all in order, Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste them after the selection, and Escape clears.
- Everything here can be undone.

## Step 4 — Selection, clipboard, delete, undo/redo (2026-10-01)

- Ctrl + click (or Shift + click) adds or removes a block from the selection. ⌘ works instead of Ctrl on a Mac.
- Select tool (V): drag a box on empty board; everything it touches is selected as you drag. Hold Ctrl to add to the current selection.
- Ctrl + A selects every column and loose card. Escape clears the selection and closes menus.
- Dragging a selected block moves the whole selection together. Colour recolours every selected block.
- Delete / Backspace deletes the selection; if it includes a column, the same "Delete '…'?" confirmation appears first.
- Ctrl + C then Ctrl + V pastes copies 40px further each time (a column copies with its cards, titled "… copy"). Ctrl + D duplicates.
- Ctrl + Z undoes, up to 100 steps, even while typing; a burst of typing is one step. Ctrl + Y redoes; Ctrl + Shift + Z does nothing. Undo and Redo buttons fade when there is nothing to undo or redo.
- Block shortcuts don't fire while typing in a text field (undo, redo and zoom still do).

## Step 3 — No overlap, resizing, size matching, snap realignment (2026-10-01)

- No overlap, ever: loose cards and columns always keep at least 10px apart.
  - While dragging over another block, a dashed teal outline shows the nearest free landing spot; the block lands there.
  - When a note grows as you type, a column gains cards, or a block is resized, anything it would cover moves to the nearest free spot.
  - Boards saved with overlapping blocks are tidied when they load.
- Resize loose cards from the bottom-right corner (width and minimum height; longer content still grows the card).
- Resize columns from the corner (width and minimum height) or the right-edge strip (width only). Cards inside follow the column width. Cards inside a column have no resize handle.
- Size matching: within 8px of another block's width or height, the size snaps to match; matched blocks get a dashed teal outline and a label shows e.g. "240 × 180 · same width as 2 blocks". Otherwise sizes land on the 20px grid when snapping is on.
- Turning Snap to grid back on moves every block's position and resized size to the nearest grid point.

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
