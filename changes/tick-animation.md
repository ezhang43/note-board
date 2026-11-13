## A small animation when you tick an item (2026-11-13)
- Ticking a checklist item yourself (its box, a tap, or Ctrl+Enter) now plays a short animation: the box presses in and settles back while its tick grows in, and the strike-through and fade ease in. It takes about 200ms and nothing moves.
- It plays only for the item you ticked. Unticking, undo and redo, loading, changes from another device, Clean up, and a parent ticked because its sub-items were do not play it.
- It plays even if your device asks for reduced motion, as you asked.
- Nothing about saved boards changed.
