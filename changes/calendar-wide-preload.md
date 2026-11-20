## Calendar loads many weeks ahead in one go (2026-11-20)

- In the Week view, once a week has loaded, the 4 weeks before it and the 8 weeks after it are fetched quietly in one request, so stepping through them shows events at once. In the Month view the month before and after come in one request.
- Weeks with more than 250 events are fetched with more pages (up to 4); if that is still not enough, only the weeks that were fully fetched are kept, and the rest load when you step to them.
- Stepping to within 2 weeks of the end of what was fetched fetches the next stretch.
- Events that run over two weeks show in both, the same as before.
- Fix: if you sign out and someone else signs in while the Calendar panel stays open, none of the first person's events can show up. Everything fetched is thrown away, and late answers for the first person are ignored.
- Your boards and what is saved are not touched. This only reads from Google Calendar.
