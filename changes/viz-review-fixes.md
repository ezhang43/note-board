## Visualizer and calendar fixes (2026-11-15)

- Calm mode in the Visualizer now draws its picture once and stops, instead of redrawing the whole screen about 60 times a second. It draws again only if the window changes size.
- A calendar event marked "tentative" no longer counts as done in the Visualizer. Only confirmed events do.
- If a calendar is so full that the Visualizer cannot read all of it, it now keeps the newest events and leaves out the oldest, instead of the other way round.
- After signing out and signing in again in the same tab, the Visualizer no longer opens by itself.
