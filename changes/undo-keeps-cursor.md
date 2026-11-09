## Undo while typing never leaves Backspace free to delete the card (2026-11-09)

- Pressing Ctrl+Z or Ctrl+Y while typing in a checklist item, when the undo took that item away (for example a new item you had just added), used to drop the cursor onto the page. The next Backspace then deleted the whole checklist card. Now the cursor goes to the nearest item still shown in the same list: the one above, else the one below.
- If the undo moves the item (up or down its list, or to another list), the cursor follows it, at the same place in its text.
- If the undo collapses the list (or its container), so no item is shown, every selected block is let go, and Backspace or Delete deletes nothing.
- The phone's item bar Undo works the same way, and no longer puts the cursor into an item hidden in a collapsed card (where the keyboard closed).
- Clicking the toolbar's Undo or Redo (or the Undo message's Undo, or tapping Undo or Redo in the phone's top bar) while typing in a checklist item, a note or a title now keeps the cursor there, so the same rules apply. Before, the keyboard moved to the button with the card still selected, so the next Backspace deleted the card.
- Highlighted words in the item stay highlighted after an undo that doesn't change that item. When the undo or redo changes the item's text, the cursor goes to the end of it (as it did before this change; a redo of typing put it in the middle).
