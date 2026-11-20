## Less waiting after saving a calendar event (2026-11-20)

- Saving one event was already shown at once. What still felt slow came after it: every save threw away the weeks the panel had fetched ahead, so the next week (or going back to this one) showed "Loading…" until Google answered again. Now, once Google has the change, those weeks are fetched again quietly, and stepping after a save is instant again (about 0.96 s down to 0.14 s on a slow connection).
- "All events in the series" still waits for Google, but the Save button now says "Saving…" while it does, and the form closes as soon as Google has the change instead of also waiting for the whole calendar to be fetched again (about one round trip to Google sooner). The list then updates by itself a moment later; until it does, that series' events show as still on their way and can't be changed again.
- Nothing changes in what is sent to Google, in the questions asked before saving, or in Undo.
