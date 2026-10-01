# Note Board — Build Spec v1

As of 2026-10-02 · Owner: Eric Zhang

## Overview

Note Board is a web-based visual board for notes, to-do lists and links, in the spirit of Milanote. Version 1 is a single-user app with one board that runs in the browser and saves it between visits. The published site (https://ezhang43.github.io/note-board/) also syncs the board to the owner's Google account, so the same board opens on every device.

The clickable prototype (`note-board-prototype-reference.html`) is the reference for look and behaviour. Where this spec and the prototype disagree, this spec wins.

- **Who it's for:** one person organising ideas, plans and tasks on a free-form canvas.
- **Version 1 goal:** everything in this spec working reliably, saved in the browser and synced to the owner's account.
- **Not in version 1:** multiple boards, sharing and real-time collaboration.

## Build rules for Claude Code

The owner reads code at a beginner level and will not review it line by line, so every change must be verifiable by tests and by clicking through the app.

1. **Stack:** a web app in TypeScript with React, built with Vite. Claude Code may propose an alternative once, with reasons, before writing code; the choice is then recorded in `CLAUDE.md`.
2. **Saving:** the board saves automatically to the browser (localStorage) after every change and loads on start. The published site also syncs it to Firebase (see "Sign-in, sync and offline"); running the app locally stays browser-only.
3. **One source of truth:** all board data (cards, columns, items, positions, sizes, colours) lives in one state object, so undo, copy-paste and saving work the same way for everything.
4. **Tests:** automated tests for the logic (overlap, snapping, checklist moves, undo) plus browser tests for the main flows. All tests pass before a change is accepted.
5. **Small steps:** build one section of this spec at a time, show it working, then move on. Keep a short changelog in the repo.
6. **No surprises:** do not add features that aren't in this spec without asking first.
7. **Keep this spec current:** whenever the owner asks for a new feature or change, or a decision is made, update this spec in the same step so it always describes the app as it is.

## Board and navigation

The board is an endless canvas with a dotted 20px grid under a fixed top toolbar.

**Toolbar, left to right:** board name (editable, box sized to its text) · Hand / Select tool toggle · Undo · Redo · Snap to grid · Colour · Add Note · Add To-do list · Add Link · New column; on the published site, Sign out at the far right. A zoom control (− · percentage · +) sits bottom-right; clicking the percentage resets to 100% around the centre of the screen.

| Action | How |
| --- | --- |
| Pan the board | Hand tool: drag empty space. Any tool: scroll or trackpad swipe |
| Zoom | Ctrl + scroll or trackpad pinch, centred on the cursor; Ctrl + = / Ctrl + − / Ctrl + 0 to reset (these also work while typing, so the browser never zooms the page instead). Range 30%–250% |
| Rectangle select | Select tool (V): drag on empty space; anything the rectangle touches is selected live |
| Switch tools | H for Hand, V for Select |
| Snap to grid | Toggle, on by default. Moves, resizes and pastes land on 20px steps. Snapping happens where a block lands, not while it moves (see Moving). Turning it back on moves every block (position and resized sizes) to the nearest grid point |

- The cursor stays the normal arrow in both tools and over blocks (no hand or grab cursor). Text fields show the text cursor.
- New cards and columns never appear on top of existing blocks. From a toolbar click they appear at the free spot nearest the middle of the screen.
- Add Note, Add To-do list, Add Link and New column can also be dragged from the toolbar onto the board. A dashed outline shows where the block will appear (the free spot nearest the pointer); a new card dragged over a column goes into the column at the pointer (a new column never does). Letting go off the board adds nothing.
- Pan and zoom are remembered between visits; the tool always starts as Hand.

## Blocks: cards and columns

The board holds three card types and columns that stack cards. Cards show no type label; the type is told by colour and content.

| Block | Content | Default colour |
| --- | --- | --- |
| Note | Free text; grows taller as you type, never scrolls | Butter |
| To-do list | Title plus checklist (next section) | Mint |
| Link | Title, URL field, "Open <domain>" button in a new tab | Sky |
| Column | Title (box sized to its text), card count, stacked cards | Neutral stone-grey |

**Headers:** cards show a collapse arrow and × (and a to-do list shows "2/5 done"). Columns show the collapse arrow, title, count and ×. No move handles and no per-block palette icons.

**Moving**

- Drag any blank part of a card or column to move it; a drag starts after a 5px nudge so a click still just selects.
- The dragged block stays flat (no tilt) with a 2.5px teal border and soft glow.
- Dropping a card fully onto a column inserts it at the pointer position; the column opens if collapsed. Dragging a card out of a column makes it loose.
- While dragging, the block follows the pointer exactly; a dashed teal outline shows the grid spot it will land on, and on release it glides there (160ms). Blocks pushed aside also glide. No gliding when the computer is set to reduce motion.
- **The dragged block takes priority:** it lands on the grid spot under the pointer, and blocks in its way move to the nearest free spot, previewed live while dragging. A single dragged card never pushes a column: over a column it drops in, and where it would otherwise cover one it takes the nearest free spot. Dragged columns and groups push everything.
- **No overlap, ever:** loose blocks keep at least a 10px gap. When a column grows, a block is pasted or a size changes, anything it would cover moves to the nearest free spot.

**Resizing**

- Loose cards: bottom-right corner handle sets width and minimum height (content taller than that still grows the card).
- Columns: corner handle (width and minimum height) and right-edge strip (width only). Cards inside follow the column width.
- Cards inside a column cannot be resized and size to their content.
- While resizing, the edge follows the pointer and eases to the grid size on release; the size label shows the final size.
- Size limits: cards 200–640 wide, columns 240–640 wide, heights 100–700.
- Size matching: within 8px of another block's width or height, the size snaps to match; matched blocks get a dashed teal outline and a label shows e.g. "240 × 180 · same width as 2 blocks". Otherwise sizes snap to the grid when snapping is on.

**Collapse, add, delete, colour**

- Collapse arrow: a card shrinks to one line with a preview (first line, list title with count, or link title); a column hides its cards.
- Adding a card with a column selected puts it at the end of that column; with a card inside a column selected, directly below that card; otherwise loose on the board. A new to-do list starts with one blank item, cursor in it.
- Column × opens a small confirmation ("Delete 'Ideas'?" · Cancel · red Delete column) and then deletes the column and all its cards.
- Toolbar Colour recolours every selected block from 8 swatches: Butter, Peach, Rose, Lavender, Sky, Teal, Mint, Stone. It is faded with nothing selected.

## Checklists

A to-do list is an editable title plus a tree of items up to 6 levels deep, with finished top-level items gathered in a Completed section.

**Items**

- Item text is edited in place and wraps onto new lines at a fixed width; no focus rectangle.
- Enter adds a new item below at the same level. There is no "Add an item" field and no add or sub-item buttons.
- Tab nests an item under the one above; Shift+Tab moves it out a level. Backspace on an empty item deletes it (a list's last item cannot be deleted this way).
- On hover, each item shows a small drag grip and a trash can on its right. Neither shows otherwise.
- Up / Down arrows move between items as if the list were one long text: Up goes to the end of the item above, Down to the start of the item below. Inside a multi-line item they move line by line first. Items hidden in a collapsed Completed section are skipped.

**Completed section**

- Ticking a top-level item moves it and its sub-items into "Completed · N" at the bottom; the header collapses and expands the section. Ticking a sub-item only strikes it through.
- Trash deletes that item and everything nested under it. If a list becomes empty, a blank item replaces it.
- Exception: deleting an item with no text (trash, Backspace or Delete) keeps its sub-items if any of them has text; they move up one level into its place. Cut (Ctrl+X) always takes sub-items with the parent.

**Dragging items**

- Drag the grip to move an item and all its sub-items: before/after another item (teal line), nested under an item (drop slightly right; teal tint), into another list, or onto empty list space (appends).
- Dropping on empty board space (or on a note, link or column) creates a new to-do list "New list" at that spot with the dragged items, in the source list's colour.

**Selecting several items**

- Hold the mouse on one item and drag over others to select a range, across open and completed items. Shift+click extends the range. Selected items get a teal text highlight and a lighter row tint. No action bar.
- With several selected: Backspace or Delete removes them all; ticking any one ticks them all (unticking one reopens them all); the trash on any one deletes them all; dragging any one moves them all, in order, with their sub-items; Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste them after the selection; Escape clears.

## Selection, clipboard and undo

Every block action works on one block or on a whole selection, and every change can be undone.

| Shortcut (⌘ on Mac) | Does |
| --- | --- |
| Click | Select one block (teal outline); click empty space to clear |
| Ctrl + click (or Shift + click) | Add or remove a block from the selection |
| Select tool drag | Rectangle selection; hold Ctrl to add to the current selection |
| Ctrl + A | Select every column and loose card |
| Ctrl + C, then Ctrl + V | Copy and paste the selection (a column copies with its cards, titled "… copy"); pastes offset by 40px each time |
| Ctrl + D | Duplicate the selection |
| Delete / Backspace | Delete the selection; if it includes a column, the same confirmation as the column × appears first, then columns go with their cards |
| Drag a selected block | Moves the whole selection together |
| Ctrl + Z | Undo, up to 100 steps, from anywhere including inside text fields; a burst of typing counts as one step |
| Ctrl + Y | Redo (Ctrl + Shift + Z does nothing) |
| Escape | Clear the selection and close menus |

- Undo and Redo buttons in the toolbar fade when there is nothing to undo or redo.
- Keyboard shortcuts for blocks do not fire while typing in a text field, except undo, redo and zoom.

## Keyboard navigation between cards

- Up / Down arrows move through every text field of a card (note text, list title and items, link title and address). Inside a column they carry on into the card above or below and select it. Collapsed cards are skipped; loose cards don't continue to other cards.
- Alt + arrow keys jump to the nearest card in that direction by on-screen position (loose or in a column), select it, put the cursor at the end of its first field and pan it into view. With nothing selected they start from the card nearest the middle of the screen. Works while typing.
- Ctrl + arrows keep moving word by word in text. Alt + ← / → never make the browser go back or forward a page.

## Sign-in, sync and offline (published site)

- The published site shows only a "Sign in with Google" screen until the owner signs in; sign-in is remembered on each device. Only ezhang43@gmail.com can open the board; any other Google account is told it can't open this board and offered Sign out.
- The board is stored in Firebase (project `note-board-a672a`) as one document per user, holding the same data as the browser save. Firestore security rules (`firestore.rules`, pasted into the Firebase console by the owner) allow only the owner's account to read or write it.
- First sign-in: the online board wins; if there is none, this device's board is uploaded. After that, changes reach other devices within a second or two, and the most recent change wins. A change from another device clears undo history and waits for any drag in progress to finish.
- Works offline: once visited online, the page opens without internet; edits are kept on the device and uploaded when the connection returns.
- Installable as an app: in Edge or Chrome the site can be installed (address-bar Install button), giving Note Board its own window without an address bar, a Start menu and taskbar icon (three cards on teal), and the same sign-in, sync and offline behaviour. It updates itself whenever the site does.
- Running the app locally (`npm run dev`) and the tests stay browser-only, with no sign-in.

## Look and feel

Professional but with colour: soft tinted cards on a warm neutral canvas, thin borders, soft shadows, one teal accent.

- **Type:** IBM Plex Sans (400, 500, 600). Titles 14–17px semibold, body 14px.
- **Canvas:** #F6F4F0 with #CFC8BC dots every 20px (fainter when snapping is off). Toolbar white with a #E2DDD4 bottom border.
- **Accent:** teal #1F5F5B for selection, active tool, drop lines and New column. Destructive actions use #A3263F.
- **Cards:** 10px radius, 1px border in the card colour's edge tone, shadow 0 1px 2px at 6%. Columns: 12px radius, #EFECE6 unless recoloured.
- **States:** selection = 2px solid teal outline; size match = 2px dashed teal; dragging = 2.5px teal border with glow; no focus rectangles on text fields (buttons keep a keyboard focus ring).

| Swatch | Background | Edge | Text |
| --- | --- | --- | --- |
| Butter | #FFF3CF | #EED9A0 | #6B4600 |
| Peach | #FDEBDD | #F2CDB0 | #7A3A0E |
| Rose | #FCE7EC | #F2C4CF | #8A1F3D |
| Lavender | #EFEAFB | #D5CAF2 | #4B2E8A |
| Sky | #E6EEFC | #C3D4F2 | #1F4A8A |
| Teal | #E0F2F1 | #B7DEDB | #155E58 |
| Mint | #E3F4EA | #BFE0CC | #1B5A3C |
| Stone | #F7F5F1 | #E2DDD4 | #3F3B35 |

## Out of scope and build order

Build in this order, each step tested and working before the next.

1. Canvas, toolbar, pan and zoom, grid, and saving to the browser
2. Cards and columns: add, edit, move, drop into columns, collapse, colour, delete with confirmation
3. No-overlap layout, resizing, size matching and snap-to-grid realignment
4. Selection, rectangle select, clipboard, delete, and undo/redo for everything
5. Checklists: items, nesting, Completed section, item drag, multi-select and drop-to-board

After step 5 (owner additions): dragging new blocks from the toolbar, keyboard navigation between cards, smoother snapping, dragged block takes priority, and the published site with sign-in, sync, offline use and installing as an app.

**Not in version 1:** more than one board, sharing, real-time collaboration, image cards, connector lines, nested boards, mobile layout.

**Decisions (1 Oct 2026)**

- The Delete key asks for confirmation when the selection includes a column.
- Version 1 supports one board only.

Later decisions, with dates and reasons, are listed under "Decisions" in `CLAUDE.md`.
