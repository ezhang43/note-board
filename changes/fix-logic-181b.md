## Board-logic fixes from the review (2026-10-22)

- Resizing a card from a top corner no longer throws a taller neighbor beside it up off the board; it slides sideways like the left or right edge does.
- A board that somehow holds two Completed records (two devices cleaned up before syncing) now shows, searches and restores the items of both; the next Clean up or restore folds them into one.
- An open item can no longer end up under a ticked one: Tab (one item or several) or a drag that nests it there unticks the items it is under, so Clean up never sweeps away something you never ticked.
- Tab, Shift+Tab and bold on a thousand selected items are now instant (they took over a second each), and a big pile of blocks tidies itself in a fraction of the time.
- Turning Snap on moves a block that lands on another to the nearest free spot instead of dropping it a row down, and it is one Ctrl+Z; collapsed heights snap too.
- Collapsing a block can no longer send two pushed blocks to the same spot.
- Importing a web page that holds a bare address with brackets in it keeps the address whole.
- Importing a file while an old version is shown puts the old version away and adds the cards, instead of saying it worked and doing nothing.
- Clean up or restore into a container that is gone no longer leaves a broken card.
- The resize label keeps "same height as 2 blocks" after a left or top edge snaps.
- Removing the last weight from a Weight card that holds other text, then saving a weight, uses that card again instead of making a second one.
- Template containers sit on the grid, 20px apart instead of 24.
- An event of zero length at exactly midnight now shows on its day.
- Download as text keeps a multi-line item inside its item and escapes "[" and "]" in a link title.
- A card you drag before it has been drawn shows a card-sized landing outline, not a container-sized one.
- Boards already saved are unchanged. Nothing about how saving, sync or undo work was touched.
