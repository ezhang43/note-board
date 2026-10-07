# BusyAnts (Note Board) — Build Spec v1

As of 2026-10-02 · Owner: Eric Zhang

## Overview

BusyAnts (built as "Note Board"; the name shows in the browser tab, the installed app and the sign-in screen) is a web-based visual board for notes, checklists and links, in the spirit of Milanote. Version 1 is a single-user app that runs in the browser and saves its boards between visits; a person can have several boards, and boards inside boards. The published site (https://ezhang43.github.io/note-board/) also syncs every board to the signed-in Google account (any Google account), so the same boards open on every device.

The clickable prototype (`note-board-prototype-reference.html`) is the reference for look and behaviour. Where this spec and the prototype disagree, this spec wins.

- **Who it's for:** one person organising ideas, plans and tasks on a free-form canvas.
- **Version 1 goal:** everything in this spec working reliably, saved in the browser and synced to the owner's account.
- **Not in version 1:** image cards. Sharing and real-time collaboration are being built (see "Sharing and editing together").

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

**Toolbar, left to right:** Boards button (see "Several boards") · the path to the open board, when it is inside another · board name (editable, box sized to its text; in a narrow window it and the path shrink first, the name down to 140px, ending in …, so no button is pushed off) · Hand / Select tool toggle · Undo · Redo · | · Snap to grid · Colour · Auto-colour · Collapse all · Same width · | · Add Note · Add Checklist · New column · | · File · Clean up · Dark mode (moon icon); on the published site, Share (an icon of two people, see "Sharing and editing together") and | · Sign out at the far right (an icon button: an arrow leaving a door, with the tooltip "Sign out"). (| = a thin divider between groups.) In windows up to 1500px wide the toolbar's gaps and button text tighten, so every button, Sign out included, fits a 1280px window, also inside a sub-board. Locally, `npm run dev` with `?signed-in` in the address shows Sign out, to check the fit. Add Note and Checklist are plain buttons (there is no Add Link: new cards are notes and checklists only; link cards already on a board, or made by an import, still work as described below); New column is the one solid amber button. Rarely used buttons (Auto-colour, Collapse all, Same width, File, Clean up) have no border until hovered. A zoom control (Fit to screen · − · percentage · +) sits bottom-right; Fit to screen (or Shift+1 outside text fields) brings every card and column into view, as large as fits, centred (zooming in up to 100%, or out as far as 30%); clicking the percentage resets to 100% around the centre of the screen. Left of it: A− / A+ (text size on cards and columns: Small, Normal, Large, Larger; the toolbar keeps its size; remembered on this device, not synced, not undoable; A− / A+ fade at the ends), and a round ? button that opens a Keyboard shortcuts panel listing every shortcut (also opened and closed by the ? key outside text fields; Escape, its ×, or a click outside closes it). Right of ?: a round coffee-cup button, "Buy me a coffee", that opens the owner's Buy Me a Coffee page (https://buymeacoffee.com/ezcookie) in a new tab; on a phone it is in the ⋯ menu. Right of Version history (clock button), a round stopwatch button opens the Focus timer (see "Focus timer"), and right of it, for someone signed in, a round calendar-page button opens Google Calendar (see "Google Calendar").

| Action | How |
| --- | --- |
| Pan the board | Hand tool: drag empty space. Any tool: scroll or trackpad swipe, which moves the board half the scroll distance (mouse wheels that scroll by lines or pages count a line as 16 px and a page as the board area's height) |
| Zoom | Ctrl + scroll or trackpad pinch, centred on the cursor; Ctrl + = / Ctrl + − / Ctrl + 0 to reset (these also work while typing, so the browser never zooms the page instead). On a touch screen, two fingers pinch to zoom and move together to pan, anywhere on the board including over cards; a pinch cancels whatever the first finger had started (such as dragging a card). Phones use the phone layout below. Range 30%–250% |
| Rectangle select | Select tool (V): drag on empty space; anything the rectangle touches is selected live |
| Switch tools | H for Hand, V for Select |
| Snap to grid | Toggle, on by default. Moves, resizes and pastes land on 20px steps. Snapping happens where a block lands, not while it moves (see Moving). Turning it back on moves every block (position and resized sizes) to the nearest grid point |

- With the Hand tool, the cursor is an open glove over empty board and a closed glove while dragging the board. Otherwise (Select tool, and over cards and columns with either tool) it is the normal arrow. Text fields show the text cursor.
- New cards and columns never appear on top of existing blocks. From a toolbar click they appear at the free spot nearest the middle of the screen.
- Edge panning: while dragging a block, dragging checklist items, selecting items by press-and-drag, or drawing a selection box, holding the pointer within 48px of the edge of the board area keeps moving the board that way (faster nearer the edge), and the drag carries on as if the pointer had moved. A drag that starts near an edge only does this once the pointer has been away from the edges.
- Alignment guides: while dragging a card or column (or several selected ones together, which line up as one: the box around them all), when its left edge, middle or right edge (or top, middle or bottom) comes within 8px of the same line of another block on the board, it snaps onto that line and a thin amber guide shows across both blocks. A guide wins over the grid on its axis. Blocks the dragged one is on top of are left out (they are about to move aside). Not while resizing (sizes match instead).
- Add Note, Add Checklist and New column can also be dragged from the toolbar onto the board. A dashed outline shows where the block will appear (the free spot nearest the pointer); a new card dragged over a column goes into the column at the pointer (a new column never does). Letting go off the board adds nothing.
- Opening the board (desktop and phone) shows every card and column, centred on the screen. The remembered zoom is kept when everything fits at it; otherwise the board zooms out just enough, but not below 50% so text stays readable. If the board is still too big at 50%, its top-left part is shown. This also happens when the online copy first arrives on an empty screen. The tool always starts as Hand.

### Several boards

- There can be any number of boards. The first board is the **home board**, which can't be deleted. Each board has its own cards, columns, name, Snap setting and undo history: Ctrl+Z never undoes something on another board, and switching away and back keeps a board's undo history (until the page is reloaded).
- **Boards button** (a two-boards icon at the left of the toolbar, after the ant; on a phone, in the top bar) opens a menu listing every board: the home board first with the boards inside it indented under it (and theirs under them), then each board that isn't inside another. The open board is highlighted. Clicking a board opens it. Every board except home has a × that deletes it, after a confirmation.
- **Add a sub-board here** (in the menu; on a phone also + → Sub-board) makes a new, empty board inside the open one: a **board card** appears on the open board (placed like a new card: into a selected column, else at the free spot nearest the middle of the screen), selected. A board card shows the board's name ("Untitled board" until it is named), how many cards are on it, and **Open board**; double-clicking the card opens it too. It can be moved, put in a column, collapsed (showing the name), resized, copied (the copy opens the same board), and deleted like any card: deleting the card leaves the board itself in the Boards menu.
- **New board** (in the menu) makes a new, empty board on its own (not inside another) and opens it. A new board that is left empty and unnamed, and that no card opens, is dropped when another board is opened.
- Opening a board shows every card and column on it, as when the app opens. Which board is open is remembered on each device (not synced), so the app reopens there.
- **Path back up:** on a board inside another, the boards above it show before its name, smaller and greyed ("Home › Trips ›"); clicking one opens it.
- **Deleting a board** removes it and every board card that opens it, on every board; boards inside it are kept and then stand alone. Every board is saved in Version history first, so a deleted board can be brought back from there. If the deleted board is open, the board above it opens. A shared board is the exception: only the person who shared it can delete it, and it is deleted for everyone (see Sharing and editing together); a "couldn’t be deleted" note shows if that fails.
- Search, Ctrl+A, Clean up, Collapse all, Fit to screen and Download as text work on the open board only. Copy and paste work between boards.

### Importing from other apps

**File** (toolbar; on a phone under ⋯) opens a menu:

- **Download backup:** every board (every card, position, size, colour and setting) in one file, named like "BusyAnts - Home - 2026-10-05.json" ("All boards" in place of the name when there are several).
- **Download as text:** the open board as readable Markdown (a board card is written as "Board: its name"): its name, each column (left to right) with its cards, then the loose cards top to bottom; to-do items as "- [ ]" / "- [x]", sub-items indented.
- **Restore from backup…:** pick a backup file; after a confirmation it replaces the board. A backup of one board, with one board here, replaces the open board: the board as it was is saved in Version history first, and Ctrl+Z brings it back. A backup of several boards (or any backup while there are several boards here) replaces every board, after asking "Replace all your boards…?": every board is saved in Version history first, and undo starts over. A backup made before there were several boards replaces the open board. A file that isn't a BusyAnts backup changes nothing and says so. The restored board is brought into view.
- **Import file…** (on a phone, in the File menu under ⋯): pick a file from another app: Markdown (.md, .markdown: Milanote, Obsidian, Notion, Bear…), text (.txt), a web page (.html, .htm: Evernote or Google Keep exports, saved pages) or a JSON export (.json: a Trello board, Google Keep notes from Google Takeout). The kind of file is worked out from its name and content. Its cards are added to the current board; nothing already there is changed or replaced.

On an iPhone with BusyAnts on the home screen, the downloads open the Share sheet (Save to Files) instead.

**Markdown** (a Milanote export reads as it always has, except that bullet lines right under a heading now become list items):

- Each heading becomes a checklist with that title; a heading with nothing under it becomes an empty list. A "# name" line at the very top of the file (the board or page name) is ignored, and so is a "---" block of settings at the top (Obsidian).
- Checklist lines ("- [ ]", "- [x]", "* [ ]") become the list's items, keeping sub-items (up to 6 levels) and ticks; ticked top-level items go into "Completed". A blank line between items starts a new list with no title.
- Plain bullet and numbered lines ("- a", "* a", "1. a") right under a heading, or inside a list, also become items (not ticked). Elsewhere they stay part of a note.
- Other text becomes a note (paragraphs kept; bold, strike-through and escape marks removed; links shown as "text (address)"). A note that is only a web address becomes a link card, titled by a heading right above it.

**Text:** a .txt file with headings or checklist lines in it is read as Markdown. Otherwise each block of text between blank lines becomes its own note (a block that is only a web address becomes a link card).

**Web pages (HTML):** h1–h6 become checklist titles; lists (ul / ol / li) become items, keeping nesting; a ticked checkbox in an item ticks it; each paragraph becomes its own note (a heading right above it starts the note, line breaks kept); a paragraph that is only a link becomes a link card; links inside text show as "text (address)". Scripts, styles, menus (nav), the page head, comments, noscript, template, iframe and svg are ignored, and so is a heading with no text (such as a logo). Only web addresses (http, https) are shown after a link's text; other links keep just their text. The page is only read as text: it is never shown, its scripts never run and its pictures and other files are never loaded.

**JSON (Trello, Google Keep):**

- A Trello board export: each open list (in Trello's order) becomes a checklist titled with its name; its open cards become items, ticked when the card's due date is marked complete; a card's checklist items become its sub-items with their ticks (a card with several checklists gets one sub-item per checklist, its items under it). A card's description becomes a note (the card's name on its first line) placed after its list. Archived (closed) lists and cards are left out; a list with no cards becomes an empty list. Labels, dates, members and attachments are not brought in.
- Google Keep notes (one note per file, or a file holding a list of notes): a list note becomes a checklist titled with the note's title, keeping its ticks; a text note becomes a note, its title on the first line; a text note that is only a web address becomes a link card titled with the note's title. Notes in the bin are left out; archived notes come in.
- Any other JSON, or a .json file that isn't valid JSON (including a BusyAnts backup, which goes through Restore from backup…), adds nothing and says "BusyAnts can only import JSON files from Trello or Google Keep."
- All of it is read as plain text: nothing in the file is run, shown as a web page or loaded.

**Every import:**

- The file has no positions, sizes or colours: cards are laid out loose in up to 4 lanes 20px apart (each card at the bottom of the shortest lane, in file order), starting at the top middle of the screen, or the nearest free space (the board then pans to show them). Once drawn, the lanes are tidied to the cards' real heights.
- The imported cards are selected, so they can be dragged or deleted together. One undo removes the whole import. A file with nothing in it adds nothing.
- A file it can't read (another kind, such as a PDF or a picture) adds nothing and says "BusyAnts can’t read that file yet." A file over 5 MB is refused with a short note. At most 300 cards and 2,000 checklist items come in from one file; a longer file adds its first part and says so.

## Blocks: cards and columns

The board holds three card types and columns that stack cards. Cards show no type label; the type is told by content. Cards are always white (loose or in a column); only columns are coloured.

| Block | Content | Colour |
| --- | --- | --- |
| Note | Free text; grows taller as you type, never scrolls | White |
| Checklist | Title plus checklist (next section) | White |
| Link | Title, URL field, "Open <domain>" button in a new tab | White |
| Column | Title (box sized to its text), card count, stacked cards | Neutral stone-grey until recoloured |

**Headers:** cards show a collapse arrow and a small trash can (the same icon and faint colour as a checklist item's, red on hover) at the top right (no "2/5 done" count); hovering them shows what they do ("Collapse card", "Delete card (Ctrl+Z brings it back)"; columns the same). Checklists, links and the Completed card have a tinted title band across the top (header and title): soft honey (#FFF1C2) when loose; inside a coloured column, a deeper shade of the column's colour (70% of its edge tone mixed with its background), so it stands out from the column but stays in the same colour family; inside an uncoloured (Default) column, the same soft honey as loose cards. Columns show the title and count centred, and the collapse arrow next to the trash can on the right. No move handles and no per-block palette icons.

**Moving**

- Drag any blank part of a card or column to move it; a drag starts after a 5px nudge so a click still just selects.
- The dragged block stays flat (no tilt) with a 2.5px amber border and soft glow.
- Dropping a card fully onto a column inserts it at the pointer position; the column opens if collapsed. Dragging a card out of a column makes it loose.
- **A checklist dropped on another checklist pours into it** (owner request): drag a whole checklist so the pointer is over the body (title or items, not the top strip) of another loose checklist; that list gets the dashed amber outline and nothing is pushed aside. Letting go moves all the dragged list's items to the end of it, with their sub-items, order and ticks (ticked ones into its Completed section; top-level items with no text anywhere in them are left out), and the dragged list, title included, is gone; the list that took them is selected. One undo brings it back. Lists inside a column don't take a dragged list (dropping there puts it into the column as usual), and nor do collapsed lists, notes, links or the Completed card; several blocks dragged together never pour.
- While dragging, the block follows the pointer exactly; a dashed amber outline shows the grid spot it will land on, and on release it glides there (160ms). Blocks pushed aside also glide. No gliding when the computer is set to reduce motion.
- **The dragged block takes priority:** it lands on the grid spot under the pointer, and blocks in its way move to the nearest free spot, previewed live while dragging (except over a list it will pour into, above). A single dragged card never pushes a column: over a column it drops in, and where it would otherwise cover one it takes the nearest free spot. Dragged columns and groups push everything.
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
- Adding a card with a column selected puts it at the end of that column; with a card inside a column selected, directly below that card; otherwise loose on the board. New checklists and columns start untitled, showing a "List title" / "Column title" placeholder (a list made by dropping items on the board too). A new checklist starts with one blank item and the cursor in its title; Enter there moves the cursor to the first item. A new note gets the cursor in its text, a new column in its title. An empty board shows a centred hint ("Add a note, a checklist or a column from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.") until anything is on it. Escape leaves the field and keeps the block selected.
- The column's trash can opens a small confirmation saying what goes ("Delete “Ideas” and its 3 cards?", or "Delete “Ideas”?" when it is empty; for several columns "Delete 2 columns and their 5 cards?") · Keep column · red Delete column, and then deletes the column and all its cards.
- Toolbar Colour recolours every selected column from 16 swatches (two rows of 8 large 32px chips, table below, each ringed in its own edge tone; if the open menu would cover the block being coloured, the board moves down so it stays in view), plus Default (back to stone-grey). The name of the swatch under the pointer (or of the current colour) shows under the swatches. For selected cards, which stay white, it colours their title band instead, in a deeper shade of the swatch (70% edge tone mixed with its background); a note, which has no title, gets the band across its header strip. Default puts a card's usual band back. It is faded with nothing selected.
- Toolbar Auto-colour gives every column on the board a different colour in one step (undoable). Columns are taken left to right, and colours handed out in this order so neighbours differ clearly: Sky, Peach, Mint, Lavender, Butter, Teal, Rose, Lime, Periwinkle, Coral, Aqua, Orchid, Sage, Sand, Slate, Stone. Colours repeat only beyond 16 columns. Faded when there are no columns.

### Arrows

- An arrow joins one card or column to another (cards inside columns included), to show how they connect. It is a plain line with an arrowhead, no label.
- Drawing one works as in Miro: hovering a card or column (or selecting a single one) shows small round dots, one just outside the middle of each side: soft grey, fading in after a moment so passing over cards doesn't flash them, and amber and a little bigger under the pointer. A dot that would lie over another card or column, or over the title strip of the column a card sits in, isn't shown, so dots don't cover text (a card in a column usually keeps its side dots, and any dot draws the same arrow). When every dot would be covered (a block boxed in by others, or the board zoomed far out), the least covered one still shows, so an arrow can always be drawn. The dots stay while the pointer moves out to them, also across the column a card sits in; a dot lying over another card gives way to that card. Drag a dot onto another card or column (it gets a dashed amber outline) and let go. Letting go anywhere else, or clicking a dot without dragging, draws nothing. A block can't point to itself, a column and a card inside it can't be joined, and two blocks are joined at most once. On a touch screen (no hover) the dots show on the selected block.
- The arrow is a smooth curve from the middle of one block's side to the middle of the facing side of the other: left / right sides when the blocks are further apart side to side than up and down, otherwise top / bottom. It leaves and arrives square to each side, a small gap clear of the blocks, and follows them as they move, grow, collapse or change column (a card in a collapsed column points from its column), switching sides as they move round each other. It isn't drawn while the two blocks overlap or nearly touch.
- Clicking an arrow selects it (amber, with a × in its middle); Delete, Backspace or the × removes it; Escape or clicking the board lets it go. Deleting a card or column deletes its arrows.
- Drawing and deleting an arrow are each one undo step. Arrows are saved and synced with the board. They are not copied with copied or duplicated cards.

### Text formatting

- Every text box can be formatted as a whole: card titles (checklists and links), note text, checklist items and column titles. Not a link's address, nor the board name. Formatting always covers the whole box, never single words.
- Choices: size Small / Normal / Large (Normal is the usual size; they scale with A− / A+, so Large stays larger than the text around it), **bold**, *italic*, and a typeface: Plex Sans (the usual one), Serif, Rounded, Handwritten, Typewriter. No colours.
- Highlighting any text in a box shows a small bar just above it with B, I, the three sizes and a Font menu (each font shown in its own style). Its buttons format the whole box; hovering the bar outlines what it will change. With checklist items selected, the bar shows above them and formats all of them.
- While typing: Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+> larger, Ctrl+Shift+< smaller, on the box you are in (with or without highlighting). With checklist items selected, they format those items; with whole cards or columns selected, every text box in them. Bold and italic turn on for all unless all already have it, then off for all.
- Formatting is saved with the board, syncs, is one Ctrl+Z step, and is kept by copy, duplicate and paste. Enter keeps it on both halves of a split item (and on the new item below); joining two items keeps the first one's formatting. Ticked items and items in the Completed card keep it. Text copied to other apps is plain.

## Checklists

A checklist is an editable title plus a tree of items up to 6 levels deep, with finished top-level items gathered in a Completed section.

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
- **Ctrl+Shift+Backspace** (with the Control key on a Mac too, since ⌘+Shift+Backspace there is the browser's Clear browsing data; not while typing in a text field) deletes every item in the Completed sections of the open board's lists, with their sub-items. Other boards (sub-boards too), open items, ticked sub-items under open items and the Completed card are left alone. It always asks first, below the toolbar in the column confirmation's style: "Delete 12 completed items?" ("Delete 1 completed item?"; the count includes sub-items) · Keep · red Delete. Escape keeps them, and other board keys wait until it is answered. Delete is one undo step: Ctrl+Z brings them all back. A list left empty gets one blank item. With nothing completed, nothing is deleted and a short note, "No completed items on this board", shows for a moment. On a shared board it works like any other edit. It does nothing while an old version is being looked at.
- **Clean up** (just left of Uncheck all) does the toolbar's Clean up for this list only: its ticked items (the Completed section and ticked sub-items) move into the board's Completed card under today's date (see "Clean up and the Completed card"); other lists are left as they are. The list stays selected. One undo step. On a card too narrow for all three, Clean up and Uncheck all go on the line below, still at the right.
- Web addresses (http://, https:// or www.) typed in a note show as links under its text (the address without https:// and www., opening in a new tab); Ctrl+click (⌘+click) on an address in a note or a checklist item opens it too.
- With motion allowed, an item on its way to Completed shows ticked and eases down and out (280ms) before moving, then fades in at its new place with a brief amber tint (450ms). With reduced motion it moves at once. Undo right after ticking undoes the tick.
- Trash deletes that item and everything nested under it. If a list becomes empty, a blank item replaces it.
- Exception: deleting an item with no text (trash, Backspace or Delete) keeps its sub-items if any of them has text; they move up one level into its place. Cut (Ctrl+X) always takes sub-items with the parent.

**Dragging items**

- Drag the grip to move an item and all its sub-items: before/after another item (amber line), nested under an item (drop slightly right; amber tint), into another list, or onto empty list space (appends; the whole card, top included, gets a dashed amber outline).
- Dropping on empty board space (or on a note, link or open column) creates a new untitled checklist at that spot with the dragged items (the dragged label says "Drop to make a new list"). Dropped on a collapsed checklist, they go in at its end (ticked ones into Completed); it stays collapsed and gets the dashed amber outline while they are over it. Dropped on a collapsed column, they become a new untitled checklist at the end of that column, which opens.
- A list emptied by the drag (every item dragged out, one at a time or several selected, into another list or onto the board) is gone, title or not, and the list that took them is selected. One undo brings it back.

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
- The Completed card can never be deleted: it has no trash can, the Delete key skips it, and deleting a column it sits in leaves it loose where the column was. It is never copied. It can be moved, collapsed, resized and put in a column like any card.
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
| Delete / Backspace | Delete the selection; if it includes a column, the same confirmation as the column's trash can appears first, then columns go with their cards |
| Ctrl + Shift + Backspace (Control on a Mac too) | Delete every item in the Completed sections on the open board, after asking (see "Completed section") |
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

- The published site updates when the owner says "publish", or by itself shortly after a low-risk pull request (one that doesn't touch saving, sync, undo or deleting) is merged and passes its tests.

- The published site shows only a "Sign in with Google" screen until someone signs in; sign-in is remembered on each device. It is open to everyone: any Google account (with a verified address) can sign in and gets its own private board, synced across that person's devices, which no one else can see, except boards they share (see Sharing and editing together). Under the button: "Your board is saved online with your Google account so it opens on all your devices. Only you can see it." The online rules only accept the fields the app saves, and a board (or a saved version) of at most 900,000 characters; a refused save shows the usual "Couldn't save online" banner. An account the rules turn away anyway is told "This Google account can't open a board" and offered Sign out.
- Every board of a person's own is stored in Firebase (project `note-board-a672a`) in one document per user (shared boards are stored apart, one document per shared board: see Sharing and editing together), holding the same data as the browser save (so the 900,000-character limit is for all of a person's boards together). Which board is open isn't synced. A single board sent by an older version of the app (still open somewhere) only replaces the home board; the other boards are kept. Firestore security rules (`firestore.rules`, pasted into the Firebase console by the owner) allow only the owner's account to read or write it.
- First sign-in: the online board wins; if there is none, this device's board is uploaded. After that, changes reach other devices within a second or two, and the most recent change wins. A change from another device clears undo history and waits for any drag in progress to finish. A change made on this device that hasn't been uploaded yet, or a drop made after the other device saved, counts as more recent: it is kept and sent, and the other device's version is dropped. If the online board can't be read (damaged, or saved by a newer version of the app), it is never shown or overwritten: the page shows "Your board couldn't be loaded" and stops syncing until reloaded. If an upload is refused (for example the board is too big for Firebase), a small red note at the bottom says "Couldn't save online. Changes are on this device only." The next change tries again; the note goes once an upload succeeds, and until then changes from other devices are not applied. Changes are also uploaded straight away when the window is hidden or minimised, not only when it is closed.
- Works offline: once visited online, the page opens without internet; edits are kept on the device and uploaded when the connection returns. A small grey note left of the bottom-right controls says "Saving…" while a change waits to upload, "Saved" once it is online, and "Offline. Will save when you’re back online" without a connection (the red banner shows instead when a save fails). A new version of the site replaces its offline copy, so new icons and files reach returning visitors.
- Installable as an app: in Edge or Chrome the site can be installed (address-bar Install button), giving BusyAnts its own window without an address bar, a Start menu and taskbar icon (a simple chibi ant silhouette on warm yellow), and the same sign-in, sync and offline behaviour. It updates itself whenever the site does. The icon files are named after the app (`busyants-192.png`, `busyants-512.png`, `busyants-maskable-512.png`, `busyants-icon.svg`, and `busyants-apple-180.png` for iPhone / iPad home screens) so a changed icon gets new file names and is fetched again rather than kept from before.
- Running the app locally (`npm run dev`) and the tests stay browser-only, with no sign-in. To try sharing locally, add `?demo-user=Alice` to the address in one window and `?demo-user=Bob` in another (a share link opened as Bob needs `&demo-user=Bob` added): each demo person keeps their own boards on the device, and shared boards go through a pretend server inside `npm run dev` (`src/sync/devServer.ts`), kept until it stops.

## Sharing and editing together (being built, owner request 2026-10-05)

Several people can work on the same board at once, on the published site. Built in steps; this section says which are done.

- **Sharing by link (done, step 2).** The Share button (two people, beside Sign out; on a phone in ⋯) opens a panel for the open board. Any board except the home board can be shared ("Your home board holds all your other boards, so it can’t be shared"): Share this board makes a link, shown with Copy link. Anyone who opens the link and signs in with Google (the sign-in screen then says "Sign in to open the board shared with you.") gets that board and every board inside it, sub-boards added later included; it opens straight away, with no "Join this board?" question (owner decision, 2026-10-06), and stands alone in their Boards menu. Shared boards have a small two-people mark in the Boards menu. The panel lists the people who have it (photo or initial, "(you)", and "Shared it" beside the person who shared it); everyone it is shared with sees the link and can copy it (owner confirmed, 2026-10-06). Changes reach everyone’s screen within a second or two.
  - Only the person who shared it can turn the link off (no one new can join; "Turn link on" makes a new link, and old copies of the link stop working for good), remove someone (after a confirmation; it goes from their screen with the note "“Trip” is no longer shared with you."; if the link is on, it changes in the same step, so the copy the removed person has never lets them back in; a link turned off stays off), rename the shared board (its name box is read-only for the others), delete it (Boards menu, after a confirmation: it is deleted for everyone, who see "“Trip” was deleted by the person who shared it."; boards inside it stay with the person who shared it), or restore an old version of it ("Only the person who shared this board can restore it." shows instead of Restore). Everyone else can change everything on it, sub-boards inside it included, and can Leave this board (after a confirmation).
  - A link that was turned off (or is wrong) shows "This share link doesn’t work. It may have been turned off: ask for a new one." Notes like these show under the toolbar until closed with ×.
  - Online, a shared board (with the boards inside it) is one Firestore document, `shared/{id}` (at most 900,000 characters), apart from the owner’s own boards (`boards/{uid}`, which no longer holds it); `shared/{id}/members/{uid}` lists who has it and `boards/{uid}/shared/{id}` which shared boards each person has. The rules (`firestore.rules`, pasted into the Firebase console by the owner) let only those people read or change it, let someone join only with the current link, and let only the person who shared it change the link, remove people or delete it. Each save counts up by one, so a page can’t save over a version it hasn’t seen. Until the new rules are pasted in, sharing shows "That wasn’t allowed…" and everything else works as before.
  - When a shared board goes from someone's device (they are removed, they leave, or it is deleted), every board is first saved in their Version history, so it can be brought back from there as a board of their own. Leaving happens online in one step: if it doesn't work, nothing changes and the panel says "That didn’t work. Check your connection and try again." (the same note shows when any other change in the panel fails). If deleting a shared board fails, a note says "“Trip” couldn’t be deleted. Check your connection and try again."
  - Until the device knows which boards are shared (the list of shared boards hasn't answered yet), a board on it that came with a shared board kept on the device, or one made meanwhile, is left alone: it is neither sent with their own boards nor removed by a version from their other devices. Other boards left on the device still give way to the online copy on first sign-in, as above.
  - Changes made offline are kept on the device and sent when the connection returns, combined with what others did meanwhile; so are changes made just before the page was closed. The version last agreed with the server is kept on the device for this, and so is the list of shared boards the device has, so they are known as shared as soon as the page opens, before the server answers.
  - **A share never takes your own boards** (security review, 2026-10-06). A shared board only ever holds the boards in its own online data, plus sub-boards made inside it on a person's own screen (with the boards inside those). Whatever anyone saves in it online can't take, replace or delete one of the boards of the person who opens it: a board card in it pointing at one of your boards doesn't bring that board in (even once moved to another of its boards), and nor does a board card you paste or move onto it that opens a board that was already one of yours: only a sub-board made inside the shared board joins it; the card just opens your board, for you only (main session check, 2026-10-06), a board in it with the id of one of yours is left out on your screen (your own stays as it is; the one exception: the first time the person who shared it opens it on another of their devices, the share takes over that device’s old copy of the board and the boards inside it), and a link whose shared board is one of your own doesn't open ("This share link doesn’t work…"). A later version without its shared board isn't taken (the boards stay as they were). The shared board itself can't go from a device by any other way than deleting or leaving it: if it does (undoing its making, say) it comes straight back, and its deletion is never sent to everyone. A deleted share's records of who had it go with it, and a page that finds someone else's share under a deleted one's id treats it as deleted.
- **Edits are combined (done, step 1: `src/model/merge.ts`).** When two people change a board at the same time, every change to different things is kept: different cards, different parts of one card (its text and its position, say), different checklist items, cards both added to one column, arrows both drew. Only when both change the very same thing (the same text box, the same card's colour) does the later change win. A card or item one person deletes while the other is changing it is kept, so nothing typed is lost. The combined board always keeps the board's rules (every card in one place, every item in one list, no arrow to a missing block).
- **Undo (planned, step 3).** Ctrl+Z undoes only your own changes, and changes from other people no longer clear undo history.
- **Who's here (planned, step 4).** Small round photos of everyone who has the board open; a coloured outline with the person's name on any card or column they're typing in or dragging.
- **Version history (planned, step 5)** for shared boards: for now every page keeps its own versions (holding the shared boards too), and only the person who shared a board can restore it.

## Look and feel

Professional but with colour: white cards and soft-tinted columns on a warm neutral canvas, thin borders, soft shadows, one amber accent, all in the warm honey tones of the BusyAnts icon (an ant on yellow).

- **Type:** IBM Plex Sans (400, 500, 600). Titles 14–17px semibold, body 14px.
- **Canvas:** #FAF6EC (warm cream) with #D6CBB0 dots every 20px (fainter when snapping is off). Toolbar soft honey #FFF1C2 with a #ECD897 bottom border, the BusyAnts ant (the app icon) at its left before the board name; the browser / app title bar takes the toolbar colour. Dark mode: toolbar #2A2416, canvas #1D1B17.
- **Accent:** amber-brown #8A5A00 (dark mode: honey #F2C14E) for selection, active tool, drop lines and New column; its soft tint #FFF1C2 (dark #3A3020) for title bands and pressed buttons. Destructive actions use #A3263F.
- **Cards:** white (#FFFFFF), 10px radius, 1px #E2DDD4 border, shadow 0 1px 2px at 6%. Columns: 12px radius, #EFECE6 unless recoloured; the swatches below are for columns.
- **Dark mode:** the toolbar's moon button switches between light and dark (pressed = dark; it shows the same pressed look as Snap to grid: soft honey with an amber border). A first visit on a device follows the computer's light / dark setting; once the button is pressed, that device remembers the choice (it is not synced, not saved with the board, and not undone by Ctrl+Z). Dark mode changes only colours: canvas #1C1B19 with #45413B dots, toolbar #232220, cards #2B2926 with a #3D3A35 border and #ECE8E1 text, accent amber #5FB3AB. Columns use a deep, muted shade of each swatch (`DARK_PALETTE` in `src/model/theme.ts`, same names; uncoloured columns #2A2825), and the Colour menu shows those shades. Every dark column colour keeps at least 7:1 contrast with the text. Faded toolbar buttons fade a little less in dark mode (55% instead of 45%; Undo/Redo 50% instead of 40%). Placeholder text is #736C62 in light mode and #A39D93 in dark mode, readable at about 4.5:1.
- **States:** selection = 2px solid amber outline; size match = 2px dashed amber; a list about to take dragged items (or a whole dragged list) at its end = 2px dashed amber around the whole card; dragging = 2.5px amber border with glow; no focus rectangles on text fields (buttons and tick boxes keep a keyboard focus ring).
- **Accessibility:** tick boxes, resize handles and the item grip can be pressed within at least 24×24px (the drawn handles stay small). Screen readers hear cards as "Checklist: Groceries" / "Link: …" / "Note" and columns as "Column: Week" ("Untitled …" when there is no title); the board area is called "Board". Placeholders: "Add an item" for a blank checklist item, "Paste a link address" for a link's address.

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

**Not in version 1:** image cards. (Several boards and boards inside boards were added on 5 Oct 2026, arrows between blocks since, and sharing and real-time collaboration are being built from 5 Oct 2026.)

**Decisions (1 Oct 2026)**

- The Delete key asks for confirmation when the selection includes a column.
- Version 1 supports one board only (changed on 5 Oct 2026: several boards, and boards inside boards).

Later decisions, with dates and reasons, are listed in `docs/decisions.md`.

## Phone layout

- Windows under 600px wide (phones) use a phone layout; tablets and wider windows keep the desktop layout. Touch screens of any size follow the touch rules for checklist items above.
- The top bar shows the Boards button (icon), the path back up when inside another board, and the board name. A bar along the bottom holds Undo, Redo, a large + and ⋯.
- + opens a menu: Note, Checklist, Column, Sub-board (Add a sub-board here). Choosing one adds it (as the desktop buttons do) and closes the menu.
- ⋯ opens a panel above the bar with every other toolbar control: Hand / Select, text size A− / A+, Snap to grid, Colour (its swatches open inside the panel), Auto-colour, Collapse all, Same width, Clean up, Import, Due today, Focus timer, Google Calendar (signed in), Dark mode and, on the published site, Share and Sign out. Tapping outside it closes it.
- The zoom control and the ? button are not shown on a phone (two fingers pinch to zoom; there is no keyboard). The "Saving…" / "Saved" note sits just above the bottom bar.
- While typing in a checklist item on a phone, a row of buttons sits just above the on-screen keyboard: Outdent, Indent, Move up, Move down, Tick and Delete (the same as Shift+Tab, Tab, Ctrl+Shift+Up / Down, the tick box and the trash). Pressing them keeps the cursor in the item, so the keyboard stays up. The row goes once nothing is being typed in.
- On a phone, when the keyboard (or the item buttons) would cover the text box being typed in, the board moves up so it stays in view.
- On touch screens the small card controls (collapse, the card's trash can, the item grip and trash, the resize corner) can be pressed a little outside their drawn edge. The resize corner's extra area lies outside the card, so it never takes a press meant for the last item's grip.
- On a touch screen, one finger moving straight away over a card, a column or a resize handle moves the board around (nothing is moved or resized by accident). Resting the finger for about half a second first, then moving, drags the card or column (anywhere on it, its text included), or resizes from a resize handle. A quick tap still types. Checklist items still move by their grip, which drags at once; tick boxes and buttons keep their own meaning. No copy / paste menu appears from the hold, and dragging a finger over checklist items no longer selects them.

## Version history

- Like Google Docs, earlier versions of the board are kept and can be looked at and restored. On a computer it opens from a clock button beside ? (bottom right); on a phone from ⋯ → Version history.
- A version holds every board. A version is saved automatically: when editing starts again after 10 minutes without an edit on any board, every board as it was just before is saved (and during a long stretch of editing, once an hour). Undo and redo count as edits; blocks re-arranging themselves don't. A version that couldn't be saved (offline, say) is tried again a minute later. The board on screen is always the "Current version". Changes arriving from another device don't save a version there (that device saves its own). A version the same as the newest one isn't saved again. The newest 100 versions are kept online; a board kept on one device only (no sign-in) keeps 20, since each is a whole copy of the board and device storage is small.
- On the published site, versions are kept online with the board (shared by every device the owner signs in on); otherwise, on the device.
- The list shows "Current version", then earlier versions grouped by day (Today, Yesterday, then the date), newest first, each with its time and what was on the boards (e.g. "12 cards · 3 columns", or "2 boards · 12 cards · 3 columns").
- Picking a version shows the open board as it was then (empty if it didn't exist yet), read-only: the board can be moved around and zoomed, but nothing can be changed. A bar shows when it was saved, with Back to current and Restore this version. Escape goes back to the current board, then closes the history. On a computer the list stays at the right; on a phone it fills the screen and steps aside while a version is shown (Back to current brings the list back).
- On a shared board only the person who shared it can restore (see Sharing and editing together). Restoring first saves every board as a version (so nothing is lost), then puts the open board back as it was in the chosen version, as one change: Ctrl+Z (or Undo) brings back the board from before the restore. Boards deleted since that version come back too (they stand alone in the Boards menu); other boards are left as they are.

## Focus timer (owner request 2026-10-06)

- A Pomodoro timer for focused work. The round stopwatch button by the zoom control (right of Version history; on a phone ⋯ → Focus timer) opens it in the **side panel**, a plain panel at the right of the board. It shares that spot with Version history and Due, one at a time (opening one closes the other), and fills the screen on a phone. Escape, its × or the button again closes it; an Escape meant for something else (leaving a text box, closing a date picker or the shortcuts list, cancelling a "Delete …?" question) leaves it open.
- The classic cycle: a 25-minute focus round, then a 5-minute short break, and after every 4th focus round a 15-minute long break, then round 1 again. The panel shows which it is ("Focus · Round 2 of 4", "Short break · Round 2 of 4"), the time left in large figures (25:00), and **Start** (**Pause** while running), **Reset** (back to the full length of this round, stopped) and **Skip** (on to the next round straight away, counted as done).
- When a round ends, the next round is set up at its full length and waits for Start. A short, soft chime plays (made in the browser, no sound file), unless "Chime when a round ends" is unticked in the panel. If the tab is behind another, a browser notification also shows ("Focus round done" / "Break over", with what comes next), once notifications are allowed: the browser asks once, on the first Start. Skip and Reset don't chime.
- It keeps running with the panel closed: the stopwatch button then widens to show the time left (18:42), also while paused; on a phone the ⋯ line shows it. It keeps going across a page reload (the time the round ends is kept, not a counter); a round that ended while the page was closed has moved on when it opens, without a chime.
- The lengths (Focus, Short break, Long break, whole minutes from 1 to 120) can be changed in the panel; a stopped round takes the new length at once, a running or paused one keeps the time it has left. A box left with anything else goes back to the length in use. Lengths, the chime setting and the timer are remembered on this device (`note-board:pomodoro`), the same for everyone using this browser: not part of any board, not undone by Ctrl+Z, not synced. Missing or damaged saved values fall back to the defaults, and a saved round with more than 120 minutes left (the computer's clock was wrong) starts again as a stopped first focus round. With BusyAnts open in two tabs, each follows what the other does with the timer, and only one chimes.

## Google Calendar (owner request 2026-10-06)

- Someone signed in can see their **primary** Google Calendar beside the board. The round calendar-page button by the zoom control (right of the Focus timer; on a phone ⋯ → Google Calendar) opens it in the side panel, sharing that spot with Version history, Due and the Focus timer (one at a time; full screen on a phone). Escape, its × or the button again closes it; an Escape that answers a "Delete …?" question in it leaves it open. Without anyone signed in (running locally) there is no button.
- **Week** (Monday to Sunday, each day with its events: all-day ones first, then by start time, times on the 24-hour clock, "10:00 – 11:00") and **Month** (a grid of days, Monday first, a dot on days with events; clicking a day lists its events under the grid). ‹ / › go back and forward a week or a month, **Today** comes back; the open view starts on today each time the panel opens.
- **Simple events** (not repeating, no guests, no reminders of their own, the person's own) can be changed: the + beside a day adds one (an hour from 9:00 that day), clicking one opens a form with Title, All day, Starts (date, time) and Ends (date, time); changing the start date moves the end date with it, so moving an event keeps its length. Save sends it to Google; an end not after the start says "The end must be after the start." **Delete** asks first, in the column confirmation's style: "Delete “Dentist”?" · Keep · red Delete.
- Other events (repeating ones, ones with guests or invites, with their own reminders, someone else's, or Google's special kinds like Out of office) are shown read-only, marked with a small open-in-new icon: clicking one shows its day and time, says they can only be changed in Google Calendar, and has **Open in Google Calendar** (a new tab; only links into Google Calendar are opened).
- Calendar events aren't board data: they are not undone by Ctrl+Z, not in Version history, not saved with or synced as boards. Several calendars, answering invites, reminders and links to board cards are not in this version.
- **Access:** calendar permission (`calendar.events`) is asked for only when the panel first opens, not at sign-in, through Google's own window (Google Identity Services, whose script loads once the button shows, so the click opens the window without a wait that browsers would block); after agreeing once, a fresh access (about an hour each) comes without asking. The access is kept in memory only (never saved on the device) and is dropped on sign-out. The OAuth client ID is `VITE_GOOGLE_CLIENT_ID` in `.env.production`. When the calendar can't be reached (not set up yet, access refused, offline), the panel shows one plain note, "Google Calendar isn’t connected yet. Try again later.", with **Try again**; a change Google refuses says "That change didn’t reach Google Calendar. Try again later." Nothing else is affected.
- Locally, `npm run dev` with `?demo-user=Alice` shows a pretend calendar (`src/calendar/devServer.ts`, one per demo person, kept until the dev server stops): "Dentist" today 10:00–11:00, "Team stand-up" every day 09:00–09:15 (repeating), "Lunch with Sam" tomorrow (with a guest) and "Holiday" all day in three days.

## Claude connector (owner request 2026-10-06, read-only part)

- A local MCP server (`mcp/`, built to `mcp/dist/server.js` by `npm run mcp:build`) lets Claude Desktop and Claude Code read the owner's boards. Plan and the owner's decisions: `docs/plans/mcp-connector-plan.md`; setup steps: `mcp/README.md`. It is not part of the web app.
- **Sign-in:** `npm run mcp:login` opens a page on this computer only (localhost, a random port, a one-time code in its address) with **Sign in with Google**; the Firebase refresh token is saved in `%APPDATA%\busyants-mcp\token.json` and swapped for an id token (1 hour) when needed, so `firestore.rules` apply as in the app. `npm run mcp:login -- --key <key>` uses a second API key instead of the app's web key (for when that key only works from the site's address). `npm run mcp:logout` deletes the file; the running connector reads the saved sign-in on every call, so a logout stops it reading at once and a new sign-in is used without restarting it. Claude Code may not read it (deny rule in `.claude/settings.json`).
- **Tools (read only):** `list_boards` gives each board's name, id, the board it sits inside, home or shared ("shared by Erika, read-only"; "shared by you" for one the owner shared) and its counts of columns, cards and open items. `read_board` (by id, or by name when only one board has it; otherwise it lists the choices) gives an outline: columns left to right with their cards top to bottom, then loose cards top to bottom; checklists with ticks, nesting, due dates, ids and their Completed section; notes (quoted), links, board cards and the Completed card. Failures (not signed in, sign-in expired, key restricted, permission denied) come back as plain error text.
- **Check:** `npm run mcp:check` reads only and prints the account, the board count (and how many are shared) and "Safe to edit: yes / no (reason)": yes only when the saved data reads as boards and writes back exactly as it was (`safeToEdit`), so a later version that changes boards never drops data from a newer app. With no sign-in it says "Not signed in. Run npm run mcp:login first." and fails.
- Changing boards (adding, editing, ticking, moving items, adding notes) is the next part (job B in the plan), not built yet.

## Search

- Ctrl+F (also while typing in a card) opens the board's own search bar instead of the browser's; so does the magnifier button beside the clock button (bottom right), and ⋯ → Search on a phone. The bar sits at the top right (across the top on a phone).
- It looks in column titles, list and link titles, checklist items (sub-items and ticked items too), notes, link addresses and the Completed card, ignoring upper / lower case. Matches are taken in board order: columns left to right (their cards top to bottom), then loose cards top to bottom.
- Every match is marked in yellow inside the text, the current one in orange; the bar shows e.g. "2 of 7", or "No matches". Enter / ↓ / the down arrow button go to the next match, Shift+Enter / ↑ / the up arrow button to the previous one (wrapping round). The board moves so the current match is in the middle of what can be seen (above a phone's keyboard), zooming in to 100% first if the board is zoomed out below 60%.
- A match out of sight (in a collapsed card or column, or a closed Completed section) marks that card or column with an orange ring instead, and the count says "in a closed card"; nothing is opened by itself. A match in a link address rings the address box.
- Escape or × closes the bar and the marks go.
