## Pasting no longer pushes neighbors straight down (2026-10-22)

- When you paste (or duplicate) blocks and the copy lands on top of another block, that block now moves to the nearest free spot, as the spec always said, instead of being pushed straight down below the copy. Blocks that grow (expanding a card, typing, a container filling up) still push what is below them straight down.
- Boards already saved are unchanged. Only where a block settles after a paste differs; nothing about saving, sync or undo changed.
