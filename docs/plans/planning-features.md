
# Plan: brain dump → board → calendar → focus timer; weekly planning; a day that re-plans itself

Status: plan only. Nothing is built. Every job below is one branch and one pull request into `build/v1`, with `changes/<branch>.md` (and `changes/<branch>.decisions.md` if calls were made while building). SPEC.md is updated in the same commit (rule 8). Tests come first. Jobs 1–11 work with no API key; jobs 12–16 add AI.

Ground rules this plan follows:
- New logic goes in new files that publish-rules doesn't mark risky: `src/model/brainDump.ts`, `src/model/schedule.ts`, `src/model/weekReview.ts`, `src/model/ai.ts`, `src/store/actions/plan.ts`, `src/store/ai.ts` and new components. `src/store/actions/boards.ts` is risky, so the new actions don't go there.
- New saved fields are optional and need **no version bump** (`BOARD_VERSION` stays 2), following the `general?` (NoteCard) and `folded?` (TodoItem) precedent. Older apps drop the field. An older installed connector refuses to edit until it is updated, same as before.
- Undo rules:
  - Board changes are one `ctx.commit` (or `ctx.commitTo` for another board).
  - Calendar changes are undone through the calendar's own Undo message (`tell(text, undo)` in `src/store/calendar.ts`).
  - A batch of calendar changes is **one** Undo message that reverses the whole batch.

## (a) Jobs in order

Sizes: S is under half a day, M about a day, L two days or more.

### Part A: no AI, works with no key

**1. `brain-dump-parse`: messy text to card drafts (model only).**
- What it does: `parseBrainDump(text) → Draft[]`, where a draft is {title, minutes?, kind: 'note' | 'todo'}.
- How it reads the text:
  - One line or bullet is one draft. Leading `-`, `*`, `•`, `1.` and `[ ]` are removed. Blank lines are skipped.
  - Time estimates are read from tokens such as "30m", "1h", "1h30", "90 min" or "(45m)". The token is removed from the title.
  - Default estimate: none, which shows as "?".
  - Cap: 300 drafts, the same as `IMPORT_MAX_CARDS`.
- Files: new `src/model/brainDump.ts` and `brainDump.test.ts`.
- High-risk: no. Format bump: no.
- Tests first: bullets and numbering, estimate tokens and their edge cases ("1.5h", "h" alone is not an estimate), the cap, blank and whitespace-only input, very long lines (title cut at the same limit cards use).
- Size: S.

**2. `card-estimate`: an optional `estimate` field in minutes on cards (and on to-do items, if the owner agrees).**
- Files: `src/model/types.ts`, `src/model/persist.ts` (parse and keep), a small badge in the card component, SPEC.md (card section and saved format note).
- **High-risk** because it touches `src/model/persist.ts`. Format bump: none.
- Alternative with no format change: keep the "30m" tag in the title text (see question Q3). If the owner picks that, this job drops out and job 1's parser is used for display too.
- Tests first:
  - persist round trip, a missing field, and bad values (negative, non-integer, over 24 h) dropped;
  - an old save loads unchanged;
  - mcp `safeToEdit` behaviour noted. mcp isn't touched in this job; check how the connector treats an unknown field and say so in the changes fragment.
- Size: S–M (most of the time goes to review).

**3. `brain-dump-panel`: paste, preview, add as one undo step.**
- What it does: a "Brain dump" box opened from the ⋯ menu / the board's add menu (Q4). The user pastes text, sees the draft list with editable estimates, and taps **Add to board**.
- The cards are placed with the existing `packInLanes` / `placeCards` from `src/model/milanote.ts`, starting at `spotForNewBlock` (Q4). This is one `ctx.commit`, so Ctrl+Z removes them all.
- Files: new `src/components/BrainDumpDialog.tsx`, new `src/store/actions/plan.ts` (`addDrafts`), a menu entry in the existing menu component, SPEC.md.
- High-risk: no (plan.ts is new; boards.ts isn't touched). Format bump: no (uses job 2's field, or the title tag).
- Tests first:
  - unit: `addDrafts` positions, a single commit, and undo restores the board;
  - e2e: paste 5 lines, Add, 5 cards appear, Ctrl+Z removes all 5.
