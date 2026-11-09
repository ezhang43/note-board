## Fold a checklist item's sub-items (2026-11-09)

- An item that has sub-items now has a small arrow just left of its tick box. Click it to hide its sub-items, and click again to show them. The item keeps its "1/3" count while folded.
- Ctrl+Up hides and Ctrl+Down shows the sub-items of the item you are typing in (⌘+Up / ⌘+Down on a Mac). The arrow can also be reached with Tab and pressed with Enter or Space.
- The fold is saved with the board. It stays after a reload, syncs to your other devices, and is kept in backups, exports, Version history and copied items. Ctrl+Z undoes each fold or unfold.
- Collapse all / Expand all leave item folds alone.
- The arrow keys, Enter and selections skip hidden sub-items. Copy, cut, delete, drag and move take them along. Search finds them and rings the folded item ("in a folded item") without opening it. Clean up still moves hidden ticked items to Completed.
- On a phone the arrow can be tapped across a 44px area without touching the tick box.
- Ctrl+Up / Ctrl+Down only take the key when they fold or unfold something. Otherwise the key does what it always did (jump by paragraph; on a Mac, to the start or end of the text). The arrow darkens on hover.
- When the Claude connector deletes or moves out an item's last sub-item, the fold goes too, as in the app.
- **For the owner, after this goes live:** update the Claude connector's local copy (pull the latest code in its folder). An older connector refuses to edit boards that have folded items.
