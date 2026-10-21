## Interface fixes from the review, the rest (2026-10-21)

- The welcome tour now really covers the board: keys (Delete, Ctrl+A, Ctrl+D, H, V, Ctrl+F) and paste pressed while it is up no longer change the board or open the search behind it.
- The "Looking at an earlier version" bar keeps clear of Version history when you widen the panel.
- "Couldn't restore it" now stays with the version it failed on, instead of showing on the next version you look at.
- The Boards menu closes with Escape (and leaves a side panel open behind it). Escape with the keyboard on a Search bar button closes the Search bar and not the panel behind it.
- Zoom keys (Ctrl and +, -, 0) typed in the Search box zoom the board, instead of zooming the whole browser page.
- The Search box no longer draws a focus rectangle. Ctrl+F while the keyboard shortcuts list is open (for example while recording a key) no longer opens the search behind it.
- The Share panel says "Copied" only for the link that was copied, and only if the copy worked.
- A container with one card is read out as "1 card" by screen readers.
- Small tidy-ups: the format bar sets up its listeners once, a phone's pending timer is cleared, one phone-size rule and a misplaced comment were fixed.
- New browser tests for all of the above, plus guards for dark mode of the panels, Tab focus rings, the Hand tool after a reload and the always-visible card buttons on a tablet.
