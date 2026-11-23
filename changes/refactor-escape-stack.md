## Central Escape and overlay dismissal stack (2026-11-23)
- Behind the scenes: replaced the scattered Escape listeners across panels, dialogs, popovers, and calendar overlays with one small central LIFO stack (`src/components/escapeLayer.ts`) backed by a single capture `keydown` listener on `window`, plus a shared `useOutsidePointerDown` helper.
- Removed the CSS-class sniffing helpers (`closedOne`, `escapeIsFree`, `escapeIsForPanel`, `escapeIsForChecklist`), `TimePicker`'s global `closeTimeList`, and the no-deps `useEffect` listener churn in `EventCard`, `EventForm`, and `MoveAsk`.
- Nothing changes in how Escape or outside clicks behave across the app.
