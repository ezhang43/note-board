# BusyAnts (Note Board) — Build Spec v1

As of 2026-10-02 · Owner: Eric Zhang

## Overview

BusyAnts (built as "Note Board"; the name shows in the browser tab, the installed app and the sign-in screen) is a web-based visual board for notes, to-do lists and links, in the spirit of Milanote. Version 1 is a single-user app that runs in the browser and saves its boards between visits; a person can have several boards, and boards inside boards. The published site (https://ezhang43.github.io/note-board/) also syncs every board to the signed-in Google account (any Google account), so the same boards open on every device.

The clickable prototype (`note-board-prototype-reference.html`) is the reference for look and behaviour. Where this spec and the prototype disagree, this spec wins.

- **Who it's for:** one person organising ideas, plans and tasks on a free-form canvas.
- **Version 1 goal:** everything in this spec working reliably, saved in the browser and synced to the owner's account.
- **Not in version 1:** sharing and real-time collaboration.

## Build rules for Claude Code

The owner reads code at a beginner level and will not review it line by line, so every change must be verifiable by tests and by clicking through the app.

1. **Stack:** a web app in TypeScript with React, built with Vite. Claude Code may propose an alternative once, with reasons, before writing code; the choice is then recorded in `CLAUDE.md`.
2. **Saving:** the board saves automatically to the browser (localStorage) after every change and loads on start. The published site also syncs it to Firebase (see "Sign-in, sync and offline"); running the app locally stays browser-only.
3. **One source of truth:** all board data (cards, columns, items, positions, sizes, colours) lives in one state object, so undo, copy-paste and saving work the same way for everything.
4. **Tests:** automated tests for the logic (overlap, snapping, checklist moves, undo) plus browser tests for the main flows. All tests pass before a change is accepted. Tests are written first: for each change, write its tests, see them fail, then build it.
5. **Small steps:** build one section of this spec at a time, show it working, then move on. Keep a short changelog in the repo.
6. **No surprises:** do not add features that aren't in this spec without asking first.
7. **Keep this spec current:** whenever the owner asks for a new feature or change, or a decision is made, update this spec in the same step so it always describes the app as it is.

## Board and navigation

The board is an endless canvas with a dotted 20px grid under a fixed top toolbar.

**Toolbar, left to right:** Boards button (see "Several boards") · the path to the open board, when it is inside another · board name (editable, box sized to its text; in a narrow window it shrinks first, down to 140px, ending in …, so no button is pushed off) · Hand / Select tool toggle · Undo · Redo · | · Snap to grid · Colour · Auto-colour · Collapse all · Same width · | · Add Note · Add To-do list · New column · | · File · Clean up · Dark mode (moon icon); on the published site, | · Sign out at the far right. (| = a thin divider between groups.) Add Note and To-do list are plain buttons (there is no Add Link: new cards are notes and to-do lists only; link cards already on a board, or made by a Milanote import, still work as described below); New column is the one solid amber button. Rarely used buttons (Auto-colour, Collapse all, Same width, File, Clean up) have no border until hovered. A zoom control (Fit to screen · − · percentage · +) sits bottom-right; Fit to screen (or Shift+1 outside text fields) brings every card and column into view, as large as fits, centred (zooming in up to 100%, or out as far as 30%); clicking the percentage resets to 100% around the centre of the screen. Left of it: A− / A+ (text size on cards and columns: Small, Normal, Large, Larger; the toolbar keeps its size; remembered on this device, not synced, not undoable; A− / A+ fade at the ends), and a round ? button that opens a Keyboard shortcuts panel listing every shortcut (also opened and closed by the ? key outside text fields; Escape, its ×, or a click outside closes it). Right of ?: a round coffee-cup button, "Buy me a coffee", that opens the owner's Buy Me a Coffee page (https://buymeacoffee.com/ezcookie) in a new tab; on a phone it is in the ⋯ menu.

| Action | How |
| --- | --- |
| Pan the board | Hand tool: drag empty space. Any tool: scroll or trackpad swipe |
| Zoom | Ctrl + scroll or trackpad pinch, centred on the cursor; Ctrl + = / Ctrl + − / Ctrl + 0 to reset (these also work while typing, so the browser never zooms the page instead). On a touch screen, two fingers pinch to zoom and move together to pan, anywhere on the board including over cards; a pinch cancels whatever the first finger had started (such as dragging a card). Phones use the phone layout below. Range 30%–250% |
| Rectangle select | Select tool (V): drag on empty space; anything the rectangle touches is selected live |
| Switch tools | H for Hand, V for Select |
| Snap to grid | Toggle, on by default. Moves, resizes and pastes land on 20px steps. Snapping happens where a block lands, not while it moves (see Moving). Turning it back on moves every block (position and resized sizes) to the nearest grid point |

- With the Hand tool, the cursor is an open glove over empty board and a closed glove while dragging the board. Otherwise (Select tool, and over cards and columns with either tool) it is the normal arrow. Text fields show the text cursor.
- New cards and columns never appear on top of existing blocks. From a toolbar click they appear at the free spot nearest the middle of the screen.
- Edge panning: while dragging a block, dragging checklist items, selecting items by press-and-drag, or drawing a selection box, holding the pointer within 48px of the edge of the board area keeps moving the board that way (faster nearer the edge), and the drag carries on as if the pointer had moved. A drag that starts near an edge only does this once the pointer has been away from the edges.
- Alignment guides: while dragging a card or column (or several selected ones together, which line up as one: the box around them all), when its left edge, middle or right edge (or top, middle or bottom) comes within 8px of the same line of another block on the board, it snaps onto that line and a thin amber guide shows across both blocks. A guide wins over the grid on its axis. Blocks the dragged one is on top of are left out (they are about to move aside). Not while resizing (sizes match instead).
- Add Note, Add To-do list and New column can also be dragged from the toolbar onto the board. A dashed outline shows where the block will appear (the free spot nearest the pointer); a new card dragged over a column goes into the column at the pointer (a new column never does). Letting go off the board adds nothing.
- Opening the board (desktop and phone) shows every card and column, centred on the screen. The remembered zoom is kept when everything fits at it; otherwise the board zooms out just enough, but not below 50% so text stays readable. If the board is still too big at 50%, its top-left part is shown. This also happens when the online copy first arrives on an empty screen. The tool always starts as Hand.

### Several boards

- There can be any number of boards. The first board is the **home board**, which can't be deleted. Each board has its own cards, columns, name, Snap setting and undo history: Ctrl+Z never undoes something on another board, and switching away and back keeps a board's undo history (until the page is reloaded).
- **Boards button** (a two-boards icon at the left of the toolbar, after the ant; on a phone, in the top bar) opens a menu listing every board: the home board first with the boards inside it indented under it (and theirs under them), then each board that isn't inside another. The open board is highlighted. Clicking a board opens it. Every board except home has a × that deletes it, after a confirmation.
- **Add a sub-board here** (in the menu; on a phone also + → Sub-board) makes a new, empty board inside the open one: a **board card** appears on the open board (placed like a new card: into a selected column, else at the free spot nearest the middle of the screen), selected. A board card shows the board's name ("Untitled board" until it is named), how many cards are on it, and **Open board**; double-clicking the card opens it too. It can be moved, put in a column, collapsed (showing the name), resized, copied (the copy opens the same board), and deleted like any card: deleting the card leaves the board itself in the Boards menu.
- **New board** (in the menu) makes a new, empty board on its own (not inside another) and opens it. A new board that is left empty and unnamed, and that no card opens, is dropped when another board is opened.
- Opening a board shows every card and column on it, as when the app opens. Which board is open is remembered on each device (not synced), so the app reopens there.
- **Path back up:** on a board inside another, the boards above it show before its name, smaller and greyed ("Home › Trips ›"); clicking one opens it.
- **Deleting a board** removes it and every board card that opens it, on every board; boards inside it are kept and then stand alone. Every board is saved in Version history first, so a deleted board can be brought back from there. If the deleted board is open, the board above it opens.
- Search, Ctrl+A, Clean up, Collapse all, Fit to screen and Download as text work on the open board only. Copy and paste work between boards.

### Importing from Milanote

**File** (toolbar; on a phone under ⋯) opens a menu:

- **Download backup:** every board (every card, position, size, colour and setting) in one file, named like "BusyAnts - Home - 2026-10-05.json" ("All boards" in place of the name when there are several).
- **Download as text:** the open board as readable Markdown (a board card is written as "Board: its name"): its name, each column (left to right) with its cards, then the loose cards top to bottom; to-do items as "- [ ]" / "- [x]", sub-items indented.
- **Restore from backup…:** pick a backup file; after a confirmation it replaces the board. A backup of one board, with one board here, replaces the open board: the board as it was is saved in Version history first, and Ctrl+Z brings it back. A backup of several boards (or any backup while there are several boards here) replaces every board, after asking "Replace all your boards…?": every board is saved in Version history first, and undo starts over. A backup made before there were several boards replaces the open board. A file that isn't a BusyAnts backup changes nothing and says so. The restored board is brought into view.
- **Import from Milanote…:** pick a Milanote board exported as Markdown (.md). Its cards are added to the current board; nothing already there is changed or replaced.

On an iPhone with BusyAnts on the home screen, the downloads open the Share sheet (Save to Files) instead.

- Each heading becomes a to-do list with that title; a heading with nothing under it becomes an empty list. The board name line at the top of the file is ignored.
- Checklist lines become the list's items, keeping sub-items (up to 6 levels) and ticks; ticked top-level items go into "Completed". A blank line between items starts a new list with no title.
- Other text becomes a note (paragraphs kept; bold, strike-through and escape marks removed; links shown as "text (address)"). A note that is only a web address becomes a link card, titled by a heading right above it.
- The export has no positions, sizes or colours: cards are laid out loose in up to 4 lanes 20px apart (each card at the bottom of the shortest lane, in file order), starting at the top middle of the screen, or the nearest free space (the board then pans to show them). Once drawn, the lanes are tidied to the cards' real heights.
- The imported cards are selected, so they can be dragged or deleted together. One undo removes the whole import. A file with nothing in it adds nothing.

## Blocks: cards and columns

The board holds three card types and columns that stack cards. Cards show no type label; the type is told by content. Cards are always white (loose or in a column); only columns are coloured.

| Block | Content | Colour |
| --- | --- | --- |
| Note | Free text; grows taller as you type, never scrolls | White |
| To-do list | Title plus checklist (next section) | White |
| Link | Title, URL field, "Open <domain>" button in a new tab | White |
| Column | Title (box sized to its text), card count, stacked cards | Neutral stone-grey until recoloured |

**Headers:** cards show a collapse arrow and × at the top right (no "2/5 done" count); hovering them shows what they do ("Collapse card", "Delete card (Ctrl+Z brings it back)"; columns the same). To-do lists, links and the Completed card have a tinted title band across the top (header and title): soft honey (#FFF1C2) when loose; inside a coloured column, a deeper shade of the column's colour (70% of its edge tone mixed with its background), so it stands out from the column but stays in the same colour family; inside an uncoloured (Default) column, the same soft honey as loose cards. Columns show the title and count centred, and the collapse arrow next to the × on the right. No move handles and no per-block palette icons.

**Moving**

- Drag any blank part of a card or column to move it; a drag starts after a 5px nudge so a click still just selects.
- The dragged block stays flat (no tilt) with a 2.5px amber border and soft glow.
- Dropping a card fully onto a column inserts it at the pointer position; the column opens if collapsed. Dragging a card out of a column makes it loose.
- While dragging, the block follows the pointer exactly; a dashed amber outline shows the grid spot it will land on, and on release it glides there (160ms). Blocks pushed aside also glide. No gliding when the computer is set to reduce motion.
- **The dragged block takes priority:** it lands on the grid spot under the pointer, and blocks in its way move to the nearest free spot, previewed live while dragging. A single dragged card never pushes a column: over a column it drops in, and where it would otherwise cover one it takes the nearest free spot. Dragged columns and groups push everything.
- **No overlap, ever:** loose blocks keep at least a 10px gap. When a column grows, a block is pasted or a size changes, anything it would cover moves to the nearest free spot. When a block grows (expanding, typing, a column filling up), blocks below it (their top level with or lower than its top) are pushed straight down instead, and so are blocks below those; blocks beside it still take the nearest free spot.

**Resizing**

- Loose cards: bottom-right corner handle sets width and minimum height (content taller than that still grows the card). A collapsed loose card can still be resized: a right-edge strip sets its width, and its corner handle sets width and height (down to just its header, 40px). A collapsed loose card starts as tall as a collapsed column (60px), so collapsed blocks line up; one made taller keeps its header in the middle. Its collapsed height is kept separately, so expanding it gives back its open size, and collapsing it again gives back the collapsed size.
- Columns: corner handle and right-edge strip set the width; cards inside follow it. A collapsed column keeps its right-edge strip, so its width can still be changed. On collapsed cards and columns the strip is tinted on hover. A column with cards is always exactly as tall as its cards (so collapsing cards shrinks it); only an empty column has a minimum height, which the corner handle also sets.
- Cards inside a column cannot be resized and size to their content.
- Keyboard: a resize handle reached with Tab resizes with the arrow keys: → / ← 20px wider / narrower, ↓ / ↑ taller / shorter (corner handles only); Shift for 100px. Each press is one undo step.
- While resizing, the edge follows the pointer and eases to the grid size on release; the size label shows the final size.
- Size limits: cards 200–640 wide, columns 240–640 wide, heights 100–700.
- Size matching: within 8px of another block's width or height, the size snaps to match; matched blocks get a dashed amber outline and a label shows e.g. "240 × 180 · same width as 2 blocks". Otherwise sizes snap to the grid when snapping is on.

**Collapse, add, delete, colour**

- Collapse arrow: a card shrinks to one line with a preview (first line, list title, or link title), shown in the middle of the card when it is loose; a column hides its cards.
- Toolbar Collapse all (icon button): if any card or column is open, collapses every card and column; when everything is collapsed it reads Expand all. With cards or columns selected it acts on just those (a selected column with its cards), and on everything only when nothing is selected. Collapsing closes the gaps (Collapse all, and also collapsing a single card or column with its arrow): each block below a collapsed one moves straight up by as much as that block shrank, keeping the spacing it had under it (the mirror of growth pushing straight down); blocks to the side and big deliberate gaps stay as they were. Expand all opens every card and column (also ones that were collapsed before Collapse all). Straight after Collapse all it also puts every block back where it was, unless it was moved in between; whatever an opening block grows into is pushed straight down (the higher block keeps its place). One undo step each. Faded on an empty board.
- Toolbar Same width (icon button, after Collapse all): the selected loose cards and columns all take the width of the first one selected (within each kind's size limits; cards inside columns follow their column). One undo step; anything they now cover moves out of the way. Faded with fewer than two selected.
- Expanding a card or column can push nearby blocks aside. Collapsing it again puts those blocks back where they were (in the same undo step), unless one has been moved since or its old spot is now taken. This is remembered until the page is reloaded.
- Adding a card with a column selected puts it at the end of that column; with a card inside a column selected, directly below that card; otherwise loose on the board. New to-do lists and columns start untitled, showing a "List title" / "Column title" placeholder (a list made by dropping items on the board too). A new to-do list starts with one blank item and the cursor in its title; Enter there moves the cursor to the first item. A new note gets the cursor in its text, a new column in its title. An empty board shows a centred hint ("Add a note, a to-do list or a column from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.") until anything is on it. Escape leaves the field and keeps the block selected.
- Column × opens a small confirmation saying what goes ("Delete “Ideas” and its 3 cards?", or "Delete “Ideas”?" when it is empty; for several columns "Delete 2 columns and their 5 cards?") · Keep column · red Delete column, and then deletes the column and all its cards.
- Toolbar Colour recolours every selected column from 16 swatches (two rows of 8 large 32px chips, table below, each ringed in its own edge tone; if the open menu would cover the block being coloured, the board moves down so it stays in view), plus Default (back to stone-grey). The name of the swatch under the pointer (or of the current colour) shows under the swatches. For selected cards, which stay white, it colours their title band instead, in a deeper shade of the swatch (70% edge tone mixed with its background); a note, which has no title, gets the band across its header strip. Default puts a card's usual band back. It is faded with nothing selected.
- Toolbar Auto-colour gives every column on the board a different colour in one step (undoable). Columns are taken left to right, and colours handed out in this order so neighbours differ clearly: Sky, Peach, Mint, Lavender, Butter, Teal, Rose, Lime, Periwinkle, Coral, Aqua, Orchid, Sage, Sand, Slate, Stone. Colours repeat only beyond 16 columns. Faded when there are no columns.

### Arrows

- An arrow joins one card or column to another (cards inside columns included), to show how they connect. It is a plain line with an arrowhead, no label.
- To draw one, select a single card or column: a small round handle shows just off its right edge. Drag the handle onto another card or column (it gets a dashed amber outline) and let go. Letting go anywhere else draws nothing. A block can't point to itself, a column and a card inside it can't be joined, and two blocks are joined at most once.
- The arrow runs along the line between the two blocks' middles, from edge to edge, and follows them as they move, grow, collapse or change column (a card in a collapsed column points from its column). It isn't drawn while the two blocks overlap.
- Clicking an arrow selects it (amber, with a × in its middle); Delete, Backspace or the × removes it; Escape or clicking the board lets it go. Deleting a card or column deletes its arrows.
- Drawing and deleting an arrow are each one undo step. Arrows are saved and synced with the board. They are not copied with copied or duplicated cards.

### Text formatting

- Every text box can be formatted as a whole: card titles (to-do lists and links), note text, checklist items and column titles. Not a link's address, nor the board name. Formatting always covers the whole box, never single words.
- Choices: size Small / Normal / Large (Normal is the usual size; they scale with A− / A+, so Large stays larger than the text around it), **bold**, *italic*, and a typeface: Plex Sans (the usual one), Serif, Rounded, Handwritten, Typewriter. No colours.
- Highlighting any text in a box shows a small bar just above it with B, I, the three sizes and a Font menu (each font shown in its own style). Its buttons format the whole box; hovering the bar outlines what it will change. With checklist items selected, the bar shows above them and formats all of them.
- While typing: Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+> larger, Ctrl+Shift+< smaller, on the box you are in (with or without highlighting). With checklist items selected, they format those items; with whole cards or columns selected, every text box in them. Bold and italic turn on for all unless all already have it, then off for all.
- Formatting is saved with the board, syncs, is one Ctrl+Z step, and is kept by copy, duplicate and paste. Enter keeps it on both halves of a split item (and on the new item below); joining two items keeps the first one's formatting. Ticked items and items in the Completed card keep it. Text copied to other apps is plain.

## Checklists

A to-do list is an editable title plus a tree of items up to 6 levels deep, with finished top-level items gathered in a Completed section.

**Items**

- Item text is edited in place and wraps onto new lines at the width of the card (no room is kept for the hover buttons); no focus rectangle.
- Enter works like a text editor. At the end of an item it adds a new item directly below: right after it, or as its first sub-item if it has sub-items. In the middle of the text it splits the item: the text after the cursor moves into a new item directly below (placed the same way; one space at the split is dropped; any sub-items stay with the first half; a ticked item stays ticked in both halves), with the cursor at its start. At the very start of an item with text it adds a blank item right above, and the cursor stays with the text. Selected text is removed first. There is no "Add an item" field and no add or sub-item buttons.
- Tab nests an item under the one above; Shift+Tab moves it out a level. Backspace on an empty item deletes it (a list's last item cannot be deleted this way). Delete with the cursor at the very end of an item pulls the item shown below it up into it: its text is joined on (cursor stays at the join) and its sub-items move up one level into its place. It never pulls an item across from the open list into Completed.
- On hover, each item shows a small drag grip and a trash can at the right end of its first line, in a narrow strip every item keeps free for them, so they never cover the text and the text never moves on hover. Neither shows otherwise. On a touch screen (no hover) they show only on the item being typed in; tapping its trash deletes it, and its grip drags with a finger.
- Up / Down arrows move between items as if the list were one long text: Up goes to the end of the item above, Down to the start of the item below. Inside a multi-line item they move line by line first. Items hidden in a collapsed Completed section are skipped.
- Ctrl+Shift+Up / Down move the item being typed in (with its sub-items) past the item above / below at the same level, keeping the cursor in it. A top-level item never passes into or out of the Completed section; at the top or bottom of its level nothing happens.

**Completed section**

- Ticking a top-level item moves it and its sub-items into the "Completed" section at the bottom (its header shows no count, and collapses and expands the section). Ticking a sub-item only strikes it through, except that ticking the last open sub-item of an item ticks that item too (and so on upwards), so a list item whose sub-items are all done moves to Completed. Unticking a sub-item unticks the items it is nested in.
- **Uncheck all** (on the same line as "Completed", at the right; shown while anything in the list is ticked) unticks every item and sub-item in the list, so a list such as groceries can be used again. One undo step.
- Web addresses (http://, https:// or www.) typed in a note show as links under its text (the address without https:// and www., opening in a new tab); Ctrl+click (⌘+click) on an address in a note or a checklist item opens it too.
- With motion allowed, an item on its way to Completed shows ticked and eases down and out (280ms) before moving, then fades in at its new place with a brief amber tint (450ms). With reduced motion it moves at once. Undo right after ticking undoes the tick.
- Trash deletes that item and everything nested under it. If a list becomes empty, a blank item replaces it.
- Exception: deleting an item with no text (trash, Backspace or Delete) keeps its sub-items if any of them has text; they move up one level into its place. Cut (Ctrl+X) always takes sub-items with the parent.

**Dragging items**

- Drag the grip to move an item and all its sub-items: before/after another item (amber line), nested under an item (drop slightly right; amber tint), into another list, or onto empty list space (appends; the whole card, top included, gets a dashed amber outline).
- Dropping on empty board space (or on a note, link or column) creates a new untitled to-do list at that spot with the dragged items (the dragged label says "Drop to make a new list").

**Selecting several items**

- Hold the mouse on one item and drag over others to select a range, across open and completed items. Shift+click extends the range; with no range yet, Shift+click selects from the item being typed in to the one clicked. A range can span items at different levels. Selected items get a amber text highlight and a lighter row tint. No action bar.
- With several selected: Backspace or Delete removes them all; ticking any one ticks them all (unticking one reopens them all); the trash on any one deletes them all; dragging any one moves them all, in order, with their sub-items; Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste them after the selection. Copy and cut take exactly the highlighted items (a sub-item that isn't highlighted is left out, and cut leaves it in the list, moved up into its parent's place), and also put their text on the computer's clipboard for other apps: one item per line in the order shown, indented two spaces per level below the least-indented highlighted item; Tab / Shift+Tab move them all in or out one level together (one that can't move, such as the first item of a list, stays and the ones after it nest under it) and they stay selected; Escape clears.
- Ctrl+A, pressed again and again, selects more each time: first the text of the item being typed in; then every item in that list (from some of a list's items, the whole list); then every item in every list in the same column (skipped for a loose list); then every item on the board. Only items you can see are taken: none from collapsed cards or columns, nor from a closed Completed section. Escape or clicking empty board clears.
- Pressing on an item and dragging down or up into another card of the same column carries the selection on through those cards (never into other columns or loose cards).
- With items selected in several lists: Delete / Backspace, ticking and the trash work on all of them (a list left empty keeps one blank item); Ctrl+C copies them, putting each list's title on its own line with its items indented two spaces under it, in board order (columns left to right, each top to bottom, then loose lists top to bottom, left to right). Tab, Ctrl+X, Ctrl+V and dragging do nothing then.

### Due dates

- Any checklist item can have a due date: a day, with no time and no reminders. On hover a calendar button shows beside the trash (the strip kept free for the hover buttons is wide enough for grip, trash and calendar, so text never moves). On a phone the same button is in the bar above the keyboard.
- The calendar opens a small menu: **Today**, **Tomorrow**, **Next week**, a box to pick any day, and **No due date** (shown when the item has one). Escape or a click elsewhere closes it. Setting or clearing a date is one undo step; it is saved, synced, copied with the item and kept when the item moves to Completed.
- An item with a date shows a small chip under its text: Today, Tomorrow, Yesterday, a weekday within the next six days (Fri), otherwise the date (Tue 20 Oct, with the year when not this year). Today's chip is amber, an overdue one red, a ticked item's faded. Clicking the chip opens the same menu.
- The **Due** button (calendar, by the zoom control; in the phone's ⋯ menu) shows a red count of unticked items due today or earlier, on every board. It opens the Due panel on the right (it takes the place of Version history; only one shows at a time): **Overdue** (oldest first, each with its date) and **Today**, each item with its list's title and, when there are several boards, its board's name. Clicking one opens its board, brings the item into view and puts the cursor in it. Ticked items, and sub-items of ticked items, are left out. With nothing due it says so and how to add a date. Escape closes it.

### Clean up and the Completed card

- Toolbar **Clean up** moves every ticked checklist item on the board into the board's one **Completed** card: ticked top-level items (the Completed sections) and ticked sub-items under open items, each with everything nested under it. Lists left empty get one blank item. It is faded when nothing is ticked, and is one undo step.
- The first Clean up makes the Completed card (white, at the free spot nearest the middle of the screen). Items are grouped under the date Clean up was clicked ("2 Oct 2026"), newest date on top; cleaning up again on the same day adds to that day. Each item shows the list it came from, and its sub-items as they were.
- The Completed card can never be deleted: it has no ×, the Delete key skips it, and deleting a column it sits in leaves it loose where the column was. It is never copied. It can be moved, collapsed, resized and put in a column like any card.
- Unticking an item in the Completed card sends it back, unticked, to the list it came from: under the item it was nested in if that is still there, otherwise at the end of the list. If that list is gone, a new list with the old title is made next to the Completed card. An emptied day disappears.

## Selection, clipboard and undo

Every block action works on one block or on a whole selection, and every change can be undone.

| Shortcut (⌘ on Mac) | Does |
| --- | --- |
| Click | Select one block (amber outline); click empty space to clear |
| Ctrl + click (or Shift + click) | Add or remove a block from the selection |
| Select tool drag | Rectangle selection; hold Ctrl to add to the current selection |
| Ctrl + A | Select every column and loose card (with checklist items selected, selects more items instead; see "Selecting several items") |
| Ctrl + C, then Ctrl + V | Copy and paste the selection (a column copies with its cards, titled "… copy"); pastes offset by 40px each time |
| Ctrl + D | Duplicate the selection |
| Delete / Backspace | Delete the selection; if it includes a column, the same confirmation as the column × appears first, then columns go with their cards |
| Drag a selected block | Moves the whole selection together |
| Arrow keys | Move the selected loose cards and columns one grid step (20px); Shift + arrow moves five. Like a drag, they keep their spot and whatever is in the way moves. A single selected card inside a column moves up / down its column instead (← / → do nothing). Presses in quick succession are one undo step |
| Ctrl + Z | Undo, up to 100 steps, from anywhere including inside text fields; a burst of typing counts as one step |
| Ctrl + Y | Redo (Ctrl + Shift + Z does nothing) |
| Escape | Clear the selection and close menus. While typing in a card or column, Escape leaves the text field and keeps the block selected, so the arrow keys then move it |

- Undo and Redo buttons in the toolbar fade when there is nothing to undo or redo.
- Keyboard shortcuts for blocks do not fire while typing in a text field, except undo, redo and zoom.

## Keyboard navigation between cards

- Up / Down arrows move through every text field of a card (note text, list title and items, link title and address). Inside a column they carry on into the card above or below and select it. Collapsed cards are skipped; loose cards don't continue to other cards.
- Alt + arrow keys jump to the nearest card or column in that direction by on-screen position (loose or in a column), select it, put the cursor at the end of its first field and pan it into view. Only a card or column lying wholly that way counts (one mostly below is reached with ↓, never →); one straight ahead (level with it for ← / →, above or below it for ↑ / ↓) beats one off to the side, then the nearest wins. Columns are stops at their title strip: ↑ from a column's top card goes to the column (cursor in its title), ↓ from there to its first card, ← / → from a title to the next column's title; empty and collapsed columns are reached the same way. With nothing selected they start from the card or column nearest the middle of the screen. Works while typing.
- Ctrl + arrows keep moving word by word in text. Alt + ← / → never make the browser go back or forward a page.

## Sign-in, sync and offline (published site)

- The published site shows only a "Sign in with Google" screen until someone signs in; sign-in is remembered on each device. It is open to everyone: any Google account (with a verified address) can sign in and gets its own private board, synced across that person's devices, which no one else can see. Under the button: "Your board is saved online with your Google account so it opens on all your devices. Only you can see it." The online rules only accept the fields the app saves, and a board (or a saved version) of at most 900,000 characters; a refused save shows the usual "Couldn't save online" banner. An account the rules turn away anyway is told "This Google account can't open a board" and offered Sign out.
- Every board is stored in Firebase (project `note-board-a672a`) in one document per user, holding the same data as the browser save (so the 900,000-character limit is for all of a person's boards together). Which board is open isn't synced. A single board sent by an older version of the app (still open somewhere) only replaces the home board; the other boards are kept. Firestore security rules (`firestore.rules`, pasted into the Firebase console by the owner) allow only the owner's account to read or write it.
- First sign-in: the online board wins; if there is none, this device's board is uploaded. After that, changes reach other devices within a second or two, and the most recent change wins. A change from another device clears undo history and waits for any drag in progress to finish. A change made on this device that hasn't been uploaded yet, or a drop made after the other device saved, counts as more recent: it is kept and sent, and the other device's version is dropped. If the online board can't be read (damaged, or saved by a newer version of the app), it is never shown or overwritten: the page shows "Your board couldn't be loaded" and stops syncing until reloaded. If an upload is refused (for example the board is too big for Firebase), a small red note at the bottom says "Couldn't save online. Changes are on this device only." The next change tries again; the note goes once an upload succeeds, and until then changes from other devices are not applied. Changes are also uploaded straight away when the window is hidden or minimised, not only when it is closed.
- Works offline: once visited online, the page opens without internet; edits are kept on the device and uploaded when the connection returns. A small grey note left of the bottom-right controls says "Saving…" while a change waits to upload, "Saved" once it is online, and "Offline. Will save when you’re back online" without a connection (the red banner shows instead when a save fails). A new version of the site replaces its offline copy, so new icons and files reach returning visitors.
- Installable as an app: in Edge or Chrome the site can be installed (address-bar Install button), giving BusyAnts its own window without an address bar, a Start menu and taskbar icon (a simple chibi ant silhouette on warm yellow), and the same sign-in, sync and offline behaviour. It updates itself whenever the site does. The icon files are named after the app (`busyants-192.png`, `busyants-512.png`, `busyants-maskable-512.png`, `busyants-icon.svg`, and `busyants-apple-180.png` for iPhone / iPad home screens) so a changed icon gets new file names and is fetched again rather than kept from before.
- Running the app locally (`npm run dev`) and the tests stay browser-only, with no sign-in.

## Look and feel

Professional but with colour: white cards and soft-tinted columns on a warm neutral canvas, thin borders, soft shadows, one amber accent, all in the warm honey tones of the BusyAnts icon (an ant on yellow).

- **Type:** IBM Plex Sans (400, 500, 600). Titles 14–17px semibold, body 14px.
- **Canvas:** #FAF6EC (warm cream) with #D6CBB0 dots every 20px (fainter when snapping is off). Toolbar soft honey #FFF1C2 with a #ECD897 bottom border, the BusyAnts ant (the app icon) at its left before the board name; the browser / app title bar takes the toolbar colour. Dark mode: toolbar #2A2416, canvas #1D1B17.
- **Accent:** amber-brown #8A5A00 (dark mode: honey #F2C14E) for selection, active tool, drop lines and New column; its soft tint #FFF1C2 (dark #3A3020) for title bands and pressed buttons. Destructive actions use #A3263F.
- **Cards:** white (#FFFFFF), 10px radius, 1px #E2DDD4 border, shadow 0 1px 2px at 6%. Columns: 12px radius, #EFECE6 unless recoloured; the swatches below are for columns.
- **Dark mode:** the toolbar's moon button switches between light and dark (pressed = dark; it shows the same pressed look as Snap to grid: soft honey with an amber border). A first visit on a device follows the computer's light / dark setting; once the button is pressed, that device remembers the choice (it is not synced, not saved with the board, and not undone by Ctrl+Z). Dark mode changes only colours: canvas #1C1B19 with #45413B dots, toolbar #232220, cards #2B2926 with a #3D3A35 border and #ECE8E1 text, accent amber #5FB3AB. Columns use a deep, muted shade of each swatch (`DARK_PALETTE` in `src/model/theme.ts`, same names; uncoloured columns #2A2825), and the Colour menu shows those shades. Every dark column colour keeps at least 7:1 contrast with the text. Faded toolbar buttons fade a little less in dark mode (55% instead of 45%; Undo/Redo 50% instead of 40%). Placeholder text is #736C62 in light mode and #A39D93 in dark mode, readable at about 4.5:1.
- **States:** selection = 2px solid amber outline; size match = 2px dashed amber; a list about to take dragged items at its end = 2px dashed amber around the whole card; dragging = 2.5px amber border with glow; no focus rectangles on text fields (buttons and tick boxes keep a keyboard focus ring).
- **Accessibility:** tick boxes, resize handles and the item grip can be pressed within at least 24×24px (the drawn handles stay small). Screen readers hear cards as "To-do list: Groceries" / "Link: …" / "Note" and columns as "Column: Week" ("Untitled …" when there is no title); the board area is called "Board". Placeholders: "Add an item" for a blank checklist item, "Paste a link address" for a link's address.

| Swatch | Background | Edge | Text |
| --- | --- | --- | --- |
| Butter | #FFF3CF | #EED9A0 | #6B4600 |
| Sand | #F4ECDF | #E3D3B9 | #5E4724 |
| Peach | #FDEBDD | #F2CDB0 | #7A3A0E |
| Coral | #FDE4DC | #F4C4B5 | #8A2F17 |
| Rose | #FCE7EC | #F2C4CF | #8A1F3D |
| Orchid | #F7E6F6 | #E8C5E5 | #7A2A73 |
| Lavender | #EFEAFB | #D5CAF2 | #4B2E8A |
| Periwinkle | #E4E7FC | #C5CBF3 | #2F3C8A |
| Sky | #E6EEFC | #C3D4F2 | #1F4A8A |
| Aqua | #DCF2F7 | #B3DDE8 | #135A6B |
| Teal | #E0F2F1 | #B7DEDB | #155E58 |
| Mint | #E3F4EA | #BFE0CC | #1B5A3C |
| Sage | #E8EEE4 | #CCD8C3 | #3D5233 |
| Lime | #EEF6D6 | #D3E3A6 | #4A5C12 |
| Slate | #E7EBEF | #CBD3DC | #36424F |
| Stone | #F7F5F1 | #E2DDD4 | #3F3B35 |

## Out of scope and build order

Build in this order, each step tested and working before the next.

1. Canvas, toolbar, pan and zoom, grid, and saving to the browser
2. Cards and columns: add, edit, move, drop into columns, collapse, colour, delete with confirmation
3. No-overlap layout, resizing, size matching and snap-to-grid realignment
4. Selection, rectangle select, clipboard, delete, and undo/redo for everything
5. Checklists: items, nesting, Completed section, item drag, multi-select and drop-to-board

After step 5 (owner additions): dragging new blocks from the toolbar, keyboard navigation between cards, smoother snapping, dragged block takes priority, importing from Milanote, white cards with 16 column colours and Auto-colour, Clean up with the Completed card, Delete joining checklist items, Tab on several items, collapse returning pushed blocks, and the published site with sign-in, sync, offline use and installing as an app.

**Not in version 1:** sharing, real-time collaboration, image cards, connector lines. (Several boards and boards inside boards were added on 5 Oct 2026.)

**Decisions (1 Oct 2026)**

- The Delete key asks for confirmation when the selection includes a column.
- Version 1 supports one board only (changed on 5 Oct 2026: several boards, and boards inside boards).

Later decisions, with dates and reasons, are listed in `docs/decisions.md`.

## Phone layout

- Windows under 600px wide (phones) use a phone layout; tablets and wider windows keep the desktop layout. Touch screens of any size follow the touch rules for checklist items above.
- The top bar shows the Boards button (icon), the path back up when inside another board, and the board name. A bar along the bottom holds Undo, Redo, a large + and ⋯.
- + opens a menu: Note, To-do list, Column, Sub-board (Add a sub-board here). Choosing one adds it (as the desktop buttons do) and closes the menu.
- ⋯ opens a panel above the bar with every other toolbar control: Hand / Select, text size A− / A+, Snap to grid, Colour (its swatches open inside the panel), Auto-colour, Collapse all, Same width, Clean up, Import, Dark mode and, on the published site, Sign out. Tapping outside it closes it.
- The zoom control and the ? button are not shown on a phone (two fingers pinch to zoom; there is no keyboard). The "Saving…" / "Saved" note sits just above the bottom bar.
- While typing in a checklist item on a phone, a row of buttons sits just above the on-screen keyboard: Outdent, Indent, Move up, Move down, Tick and Delete (the same as Shift+Tab, Tab, Ctrl+Shift+Up / Down, the tick box and the trash). Pressing them keeps the cursor in the item, so the keyboard stays up. The row goes once nothing is being typed in.
- On a phone, when the keyboard (or the item buttons) would cover the text box being typed in, the board moves up so it stays in view.
- On touch screens the small card controls (collapse, ×, the item grip and trash, the resize corner) can be pressed a little outside their drawn edge. The resize corner's extra area lies outside the card, so it never takes a press meant for the last item's grip.
- On a touch screen, one finger moving straight away over a card, a column or a resize handle moves the board around (nothing is moved or resized by accident). Resting the finger for about half a second first, then moving, drags the card or column (anywhere on it, its text included), or resizes from a resize handle. A quick tap still types. Checklist items still move by their grip, which drags at once; tick boxes and buttons keep their own meaning. No copy / paste menu appears from the hold, and dragging a finger over checklist items no longer selects them.

## Version history

- Like Google Docs, earlier versions of the board are kept and can be looked at and restored. On a computer it opens from a clock button beside ? (bottom right); on a phone from ⋯ → Version history.
- A version holds every board. A version is saved automatically: when editing starts again after 10 minutes without an edit on any board, every board as it was just before is saved (and during a long stretch of editing, once an hour). Undo and redo count as edits; blocks re-arranging themselves don't. A version that couldn't be saved (offline, say) is tried again a minute later. The board on screen is always the "Current version". Changes arriving from another device don't save a version there (that device saves its own). A version the same as the newest one isn't saved again. The newest 100 versions are kept online; a board kept on one device only (no sign-in) keeps 20, since each is a whole copy of the board and device storage is small.
- On the published site, versions are kept online with the board (shared by every device the owner signs in on); otherwise, on the device.
- The list shows "Current version", then earlier versions grouped by day (Today, Yesterday, then the date), newest first, each with its time and what was on the boards (e.g. "12 cards · 3 columns", or "2 boards · 12 cards · 3 columns").
- Picking a version shows the open board as it was then (empty if it didn't exist yet), read-only: the board can be moved around and zoomed, but nothing can be changed. A bar shows when it was saved, with Back to current and Restore this version. Escape goes back to the current board, then closes the history. On a computer the list stays at the right; on a phone it fills the screen and steps aside while a version is shown (Back to current brings the list back).
- Restoring first saves every board as a version (so nothing is lost), then puts the open board back as it was in the chosen version, as one change: Ctrl+Z (or Undo) brings back the board from before the restore. Boards deleted since that version come back too (they stand alone in the Boards menu); other boards are left as they are.

## Search

- Ctrl+F (also while typing in a card) opens the board's own search bar instead of the browser's; so does the magnifier button beside the clock button (bottom right), and ⋯ → Search on a phone. The bar sits at the top right (across the top on a phone).
- It looks in column titles, list and link titles, checklist items (sub-items and ticked items too), notes, link addresses and the Completed card, ignoring upper / lower case. Matches are taken in board order: columns left to right (their cards top to bottom), then loose cards top to bottom.
- Every match is marked in yellow inside the text, the current one in orange; the bar shows e.g. "2 of 7", or "No matches". Enter / ↓ / the down arrow button go to the next match, Shift+Enter / ↑ / the up arrow button to the previous one (wrapping round). The board moves so the current match is in the middle of what can be seen (above a phone's keyboard), zooming in to 100% first if the board is zoomed out below 60%.
- A match out of sight (in a collapsed card or column, or a closed Completed section) marks that card or column with an orange ring instead, and the count says "in a closed card"; nothing is opened by itself. A match in a link address rings the address box.
- Escape or × closes the bar and the marks go.
