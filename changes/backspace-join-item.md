## Backspace at the start of a checklist item joins it to the item above (2026-11-11)

- Pressing Backspace with the cursor at the very start of a checklist item now joins its words onto the end of the item above it, with the cursor where the two meet. Before, nothing happened. It is the mirror of Delete at the end of an item.
- A first sub-item joins onto its parent. The joined item's own sub-items move up one level. A ticked item joins like any other; the result stays ticked only if both were. One Ctrl+Z undoes it.
- On the first item of a list nothing happens, and Backspace on an empty item still deletes it, as before.
