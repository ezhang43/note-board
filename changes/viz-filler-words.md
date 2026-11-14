## Visualizer: filler items are not counted (2026-11-14)

- Items that mean nothing on their own are no longer counted in the Visualizer: "meow", "nowww", "test", "asdf", "lol", "ok", "stuff", "untitled", a single letter, or text with no letters at all ("1", "!!!", a check mark). Time words such as "today" and "now" were already skipped; stretched spellings ("todayyy") and short forms ("tmrw", "2day", "rn") are skipped too.
- Real short tasks still count: "gym", "eat", "run", "tax", "vet". Only the whole text is checked, so "Test the smoke alarm" counts.
- As before, a skipped item's ticked sub-items still count, and Sort with AI never sends a skipped item. Other screens' counts do not change.
- Ticked items at every level count, middle levels as well as the lowest.
