## An item's trash can keeps the cursor in the list (2026-10-29)

- Pressing a checklist item's trash can (by clicking it, or with Enter from the keyboard) used to leave the cursor nowhere, so the next Delete deleted the whole card. Now the cursor moves to the item above (or the one below), just like Delete in a ticked item.
- Deleting a list's only item leaves one blank item with the cursor in it, so Delete never reaches the card.
- With items selected in several lists, the trash can removes them all as before, and the cursor goes to its own list.
- The same fix for Delete or Backspace with several items selected (by Shift+click or dragging): the cursor goes to the item above, so pressing Delete again no longer deletes the card.
- Holding Enter on a trash can removes just one item; the held key doesn't then add blank items to the item above.
