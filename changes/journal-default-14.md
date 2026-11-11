## Journal text is 14 by default (2026-11-11)

- Normal Journal text is now 14px, in new notes and in notes written before. The Size box shows 14 for it.
- Words you gave a size on purpose keep that size. Headings look exactly as before (the Size box shows 16 for a plain heading).
- 16 is now a size of its own: choosing 16 makes the words a little bigger than normal, and choosing 14 takes the size off. Pressing Enter still carries the size to the next line.
- Words made Small or Large long ago keep their look (they show as 14 and 21).
- Checklist items copied into the Journal: Small now comes in as 12, one step under normal text.
- **Behind the scenes:** boards are now saved as version 5. A copy of the app from before this change (an old tab, say) refuses them and asks for a reload instead of quietly dropping a size of 16. The Claude connector needs its newest `busyants.mcpb` (version 1.6.0, built with `npm run mcp:pack`) to change your boards again; until then it says "Safe to edit: no" and changes nothing.
