## Tidy-up in the Calendar panel code (2026-11-23)
- Split the large Calendar side panel file into focused files under `src/components/calendar/` (week list, month grid, event card, event form, repeat picker, move prompt, and confirmation dialog), keeping `CalendarPanel.tsx` as the single entry point.
- Unified the three mutually exclusive calendar overlay states (event card, add/edit form, and drag-move prompt) into one overlay state so only one can be open at a time.
- Removed duplicated date, time, all-day, and repeat input markup between the quick-add and full event form, and extracted pure draft validation (`validateDraft`) into `src/model/calendar.ts` with unit tests.
- Nothing changes in how the Calendar panel looks, saves, or behaves.
