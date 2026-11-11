## A parent item's count never drops to its own line (2026-11-11)

- The "0/2" after a parent checklist item used to fall to a line under the text when the item's last line was nearly full, making the item one line taller.
- It now always stays on the text's last line. When that line is full, the count sits in the empty space at the right end of the row (where the drag and trash buttons show on hover), so the text wraps exactly as it would without the count.
- No card or container changes width.
