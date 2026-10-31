## Journal text size is a number box (2026-10-30)

- In the Journal's Aa menu, Size is now a box showing the size of the selected words in px (16 is normal), like Google Docs, instead of Small / Normal / Large.
- − and + beside it make the words smaller or larger one step at a time (10, 12, 14, 16, 18, 20, 24, 28, 32, 36), stopping at 10 and 36. Clicking the number opens that list to pick from.
- Words made Small or Large before keep their look; the box shows them as 14 and 21.
- Pressing Enter keeps the size: the next line, or the next list item, is typed in the same size (after a heading it goes back to normal).
- **Behind the scenes:** boards are now saved as version 4. A copy of the app from before this change (an old tab, say) refuses them and asks for a reload instead of quietly dropping the new sizes. The Claude connector needs its newest `busyants.mcpb` (built with `npm run mcp:pack`) to read and change your boards again.
