## An open sub-item added under a ticked item unticks it (2026-11-03)

- When a checklist was fully ticked and you added a new sub-item (Enter at the end of its last sub-item, or Enter at the end of the parent), the new item was open but the parent stayed ticked. Now the parent, and any ticked item above it, is unticked right away, since it is only complete once every sub-item under it is. Ticked siblings stay ticked.
- The same goes for Enter at the start of an item, Enter over highlighted words, and pasting copied items or Journal lines under a ticked item.
- Ctrl+Z undoes the new item and the unticking together. Ticking the last open sub-item still ticks its parent.
