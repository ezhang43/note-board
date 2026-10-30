## A soft "Event added / saved / deleted · Undo" message in the calendar (2026-10-29)

- After you add, change or delete an event in the Google Calendar panel, a small message appears at the bottom of the screen, like Google Calendar's: "Event added", "Event saved" or "Event deleted", with an **Undo** button. It is the same message the board shows after a delete, and it goes by itself after 6 seconds.
- **Undo** takes the change back in Google Calendar: a new event is removed, a changed event gets its old title, times and guests back, and a deleted event (one, or a whole repeating series) comes back as it was.
- If Undo of an "All events" change only half reaches Google, the calendar is fetched again so it shows what Google has, and the message says so.
- Deleting an event someone already deleted in Google Calendar shows "Event deleted" without Undo, so it can't be brought back by mistake.
- Undo never emails guests. Guests who were emailed about the change are not told it was undone.
- Only one message shows at a time: a newer calendar or board message replaces the older one.
