# Changelog

## Restructure 1: one place for the waiting tick (2026-10-02)

- Behind the scenes only. Every change now works from the board as it is at that moment, so a tick that is still animating can never be lost by a new action again.

## Tidy-up and speed (2026-10-02)

Nothing should look or work differently; this makes big boards smoother and the code simpler.

- The board is saved a moment (0.15s) after you stop changing it, instead of on every key press. It is also saved straight away when the window is hidden or closed.
- Dragging a block works out where everything goes only when it reaches a new grid spot, not on every mouse movement.
- Panning and zooming no longer redraw every card and checklist item.
- All colours in the stylesheet are now named colour settings, defined once.
- Removed unused code and merged repeated helpers (copying items, snapping, refilling an emptied list).

## Paste, import and keyboard fixes from the code review (2026-10-02)

- Pasting checklist items never makes them deeper than 6 levels: if there is no room, they go after the nearest item higher up.
- Unticking an item in the Completed card unticks the item it goes back under, so it never hides inside a ticked item.
- A card copied from a column that has since been deleted is pasted where the column was, not far away at the top-left of the board.
- Importing from Milanote keeps a # that is part of a heading ("Learn C#"), and a heading with no text becomes an empty list.
- Ctrl+Z, Ctrl+C and the other shortcuts work with a non-Latin keyboard layout (for example Russian) switched on.
- Turning Snap to grid back on never makes a card narrower than the minimum card width.

## Ticking, dragging and selecting fixes from the code review (2026-10-02)

- Ticking an item and then quickly deleting, pasting, dropping a block, pressing Backspace or pressing Clean up no longer un-ticks the item.
- A tick that is still animating no longer undoes a change from another device that arrives at the same moment.
- Pressing Delete while dragging a card or column does nothing (it used to break the drag).
- Ctrl+A, or a selection box with Ctrl held, now drops any highlighted checklist items, so Delete and Ctrl+C act on the selected blocks.

## Sync fixes from the code review (2026-10-02)

- Typing or other changes not yet sent online are no longer thrown away when another device saves at the same moment: your change is kept and sent.
- A card or column you drop no longer jumps back if another device saved while you were dragging.
- Devices no longer send each other's changes back and forth (this could undo newer typing and clear Ctrl+Z history).
- If the online board can't be read (damaged, or saved by a newer version of the app), it is left untouched and the page says the board couldn't be loaded, instead of showing an empty board and saving that over everything.
- If saving online fails (for example the board is too big), a small red note at the bottom says "Couldn't save online. Changes are on this device only." Your next change tries again, and the note disappears once it works.
- Changes are sent online the moment you minimise or switch away from the window, so closing the app right after typing no longer loses that text.

## Dark mode (2026-10-02)

- New moon button at the right end of the toolbar switches between light and dark mode.
- The first time you open the app on a device, it matches your computer's light / dark setting. After you press the button, that device remembers your choice. Each device keeps its own, and Ctrl+Z doesn't change it.
- In dark mode the board, toolbar and cards turn dark grey with light text, and each column colour becomes a deep shade of itself, so columns still look clearly different.

## Tests first (2026-10-02)

- New working rule: for every change, the tests are written first and seen to fail, then the change is built until they pass.

## Arrow keys move blocks; centred titles on collapsed cards (2026-10-02)

- With a card or column selected (or several), the arrow keys move them one grid square at a time; hold Shift to move five. A card inside a column moves up or down its column instead. Ctrl+Z undoes a quick run of presses in one go.
- While typing in a card, the arrows still move through the text. Press Escape to leave the text (the card stays selected), then use the arrows to move it.
- A collapsed loose card now shows its title in the middle of the card.

## Collapse all, and resizing collapsed blocks (2026-10-02)

- New **Collapse all** button (next to Auto-colour): collapses every card and column at once. When everything is collapsed it becomes **Expand all**. Ctrl+Z undoes it.
- Collapsed columns can now be resized too: drag the right edge. On collapsed cards and columns the right edge lights up when you hover, so the handle is easy to find.

## Colour for cards' title bands (2026-10-02)

- With a card selected, **Colour** now colours the card's title band (the card itself stays white). A note gets the colour across the strip at its top. **Default** at the bottom of the colour menu puts the usual band back (or a column back to grey).

## Easier-to-see title bands (2026-10-02)

- Inside a column, a card's title band is now a slightly deeper shade of the column's colour, so it stands out from the column instead of blending into it.

## Fixes: selecting, copying and Tab (2026-10-02)

- Copy and cut now take exactly the items you highlighted. Before, highlighting an item copied everything under it too. The copied text keeps the items' levels relative to each other. Cut leaves any sub-item you didn't highlight in the list.
- Shift+click now selects from the item you're typing in to the one you click. Before, it only extended a selection you had already made, so Tab then moved just one item.

## Copy items as text (2026-10-02)

- Copying several selected checklist items (Ctrl+C or Ctrl+X) now also copies their text, one item per line (sub-items indented), so you can paste them into an email, a document or another app.

## Titles stand out (2026-10-02)

- To-do lists and links now have a soft tinted band behind their title at the top of the card: teal when loose, the column's colour inside a column.
- Column titles are centred.

## Gentler completing (2026-10-02)

- Ticking the last open sub-item of a list item now ticks the item too, so it moves into Completed. Unticking a sub-item brings its item back.
- An item that's ticked no longer just vanishes: it eases out of the list and gently fades into the Completed section (not when your computer is set to reduce motion).
- The Completed section's header no longer shows a count.

## Tidier columns and pushing (2026-10-02)

- A column is now always exactly as tall as the cards in it, so collapsing cards inside shrinks it instead of leaving blank space. Its corner handle sets the width (and the height of an empty column).
- A collapsed card can still be made wider or narrower: drag its right edge.
- When something grows (expanding a card, typing, a column filling up), the blocks below it are pushed straight down instead of off to the side.

## Fix: Tab on selected items (2026-10-02)

- Tab on several selected items now works when the selection starts at the first item of a list: the first item stays and the others move in under it. Before, nothing happened.

## Clean up (2026-10-02)

- New **Clean up** button at the end of the toolbar: it moves every ticked item on the board (with anything under it) into a **Completed** card, grouped under today's date. The first time, it makes the Completed card in the middle of the screen.
- The Completed card can't be deleted (it has no ×, and the Delete key leaves it alone). Each item shows which list it came from.
- Untick an item in the Completed card to send it back to its list. If the list has been deleted, a new list with the same name is made next to the Completed card.
- The toolbar is a little more compact so all its buttons fit on a laptop screen.

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
