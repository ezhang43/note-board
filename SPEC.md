# Note Board — Build Spec v1

As of 2026-10-01 · Owner: Eric Zhang

## Overview

Note Board is a web-based visual board for notes, to-do lists and links, in the spirit of Milanote. Version 1 is a single-user app with one board that runs in the browser and saves it between visits.

The clickable prototype (`note-board-prototype-reference.html`) is the reference for look and behaviour. Where this spec and the prototype disagree, this spec wins.

- **Who it's for:** one person organising ideas, plans and tasks on a free-form canvas.
- **Version 1 goal:** everything in this spec working reliably, plus saving in the browser.
- **Not in version 1:** multiple boards, accounts, cloud sync, sharing and real-time collaboration.

## Build rules for Claude Code

The owner reads code at a beginner level and will not review it line by line, so every change must be verifiable by tests and by clicking through the app.

1. **Stack:** a web app in TypeScript with React, built with Vite. Claude Code may propose an alternative once, with reasons, before writing code; the choice is then recorded in `CLAUDE.md`.
2. **Saving:** the board saves automatically to the browser (IndexedDB or localStorage) after every change and loads on start. No server in version 1.
3. **One source of truth:** all board data (cards, columns, items, positions, sizes, colours) lives in one state object, so undo, copy-paste and saving work the same way for everything.
4. **Tests:** automated tests for the logic (overlap, snapping, checklist moves, undo) plus browser tests for the main flows. All tests pass before a change is accepted.
5. **Small steps:** build one section of this spec at a time, show it working, then move on. Keep a short changelog in the repo.
6. **No surprises:** do not add features that aren't in this spec without asking first.

## Board and navigation

The board is an endless canvas with a dotted 20px grid under a fixed top toolbar.

**Toolbar, left to right:** board name (editable, box sized to its text) · Hand / Select tool toggle · Undo · Redo · Snap to grid · Colour · Add Note · Add To-do list · Add Link · New column. A zoom control (− · percentage · +) sits bottom-right; clicking the percentage resets to 100%.

| Action | How |
| --- | --- |
| Pan the board | Hand tool: drag empty space. Any tool: scroll or trackpad swipe |
| Zoom | Ctrl + scroll or trackpad pinch, centred on the cursor; Ctrl + = / Ctrl + − / Ctrl + 0 to reset. Range 30%–250% |
| Rectangle select | Select tool (V): drag on empty space; anything the rectangle touches is selected live |
| Switch tools | H for Hand, V for Select |
| Snap to grid | Toggle, on by default. Moves, resizes and pastes land on 20px steps. Turning it back on moves every block (position and resized sizes) to the nearest grid point |

- The cursor stays the normal arrow in both tools and over blocks (no hand or grab cursor). Text fields show the text cursor.
- New cards and columns never appear on top of existing blocks.

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
- **No overlap, ever:** loose blocks keep at least a 10px gap. While dragging, a dashed teal outline shows the nearest free landing spot; on drop the block lands there. When a column grows, a block is pasted or a size changes, anything it would cover moves to the nearest free spot.

**Resizing**

- Loose cards: bottom-right corner handle sets width and minimum height (content taller than that still grows the card).
- Columns: corner handle (width and minimum height) and right-edge strip (width only). Cards inside follow the column width.
- Cards inside a column cannot be resized and size to their content.
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
- On hover, each item shows a small drag grip on its right. Completed items also show a trash can on hover. Neither shows otherwise.

**Completed section**

- Ticking a top-level item moves it and its sub-items into "Completed · N" at the bottom; the header collapses and expands the section. Ticking a sub-item only strikes it through.
- Trash deletes that item and everything nested under it. If a list becomes empty, a blank item replaces it.

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
- Keyboard shortcuts for blocks do not fire while typing in a text field, except undo and redo.

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

**Not in version 1:** more than one board, accounts and login, cloud sync, sharing, real-time collaboration, image cards, connector lines, nested boards, mobile layout.

**Decisions (1 Oct 2026)**

- The Delete key asks for confirmation when the selection includes a column.
- Version 1 supports one board only.
