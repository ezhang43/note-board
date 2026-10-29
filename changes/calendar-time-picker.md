## Calendar: our own time picker, like Google Calendar's (2026-10-29)

- The Start and End time boxes in the calendar's New event and Change event forms (the quick-add and the full form) no longer use the browser's own time dropdown, whose minutes sat off-centre from the hours. They are now a text box showing the time as "2:00 PM" that opens a list of times every 15 minutes, with the current time in view and highlighted.
- The End list starts right after the start and shows how long each option makes the event: "2:15 PM (15 mins)", "3:00 PM (1 hr)", "4:30 PM (2.5 hrs)".
- A time can also be typed ("2:10pm", "14:10", "9") and is taken when you leave the box or press Enter; a time it can't read goes back to what it was.
- Keys: ↑ / ↓ move through the list, Enter picks, Escape closes just the list (the next Escape closes the form). A click outside closes the list. On a phone the options are big enough to tap (44px) and the text doesn't make the page zoom.
- Changing the start still moves the end with it, keeping the event's length.
