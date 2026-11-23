## Partial-match search in Google Calendar (2026-11-23)

- Calendar search now finds events on partial word matches (prefix, middle, suffix, multiple partial words, or part of a guest email — like typing "dent" for "Dentist" or "yak" for "Kayaking lesson"), even when Google Calendar's built-in `q` search misses partial words.
- Partial matching uses a read-only in-memory index of the primary calendar (2 years back and 2 years forward, refreshed automatically after any event change, fresh open, or account switch) combined with Google's 5-year search, with no new Google permissions.