- Size: M.

**4. `calendar-blocks`: schedule cards as Google Calendar blocks.**
- What it does:
  - Adds a description and `extendedProperties.private` (`noteBoardCard: <cardId>`, `noteBoardBlock: "1"`) to `EventBody`, and reads them in `parseEvent`, so `CalEvent` gains `cardId?` and `block?`.
  - Adds `createMany(bodies)` that runs the creates one after another and stops on the first error.
  - Store: `scheduleCards(cardIds, startAt)` places the blocks one after another in the next free time (using job 9's packer once it exists; until then, one after another from the time picked). It then gives **one** Undo message, "Scheduled 4 blocks", whose undo removes all of them.
  - UI: a "Schedule" action on selected cards, with a time picker defaulting to the next free half hour. Blocks show a small marker in the Calendar panel.
- Files: `src/calendar/api.ts` (or wherever `CalendarApi` and `parseEvent` live), `src/model/calendar.ts`, `src/store/calendar.ts`, `src/calendar/devServer.ts` (the demo calendar keeps extendedProperties), the card selection toolbar, SPEC.md (Google Calendar section).
- High-risk: no (none of these match RISKY). Format bump: no (calendar data isn't board data).
- Tests first:
  - parseEvent with and without the private properties;
  - createMany partial failure: the ones already made are removed again or reported. Pick one approach and test it;
  - undo removes the whole batch;
  - e2e in demo mode (`?demo-user=Alice`): schedule 2 cards, see 2 blocks, Undo, both gone.
- Size: M–L.

**5. `focus-on-card`: start the focus timer on a card.**
- What it does:
  - Adds `task?: {boardId, cardId, title}` to `PomodoroTimer`. It's per-device localStorage, so this isn't a board format; `readPomodoro` drops a bad `task`.
  - "Start focus" on a card (and on a calendar block that has `cardId`) sets the task and starts the round. The timer panel shows the title.
  - When the round ends, it asks "Done?" with Tick / Not yet. Not yet feeds job 10's re-plan prompt.
- Files: `src/model/pomodoro.ts`, `src/store/pomodoro.ts`, `src/components/PomodoroPanel.tsx`, the card menu, SPEC.md (Focus timer).
- High-risk: no. Format bump: no.
- Tests first: `readPomodoro` with good, bad and missing task values; `start` with a task; reset or skip clears the task (decide which and test it); e2e: start focus from a card, then the panel shows its title.
- Size: S–M.

**6. `done-on`: record when a to-do item was ticked.**
- What it does: an optional `doneOn?: 'YYYY-MM-DD'` on `TodoItem`. Ticking sets it, unticking removes it. It's needed for "done this week". If Completed groups are used instead (Q8), this job drops out.
- Files: `src/model/types.ts`, `src/model/persist.ts`, the tick action. If the tick lives in `src/store/actions/boards.ts`, that file is risky too. SPEC.md.
- **High-risk** (persist.ts). Format bump: none.
- Tests first: tick sets today's local date and untick clears it; persist round trip; the merge in `src/model/merge.ts` must keep the field. If merge needs a change, that is high-risk as well, so check it in a test.
- Size: S–M.

**7. `week-review-model`: the weekly review data (model only).**
- What it gives, as `weekReview(boards, events, weekStart)`:
  - items done this week, grouped by board;
  - habits from `tickedDays`, `weekCount` and `periodCount`. Show days done this week, not a streak, unless the owner overrides (Q9);
  - next week's calendar events grouped by day;
  - this week's journal entry count, from `journalEntries`.
- Files: new `src/model/weekReview.ts` and test.
- High-risk: no. Format bump: no.
- Tests first: week edges (Monday start, a time-zone/DST week), a habit ticked twice in one day counted once, no habits board, no calendar access.
- Size: S–M.

**8. `week-review-panel`: the review screen.**
- What it does: a new `SidePanelKind` value `'week'` with a button in the panel pill and a phone tile. A read-only review, plus **Save to Journal** (one `ctx.commitTo` onto the Journal board as a dated note). It is shown when Q10 says.
- Files: `src/store/types.ts` (SidePanelKind), `src/model/calendar.ts` (`SidePanelId`, `SIDE_DEFAULT` width), the panel pill component (`src/components/ZoomControl.tsx`), the phone ⋯ menu, new `src/components/WeekPanel.tsx`, `src/store/actions/plan.ts`, SPEC.md.
- High-risk: no. Format bump: no.
- Tests first: the panel opens and closes and remembers its width; Save to Journal is one undo step and lands on the right date; e2e in demo mode with the pretend calendar.
- Size: M.

**9. `day-scheduler`: pack the rest of today (model only).**
- What it does: `freeSlots(events, now, dayEnd)` gives the gaps between fixed events. All-day events are ignored, and events the user can't edit (`editable: false`) or that aren't blocks count as fixed. `repack(blocks, tasks, fixed, now, dayEnd, opts)` then gives a `Plan` of {moves: [{eventId, start, end}], creates, drops: cardIds that don't fit}.
- Rules:
  - Keep the order. Round to 5 minutes. Optional 5-minute gap between blocks.
  - Never move a fixed event. Never place a block in the past.
  - What doesn't fit goes to `drops`, and the suggestion says "move to tomorrow".
- Files: new `src/model/schedule.ts` and test.
- High-risk: no. Format bump: no.
- Tests first: an empty day; back-to-back meetings; a block running past a meeting; a day end before now; the DST day; a task longer than any gap; a stable result (the same input gives the same plan).
- Size: M.

**10. `replan-suggest`: "Your day changed" suggestion; accept is one undo step.**
- Detecting "running over" (Q11) takes three signals:
  - (a) a focus round with a task ends and the user taps Not yet;
  - (b) the minute tick sees a block's end time pass while its card or item is still open. The tick runs only while the app is open; on open it runs once;
  - (c) a manual "I'm running late" button in the Calendar panel.
- What happens:
  - The app runs `repack` and shows a suggestion card in the Calendar panel ("Move 3 blocks, 1 won't fit today") with Accept and Dismiss. Nothing changes before Accept.
  - Accept applies the moves and creates through the calendar API as **one** Undo message, which restores every original start and end.
  - If a dropped task's card changes (for example it gets a "tomorrow" estimate), that is one `ctx.commit` too. That makes two undo steps; Q12 is a recommendation to avoid it.
  - A dismissed suggestion stays hidden until something new happens.
- Files: `src/store/calendar.ts` (`applyPlan` plus undo), new `src/components/ReplanCard.tsx`, the Calendar panel component, `src/store/pomodoro.ts` (the Not yet hook), SPEC.md.
- High-risk: no. Format bump: no.
- Tests first:
  - `applyPlan` and undo restore the exact old times;
  - a partial API failure rolls back what was already moved and reports it;
  - no change happens without Accept;
  - e2e in demo mode: move the clock (Playwright `page.clock`) past a block's end, the suggestion appears, Accept moves it, Undo puts it back.
- Size: L (consider splitting into 10a detection plus card, and 10b apply plus undo).

**11. `csp-meta`: add a Content Security Policy before any key exists.**
- What it does: adds `<meta http-equiv="Content-Security-Policy">` to `index.html` (details in section c). The GoatCounter inline loader from `scripts/goatcounter.ts` moves to a small file, or gets a sha256 hash added at build time.
- Files: `index.html`, `scripts/goatcounter.ts`, maybe `vite.config.ts`. Also update `privacy/index.html` and `faq/index.html` if they load anything.
- High-risk: no (by path). **Rule 4 still applies (security)**, so ask the owner to look before merging.
- Tests first: an e2e that collects `securitypolicyviolation` events and fails on any of them during a demo run (open board, calendar panel, link card image, video embed, sign-in button render). A build test checks that the meta tag exists and the GoatCounter hash matches.
- Size: M (mostly finding every source).

### Part B: AI (bring your own key)

**12. `ai-key-settings`: where the key lives, and clearing it.**
- What it does:
  - A small AI settings dialog with:
    - a password-type input for the key;
    - a model choice (Q2);
    - a monthly "stop after" counter of uses, kept on this device;
    - "Test key";
    - "Forget key";
    - a plain warning, below.
  - The warning says the key is stored on this device in this browser, anyone with access to this browser profile can use it, and using it costs money on the user's Anthropic account. It advises a separate workspace with a low monthly spend limit and a key that expires (e.g. 30 days).
  - The key is stored per Q1. It is cleared on sign-out and user change, and on account delete.
- Files: new `src/store/ai.ts` (`getKey`, `setKey`, `forgetKey`); new `src/components/AiSettings.tsx`; the ⋯ menu.
  - Sign-out/user change: `src/sync/firebase.ts` (`watchUser`), next to the calendar access drop.
  - Account delete: `src/store/account.ts` (`accountKeys`).
  - SPEC.md, and privacy/index.html (what's sent to Anthropic and when).
- **High-risk** (`src/sync/` and `src/store/account.ts`). Format bump: no.
- Option: split it into 12a (non-risky dialog and storage) and 12b (the risky clearing hooks, small and easy to review). **12b must merge before any AI job ships**, otherwise a key outlives a sign-out.
- Tests first:
  - key set, get, forget;
  - a signed-out user change clears it;
  - accountKeys includes the key name;
  - the key never appears in the store state given to sync. A test serialises the store state and the outgoing Firestore payloads in demo mode and asserts the key string is absent.
- Size: M.

**13. `ai-client`: one small module that calls the Messages API.**
- What it does: `askClaude({system, user, schema, maxTokens, signal})` sends a raw `fetch` to `https://api.anthropic.com/v1/messages` with these headers:
  - `x-api-key`
  - `anthropic-version`: check the current value when building
  - `content-type: application/json`
  - `anthropic-dangerous-direct-browser-access: true` (confirmed in Anthropic's docs)
- Request body:
  - `model`: from settings;
  - `max_tokens`: a hard cap per use;
  - `output_config: {format: {type: 'json_schema', schema}}`: structured output;
  - `output_config.effort: 'low'` for simple tasks.
  - No temperature, top_p or top_k (400 on current API versions). No assistant prefill. No forced tool_choice.
- Checking the reply:
  - check `stop_reason`, and turn `refusal` and `max_tokens` into plain messages;
  - JSON.parse, then a small hand-written validator for each schema. No new package (rule 11);
  - unknown fields are dropped and strings are cut to card limits.
- Errors become plain messages:
  - 401 "invalid key";
  - 401 with "CORS requests are not allowed for this Organization": "Your Anthropic organization blocks browser use (Zero Data Retention or Compliance API). Use a key from a different organization.";
  - 429 and 529: "busy, try again";
  - 400: "Note Board needs an update";
  - network or offline.
- Input cap: refuse text over N characters (Q2) before sending. Uses an AbortController (Cancel button). It never logs the request, the headers or the key (see c).
- Alternative: `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` is the officially supported path and sends the same header. The owner chose raw fetch, which also fits rule 11 (no new package).
- Files: new `src/model/ai.ts` (the request builder, the response validator and the error mapping, all pure); `src/store/ai.ts` (the fetch call).
- High-risk: no. Format bump: no.
- Tests first:
  - request shape snapshot (headers present, no sampling parameters, effort and caps set);
  - each error mapping, including the ZDR 401 text;
  - the validator rejects bad JSON, extra fields and over-long strings;
  - `refusal` and `max_tokens` handling;
  - a guard test that fails if any non-test source file calls `console.*` with a variable named key or headers (a simple grep test).
- Size: M.

**14. `ai-brain-dump`: "Tidy with AI" in the brain-dump dialog.**
- What it does: sends the pasted text and gets back drafts {title, minutes, kind, group?}, validated through the same `Draft` type. The result fills the same preview as job 3, so the user still edits and taps Add, and it's still one undo step. Without a key the button is hidden or shows "Add your key in AI settings".
- Files: `src/components/BrainDumpDialog.tsx`, `src/model/brainDump.ts` (schema plus validator mapping), SPEC.md, privacy page note.
- High-risk: no. Format bump: no.
- Tests first: the response is mapped to drafts; an invalid response falls back to the plain parser with a message; e2e with `page.route` faking api.anthropic.com (never real calls in tests).
- Size: S–M.

**15. `ai-week-plan`: a suggested plan in the weekly review.**
- What it does: "Suggest my week" sends a short summary to the model and gets back a plan: per day, up to N items {cardId?, title, minutes, why}.
- What it sends: open item titles with estimates, habit targets, next week's busy times **as times only**, and an optional journal summary (Q13).
- The plan shows as a list. Accept per day or all does two things:
  - it creates blocks through job 4's `scheduleCards` (one calendar Undo message);
  - it adds any new cards as one `ctx.commit`.
  - Nothing is written before Accept.
- Files: `src/components/WeekPanel.tsx`, `src/model/weekReview.ts` (prompt builder and validator), `src/store/actions/plan.ts`, SPEC.md.
- High-risk: no. Format bump: no.
- Tests first: the prompt builder leaves out event titles and guests by default; the validator drops cardIds that don't exist; accept is one undo per kind; e2e with a faked API.
- Size: M.

**16. `ai-replan-advice`: optional AI judgement in the re-plan card.**
- What it does: "Ask AI what to drop" sends the plan from job 9 (tasks, estimates, remaining slots) and gets back {drop: cardId[], reorder?: cardId[], note}. The app re-runs `repack` with that order and those drops, so the **plain scheduler still decides the times**; the model only picks what goes in. The result shows as the same accept card.
- Files: `src/components/ReplanCard.tsx`, `src/model/schedule.ts` (prompt and validator), SPEC.md.
- High-risk: no. Format bump: no.
- Tests first: unknown ids are ignored; the advice can't move fixed events (guaranteed by `repack`); e2e with a faked API.
- Size: S–M.

## (b) Open questions for the owner, with recommended answers

**Q1. Where is the API key stored?**
- Recommended: localStorage on this device only, under `note-board:ai-key`. It is never in board data, never synced, never in Firestore, and is cleared on sign-out, user change and account delete.
- The trade-off to know: the site is on `ezhang43.github.io`, and **every other GitHub Pages project site of yours shares that origin and can read this localStorage.**
- Options:
  - (a) Accept that, and keep no other Pages projects with untrusted code. This is the simplest option.
  - (b) Keep the key in sessionStorage only, so it's re-pasted each browser session. Safer, but more annoying.
  - (c) Move Note Board to its own custom domain later, which gives it its own origin.
- Recommendation: (a) plus a "Remember on this device" tick box that is **off by default**. Off means sessionStorage. Option (c) is the real fix for later.

**Q2. Which model, and what cap per use?**
- Recommended: default to `claude-haiku-5-5` ($0.10 / $0.50 per million tokens), which is plenty for splitting text and packing a list. Offer `claude-sonnet-5-5` ($2 / $10) as "Better" and `claude-opus-5-5` ($4 / $20) as "Best".
- Caps:
  - input: 20,000 characters for the brain dump, a 10,000-character summary for the week plan;
  - output: `max_tokens` 2,000 for the brain dump and re-plan, 4,000 for the week plan;
  - `effort: 'low'`.
- Cost: a brain dump on Haiku costs well under a cent. Show "about $X" for the chosen model next to the button.
- Also a per-device monthly "uses" counter that stops at a number the user sets (default 200). This is on top of the workspace spend limit we tell them to set.

**Q3. How are time estimates kept?**
- Recommended: an optional `estimate` field (job 2, high-risk, no bump). It's cleaner to show and sort. The alternative is a "30m" tag in the title, with no format change but messier titles.
- Also decide whether to-do items get it too. Recommended: yes, the same field on `TodoItem`, since brain-dump lines are often to-dos.

**Q4. Where do brain-dump cards land?**
- Recommended: on the open board, packed in lanes starting at the usual new-block spot (`spotForNewBlock`), with all new cards selected so they can be dragged together.
- Alternative: one new to-do card holding all the items. Offer it as a toggle in the dialog, "As one list", default off.

**Q5. What is a "block", and are blocks real Google events?**
- Recommended: yes. They are real events on the primary calendar, titled with the card title, with the description "From Note Board" plus a link back to the card. They are tagged with `extendedProperties.private` so Note Board knows which events it may repack.
- Default visibility is the calendar's default. No guests and no notifications (`notify: false`). Only tagged blocks are ever moved by the re-plan; other events are always fixed.

**Q6. When does the weekly review appear?**
- Recommended: never by itself as a pop-up. A "Week" panel button is always there, and on the user's chosen day (default Sunday, any time) the button shows a dot until the review is opened that week. Keep the setting per device.

**Q7. How is "running over" detected?**
- Recommended: the three signals in job 10 (focus round ends and the user says Not yet; a block's end passes while its card is still open; the manual "I'm running late" button).
- No background checks while the app is closed; it checks on open.
- At most one suggestion is shown at a time, and a dismissed one doesn't come back until something new happens.

**Q8. Where does "done this week" come from?**
- Recommended: the new `doneOn` field (job 6). Completed groups only date items when the user tidies up, so they miss most of the week.

**Q9. Habit streaks in the weekly review?**
- On 2026-10-20 the owner said "no need for habit to have a streak counter". Recommended: show "4 of 7 days this week" per habit and no streak, unless the owner now wants streaks in the review only.

**Q10. What does a single Accept do when it changes both the calendar and the board?**
- Recommended: keep the calendar changes as one calendar Undo message, and **don't change board data during a re-plan at all**. Dropped tasks just stay open on the board, and the suggestion lists them. The week plan's Accept may add cards, which is a second step; label it clearly ("Added 2 cards and 5 blocks"), and Undo in the message reverses both.

**Q11. What may be sent to Anthropic?**
- Recommended:
  - always: the pasted text, and card titles with estimates;
  - calendar: busy times only, never event titles, guests or descriptions, unless the user ticks "Include event titles";
  - never: journal text by default.
- The privacy page says this, and the request is made only when the user taps an AI button.

**Q12. Does accepting the risk of a browser key need sign-off?**
- Anthropic recommends calling the API from a back end, not from the browser. With no server, we accept these risks:
  - the key sits in the browser;
  - a script injected into the page (XSS) or another same-origin Pages site could read it and spend the user's money;
  - organizations with Zero Data Retention or the Compliance API can't use the feature at all.
- Recommended: accept it, with the CSP (job 11), the off-by-default "remember" choice, the warning text, and the advice to use a separate workspace with a low spend limit and an expiring key.

## (c) Security notes

**Content Security Policy (job 11, before any key is pasted).** GitHub Pages can't send headers, so it has to be a `<meta http-equiv>` tag. A meta CSP can't use `frame-ancestors`, `report-uri` or `sandbox`, and it applies only from the point it appears, so put it first in `<head>`. Draft:
- `default-src 'self'`
- `script-src 'self' https://accounts.google.com/gsi/client https://gc.zgo.at` (plus the GoatCounter loader's `'sha256-…'`, or move the loader into a file). No `'unsafe-inline'` and no `'unsafe-eval'` for scripts. Check the production Vite build doesn't need eval.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (React inline styles and GSI need it; style injection is a much smaller risk than script injection).
- `font-src https://fonts.gstatic.com`
- `img-src 'self' data: blob: https:` (link-card images can come from any https host; avatars from lh3.googleusercontent.com)
- `connect-src 'self' https://api.anthropic.com https://www.googleapis.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://busyants.goatcounter.com https://accounts.google.com` (add `wss:`/long-poll hosts if Firestore uses them, found by the e2e test)
- `frame-src https://accounts.google.com https://note-board-a672a.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com`
- `object-src 'none'; base-uri 'self'; form-action 'self'`
- The real list must come from job 11's violation-catching e2e test, not from this draft.

**The key must never be synced, logged or leaked.**
- Keep it only in `src/store/ai.ts` (localStorage or sessionStorage per Q1). Never put it in the store state, board data, undo history, versions, the share or export file, the mcp connector data, or analytics.
- It is read right before each fetch and put only in the `x-api-key` header.
- No `console.*` of requests, headers or errors that might contain it. Error messages shown to the user are built from status codes and the API's error type, never by echoing the request.
- GoatCounter records only page paths: no AI query strings, and no key in a URL ever.
- The dialog input uses `type="password"`, `autocomplete="off"` and `spellcheck=false`, and the key is never shown after saving (show only `sk-ant-…last4`).
- It is cleared on sign-out, user change and account delete (job 12b, high-risk).
- Tests: the serialisation test in job 12 and the console guard in job 13.

**XSS exposure (this is what makes a browser key risky).**
- Today: no `dangerouslySetInnerHTML` or `innerHTML` in src outside tests, and React escapes text. The main surface is the rich text editor (paste handling and stored rich HTML). Check it before shipping AI: confirm pasted HTML is cleaned and stored rich text is rendered only through the editor's own model, not raw HTML.
- Link-card URLs: allow only `http`/`https` hrefs, no `javascript:`. Check that the card link code already does this, and add a test if not.
- AI output is **untrusted input**:
  - render it as plain text only, never as HTML or Markdown-to-HTML;
  - validate it against the schema;
  - cut it to length;
  - map card ids only to cards that exist;
  - never let it set URLs.
- Prompt injection: pasted text or card titles could say "ignore instructions…". The damage is limited because the model can only return validated JSON that the user previews and must Accept. It has no tools and can't reach the calendar or board directly.
- The shared `github.io` origin is a separate exposure. See Q1.

**The ZDR / Compliance API organization case.** It gets a 401 whose message begins "CORS requests are not allowed for this Organization" even with the header. Show a specific message (job 13) instead of "invalid key".

## (d) What can run in parallel

They don't touch the same files, apart from each one's own changes fragment.

- **Wave 1, all at once:** job 1 (brainDump.ts), job 7 (weekReview.ts), job 9 (schedule.ts), job 11 (index.html and goatcounter), job 13's pure part (`src/model/ai.ts`). All are new files or files nobody else touches.
- **High-risk lane, one at a time because they share `types.ts` and `persist.ts`:** job 2, then job 6. Job 12b (firebase.ts, account.ts) is in different files and can run beside them. All three wait for the owner, so start them early.
- **Wave 2, after the jobs each one needs:**
  - job 3 (needs 1, plus 2 or the title-tag decision);
  - job 5 (pomodoro files only);
  - job 12a (new ai store and dialog, plus the ⋯ menu).
  - Job 3 and job 12a both add a ⋯ menu entry, a small overlap: run them one after another, or let the second one rebase.
- **Strictly one after another (they share `src/store/calendar.ts` and the Calendar panel):** job 4, then job 10. Job 10 also needs 9, and touches `src/store/pomodoro.ts`, so it comes after job 5.
- **Job 8** (needs 7; touches `src/store/types.ts`, `src/model/calendar.ts` SIDE_DEFAULT, ZoomControl.tsx). It can run beside job 4 only if job 4 doesn't touch `src/model/calendar.ts`'s panel constants. Otherwise run it after job 4. Recommended: after job 4.
- **AI wave, after 11, 12a, 12b and 13:** job 14 (BrainDumpDialog), job 15 (WeekPanel) and job 16 (ReplanCard) touch different components and can run in parallel. They all add a few lines to `src/store/actions/plan.ts` or `src/model/*`, but in different files, apart from plan.ts for 14 and 15. Do 15 after 14 if both edit plan.ts.

Suggested critical path: 1 → 3 → 4 → 9 → 10, with 11, 12 and 13 running beside it, then 14, 15 and 16.

### Critical Files for Implementation
- /home/user/note-board/src/store/calendar.ts
- /home/user/note-board/src/model/persist.ts
- /home/user/note-board/src/model/pomodoro.ts
- /home/user/note-board/src/store/account.ts
- /home/user/note-board/index.html

## Owner answers (2026-11-11)
- Q1 key: sessionStorage by default; "Remember on this device" tick box, off by default (then localStorage). Never synced; cleared on sign-out, user change, account delete.
- Q12 risk: accepted with safeguards (CSP job 11 ships before any key entry; warning; spend-limit + expiring-key advice).
- Q5 blocks: real events on primary calendar, tagged via extendedProperties.private; no guests, no notifications; only tagged blocks ever moved.
- Q3 estimates: new optional `estimate` field on cards AND to-do items (high-risk, owner OK before live).
- Coordinator-picked defaults (recommended): Q2 Haiku default + Sonnet/Opus; Q4 lands on open board; Q6 Week button with Sunday dot, no pop-up; Q7 three signals; Q8 doneOn field; Q9 no streak; Q10 re-plan changes calendar only; Q11 busy times only, no journal by default.

## REVISIONS — binding; they override anything above (2026-11-11, after Fable review + 2 grilling rounds, owner confirmed)
Save format and connector:
- Board format: `WORKSPACE_VERSION` (src/model/workspace.ts) is the guard, currently 5. Estimates and doneOn need a bump to 6, with a connector release (mcp/boards.ts refuses unknown fields; mcp/ is risky) and a SPEC note to reinstall the connector. BOARD_VERSION is irrelevant.
- Jobs 2 and 6 are ONE high-risk job `saved-estimate-doneon`: `estimate?` minutes on NoteCard and TodoItem, plus `doneOn?` on TodoItem. Ticking is `setItemsDone` (src/model/checklist.ts), which the connector shares (mcp/edits.ts), so pass "today" in. Merge is field by field (src/model/merge.ts), and habits/imports set done directly, so readers must tolerate done without doneOn.
File locations:
- `src/calendar/api.ts` doesn't exist. CalendarApi is in src/store/calendar.ts and parseEvent in src/model/calendar.ts.
- No `createMany`: loop the existing create. Job 4 comes after job 9 and uses repack.
Prompts and undo:
- "Done?" and the re-plan suggestion go in ONE global bottom card (not the Calendar panel), visible whichever side panel is open, with an Undo that stays until closed. Today's UndoToast is a 6-second single slot.
- Only checklist items have "done"; a checklist card is done when all its items are ticked. Notes get no Done? prompt, and a note's block re-plans only via "I'm running late".
- A deleted card's block stays on the calendar and is treated as fixed.
- The Journal write in the week panel uses commitTo, so undo needs undoOn (src/store/core.ts).
Calendar access:
- Read events only when a Google token is already held (src/calendar/google.ts token() opens a popup). Timers and the week review never trigger a popup.
Owner choices:
- My day defaults to 9:00 to 18:00, kept on the device (Calendar panel setting, not synced).
- 30 minutes when there's no estimate; a 5-minute gap between blocks.
- Brain dump opens from the + add menu and the ⋯ menu (phone too); cards land on the open board, packed and selected.
- Week button shows a dot on Sunday, no pop-up. Habits show "N of 7 days", no streak.
- Re-plan only moves calendar blocks; the board is never changed. The three signals stand.
Pomodoro and AI:
- The pomodoro task stores ids only (boardId, cardId, itemId?), never the title. Look the title up at render.
- AI key: sessionStorage by default; "Remember on this device" (off) uses localStorage. Store the uid with it. Clear it on sign-out, user change and account delete. src/sync/account.ts finishDeletion walks only localStorage, so add sessionStorage (high-risk).
- AI defaults: Haiku, with Sonnet/Opus options; 200 uses a month per device, changeable; max_tokens about 16000 (thinking shares the cap), with the input cap controlling cost.
- What's sent: pasted text, card titles with estimates, and free/busy times. Event names and journal text only via a tick box per request. GATE: before jobs 15 and 16, check Google's API user-data policy; any consent-screen change goes to the owner.
CSP job 11:
- HIGH-RISK label; the owner checks sign-in and sync on the live site.
- Cover all 6 built HTML pages (vite.config.ts).
- Check whether Firebase popup sign-in needs https://apis.google.com.
Build order:
- brain dump (3) → saved-estimate-doneon → scheduling (4) → focus (5) → weekly review (8) → re-plan (10) → Tidy with AI (14, needs 11/12/13). Jobs 15 and 16 come last.
