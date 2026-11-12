## A time-estimate clock on every checklist item (2026-11-11)

- Each checklist item now has a faint clock button at the far right of its hover buttons (after the drag grip and the trash can). Click it to give the item an estimate: 15m, 30m, 45m, 1h, 2h, or your own minutes, the same box notes use. Setting or clearing is one undo step.
- On a phone the clock shows while you are typing in the item, with a full-size touch area, next to the grip.
- To make room, the free space at the right end of every item is 26px wider. A parent's "0/2" count still stays on the text's last line and never covers the clock; on a phone the free space grows a little more (16px at Normal text, more at bigger sizes) so a count like "0/12" always fits before the clock. At the biggest text sizes (225% and up) items show no clock, as notes don't.
- Fixes to the estimate box: after Ctrl+Z inside the Minutes box it shows the undone value, so Enter no longer puts it back; pressing the pill again to close the box keeps the keyboard on the pill; and selecting from one item into the next and deleting now keeps the lower item's estimate when the upper one has none, as joining with Backspace does.
- The box no longer re-measures itself on every change to the board, and every item row no longer listens for it opening.
