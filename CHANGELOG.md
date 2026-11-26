# Changelog

## About page shows ticked items staying in place (2026-10-24)

- The demo video on the About page now matches the app: ticking an item leaves it where it is, struck through and faded, then Clean up in the list's title row sends it away. Light and dark versions and both poster pictures were retaken; the lists in the demo are a bit wider so their titles fit beside Clean up.
- "Try it: tick one off" works the same way: a ticked point stays in its place, struck through and faded, and there is no "Completed" heading any more.
- The video's description for screen readers says the same.

## AI client: Test key follow-ups (2026-11-12)

- Test key no longer says "Key works." when Anthropic's reply breaks on the way (cut off or unreadable). It now says it couldn't reach Anthropic, like any lost connection.
- A running Test key is now stopped, and says nothing, when something changes under it: the model is picked again, the key is forgotten (here or in another tab), a new key is saved, or you sign out or someone else signs in.
- A request that times out now says Anthropic took too long, not "Stopped." (that word is only for when you cancel).
- Clearer messages: a rate limit (too many requests, wait a minute) is no longer mixed with a spend or billing limit, a key that isn't allowed has its own message, and a browser that can't save the use count no longer claims you reached your monthly limit.
- Saved boards are unchanged; the key is still kept only in this browser.

## AI client: Note Board can now talk to Claude with your own key (2026-11-12)

- New "Test key" button in AI settings (beside Forget key). It sends one tiny request to Anthropic with your saved key, counts as one of this month's uses, and says "Key works." or what went wrong in plain words: a key that isn't valid, an Anthropic organization that blocks browser use (Zero Data Retention or Compliance API), a spend or rate limit, Anthropic being busy, no connection, and so on.
- Behind it is the one piece every AI feature will use to ask Claude: it sends only what the feature chose, straight from your browser to Anthropic, never through BusyAnts. It checks Claude's answer before anything uses it, sends nothing once the monthly limit is reached, and never writes your key anywhere it could leak.
- The site's security policy now lets pages reach Anthropic's API (`https://api.anthropic.com` only), as the owner agreed on 2026-11-12.
- The Privacy page says what an AI button sends, to whom, and with whose key. The AI settings hint says the same.
- No AI feature on the board uses it yet; those come next. Saved boards are unchanged.

## Your AI key goes when you sign out or delete your account (2026-11-12)

- The Anthropic key you keep in AI settings is now removed from this browser when you sign out, when someone else signs in on this browser, and when you delete your account. It is removed whether it was kept for the tab or on the device, and from every open tab.
- Reloading the page while you stay signed in keeps it, as before.
- Your choice of model, your monthly limit and this month's count stay: they are settings of this device, like dark mode.
- Your boards are not touched by this change.
- The Privacy page now says when the key is removed.

## AI settings: a place for your own AI key (2026-11-12)

- New row "AI settings" in the ⋯ menu (also on a phone). It opens a small dialog where you can keep your own Anthropic key, choose a model and set a monthly limit.
- Nothing uses the key yet, and the dialog sends nothing anywhere. It is groundwork for the AI features planned later.
- The key stays in this browser only: for this tab by default, or on this device if you tick "Remember on this device". It is never saved with your boards or sent to your account, and after saving only its start and last four letters show.
- The dialog warns that anyone using this browser profile can use the key and that it costs money on your Anthropic account, and suggests a separate workspace with a low spend limit and a key that expires.
- Model choices: Haiku 5.5 (fast, cheapest, the default), Sonnet 5.5 (better) and Opus 5.5 (best). The monthly limit starts at 200 uses and shows how many are used this month.
- The Privacy page has a short new section about a key you enter.

## Privacy page date and AI key tidy-up (2026-11-12)

- The Privacy page now says "Effective from November 12, 2026", the day its AI key wording was added.
- Behind the scenes: putting back an AI key after a failed save no longer depends on two lists being in the same order, and the AI key tests clean up after themselves. Nothing changes on screen.

## Sort with AI: a batch that fails the same way is not billed again (2026-11-15)

- When Claude declines a batch of finished items, its answer is too long, or it comes back in the wrong shape, those items are now remembered as asked (with no label, so they keep their built-in categories). Before, nothing was remembered, so every time the Visualizer opened, Sort automatically sent the same 50 items again, costing a use each time, and the items behind them were never sorted.
- The sort stops at that batch and says so in plain words, for example "Claude declined to sort 50 finished items, so they keep their built-in categories." The next sort sends the items behind it.
- Failures that may pass next time (no connection, a time-out, too many requests, a spend limit, a key problem, Anthropic busy) still save nothing, so those items are tried again later.
- Picking another model, or Forget key, asks about those items again, as for any item with no label.

## Sort with AI: only your own boards (2026-11-13)

- Sort with AI in the Visualizer now sends only finished items from your own boards. Items on boards other people shared with you are never sent to Anthropic, and they keep the built-in categories (even if they were sorted before this change).
- The line under the button says so: "Sends the text of N finished items from your own boards to Anthropic with your key: no board names, lists or notes, and nothing from boards shared with you."
- Just after signing in, while your shared boards are still loading, the button waits (so nothing from them can slip through).
- The AI settings hint says the same: an AI button sends the text of finished checklist items from your own boards, never from boards shared with you, straight from your browser to Anthropic, with your key.
- The Play Store Data safety draft (`docs/play-store/data-safety.md`) now says what goes to Anthropic, when, and how, and declares it as shared with a third party (Other user-generated content, optional).
- The Privacy policy (`privacy/`) now says an AI button sends the text of finished checklist items from your own boards (never from boards shared with you), and that Test key sends only a tiny test message. Effective date moved to November 13, 2026.

## An Antigravity session can be the crew coordinator (2026-11-23)

- The owner can now run the crew from an Antigravity session as well as from Claude Code. It keeps its own private Crew Log, and the crew skill explains how to hand the crew back to Claude Code.

## Arrow keys move the board (2026-10-29)
- On a computer, with nothing selected, the arrow keys now pan the board like scrolling: ↓ shows what is further down, → what is further right. Each press moves the board 80px, and Shift plus an arrow moves it 400px. Holding a key keeps going.
- Nothing else changed: with something selected the arrows still move it, and they still belong to text fields, checklists, menus, panels and a focused resize handle. Alt+arrows and Ctrl+arrows work as before, and the phone layout is untouched.
- Moving the board this way is not an edit: it is not saved and not undoable.
- The Keyboard shortcuts list describes it.
- Nothing about saved boards changed.

## Coordinator can merge clean high-risk pull requests without waiting (2026-11-23)

- Once `/check-pr` and all GitHub tests pass cleanly on a `high-risk` pull request, the crew coordinator now merges it and publishes `main` without waiting for the owner's yes (owner decision). Workers still never merge `high-risk` pull requests themselves, and any real bug, clash, or data-loss concern still stops for fixes or owner approval.

## Backspace at the start of a checklist item joins it to the item above (2026-11-11)

- Pressing Backspace with the cursor at the very start of a checklist item now joins its words onto the end of the item above it, with the cursor where the two meet. Before, nothing happened. It is the mirror of Delete at the end of an item.
- A first sub-item joins onto its parent. The joined item's own sub-items move up one level. A ticked item joins like any other; the result stays ticked only if both were. One Ctrl+Z undoes it.
- On the first item of a list nothing happens, and Backspace on an empty item still deletes it, as before.

## Claude Code best-practices check (2026-11-08)
- Weekly check of Anthropic's Claude Code best-practices pages: the advice is the same as on 2026-10-29, so nothing in the setup changed.
- The checklist document now shows the new check date and page fingerprints.
- Nothing about the app or saved boards changed.

## Claude Code best-practices check (2026-11-15)
- Weekly check of Anthropic's Claude Code best-practices pages: the advice is the same as on 2026-11-08, so nothing in the setup changed.
- The checklist document now shows the new check date, the new page fingerprints, and two small facts it records from the pages (`/context all` shows loaded files, and an environment variable can raise the Stop-hook block limit).
- Two new questions for the owner are written down in the checklist (whether the push guard should also cover Windows PowerShell, and whether security review can stall a background worker).
- Nothing about the app or saved boards changed.
- Owner answers (2026-11-16): the push guard now also watches Windows PowerShell commands, not only Bash, so a blocked push stays blocked on the Windows computer. Security review stays as it is for now.

## Bigger text sizes, up to 250% (2026-10-23)

- A+ now goes three steps further after Largest (175%): 200%, 225% and 250%. A− brings them back down; a size you saved before still loads.
- Everything on a card or container grows with the step, as the item buttons and card buttons already did: checklist tick boxes (and the tick mark and press area around them), the Completed header and its arrow, Clean up and Uncheck all, a link card's address box and Open link button, a board card's Open board button, the "Delete container?" question, and the label that follows a dragged item.
- At the biggest sizes a narrow card stays tidy: "Completed" is shortened with … instead of running off the card, Clean up and Uncheck all wrap onto two lines, at 225% and up a card’s buttons drop under its title instead of covering it, and a collapsed card's buttons stay inside the card. Item text in a 200px-wide card wraps to only a few letters a line at 250%, so widen the card at the top sizes.
- The toolbar, bars, side panels and menus keep their size, and so does the phone layout.

## Brain dump: turn a messy list into cards (2026-11-11)

- New: Brain dump. Open it from the Add group in the toolbar (the new icon next to Container), from the ⋯ menu in a medium window, or on a phone from + and from ⋯ (in the Board group).
- Type or paste one thing per line. A preview shows the cards you will get: a Note for a plain line, a Checklist for a line that starts with [ ], and a time tag when the line says how long it takes (30m, 1h30).
- "Add N cards" puts them on the board near what you are looking at, selected and not covering anything. One Undo takes them all away again.
- Times show in the preview only for now. They are not saved on the cards yet.
- Nothing you typed is lost if you close the window by mistake, until the cards are added.
- Not shown on a board that is shared with you to view only.

## Groundwork for "Brain dump": turning pasted text into card drafts (2026-11-11)

- Nothing changes on screen yet. This adds the reading step for a coming "Brain dump" feature: paste messy text and get one draft card per line.
- Bullets, numbers and checkboxes at the start of a line are dropped. A line with a checkbox becomes a to-do draft; every other line becomes a note draft.
- A time estimate such as "30m", "1h", "1h30", "1.5h", "90 min" or "(45m)" is read out of the line and kept as minutes. Lines with no estimate have none.
- At most 300 drafts are read from one paste (the same limit as importing a file), and each title is cut at 200 characters.

## Calendar arrows sit together (2026-11-19)

- In the Google Calendar panel, the back and forward arrows (‹ and ›) now sit side by side on the left, with the dates (like "15–21 Nov 2026") after them, in both Week and Month. They look like the joined pair of arrows in the Habits panel. Clicking, hover text and Tab order are unchanged.

## Calendar: new events start at noon (2026-11-17)

- A new Google Calendar event now starts at 12:00 PM and ends at 1:00 PM (it was 9:00 to 10:00). This is what the + beside a day opens, and clicking a day in the Month grid that is already picked.
- Events you already have are unchanged, and saved boards are unchanged.

## Calendar: quicker delete (2026-10-24)

- Deleting a one-off calendar event (not part of a series) no longer asks "Delete “Dentist”?": the event card's trash, the edit form's Delete button and the Delete or Backspace key delete it at once. If the event has guests, "Send update emails to guests?" is still asked.
- Deleting an event in a repeating series still asks "Delete “Team stand-up”?", now with just two red buttons of the same width, **Only this event** and **All events in the series**, and no Keep button. Escape, × or a click outside still keeps the event. The buttons sit side by side when there is room, or one above the other at full width when the card is too narrow for both labels on one line. Neither button has the keyboard when the question opens, so holding Enter on the trash can't delete by accident; Tab reaches them.
- Only a fresh press of Delete or Backspace deletes. Holding the key down never deletes an event, and once a press has deleted one, the held key doesn't go on to delete the note selected on the board behind.
- Read-only events, and the "Save changes to which events?" question with its Cancel button, are unchanged.

## Drag an event to another day in the calendar (2026-11-11)
- In the Calendar panel you can now drag one of your own events onto another day, in the Week list or the Month grid, and it moves there, as in Google Calendar. It keeps its time of day and its length.
- The day you are over is outlined while you drag, and a copy of the event follows the mouse. Escape cancels. Letting go on the same day does nothing.
- It is saved to Google like pressing Save in the event form. Afterwards the "Event saved" message appears with Undo, which puts the old day back and never emails guests. If Google says no, the event jumps back to its old day and says so.
- An event with guests asks "Send update emails to guests?" first. A repeating event moves on its own, as it does in the form.
- A click on an event still opens it, and events that are not yours (gray) can't be dragged. Touch screens are unchanged for now: tap still opens the event. The event form's Start date still moves an event by keyboard.
- Nothing about saved boards changed: calendar events are not board data.

## Calendar: the end time follows the start time (2026-10-29)

- In the calendar's New event and Change event forms (the quick-add and the full form), changing the start time now moves the end time by the same amount, so the event keeps its length, as in Google Calendar. A new event starts at one hour, so 10:00 becomes 10:00 to 11:00, and 14:00 becomes 14:00 to 15:00.
- Changing the end time only changes the end; that becomes the event's new length for the next start change.
- A one-day event never runs past midnight this way: its end stops at 23:59. An event that already spans several days carries its end across midnight.

## Calendar: adding and changing an event opens an overlay (2026-10-24)

- In the Calendar panel, the + for a new event and the pencil on an event's card no longer take over the whole panel. A small overlay pops up just left of the panel, level with the day or event, like the event card, and the Week or Month list stays in view.
- Adding starts as a quick-add: title (the cursor is already in it), date, start and end time (9:00 to 10:00 to begin with) or All day, Save, and More options. Enter in the title saves. More options opens the full form (Ends, Guests, Cancel) in the same overlay with everything you typed kept.
- Changing an event opens the full form straight away, as before, but in the overlay. Clicking an open event's card again still opens it.
- Escape, the new × or a click outside closes the overlay without saving; saving or deleting closes it and the list shows the result. On a phone it is a sheet from the bottom, with 16px fields so the page doesn't zoom, and it sits above the keyboard.
- The form's rules are unchanged: end-before-start note, guest emails, the repeating-event questions and the Delete question.

## Drag the divider between the expanded Month calendar and Main checklist (2026-11-24)

- When the Month calendar is expanded beside the open Main checklist on desktop, the divider between them can now be dragged left and right (or moved with the Left/Right arrow keys, and double-clicked to reset) to smoothly adjust how much space each panel takes, keeping both at least 300px wide.
- Dragging this expanded split leaves both panels' remembered normal widths untouched, so collapsing the calendar or switching back to Week view restores their usual widths cleanly.

## Calendar events you're going to are green (2026-11-21)

- In the Calendar panel (Week and Month), every event you haven't said No to is now green: your own events, invites you accepted, and invites you answered Maybe to or haven't answered yet.
- Maybe and unanswered invites also get a dashed green edge, as a reminder to reply.
- Events on days already gone are a paler green, so the past still looks faded; past dates keep their gray.
- Declined events, and Google's special kinds like birthdays or out of office, look the same as before.

## Calendar: only real meetings are green (2026-11-22)

- Green in the calendar panel now means a real meeting: an event with someone else on its guest list, or one someone else sent you (an invite, such as an interview invite). Invites you haven't answered or said Maybe to still get the dashed green edge.
- Events you made just for yourself, with no other guests (reminders, blocks of time), keep the normal event color again, in the Week list, the Month grid, the picked day's list and search results. Past ones still fade as before.
- Add a guest to one of your own events and it turns green as soon as you save it.
- Declined events and Google's special kinds (birthdays, out of office, focus time) look as before. Nothing is saved or sent differently; boards are unchanged.

## Ctrl+Z and new keys for calendar events (2026-11-17)
- With the Google Calendar panel open, Ctrl+Z now undoes your last event change: adding, editing, dragging or deleting an event. It works even after the "Event deleted · Undo" message has gone, and it goes back several steps (the last 50).
- Ctrl+Y (or Ctrl+Shift+Z) makes the change again. Neither ever emails guests.
- If your last change was on the board instead, Ctrl+Z undoes the board first: whichever change is newer goes first. With the panel closed, Ctrl+Z and Ctrl+Y work on the board exactly as before.
- New keys in the calendar panel: N for a new event (12 to 1pm on the day you're looking at), T for today, ← and → for the week or month before or after. With an event's card open: E or Enter to edit it, Ctrl+D to copy it at the same time (the copy has no guests, so no one gets an invitation). None of them fire while you're typing.
- The Keyboard shortcuts list (?) shows the new keys.
- If an undo or redo can't reach Google (you're offline, or Google says too many requests), it says so with a **Try again** button and keeps that step, so Try again, or pressing Ctrl+Z (or Ctrl+Y) again, tries it again. A step is dropped only when Google says the change can't be made (the event is gone, for example); then the message says the change can't be undone (or redone), with no button.
- The little message at the bottom is now as wide as its words on a phone, and wraps onto a second line there instead of being cut short with "…".
- Undo puts back the event as this session last saw it, even if it was changed in Google Calendar since.
- Nothing about saved boards changed. The event history is kept in memory only, and is gone after a reload.

## Calendar changes show at once (2026-11-17)
- Adding, changing or deleting one of your events in the Calendar panel no longer waits for Google: the form or card closes and the list shows the change straight away, while Google is told in the background, as Google Calendar does. This covers one-off events, "Only this event" of a repeating one, and dragging an event to another day.
- The "Event added / saved / deleted · Undo" message appears once Google has answered, so Undo always works on something Google really has.
- If Google says no, only that event goes back to how it was (a new one disappears again, with its typed title), and the bottom message says "That change didn’t reach Google Calendar. Try again later." with no Undo.
- While a change is still on its way, that event's pencil and trash are greyed out, so it can't be changed twice at once.
- Notes about the form itself (an end before the start, a bad email address) still show in the form, which stays open. Changes to "All events in the series" still wait for Google with the form open, as before.
- Nothing about saved boards changed: calendar events are not board data. The Visualizer is unchanged.

## Google Calendar stays connected (2026-11-20)

- Google's window for the calendar can now show just once per account, instead of about once an hour. A small helper on Cloudflare (free plan) keeps a long-lived permission from Google, encrypted, and hands the page a fresh hour's access whenever it needs one, on any device, with no window. It lasts until you click the new **Disconnect calendar** link at the bottom of the calendar panel, take the permission back in your Google account, or delete your account.
- Signing out on one device forgets only that device's access; your other devices stay connected.
- Deleting your account now also cancels the calendar connection at Google and deletes the helper's copy.
- It is off until the owner sets the helper up (docs/calendar-helper-setup.md) and adds its address as the `CALENDAR_HELPER_URL` repository variable. Until then, or whenever the helper can't be reached, the calendar works exactly as before.
- The Privacy policy (now effective November 20, 2026) and the Delete your account page say what the helper keeps and where. The site's security policy allows the helper's address only when it is set.
- Saved boards are unchanged: nothing here touches board data.

## Easier-to-read Calendar Month view (2026-11-23)

- **Expand / Collapse toggle (desktop Month view):** Added an Expand/Collapse button in the Google Calendar panel header (beside ×) when in Month view on desktop. Expanding widens the panel to ~80% of the viewport (leaving at least 300px of board visible) without changing your saved panel width; collapsing, switching back to Week view, or closing the panel restores your saved width, and dragging the resize strip exits expanded mode and saves the new width.
- **More readable Month event chips:** Replaced the indented dot with a slim colored left bar (2.5px, keeping green-meeting, read-only, past, and all-day distinctions), raised chip wrapping from 2 lines to 3 lines, and increased events shown per day before `+N more` (up to 3 when narrow, 4 at normal desktop width, 5 when wide/expanded).
- **Desktop hover preview:** Hovering over a Month event chip with a mouse shows a floating preview popover with the full title, date/time range, and location (when present), without stealing focus or interfering with click-to-open or drag-to-move. Dismisses cleanly on mouseleave, click, drag start, or Escape, and never opens on touch taps.
- **Side-by-side selected-day agenda when wide:** When the Calendar panel is wide (`>= 800px`, e.g., expanded or resized wider) on desktop, the selected day's full event list appears right beside the Month grid instead of pushed below it; narrower panels and phones keep it stacked below the grid.

## Calendar Month view: tidier event text (2026-10-24)

- In the Calendar panel's Month view, an event's name now continues right after its start time on the same line and wraps under the time, like Google Calendar, instead of sitting in a thin column beside it.
- Each event (timed or all-day) shows at most two lines, then ends with …, so the days stay even. The full name is still in the hover text and in the day's list under the grid.
- Words are no longer broken in the middle ("Produc / t / Market / ing"); they wrap only at spaces. Only a single word longer than the whole line may still break, so nothing runs out of its day.
- The dot stays at the left of the first line. Narrow cells (no time or dot), the 3 / 2 events per day and "+n more" are unchanged.

## Calendar weeks show at once when you step (2026-11-19)

- Once a week or month has loaded in the Calendar panel, the one before and the one after are fetched quietly. Stepping to them with the arrows now shows their events straight away, then refreshes them in the background.
- A week or month that was not fetched yet shows "Loading…" and no events, never the previous week's events under the new heading.
- Any change you make (add, edit, move, delete, Undo, Redo) forgets what was fetched ahead, so an old or deleted event never comes back. Closing and reopening the panel also starts fresh.
- Your boards and what is saved are not touched. This only reads from Google Calendar.

## Repeating options in Google Calendar (2026-11-23)

- The event form (both quick-add and full form) now has a **Repeat** dropdown like Google Calendar's: Does not repeat, Daily, Weekly on that weekday, Monthly on the nth/last weekday, Annually, Every weekday, and **Custom…** (every N days, weeks, months or years, weekday buttons, monthly by day or weekday, and Ends Never / On a date / After N times).
- You can make a new event or an existing one-off event repeat, or change how an existing repeating event repeats across the whole series (including back to Does not repeat). Series with complex rules the app can't read stay read-only and untouched.
- Repeating events keep the same green/blue meeting look as other events, and Undo / Ctrl+Z removes a new series or puts the old repeat rule back.

## Less waiting after saving a calendar event (2026-11-20)

- Saving one event was already shown at once. What still felt slow came after it: every save threw away the weeks the panel had fetched ahead, so the next week (or going back to this one) showed "Loading…" until Google answered again. Now, once Google has the change, those weeks are fetched again quietly, and stepping after a save is instant again (about 0.96 s down to 0.14 s on a slow connection).
- "All events in the series" still waits for Google, but the Save button now says "Saving…" while it does, and the form closes as soon as Google has the change instead of also waiting for the whole calendar to be fetched again (about one round trip to Google sooner). The list then updates by itself a moment later; until it does, that series' events show as still on their way and can't be changed again.
- Nothing changes in what is sent to Google, in the questions asked before saving, or in Undo.

## A soft "Event added / saved / deleted · Undo" message in the calendar (2026-10-29)

- After you add, change or delete an event in the Google Calendar panel, a small message appears at the bottom of the screen, like Google Calendar's: "Event added", "Event saved" or "Event deleted", with an **Undo** button. It is the same message the board shows after a delete, and it goes by itself after 6 seconds.
- **Undo** takes the change back in Google Calendar: a new event is removed, a changed event gets its old title, times and guests back, and a deleted event (one, or a whole repeating series) comes back as it was.
- If Undo of an "All events" change only half reaches Google, the calendar is fetched again so it shows what Google has, and the message says so.
- Deleting an event someone already deleted in Google Calendar shows "Event deleted" without Undo, so it can't be brought back by mistake.
- Undo never emails guests. Guests who were emailed about the change are not told it was undone.
- Only one message shows at a time: a newer calendar or board message replaces the older one.

## Calendar stays steady between weeks (2026-11-19)

- Stepping through weeks no longer nudges the calendar sideways: the side panels now always keep room for a scrollbar, so a busy week that scrolls and a quiet week that doesn't look the same width.

## Calendar: scroll on through the weeks, past days faded (2026-11-20)

- The calendar's Week view is now one long list of days. Scroll down for later weeks and up for earlier ones, as far as you like.
- The heading above the list follows the scroll and names the week at the top.
- ‹ and ›, Today, and the keys ←, → and T glide the list to the week before, the week after, or this week. With reduced motion they jump straight there.
- A week whose events haven't arrived yet shows its days in light gray for a moment, and the list never jumps when weeks are added above.
- Days already gone are shown in softer colors, in the Week list and in the Month grid, so the past is easy to tell apart. They still open, edit and drag as before.
- The Month view is otherwise unchanged.

## Instant calendar search and 5-year partial matching (2026-11-23)

- Opening the calendar search box now preloads your events quietly in the background, so matching results appear immediately as you type instead of waiting on Google for every query.
- Widened partial-word matching from 2 years to the full **5 years back and 5 years forward** (matching Google's search window).

## Partial-match search in Google Calendar (2026-11-23)

- Calendar search now finds events on partial word matches (prefix, middle, suffix, multiple partial words, or part of a guest email — like typing "dent" for "Dentist" or "yak" for "Kayaking lesson"), even when Google Calendar's built-in `q` search misses partial words.
- Partial matching uses a read-only in-memory index of the primary calendar (2 years back and 2 years forward, refreshed automatically after any event change, fresh open, or account switch) combined with Google's 5-year search, with no new Google permissions.

## Search in the calendar (2026-11-19)
- The calendar panel has a new magnifier button ("Search events") next to Today. It opens a search box at the top of the panel, with the cursor in it. You can also press / with the keyboard in the calendar panel.
- It searches your whole main calendar, past and future, with Google's own event search: names, descriptions, places and guests.
- Results replace the Week or Month list while you have text in the box: grouped by date, upcoming events first (soonest at the top), then past events (most recent first). It shows "Searching..." while it waits and "No events found" when there are none.
- Click a result to go to that day and open the event's card. Escape, or the x in the box, closes the search and brings back the week or month as it was.
- Works on the phone too. The Keyboard shortcuts list (?) shows the new / key. Ctrl+F is still the board's Find.
- Nothing about saved boards changed. Search only reads from Google Calendar; it asks for no new permission and changes nothing.

## Calendar weeks start on Sunday (2026-11-17)

- In the Calendar panel, the Month view now starts each week on Sunday (Sun Mon Tue Wed Thu Fri Sat).
- The Week view shows the Sunday-to-Saturday week you are on, headed like "15–21 Nov 2026", instead of today and the next six days. Back and forward move a week, and Today returns to this week.
- Habits, the Journal, the Completed panel, the Visualizer and the week review keep weeks starting on Monday.

## Calendar: our own time picker, like Google Calendar's (2026-10-29)

- The Start and End time boxes in the calendar's New event and Change event forms (the quick-add and the full form) no longer use the browser's own time dropdown, whose minutes sat off-centre from the hours. They are now a text box showing the time as "2:00 PM" that opens a list of times every 15 minutes, with the current time in view and highlighted.
- The End list starts right after the start and shows how long each option makes the event: "2:15 PM (15 mins)", "3:00 PM (1 hr)", "4:30 PM (2.5 hrs)".
- A time can also be typed ("2:10pm", "14:10", "9") and is taken when you leave the box or press Enter; a time it can't read goes back to what it was.
- Keys: ↑ / ↓ move through the list, Enter picks, Escape closes just the list (the next Escape closes the form). A click outside closes the list. On a phone the options are big enough to tap (44px) and the text doesn't make the page zoom.
- Changing the start still moves the end with it, keeping the event's length.

## A time typed in a calendar event's name sets its start (2026-11-22)

- Type a time into a calendar event's title, like "Dinner 8pm" or "Dinner at 8:30pm", and press Save: the event moves to that time on the same day, keeps its length, and is saved as just "Dinner".
- A range like "8-9pm" or "8pm-10pm" sets both the start and the end.
- It works for new events and when changing an existing one. A number without am or pm (like "Room 101") stays in the name, and all-day events are left alone. Undo puts the old name and time back.

## Calendar week view: dates on the left, events beside them (2026-10-24)

- In the Calendar panel's Week view, each day now has its date on the left ("Thu 15") and its events in a column to the right. The first event sits on the same line as the date and the rest stack under it, so nothing is under the date any more.
- The date column is a fixed width, so all seven days line up. It fits the panel at its narrowest (300px) and on a phone. The + for a new event stays on the date's line.
- Today's date is shown in bold amber instead of with the words "· Today". The Month view is unchanged.

## Calendar loads many weeks ahead in one go (2026-11-20)

- In the Week view, once a week has loaded, the 4 weeks before it and the 8 weeks after it are fetched quietly in one request, so stepping through them shows events at once. In the Month view the month before and after come in one request.
- Weeks with more than 250 events are fetched with more pages (up to 4); if that is still not enough, only the weeks that were fully fetched are kept, and the rest load when you step to them.
- Stepping to within 2 weeks of the end of what was fetched fetches the next stretch.
- Events that run over two weeks show in both, the same as before.
- Fix: if you sign out and someone else signs in while the Calendar panel stays open, none of the first person's events can show up. Everything fetched is thrown away, and late answers for the first person are ignored.
- Your boards and what is saved are not touched. This only reads from Google Calendar.

## Honey well tick boxes (2026-10-23)

- Checklist tick boxes have a new look: a honey-tinted square with an amber border, filled with amber and a thin tick when ticked (a dark tick in dark mode). The border, corners and tick grow with A−/A+.
- The text of an item now looks centered next to its box: the box sits a hair lower (1px at Normal, 2px at 200%), and the gap between box and text grows with A+.
- Pressing a box shrinks it a little for a moment. Ticked text is struck through with a softer line and faded.
- The phone keeps its 16px box and big tap area. Habits and the Completed panel boxes look the same as before.

## Checkbox and text line up better (2026-11-13)
- A checklist item's tick box now sits only a little below the middle of the first line of text: 2.5% of the line (0.5px at Normal, 1px at 200%), down from 7.5% (1.5px at Normal). The text now reads about 1px lower beside its box than before, which is the look you liked in the other app.
- The Completed panel's tick boxes (items and sub-items) got the same small nudge, so their text lines up with the box the same way as in a checklist. Before, they had none and the text looked a touch too low.
- Only the boxes moved, by one pixel at most at Normal. Their size, the gap to the text and the fold arrow are the same.
- Nothing about saved boards changed.

## Checklist centering guard (2026-10-23)

- A new browser test now checks, in the real app, that every checklist tick box stays centered on its item's first line (the same slightly-low spot as before), with the same gap to the text. It covers every text size, every text style and font, open and ticked items, sub-items, wrapped items, light and dark, and the phone layout. If a later change moves the centering, the test fails and names the case.
- Nothing looks different: the test found the centering already correct everywhere.

## Checklist items in the Completed panel (2026-11-13)

- The Checklist panel no longer has its own Completed button. Items you clean up from the main checklist now show in the normal **Completed** panel (⋯ More, or the Completed tile on a phone), mixed in with the open board's items under the same dates, each marked "Checklist".
- Unticking one sends it back to the end of your main checklist. Ctrl+Z in the Completed panel takes your unticks there back, newest first; Ctrl+Y redoes them. Once they run out, Ctrl+Z there does nothing (it never undoes something else on the board).
- Boards already saved are not changed: each board still keeps its own Completed items.

## Pasting copied checklist items keeps them as items (2026-10-31)

- Copy several checklist items, click into an item of another list and press Ctrl+V: they now land as separate items with the same indent levels, text formatting (bold, italic, size, font) and ticked state, instead of everything going into one item.
- They go after the item you clicked in (in its place if that item is empty), are highlighted afterwards, and one Ctrl+Z takes them back.
- Text copied from another app still pastes as plain text, as before.
- Only items copied in the app paste as items; the same words copied again, or copied from another app, or Ctrl+Shift+V, paste as plain text. Items copied across several lists paste as text only.
- Sub-items copied without their parent keep their indent relative to each other.

## A "3 of 5 done" count on checklists (2026-11-03)

- A checklist now shows a small gray count right after its title, such as "Groceries 3/5": ticked items out of all items, sub-items included. When everything is ticked, the count turns the calm green of the tick boxes.
- An item that has sub-items shows its own small count after its text, such as "Trip 1/3", for everything under it.
- A blank item at the end of a list is not counted, so a finished list reads "all done" without it.
- The count updates as you tick, untick, add or delete items. It is not saved, can't be edited, and is not part of the title or the item text, so copying and Download as text are unchanged. Screen readers hear "3 of 5 done" on the list's title.
- It works on the phone, at every text size and in dark mode. The Habits and Completed panels have no counts.

## Checklist panel header lines up (2026-11-19)

- "Clean up" in the main Checklist panel is now the same size as the "Checklist" title, in the title's dark color and a bolder weight, so it no longer looks smaller. Clean up on cards on boards is unchanged.
- The done count (like "5/13") beside the title sits about 1px higher, level with the title's capital letters instead of hanging below.

## Deeper checklist indent (2026-10-29)

- Sub-items in a checklist are now indented 32px per level (it was 22px), so it is easier to see which item a checkbox belongs to. No guide lines were added.
- The Completed panel indents sub-items the same way.
- In a narrow list the deepest levels stop short instead of squeezing the text into a column a few pixels wide.
- Dragging an item to the right of another one still nests it under that one.

## Checklist rows a little further apart (2026-10-24)

- There is now 2px more space between checklist items (and between sub-items) at Normal text size. It grows with the A− / A+ text size like the text does. The tick boxes, the grip and trash can, and the phone's tap areas sit exactly where they did.

## Checklist panel no longer pans the board (2026-11-23)

- Dragging to select items or text (or dragging items around) in the main Checklist panel never moves the board behind it, even near the top-left edge of the screen.
- Highlighting text inside a single checklist item on a board no longer pans the board when the pointer reaches the screen edge.

## Checklist panel keys and focus (2026-11-15)

- With a dialog open (Brain dump, AI settings, Sign out, Send feedback), Tab, Delete, Backspace and Ctrl+X no longer indent, delete or cut items selected in the Checklist panel behind it.
- Ctrl+Z on a new item in the Checklist panel keeps the keyboard in the panel, so the next Ctrl+Z steps the checklist back, never the board behind it.
- With the Main checklist board open beside the panel, pressing Enter in the board's copy keeps the cursor there instead of jumping into the panel's copy.
- Dragging an item in the panel over blank panel space no longer drops it into the board underneath.

## Checklist row spacing set to 1.5px (2026-10-26)

- The extra space between checklist items (and sub-items) is now 1.5px at Normal text size, halfway between the 1px that was live and the earlier 2px. It still grows with the A− / A+ text size. Nothing else about the rows moved.

## Checklist row spacing trimmed to 1px (2026-10-24)

- The extra space between checklist items (and sub-items) is now 1px at Normal text size instead of 2px, since 2px looked a bit too large. It still grows with the A− / A+ text size. Nothing else about the rows moved.

## Top-level checklist items fold with 1 or more sub-items (2026-11-23)

- Top-level parent items in checklists (both on the board and in the Main checklist) can now always collapse as long as they have at least 1 sub-item: the fold arrow appears beside the tick box, clicking it or pressing Ctrl+Up / Ctrl+Down hides and shows the sub-item, and the list adds the left room for top-level arrows as soon as any top-level parent has 1 sub-item.
- Nested parent items (sub-items with sub-items of their own) still require 2 or more direct sub-items to collapse. A fold saved on a nested parent with one sub-item still shows open without rewriting saved data.

## Highlighting words across checklist items, like a word processor (2026-11-01)

- Press on an item's text and drag into the next items: only the letters from where you pressed to where the pointer is get highlighted, not whole rows. A pointer just above the next item ends on the last line of the item above.
- Delete, Backspace or typing removes just those words and joins what is left of the first and last item. Enter splits there. One Ctrl+Z brings everything back.
- Ctrl+C / Ctrl+X take exactly the highlighted words; they paste into another list as items, and other apps get plain text.
- Ticking, the trash and dragging by the grip still act on every item the highlight touches. Dragging from the grip or empty row space still selects whole items.
- Shift+click on text extends the highlight.
- Deleting a highlight works like Backspace: the joined item is ticked only if both ends were, and a highlight from the very start of an item removes the items before the last one whole, leaving the last item as it was. When whole items go, the Undo message shows.
- With a highlight, Ctrl+Shift+Backspace still asks before deleting completed items, ? still opens the shortcuts list, and keys pressed while a question or panel is open leave the list alone.

## Claude Code best-practices check (2026-10-29)

- New `docs/claude-best-practices.md`: which Anthropic Claude Code pages we follow (the best-practices page and the ones on CLAUDE.md, skills, subagents, hooks, settings, permissions, costs and workflows), what each one recommends, and what we do about it. A daily check compares it with the live pages.
- `CLAUDE.md` now says how to start in a fresh worktree (`npm ci`), how to run a single test file, and what to keep when a long session is compacted. It also points to the new file.
- `CLAUDE.local.md` and `.claude/settings.local.json` are now ignored by git, so personal notes and settings can't be committed by accident.
- No app changes. Twelve questions for the owner are listed at the end of the new file.

- CLAUDE.md's "Code layout" section is now three short rules (the model is pure, store actions get the core through StoreContext, components hold no geometry or rules logic); the plain folder descriptions are gone.

- CLAUDE.md is shorter: cut the parts Claude does by default, gets elsewhere (skill list, package.json, GitHub, hooks) or can look up, keeping the owner's own decisions.

## Clean up no longer squeezes a list's title (2026-10-24)

- A list's title was cut short ("To bo", "Packi") in narrow lists because the "Clean up" button took its room. The title now always keeps the full width it has without Clean up.
- If the title, Clean up, the collapse arrow and the trash can all fit on one line, nothing changes: Clean up stays between the title and the arrow. If they don't fit, Clean up drops onto its own short line under the title, at the right, and the arrow and trash can stay on the title's line.
- Clean up is still always visible while something in the list is ticked, at every text size, in light and dark, on the phone and inside containers.
- Boards already saved open the same as before; nothing in the saved data changes.

## Visualizer: watch your finished items replay (2026-11-12)

- New: Visualizer. Open it from the Visualizer row in the toolbar's ⋯ More menu, or the Visualizer tile at the bottom of the ⋯ sheet on a phone. It fills the screen and closes with the × or Escape.
- It replays what Clean up moved into the Completed panels, from the oldest item to the newest, then starts again. Every board is a wedge of a glowing ring, every list is a cell in it, and every finished item is a spark that flies in and lights its cell.
- Pick 7 days, 30 days or All (it opens on 30 days). Big numbers show items done today, this week and in the range, with a chart of items done per day and a "Just finished" list that fills as sparks land.
- It is always dark and glowing, even in light mode. With "reduce motion" on, nothing flies or spins: cells just light up as items land.
- It only looks. It never changes, saves or syncs your boards, and it counts every board you can open, hidden and shared ones too.
- With nothing cleaned up yet it says so.

## A + button in every container (2026-11-10)

- Every container's header now has a **+** button next to the collapse arrow and the trash can. Click it and a new checklist appears as the last card in that container, with the cursor in its title so you can type the name right away. Ctrl+Z takes it back in one step.
- If the container is collapsed, the + opens it so you can see the new checklist; Ctrl+Z removes the checklist and closes the container again.
- It looks and behaves like the other two buttons: the same size, shown when you point at the container, select it or tab to it (always shown on a touch screen), with the tooltip "Add a checklist".
- At the very biggest text sizes, a container's three buttons now stop growing a little earlier than before so the container's name still has room (a narrow container's buttons are about 52px instead of 80px at 400% text). Nothing changes up to 160% text (up to 200% in a container of the usual width).

## The container's + now adds the checklist at the top (2026-11-11)

- When you press the **+** in a container's header, the new checklist now appears as the **first** card, right under the container's name, instead of at the bottom. The cursor is in its title as before, and the cards that were already there move down one place.
- Nothing else changes: Ctrl+Z still removes it in one step, on a collapsed container the + still opens it first, and the container itself stays where it is and just grows downward. Same on a phone.

## Done counts sit a little lower (2026-11-11)
- The "1/3" next to a checklist's title and next to a parent item now sits a little lower, so its numbers line up with the middle of the lowercase letters beside it instead of looking too high.
- Only the position of those small numbers changed, at every text size and on the phone.
- Nothing about saved boards changed.

## Done count nudged up (2026-11-10)

- The small "1/3" count after a parent checklist item's text sat about 1px too low. It now sits a hair higher, so its numbers line up with the middle of the item's capital letters, at every text size.
- The list title's count was already lined up and is unchanged.

## Content Security Policy on every page (2026-11-11)

- Every page of the site (the app, About, FAQ, Terms, Privacy and Delete your account) now tells the browser which sites it may load scripts and frames from and send requests to. A script slipped into a page can no longer load more code from elsewhere or send your boards (or, later, your own Anthropic key) to a site of its own with a request.
- Allowed: the site itself, Google sign-in and Firebase sync, Google Calendar, Google Fonts, the Anthropic API, the YouTube and Vimeo players, and the visit counter. Pictures and videos on link cards still come from any secure (https) site.
- Download as picture / PDF: a picture from a site that allows copying is now loaded again as a picture and copied in, instead of being fetched, so it still shows in the download. Pictures from sites that don't allow it are a blank panel, as before, and a picture site that never answers no longer holds up the download (it is left blank after 8 seconds).
- Nothing you see changes, and saved boards are untouched. New browser tests fail if any page breaks the policy.

## Ctrl+Enter keeps the cursor in the last ticked item (2026-10-30)

- Ticking a checklist's last open item with Ctrl+Enter (⌘+Enter), or with the phone's Tick button, no longer takes the cursor out of the text and selects the whole list. The cursor stays in the item you just ticked, so pressing Delete right after removes just that item, never the whole list.

## Day scheduler groundwork (2026-11-11)
- Behind the scenes only: nothing changes on screen yet. The app can now work out the free gaps left in your day and how to pack time blocks and tasks into them.
- Meetings and other fixed events never move, nothing is placed in the past, times round to 5 minutes, and the order is kept. What doesn't fit is flagged to move to tomorrow.
- Days when the clocks change are counted in real minutes. Nothing about saved boards changed.

## Journal: divider fixes (2026-10-31)

- Clicking a divider, or pressing Ctrl+Z so one comes back under the cursor, puts the cursor next to it. Before, typing there did nothing, and a letter typed straight after the click could be lost.
- The Divider button on an empty heading line turns that line into the divider, as on an empty plain line. It no longer stacks a second divider right on top of one at the start of the note.
- Ctrl+A selects the whole note, also when it starts with a divider. Typing over it then gives a plain line, not a bullet or heading.
- Backspace and Delete next to a divider take a whole emoji (skin tones and flags too), and do nothing where there is nothing on that side.

## Drop an item anywhere in a checklist (2026-10-23)

- Dragging a checklist item over another checklist now adds it to that list wherever the pointer is inside the card, including the empty space under the last item. Before, only the spot next to the existing items counted, and the empty space said "Drop to make a new list".
- Over an item row, dropping still puts it before, after or under that item. Below the last item it goes at the end of the list, and the card gets the dashed amber outline to show it.
- "Drop to make a new list" now only shows when the pointer is outside every checklist.

## Steadier test for hover buttons (2026-11-21)

- A browser test from the paint fix sometimes failed on GitHub because it checked a card's buttons a moment too early after pointing at the card. It now waits for them. Nothing in the app changed.

## Buttons keep their keys over a word highlight (2026-11-02)
- With words highlighted across checklist items, pressing Enter, Space or a letter while a button has the keyboard focus (for example a row's "Move up") now presses the button. Before, the highlighted words were replaced by a split and the button did nothing.
- Pasting lines copied from a Journal note into a checklist item is now also ignored while a "Delete …?" question is open, like the other pastes.

## Fold arrow is bigger and darker (2026-11-11)

- In a checklist, the small arrow left of a parent item is now about a third bigger, drawn a little heavier and in the full text color, so it is easy to see in both light and dark mode. It keeps its 4px gap to the tick box and stays on the middle of the first line.
- It grows with A− / A+ again, all the way up, instead of stopping at 110%.
- A checklist that has a parent item now gets a little extra room on its left (about 3px at Normal, more at bigger text sizes) so the bigger arrow is never cut off by the card's edge. Checklists with no parent items look exactly as before.
- Nothing about saved boards changes.

## Fold arrow no longer crowds the tick box (2026-11-11)

- In a checklist, the small arrow left of a parent item now ends a clear 4px (at Normal) away from the tick box, so it no longer looks like it touches the box's border. The folded arrow (pointing right) keeps a little more room, since it is narrower.
- At bigger text sizes the arrow used to grow until it stuck out past the card's left edge. It now stops growing at 110% of Normal's size, so it always stays inside the card, and keeps its gap to the box. On a phone it still presses from a 44px area that never covers its own tick box.
- Nothing about saved boards changes.

## Easier to click the fold arrows on checklist items (2026-11-21)

- The small arrow next to a parent checklist item (the one that hides or shows its sub-items) can now be clicked from a bigger area around it: at least 24px tall and 28px wide on a computer, reaching left into the empty space. The arrow itself looks the same size.
- The arrow sits about 5px further from its tick box, on the board and in the Main checklist, so the two no longer crowd each other. Items, sub-item indents and text don't move; a list with a top-level parent item gets 5px more room on its left.
- The bigger area never covers the tick box, the item text or the item's drag grip, and never reaches outside the card.
- Your boards are not touched by this change.

## Fold arrow only when there are two or more sub-items (2026-11-11)

- In a checklist, the fold arrow left of a parent item now shows only when that parent has 2 or more sub-items. A parent with just one sub-item has no arrow, at the top level and nested alike, since there is nothing worth hiding.
- If a parent with one sub-item was folded before, its sub-item now shows and there is no arrow. Nothing is erased: if it gets a second sub-item later, the arrow comes back with the fold it was saved with.
- The extra room on the left of a checklist, added for the bigger arrow, now appears only when some top-level parent has 2 or more sub-items.
- The done count (like 1/1) shows as before. Nothing about saved boards changes.

## Fold a checklist item's sub-items (2026-11-09)

- An item that has sub-items now has a small arrow just left of its tick box. Click it to hide its sub-items, and click again to show them. The item keeps its "1/3" count while folded.
- Ctrl+Up hides and Ctrl+Down shows the sub-items of the item you are typing in (⌘+Up / ⌘+Down on a Mac). The arrow can also be reached with Tab and pressed with Enter or Space.
- The fold is saved with the board. It stays after a reload, syncs to your other devices, and is kept in backups, exports, Version history and copied items. Ctrl+Z undoes each fold or unfold.
- Collapse all / Expand all leave item folds alone.
- The arrow keys, Enter and selections skip hidden sub-items. Copy, cut, delete, drag and move take them along. Search finds them and rings the folded item ("in a folded item") without opening it. Clean up still moves hidden ticked items to Completed.
- On a phone the arrow can be tapped across a 44px area without touching the tick box.
- Ctrl+Up / Ctrl+Down only take the key when they fold or unfold something. Otherwise the key does what it always did (jump by paragraph; on a Mac, to the start or end of the text). The arrow darkens on hover.
- When the Claude connector deletes or moves out an item's last sub-item, the fold goes too, as in the app.
- **For the owner, after this goes live:** update the Claude connector's local copy (pull the latest code in its folder). An older connector refuses to edit boards that have folded items.

## Calmer format bar (2026-11-02)

- The small bar with Bold, Italic, the sizes and Font no longer pops up while you are still dragging a highlight.
- A moment after you let go of the mouse (or stop pressing keys when highlighting with the keyboard) it fades in, above the highlighted text or below it if there is no room above, so it never covers what you highlighted.
- It disappears at once when you type, delete, cut or copy. After Ctrl+C it stays away until you highlight something else.
- Alt+F10 still shows it right away and moves into it. Nothing changes about saved boards.

## Tapping a tick box on an iPhone ticks it again (2026-10-29)

- Fixed: on an iPhone, tapping a checklist tick box while typing in the same list could leave the box unticked (the cursor stayed in the text, but the tap did nothing). The tap now ticks the box and still keeps the cursor and the on-screen keyboard in the text. Other phones and computers work as before.
- The browser tests now also run this tap check in Safari's engine (WebKit) on an iPhone 14 profile, so it is checked on every change. It is an emulation: it checks the tick and where the cursor stays, not how a real iPhone keyboard looks or feels.

## A parent item's count never drops to its own line (2026-11-11)

- The "0/2" after a parent checklist item used to fall to a line under the text when the item's last line was nearly full, making the item one line taller.
- It now always stays on the text's last line. When that line is full, the count sits in the empty space at the right end of the row (where the drag and trash buttons show on hover), so the text wraps exactly as it would without the count.
- No card or container changes width.

## A time-estimate clock on every checklist item (2026-11-11)

- Each checklist item now has a faint clock button at the far right of its hover buttons (after the drag grip and the trash can). Click it to give the item an estimate: 15m, 30m, 45m, 1h, 2h, or your own minutes, the same box notes use. Setting or clearing is one undo step.
- On a phone the clock shows while you are typing in the item, with a full-size touch area, next to the grip.
- To make room, the free space at the right end of every item is 26px wider. A parent's "0/2" count still stays on the text's last line and never covers the clock; on a phone the free space grows a little more (16px at Normal text, more at bigger sizes) so a count like "0/12" always fits before the clock. At the biggest text sizes (225% and up) items show no clock, as notes don't.
- Fixes to the estimate box: after Ctrl+Z inside the Minutes box it shows the undone value, so Enter no longer puts it back; pressing the pill again to close the box keeps the keyboard on the pill; and selecting from one item into the next and deleting now keeps the lower item's estimate when the upper one has none, as joining with Backspace does.
- The box no longer re-measures itself on every change to the board, and every item row no longer listens for it opening.

## Journal + tidy-up (2026-11-11)
- Nothing changes for you: no button or key does anything different.
- Two code notes that still said a new general note is added "below" now say it is added first, at the top; the note on typing now says it goes into the top note when none is named (the panel always names one).
- Two new automatic tests: one shows that an out-of-date note id can't hide the notes you already wrote when you press +, and one shows that typing with no note named goes into the top note.

## One + at the top of the Journal's general notes (2026-11-11)

- The + that adds a general note is now a single button at the very top of the general notes, at the right end of a slim row under the Formatting bar, instead of one in every note's header. Its tooltip and name are still "Add a general note".
- Because it is at the top, the new "Untitled note" goes first in the list, above all the others, with the cursor in its name and the name selected so you can type straight away.
- Renaming, folding and the trash work as before. Notes you already have keep their words and their order; adding one just puts it on top.

## Journal text is 14 by default (2026-11-11)

- Normal Journal text is now 14px, in new notes and in notes written before. The Size box shows 14 for it.
- Words you gave a size on purpose keep that size. Headings look exactly as before (the Size box shows 16 for a plain heading).
- 16 is now a size of its own: choosing 16 makes the words a little bigger than normal, and choosing 14 takes the size off. Pressing Enter still carries the size to the next line.
- Words made Small or Large long ago keep their look (they show as 14 and 21).
- Checklist items copied into the Journal: Small now comes in as 12, one step under normal text.
- **Behind the scenes:** boards are now saved as version 5. A copy of the app from before this change (an old tab, say) refuses them and asks for a reload instead of quietly dropping a size of 16. The Claude connector needs its newest `busyants.mcpb` (version 1.6.0, built with `npm run mcp:pack`) to change your boards again; until then it says "Safe to edit: no" and changes nothing.

## Habits opens as wide as the Journal and Calendar (2026-11-12)
- The Habits panel now opens 420px wide, the same as the Journal and the Calendar (Week view). It used to open 300px wide.
- If you already dragged the Habits panel to a width of your own, that width is kept. Only a Habits panel you never resized opens wider; double-clicking its edge strip now brings it back to 420px.
- A new automatic test opens the Calendar, the Journal and Habits on a fresh board and checks they are the same width.

## Journal: new ways to add a divider (2026-11-11)

- Typing `--` on an empty line and pressing Enter now makes a divider. Typing `---` no longer does; it stays as words.
- New shortcut, as in Google Docs: hold Alt, press I, then R (Option on a Mac) to put in a divider, just like the Divider button. One Ctrl+Z takes it back.
- Both are listed in the Keyboard shortcuts (?) panel, and the Divider button's tooltip shows Alt+I, then R.
- Nothing about saving changed: a divider is still saved and shown everywhere else as a `---` line, and notes already saved open unchanged.

## Journal: divider lines (2026-10-31)

- The Journal's Formatting bar has a new Divider button. It puts a thin gray line across the note under the line you are on and moves the cursor to a new line below it.
- Typing `---` on an empty line and pressing Enter makes a divider too. `---` anywhere else stays as you typed it.
- Backspace at the start of the line after a divider, or Delete at the end of the line before it, removes it. Ctrl+Z brings it back.
- Dividers are saved with the note and go everywhere the note goes (sync, backups, Version history). Everywhere else (the board card, search, Download as text, the Claude connector) they read as `---`. Dividers don't count as words.
- Notes written before open unchanged. An app tab still open from before shows a divider as the words `---`.

## Journal: fold all general notes, and rearrange them (2026-11-21)

- A new button left of the + in the Journal panel's header folds every general note at once ("Fold all general notes"). When they are all folded it opens them all again ("Unfold all general notes"). The days are left as they are.
- With two or more general notes, each has a grip (six dots) beside its trash: drag it up or down to put the note in a new place. The other notes slide aside to make room.
- From the keyboard, Alt+Up / Alt+Down on a note's arrow or name moves it one place; the keyboard stays on it and a screen reader hears the new place.
- The new order is saved and syncs like any change. Each move is one Ctrl+Z step (Ctrl+Y moves it again). Folds are still not saved: every note opens when the panel opens.

## General notes in the Journal (2026-10-29)

- The Journal panel has a new "General notes" section at the top, above today's page, for notes that aren't tied to a day. It is open every time the panel opens; click its header (or press Enter or Space on it) to fold it away and bring today's page up. Folded, it shows its first line.
- It uses the same Formatting bar as the days, and Ctrl+Z / Ctrl+Y work in it.
- It is saved as one note on the Journal board (first line "General notes"), so it syncs, backs up, exports and shows in Version history like the rest of the journal. It is made the first time you type in it, and it never counts as a day.

## Several general notes, with names (2026-11-10)

- The Journal panel can now hold several general notes. The + at the right of a note's header ("Add a general note") adds an "Untitled note" right below it, with its name selected so you can type a new one straight away.
- Click a note's name to rename it: Enter or clicking away saves, Escape puts the old name back, and an empty name becomes "Untitled note". Only the small arrow folds a note now.
- The trash in a note's header deletes it, with "Deleted 1 note" and Undo; Ctrl+Z brings it back too. The last one can't be deleted, so there is always one. The existing "General notes" note keeps its name and words.
- If an older copy of the app (one still open in another tab or on another device) saves the Journal, your extra general notes no longer drop out of the panel: this device remembers them and lists them again, and the next change puts them back in place everywhere.
- Typing a name with a Japanese or Chinese keyboard: the Enter that picks a character no longer saves the name early.
- Deleting your account also clears the general notes this device remembers. Two tabs open on the Journal now agree on the general notes straight away. A general note's name is at most 200 characters.

## Journal list markers in the text color, and typed lists checked in every day (2026-11-21)

- In the Journal, every list marker (bullets, 1., a., i., 1) and the rest) is now drawn in the note's own text color, so it stays white in dark mode instead of turning gray.
- New browser tests check that typing "1. ", "1) ", "- " or "* " starts a list in today's page and in an earlier day opened in place, on a new line and on the first line under the date. It already worked there; nothing in the typing changed.

## Typing a list start on a list item switches it (2026-11-22)

- In a Journal note, typing `1. ` or `1) ` at the start of a bulleted item now makes it numbered, and `- ` or `* ` at the start of a numbered item makes it bulleted, as in Google Docs. The item keeps its indent, and the typed characters go away.
- `1) ` on a `1.` item switches it to the `1)` style, and `1. ` switches it back.
- Only that item changes. Ctrl+Z right after brings back the typed characters as words.
- It works the same in general notes and in day entries. Typing the kind the item already has (`- ` on a bullet) stays as words. Saved journals are unchanged.

## Journal bullets and numbers match the text size (2026-11-20)

- In the Journal, the bullet or number of a list item is now as big as the item's first character, at every indent level. A line sized 24 gets a 24 bullet or number, a line sized 10 a 10 one, and a plain line looks exactly as before.
- The marker stays on the text's baseline and the indent steps do not move. Nothing about how notes are saved changed.

- Spec wording: General notes typed on two devices before they sync follow the last save, like a day's note; the other device's text may be brought back from Version history.

## Pasting in the Journal keeps text size, lists and indents (2026-11-01)

- Copy lines in a Journal note (today's, another day's or the general notes) and paste them into a Journal note: they keep their text size, bold, italic, underline, strikethrough, highlight, fonts, bulleted and numbered lists with their indent levels, headings and dividers.
- Checklist items copied with Ctrl+C paste into the Journal as a bulleted list, sub-items as deeper levels (up to four), keeping their bold, italic, size and font. Ticked items arrive as plain words, with no tick.
- Lines copied in the Journal paste into an item of a checklist as separate items, sub-items by indent level; dividers are skipped. The formatting a checklist has (size, bold, italic, font) comes along.
- Text copied from other apps still pastes as plain words, and so does Ctrl+Shift+V.
- A paste is one Ctrl+Z step, and pasting over selected words still replaces them.
- Nothing about how notes are saved changed.

## The Journal's + sits next to the X (2026-11-11)

- The "Add a general note" + is now in the Journal panel's top bar, right beside the X that closes it, and looks like the X. The thin row it used to sit in, under the Formatting bar, is gone, so the notes start a little higher.
- It does the same as before: adds a new note at the top, with its name ready to type. On a phone it is a 44px button next to the X, and the title, + and X fit on one line.

## Google Docs size keys in the Journal (2026-11-06)

- In a Journal note, Ctrl+Shift+. makes the selected words larger and Ctrl+Shift+, makes them smaller (⌘ instead of Ctrl on a Mac), the same as the + and − beside the size number. They stop at 10 and 36, and each press is one Ctrl+Z step.
- On the board these keys already worked for card and checklist text (Small, Normal, Large); the Keyboard shortcuts list now names them as Ctrl+Shift+. / Ctrl+Shift+, in both the Text and the Journal parts.

## Journal text size is a number box (2026-10-30)

- In the Journal's Aa menu, Size is now a box showing the size of the selected words in px (16 is normal), like Google Docs, instead of Small / Normal / Large.
- − and + beside it make the words smaller or larger one step at a time (10, 12, 14, 16, 18, 20, 24, 28, 32, 36), stopping at 10 and 36. Clicking the number opens that list to pick from.
- Words made Small or Large before keep their look; the box shows them as 14 and 21.
- Pressing Enter keeps the size: the next line, or the next list item, is typed in the same size (after a heading it goes back to normal).
- **Behind the scenes:** boards are now saved as version 4. A copy of the app from before this change (an old tab, say) refuses them and asks for a reload instead of quietly dropping the new sizes. The Claude connector needs its newest `busyants.mcpb` (built with `npm run mcp:pack`) to read and change your boards again.

## Typed lists and Google Docs numbering in the Journal (2026-11-21)

- In a Journal note, typing `1. ` or `1) ` at the start of a plain line starts a numbered list, and `- ` or `* ` starts a bulleted one, as in Google Docs. Ctrl+Z right after turns it back into the words you typed.
- Numbered lists now nest like Google Docs: 1. 2. 3., then a. b. c. one level in, then i. ii. iii., then 1. again. A list started with `1)` shows 1) a) i) instead.
- The board card, search, export and copy show the same markers.
- Journals already saved keep their formatting. Their deeper numbered levels now show letters, and the note's text is updated the next time it is edited.

## Checklist panel list moved in from the edge (2026-11-21)

- The items in the Checklist panel on the left now sit 12px further in from the panel's edge, on a computer and on a phone. A parent's fold arrow lines up with the title "Checklist", and the tick boxes no longer crowd the edge.
- Sub-items still step in the same amount as before.
- Your boards are not touched by this change.

## Main checklist (2026-11-12)

- A new **Checklist** button in the bottom pill, after Journal and Habits (a Checklist tile in the ⋯ panel on a phone), opens your main checklist: one checklist, the same on every board.
- It is the only panel that opens on the **left**, so it can stay open beside the Journal, Habits, the calendar or any other panel on the right. It opens 420px wide; drag the strip on its right edge to resize it (this device remembers the width). On a phone it fills the screen, one panel at a time.
- Everything a checklist on the board does works there: sub-items, folding, ticking, dragging items, time estimates, formatting, copy and paste. **Clean up** moves ticked items into its own Completed record, which its Completed button shows.
- Ctrl+Z in the panel undoes only the checklist; on the board it undoes only the board.
- The list is kept on a board of its own, "Main checklist", hidden from the Boards menu, so it is saved online, synced and kept in backups and Version history like any board. Opening the panel saves nothing: it shows an empty list, and the board is made when you first type in it. Boards already saved are not changed.
- While Version history shows an old version, the panel is read-only and says "Viewing an old version".

## Version history and Completed move into the three dots (2026-11-12)

- On a computer, Version history and Completed are now the first two rows of the ⋯ menu at the top right. The History and Completed buttons by the zoom control are gone, so each lives in one place.
- Choosing a row opens its panel and closes the menu. Choosing it again, while the panel is open, closes the panel. The row says "Open" while its panel is open.
- The ⋯ button now always shows on a computer, not only in narrower windows. In a wide window it holds just these two rows; in a narrower one the folded buttons (Arrange, File and so on) follow them, as before.
- When Search finds a match in the closed Completed panel, the ⋯ button gets the same ring the Completed button used to get, and so does the Completed row once the menu is open.
- On a phone, ⋯ already had both as tiles; they work the same, and Version history now shows as pressed while its panel is open, as Completed already did.
- Nothing about saved boards, undo or the panels themselves changes.

## An open sub-item added under a ticked item unticks it (2026-11-03)

- When a checklist was fully ticked and you added a new sub-item (Enter at the end of its last sub-item, or Enter at the end of the parent), the new item was open but the parent stayed ticked. Now the parent, and any ticked item above it, is unticked right away, since it is only complete once every sub-item under it is. Ticked siblings stay ticked.
- The same goes for Enter at the start of an item, Enter over highlighted words, and pasting copied items or Journal lines under a ticked item.
- Ctrl+Z undoes the new item and the unticking together. Ticking the last open sub-item still ticks its parent.

## Moving a sub-item out ticks its parent again (2026-11-22)

- Adding a new sub-item under a ticked item unticks it, and deleting that sub-item ticks it again. Now moving the sub-item out from under it does the same as deleting it: press Shift+Tab on it, or drag it somewhere outside that item, and the item is ticked again if everything still under it is ticked.
- It works on checklist cards, in the Main checklist, on the phone and with the Claude connector's move, and one Ctrl+Z undoes the move and the tick together.

## Journal and Checklist edges move separately (2026-11-19)
- Dragging the right-hand panel's edge (Journal, Habits, Calendar, Completed, Focus timer, Version history) no longer pushes the Checklist's edge. Each edge moves only its own panel.
- The right panel's edge stops where 300px of board would be left beside the open Checklist, and the Checklist's edge still moves afterwards.
- Only a window too narrow for both panels plus 300px of board still makes the Checklist narrow.

## Done count only on top-level items (2026-11-10)

- The small "1/3" count after an item's text now shows only on top-level items that have sub-items. An indented item with sub-items of its own no longer shows one, folded or open.
- A top-level item's count still includes everything under it at every level, and the list title's count is unchanged.
- Nothing is saved differently; the count is still worked out each time.

## Big boards are lighter: faster panning and dragging (2026-11-20)

- The small buttons that show when you point at a checklist item (Move up / Move down, trash can, drag grip, time-estimate clock) and at a card or container's header (collapse arrow, trash can, clock, resize corner) now draw their icons with the page's styles instead of a little picture made of several parts each.
- They look, sit and work exactly as before (same sizes, colors, tooltips, keyboard and screen-reader names). On a big board (300 notes and 10 checklists of 50 items) the page has about half as many pieces to draw: 23,000 down to 11,500. Panning that board is about 60–90% smoother and dragging a card about 25% smoother; typing is a little lighter too.
- In Windows High Contrast these icons show in the button text color.

## Big boards: cards far off the screen aren't drawn (2026-11-21)

- On a board with hundreds of cards, cards and containers more than about a screen away from what you see are no longer drawn. They keep their size and place, and are drawn again a screen before they come into view, so you never see them pop in.
- Everything else works as before: Search and Alt+arrows jump to a far card, Download as picture or PDF shows every card, and moving or growing a card still pushes the others aside.
- While you drag a card, the cards that don't move are no longer redrawn on every mouse move (about a third of the work it was).
- Measured on a big test board (345 cards, computer slowed down 4 times): panning at 100% zoom about 14 to 15 frames a second before, 15 to 16 after; dragging and typing a little quicker; the board appears just as fast, with a short extra moment of work just after it shows. Zoomed out, where most cards are on screen anyway, it is about the same.
- Saved boards are unchanged.

## Big boards pan more smoothly (2026-11-21)

- Panning a big board is smoother: on a 345-card test board with the computer slowed down 4 times, it went from about 7.7 to 9.7 frames a second, and the slowest frames got about a sixth quicker.
- How: the buttons that only show when you point at something (a row's grip, trash can, time clock and Move up / down arrows; a card's or container's trash can and time clock) no longer draw their icons while they are faded out. They still fade in and out exactly as before.
- Nothing looks different: screenshots before and after, on the board, zoomed in, in dark mode and on a phone, are identical.
- The keyboard and screen readers still reach these buttons as before. Phones and tablets are unchanged.
- Your boards are not touched by this change.

## Opening and resizing panels is much quicker (2026-11-20)
- Opening, closing or dragging the width of a side panel no longer makes the whole board redraw its styles, so it stays smooth on a big board.
- The Visualizer loads the first time you open it (and as soon as you point at its button), so the app starts with about 13 KB less to download.

## On a phone, tapping into a card brings it to the top (2026-10-23)

- On a phone, tapping into a note, a checklist, a container or one of their titles now slides the board so that card's top sits just under the top bar. It used to stay wherever it was, often in the middle of the screen, where the keyboard covered it.
- A card made with + goes to the top of the screen too.
- Moving between the items of the same card does not move the board again. A card taller than the room above the keyboard still keeps the line you are typing in in view.
- The slide takes a fifth of a second, and is instant if your phone is set to reduce motion. Nothing saved changes; this is only where the board sits on the screen.

## A new item no longer gets stuck floating on the phone (2026-10-23)

- On an iPhone, resting a finger on the item you were typing could lift it, and the phone then kept the touch for its own text handling, so the item was left floating over the board and hidden from its list until the page was reloaded. Holding the text you are typing in now only moves the cursor or selects, as the phone normally does.
- If a lift, card move or resize ever loses its finger again, it ends by itself at the next touch, or when you switch to another app or tab, and the item stays where it was. Nothing was ever deleted: the item was only hidden while it floated.

## On a phone, tapping into a wide card zooms in until the text is easy to read (2026-10-23)

- When you tap into a note, checklist or container on a phone, the board now zooms in until its text shows at least 16px on the screen. Before, a wide card was squeezed to fit the screen and its text came out tiny.
- A card that is wider than the screen at that zoom starts at the left edge and runs past the right edge; the line you are typing in is kept in view, sideways too.
- If you were already zoomed in further than that, the zoom stays as you had it. A narrow card still fills the screen's width as before.
- At the bigger A+ text steps the text is already large, so less zoom is needed. Nothing saved changes; this is only how the board is zoomed on the screen.

## Checklist moves up, in the bottom pill and in the phone menu (2026-11-13)

- In the pill by the zoom control, the Checklist button now sits right after Timer: Search, Timer, Checklist, Calendar, Journal, Habits. Pressing Tab walks the buttons in that same order.
- On a phone, the Checklist tile in the ⋯ panel now sits right after the Timer tile too. The grid still has no gaps: the tile count is the same, so every row fills as before.

- The crew coordinator now puts merged changes live itself once all tests pass, without waiting for "publish" (owner request). Risky changes still need the owner's yes before they are merged.

## A list pulled out of a list keeps its width (2026-10-23)

- Drag one or more checklist items out onto empty board space and the new list is now as wide as the list they came from. Before, it always started at the standard width, even when the list had been made wider.
- Only the width is copied. The new list's height fits its items, however tall the old list was.
- A list that sits inside a container has no width of its own, so a list pulled out of one still starts at the standard width. A list made at the end of a container takes the container's width, as before.

## A ticked parent ticks again when its blank sub-item goes (2026-11-10)
- If you add a new blank sub-item under a ticked item, the item unticks (as before). Now, when you remove that blank sub-item (Backspace on it, the trash can, or Delete on selected items), the item ticks again, as long as every sub-item left under it is ticked. It carries on upwards if the item above it is then complete too.
- An item left with no sub-items keeps its tick as it was.
- One Ctrl+Z puts back the blank sub-item and the unticked item together.
- Cut (Ctrl+X) and removing highlighted words work as before and do not re-tick.
- Nothing about saved boards changed; no new data is stored.

## Split side-panel store actions out of boards.ts (2026-11-23)

- Behind the scenes: moved the Journal, Habits, and Main checklist side-panel store actions out of `src/store/actions/boards.ts` into their own focused files (`journal.ts`, `habits.ts`, and `checklistPanel.ts`), leaving `boards.ts` focused on board creation, navigation, deletion, and version restore.
- Nothing changes in how the app works, saves, syncs, or handles undo.

## Tidy-up in the Calendar panel code (2026-11-23)
- Split the large Calendar side panel file into focused files under `src/components/calendar/` (week list, month grid, event card, event form, repeat picker, move prompt, and confirmation dialog), keeping `CalendarPanel.tsx` as the single entry point.
- Unified the three mutually exclusive calendar overlay states (event card, add/edit form, and drag-move prompt) into one overlay state so only one can be open at a time.
- Removed duplicated date, time, all-day, and repeat input markup between the quick-add and full event form, and extracted pure draft validation (`validateDraft`) into `src/model/calendar.ts` with unit tests.
- Nothing changes in how the Calendar panel looks, saves, or behaves.

## Tidy-up in the Calendar store code (2026-11-23)
- Split the large Calendar store file (`src/store/calendar.ts`) into four focused modules: `src/calendar/api.ts` (Google Calendar REST client and shared `paginateEvents` helper), `src/calendar/source.ts` (Google and local demo token source), `src/calendar/vizFetch.ts` (Visualizer past-events fetcher), and `src/store/calendar.ts` (store state and actions, re-exporting public symbols so existing callers stay unchanged).
- Replaced four copy-pasted Calendar API pagination loops with one shared `paginateEvents` helper, covered by new unit tests in `src/calendar/api.test.ts`.
- Simplified the store's internals by collapsing three session resets into `resetSession()`, unifying undo and redo execution into `runHistoryEntry()`, wrapping in-flight tracking in `trackFlight()`, reusing `validateDraft` from `src/model/calendar.ts`, and splitting `save()` into `saveSingle()` and `saveSeries()`.
- Nothing changes in how Calendar sync, search, repeats, undo/redo, demo mode, or the Visualizer behave.

## Unified per-board undo histories and commits (2026-11-23)

- Kept every board’s undo history — including the currently open board — in a single map in `src/store/core.ts`, removing the duplicate history-swapping logic on board switches and remote replacements.
- Collapsed the three separate board commit paths (`commit`, `commitTo`, `commitOn`) into one `commitBoard` path and the two undo paths (`stepOpen`, `undoOn`) into one `undoOn` path, keeping the app state shape, undo/redo behavior, locked-board announcements, and saved boards unchanged.
- Stopped no-op commits on non-open boards from notifying store subscribers when nothing changed.

## Central Escape and overlay dismissal stack (2026-11-23)
- Behind the scenes: replaced the scattered Escape listeners across panels, dialogs, popovers, and calendar overlays with one small central LIFO stack (`src/components/escapeLayer.ts`) backed by a single capture `keydown` listener on `window`, plus a shared `useOutsidePointerDown` helper.
- Removed the CSS-class sniffing helpers (`closedOne`, `escapeIsFree`, `escapeIsForPanel`, `escapeIsForChecklist`), `TimePicker`'s global `closeTimeList`, and the no-deps `useEffect` listener churn in `EventCard`, `EventForm`, and `MoveAsk`.
- Nothing changes in how Escape or outside clicks behave across the app.

## Behind the scenes: split sharing storage and comments out of sharing.ts (2026-11-23)

- Moved the device-storage helpers for shared boards (`shareStorage.ts`) and card comment / unread tracking (`shareComments.ts`) out of `src/store/sharing.ts` into their own focused files with dedicated unit tests, bringing `sharing.ts` down from 999 lines to ~860 lines.
- Replaced the four separate upload-status flags (`uploading`, `again`, `failed`, `deleting`) on each share with one typed `UploadState` state machine, preserving in-flight upload tracking if deleting a share fails.
- Nothing changes in how shared boards, comments, permissions, or saved boards work.

## Clean up keyboard shortcuts and undo routing (2026-11-23)

- Merged the duplicated checklist keyboard shortcut code for board checklists and the Checklist panel into one shared helper, keeping all existing keyboard behavior unchanged.
- Extracted the undo and redo router (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`) into a clear helper covering the open board, Checklist, Completed, Journal, Habits, and Google Calendar panels.
- Added unit tests covering every undo routing branch and shared checklist shortcut path.

## Stylesheet split into focused files (2026-11-23)

- Behind the scenes: split the single 4,275-line stylesheet (`src/styles.css`) into 16 smaller feature-scoped CSS files under `src/styles/` (`tokens.css`, `base.css`, `toolbar.css`, `canvas.css`, `cards.css`, `checklists.css`, `overlays.css`, `panels.css`, `menus.css`, `comments.css`, `journal.css`, `habits.css`, `calendar.css`, `motion.css`, `phone.css`, and `visualizer.css`), imported in the exact same order.
- Updated the stylesheet and theme unit tests to read the imported files and verify that every partial in `src/styles/` is included.
- Nothing changes in how the app looks or behaves.

## Behind the scenes: untangle board sync watch flow (2026-11-24)

- Split the long `remote.watch` callback in `src/store/sync.ts` into four focused handlers (`handleDeletingMarker`, `reconcileHeld`, `handleFirstLoad`, and `handleRemoteUpdate`) and replaced the overlapping `ready`, `held`, `stopped`, and `failed` flags with one typed `SyncPhase` state machine.
- Replaced the `JSON.stringify` comparison when reclaiming a board from a deleted share with `deepEqual`, so matching boards saved with keys in a different order are left untouched.
- Extracted the shared `isGestureBusy(store)` helper (`src/store/gestureBusy.ts`) used by both `sync.ts` and `sharing.ts`.
- Nothing changes in how boards sync, save, or handle offline edits and account deletion.

## Time estimates on notes and checklist items (2026-11-11)

- A note or any checklist item can now carry a time estimate, from 1 minute to a day. It shows as a small gray pill such as "30m" or "1h 30m": at the right end of an item's row, or in a note's header.
- A note with no estimate shows a faint clock in its header when the pointer is over it. An item has no clock yet (any place for it covered the end of the item's text); an item gets an estimate from the Claude connector for now, and the owner is asked where its clock should go. Click a pill (or a note's clock) for quick choices (15m, 30m, 45m, 1h, 2h), a Minutes box, and Clear. Escape or a click elsewhere closes it without a change. Ctrl+Z undoes it like any other change.
- Ticking an item now quietly saves the day it was ticked; unticking removes it. Nothing shows this in the app yet: it is there for later features (a weekly review). Items ticked before today have no day.
- The Claude connector (version 1.7.0) can add items and notes with an estimate, change or clear an item's estimate, and shows estimates and ticked days when it reads a board.
- **Behind the scenes:** boards are now saved as version 6. Boards saved before open unchanged and are written as version 6 on their next save. A copy of the app from before this change (an old tab or another device that hasn't reloaded) refuses them and asks for a reload instead of saving over them. The Claude connector needs its newest `busyants.mcpb` (version 1.7.0, built with `npm run mcp:pack`) to change your boards again; until then it says "Safe to edit: no" and changes nothing.

## Leaving a shared board sends one leave (2026-11-11)

- Leaving a board someone shared with you, or opening a link to a shared board that can't be used, now tells the server only once. Before, a second leave could go out, and leaving could wrongly say "no longer shared with you".
- An out-of-date list of your shared boards no longer brings back a board you just left.
- If leaving doesn't work ("That didn't work"), the board always stays open, as before.
- If you were taken off a board while leaving it and then open its new link, the reopened board no longer closes by itself when the old leave answers. (The old leave can still take you off it on the server, as before.)

## Sign out asks first (2026-11-12)

- Choosing Sign out on a board (the button at the top right, the Sign out row in the ⋯ menu in narrower windows, and the Sign out row in the phone's ⋯ panel) now opens a small question: "Sign out? Your boards stay saved online. You can sign in again any time." You only sign out if you choose Sign out there.
- Unless the note by the zoom control says Saved (still saving, offline, or saving failed), the question warns that your latest changes may not be saved online yet, instead of the reassurance.
- Cancel, Escape, or a click beside the question keep you signed in, with the cursor back on the button you used. Board shortcuts do nothing while it is open.
- The Sign out on the "This Google account can't open a board" screen and the "couldn't be loaded" screen still signs out at once: there is no board there to lose.
- Nothing about how boards are saved or how signing out works changes.

## Sign-out and Delete account leave less behind (2026-11-15)

- Signing out, or another person signing in, now empties the Brain dump box and closes its dialog, so what one person typed is never shown to the next.
- The categories Sort with AI saved on this device now go on sign-out and when another person signs in (the same person signing back in after a reload keeps them), and Delete account removes them too (only that account's own). Nothing else is removed: the AI model, limit and count, the other device settings and other people's data stay.
- Boards are not touched.

## Journal size box: follow-ups (2026-10-31)

- In the size list, words made Small before now show 14 pressed. Words made Large before show 21, which isn't in the list, so nothing is pressed; − and + still step from 21 (to 20 or 24).
- Version history no longer makes an extra copy right after an update when the boards are the same and only the saved format's version number changed.
- **Behind the scenes:** the check that keeps changes held back while an account is being deleted elsewhere now reads the saved boards instead of matching their text, so a future change to how they are written can't quietly break it. A dark-mode color is now defined once.

## Left-drag moves the board; middle or both buttons select (2026-10-23)
- Dragging empty board with the left button now moves the board, with the closed glove from the first move. Dragging a card, container, item or handle still moves or resizes it, and clicking empty board still clears the selection.
- To draw a selection box, hold the middle mouse button, or the left and right buttons together (either one first), and move. It works anywhere on the board, over cards, containers, links and pictures too, and never opens a link or a menu. Holding Ctrl or Shift with it keeps what is already selected and adds to it.
- Holding Ctrl or Shift while left-dragging empty board still draws a selection box that adds to the selection, as before.
- The cursor is the normal arrow, and the closed glove only while the board is being moved with the left button.
- On a phone nothing changes: a swipe moves the board, and a finger that rests and then moves draws a box.
- The Keyboard shortcuts list describes the new buttons.
- Nothing about saved boards changed.

## Backspace never deletes a card after its text box vanishes (2026-11-09)

- When the text box you are typing in disappears because of something else (for example a change from another device), the next Backspace or Delete no longer deletes the card that was selected. It lets the card go instead, and an arrow key doesn't move it either. Other keys, such as Ctrl+C and Ctrl+D, work as usual.
- Clicking a card, or leaving a text box with Escape, and then pressing Delete still deletes it as before.

## One tap rule on phones, and a pinch is never a tap (2026-11-03)

- Fixed: on a phone, a two-finger pinch that started on a checklist tick box (while typing in the same list) could tick the box when the fingers lifted. A second finger now cancels the tap.
- A tap on a tick box now uses the same limits as every other tap: lifted within 0.45 seconds and within 5 pixels of where the finger came down (it was 0.5 seconds and 10 pixels). A very wobbly tap that used to tick may now need a second try.
- The tap rule is now written in the spec (Phone layout).

## A size box for checklists, notes and titles (2026-11-19)

- The small format bar (it shows when you highlight text in a checklist item, a note, a card title or a container title) now has the Journal's size box in place of Small / Normal / Large: a number in px with − and + beside it. − and + step through 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, and fade at the ends. Clicking the number opens the list of sizes.
- It works on the board and in the Checklist panel. The size still covers the whole item or box.
- With several items of different sizes selected, the box is empty and − / + move each one from its own size.
- Ctrl+Shift+. and Ctrl+Shift+, now step one size of the same list each press.
- Items, notes and titles made Small or Large before look exactly as they did; the box shows them as 12 and 18 (13 and 20 on a title), and − / + step from there.
- Copying items into the Journal and back keeps the size in px.
- **Behind the scenes:** a size other than the usual one is saved as its number. Boards saved before are unchanged. An older copy of the app (an old tab or a device that hasn't reloaded) shows a numbered size as the usual size and would save it that way, so reload every device once this is live.

## Text up to 400%, bigger tick boxes (2026-10-23)

- A+ now goes on to 300%, 350% and 400% after 250%. A− brings them back down; a size you saved before still loads.
- Checklist tick boxes are bigger: 20px at Normal (they were 16px), still growing with A− / A+ (80px at 400%), with the tick mark and the press area around them, and still centered on the item's first line. The phone keeps its 16px box.
- Everything else on a card keeps growing with the step. Two things stop where a 200px card runs out of room: a card's collapse and trash buttons stay at their 250% size (80px), and the hover buttons on a checklist item (trash, grip, move arrows) stay at their 190% size, so the big tick box never lands on them.
- At 300% and up a narrow card has almost no room left for item text beside the tick box: widen the card. Cards are not widened by themselves.

## A small animation when you tick an item (2026-11-13)
- Ticking a checklist item yourself (its box, a tap, or Ctrl+Enter) now plays a short animation: the box presses in and settles back while its tick grows in, and the strike-through and fade ease in. It takes about 200ms and nothing moves.
- It plays only for the item you ticked. Unticking, undo and redo, loading, changes from another device, Clean up, and a parent ticked because its sub-items were do not play it.
- It plays even if your device asks for reduced motion, as you asked.
- Nothing about saved boards changed.

## Ticked items stay in place (2026-10-23)

- Ticking a checklist item no longer moves it into a Completed section at the bottom of the list. It stays exactly where it was, struck through and faded. Unticking puts it back to normal in the same place. This is the same for sub-items.
- A small "Clean up" button now sits in the list's title row, left of the collapse arrow and the trash can. It shows only while something in the list is ticked. It sends that list's ticked items to the Completed panel, under today's date, as before. Arrange > Clean up and the phone's ⋯ > Clean up work as before too.
- "Uncheck all" is gone.
- Ctrl+Shift+Backspace now deletes every ticked item on the board, sub-items included, after asking first.
- The arrow keys, Ctrl+Shift+Up/Down, Ctrl+Enter, Delete joining, Ctrl+A, search, item drag, pouring one list into another, Markdown import, and the Claude connector's read_board all work with ticked items in place.
- Boards already saved open the same as before. Their ticked items now show in their place instead of at the bottom, and nothing in the saved data is reordered or changed.

## Checklist tick boxes sit a little lower (2026-11-10)
- A checklist item's tick box now sits a touch lower beside its text: 7.5% of the line below the middle of the first line (1.5px at Normal, 3px at 200%), up from 5% (1px at Normal). It is the middle option of the three you previewed.
- Only the box moved. The text, the fold arrow and the item buttons stay where they were, and so do the box's size and its gap from the text.
- Nothing about saved boards changed.

## Ticking an item no longer moves the cursor (2026-11-09)

- Pressing Ctrl+Enter (⌘+Enter) in a checklist item, or the phone's Tick button, ticks the item and leaves the cursor in it. It no longer jumps down to the next open item (or up to the one above). Pressing it again unticks the item; a Delete right after removes just that item. On a phone the keyboard and the button row stay up, as before.
- Clicking or tapping a tick box already left the cursor alone, and unticking is unchanged.
- The shortcuts list now says "the cursor stays in it".

## Delete in a ticked checklist item removes the item, not the card (2026-10-29)

- Pressing Delete with the cursor in a ticked (struck-through) item now removes that item and everything nested under it, just like its trash can. Ctrl+Z brings it back. The cursor moves to the item above (or the one below).
- Clicking an item's tick box and then pressing Delete or Backspace used to delete the whole card, because the tick box (not the text) had the keyboard. Now it removes just that item.
- Backspace in a ticked item still edits its text. With some letters selected, Delete deletes just those letters. Holding Delete down removes only one item.
- Open items keep their Delete and Backspace behavior. Several selected items work as before.
- On a phone or tablet, tapping a tick box while typing in the same list leaves the cursor where it was, so the on-screen keyboard stays up. A tick box clicked with a mouse shows no focus ring.

## Journal days show the fold arrow (2026-11-10)
- Today's page in the Journal now has the small fold arrow before its date, pointing down when the note is open and turned when it is folded, so it is clear that a click folds it.
- The earlier days in the timeline show the same arrow before their day number. It turns the same way (and not at all with reduced motion).
- Nothing else changes: today still opens unfolded each time the panel opens, and folds are still not remembered.

## An item's trash can keeps the cursor in the list (2026-10-29)

- Pressing a checklist item's trash can (by clicking it, or with Enter from the keyboard) used to leave the cursor nowhere, so the next Delete deleted the whole card. Now the cursor moves to the item above (or the one below), just like Delete in a ticked item.
- Deleting a list's only item leaves one blank item with the cursor in it, so Delete never reaches the card.
- With items selected in several lists, the trash can removes them all as before, and the cursor goes to its own list.
- The same fix for Delete or Backspace with several items selected (by Shift+click or dragging): the cursor goes to the item above, so pressing Delete again no longer deletes the card.
- Holding Enter on a trash can removes just one item; the held key doesn't then add blank items to the item above.
- While you type in an item (in the same list or another one), pressing the trash can of a different item leaves your cursor where you were typing.
- Holding Delete or Backspace with several items selected removes them once; it no longer eats letters from the item above.

## Undo while typing never leaves Backspace free to delete the card (2026-11-09)

- Pressing Ctrl+Z or Ctrl+Y while typing in a checklist item, when the undo took that item away (for example a new item you had just added), used to drop the cursor onto the page. The next Backspace then deleted the whole checklist card. Now the cursor goes to the nearest item still shown in the same list: the one above, else the one below.
- If the undo moves the item (up or down its list, or to another list), the cursor follows it, at the same place in its text.
- If the undo collapses the list (or its container), so no item is shown, every selected block is let go, and Backspace or Delete deletes nothing.
- The phone's item bar Undo works the same way, and no longer puts the cursor into an item hidden in a collapsed card (where the keyboard closed).
- Clicking the toolbar's Undo or Redo (or the Undo message's Undo, or tapping Undo or Redo in the phone's top bar) while typing in a checklist item, a note or a title now keeps the cursor there, so the same rules apply. Before, the keyboard moved to the button with the card still selected, so the next Backspace deleted the card.
- Highlighted words in the item stay highlighted after an undo that doesn't change that item. When the undo or redo changes the item's text, the cursor goes to the end of it (as it did before this change; a redo of typing put it in the middle).

## A browser test no longer fails near midnight (2026-10-31)

- The Version history test that restores the Journal's writing failed when it ran in the last 11 minutes before midnight: it skips the clock ahead 11 minutes, which landed on the next day, whose journal note is empty. Its clock now starts at a fixed midday. Only the test changed; the app is unchanged.

## Visualizer: a much brighter beam from space, and a light pillar (2026-11-12)

- Each finished item now arrives as a bright shaft of light shooting down from beyond the top of the screen onto its cell: a white-hot core inside a wide, glowing halo in the category's color. It lands with a flash and rings, then fades.
- A tall pillar of light runs from the top of the screen down through the middle, with a glow around it. It is always faintly there and swells brighter each time a comet arrives in the middle.
- The comet into the middle is brighter too, with a longer trail of glowing dots, and the middle flares harder when it lands.
- With reduced motion there are still no beams, comets or pulses: the cells just fade lit, and the pillar is a still, faint picture.

## Visualizer: light warps into the middle, and categories (2026-11-12)

- Each finished item now arrives as light falling into the middle: a thin beam drops onto its cell with a small ring, the cell lights, then a comet curves from the cell into the core, which flares. The cell stays faintly lit. With reduced motion you only see the cell fade lit.
- The ring's wedges are now categories (Errands & shopping, Work, Calls & messages, Home & chores, Health & fitness, Money & admin, Learning, Social & family, Other) and the cells are the lists the items came from. A small "By category / By board" switch under the range switch changes it back to boards; it opens on By category and remembers your choice on this device.
- A built-in word rule picks the category from the item's words first, then the list's title.
- The "Just finished" rows now also show the category.

## Sort with AI runs by itself (2026-11-13)

- **The Visualizer sorts with AI on its own** when you have an Anthropic key saved: open it on By category and the finished items that have no AI category yet are sorted straight away, the same way as pressing Sort with AI.
- A new **Sort automatically** box next to the button turns this off. It is on by default and remembered on this device. With it off, nothing is sent until you press the button, as before.
- It sorts at most once each time you open the Visualizer for each range, so a failure is shown and not retried by itself. The button stays for the rest past 200 and for another try.
- The hint, AI settings and the Privacy policy now say that the Visualizer can send item texts by itself.
- An item Claude could not sort is remembered on this device, so it is not sent (and paid for) again.
- **Sub-items are sorted with their parent in mind.** A finished sub-item now goes to Claude with the text of the item it sits under (for example "Beat the boss" under "Elden Ring"), so the sub-items of one topic land in one category. A parent like "Today" is skipped, and items that are only a time word are never sent. The hint, AI settings and the Privacy policy say so.
- **Never paid for twice.** If this device can't save the sorted labels (storage blocked or full), Sort automatically sends nothing and says "Can't save sorted labels on this device, so Sort automatically is paused." Pressing Sort with AI still works, and any sort stops at the first batch it can't save. Once 2,000 labels are kept, Sort automatically pauses instead of dropping older ones (which would then be sent again).
- Switching to By board while a sort runs, and back, no longer sends that batch again. Unticking Sort automatically stops a sort it started, like Cancel.
- The Play Store data-safety notes now say the Visualizer can send item texts by itself, with a sub-item's parent text.
- Sort with AI now leaves room for your boards: the labels and the boards share the space this browser gives the app, so a sort never writes labels that would eat into it. If they would, nothing is written and it says "Not saved: the sorted labels would use the space this device keeps for your boards."
- Only a label that could not be saved pauses Sort automatically. Another kind of problem (the monthly AI-use count failing to save, say) shows its own message, as before.

## Visualizer: Sort with AI (2026-11-13)

- With your own Anthropic key saved, the Visualizer's By category view has a **Sort with AI** button. Nothing is sent until you press it.
- A line under it says exactly what goes: only the text of the finished items on the disc. No board names, list names, notes or ids.
- While it works you see "Sorting… X of N" and a Cancel button. Problems show the same plain messages as Test key (spend limit, too many requests, time-out and the rest).
- Afterwards the disc shows Claude's categories (up to 8), with the built-in categories for anything left over.
- The labels stay on this device only, so a reload does not ask again. Forget key clears them, and with no key the built-in categories come back.

## Visualizer: many arrivals at once, fountains, cards (2026-11-13)

- A long list no longer plays one item at a time. Items land in waves (up to eight together, a fraction of a second apart), so several thin beams hit different cells at the same moment and then it calms down to the glowing core. A short list still plays one at a time.
- Each landing now sends up a fountain of ten glowing sparks (fewer when many are in the air at once) in curved arcs of different heights, ending in the core, which blows out to white where they meet. At the landing spot three ripple rings open across the disc and a bright white column rises for a moment.
- The item that just landed gets a small floating card near the core: its text, and under it "category · board". It fades in, drifts up a little and fades out; at most two show at once. Plain text only.
- Lit cells show one small magenta dash per finished item, each at its own place, instead of filling up in bands. The disc stays sparse however many items there are.
- The disc is a little taller (more tilt). It is still held in by the names round the rim, so it is not much bigger.
- Smooth with many items: at most eight beams and fountains are drawn at once, and the spark count per fountain shrinks when it is busy. Reduced motion is unchanged: no beams, ripples, cards or sparks, only the dashes.

## Visualizer: count past and deleted calendar events (2026-11-13)

- The Visualizer now also counts the Google Calendar events on your primary calendar that have passed or were deleted in the range. Each one gets a beam, sparks and a "Just finished" row with a small calendar mark, and counts in Done today, This week, the range count and the chart.
- Which events count: your own events and the invites you accepted (all-day included); passed ones that have already ended, and deleted ones only if they were deleted after they started. Declined and no-reply invites are skipped, and each time a repeating event happened counts once.
- By board, the events have their own "Calendar" group. By category, they fall into the built-in word categories by their title.
- Nothing is saved. Events are never part of your boards, undo, version history, exports or sync, and their titles are never sent to Anthropic.
- It never opens a Google window: it uses only calendar access this browser already kept. With none, a quiet line says "Open Calendar once to include your events."; signed out, nothing about the calendar shows. If the events can't be loaded, you still see your board items and one quiet line.

## Visualizer never pauses (2026-11-13)

- Beams and sparks now keep flowing in all the time while the Visualizer is open: a new one launches about four times a second, so there is always something in the air and never a quiet gap, however many finished items you have (even one).
- When the list runs out it simply goes round again, with no rest and no waiting. Calm still stops all motion.
- Each trip looks and moves as before; only the timing between them changed.

## Visualizer: a much bigger disc, names moved out (2026-11-13)

- The disc is now about 90% of the window's width on a computer (it was about 65%), and it sits low on the stage. On a phone it fills most of the width too (about two thirds, up from under half).
- The category names no longer stand beside the disc, holding it back. They stand above its back and below its front, in the empty space round its shoulders, outside the dashed ring, each with its dot. They still follow their wedges as the disc turns.
- Names never overlap each other or the disc and always stay fully on the screen. A name is shown in full unless it is wider than the whole screen.
- On a narrow phone with long names the disc is only as big as the names allow, so they stay readable.
- A name whose wedge passes the far left or right edge of the disc fades out for a moment as it moves from the back to the front, instead of jumping.
- The sparks after each landing now visibly flow from the category's part of the disc into the core: they run inward along that category's wedge on the disc's tilt, curving and speeding up, then lift into the core, instead of one straight jump. There are no more sparks than before.
- The fountains now arc higher, like the reference: the sparks rise in tall, mostly upright arcs above the landing cell before curving down into the core. The top of an arc is now about 0.075 to 0.13 of the disc's width above its path (it was 0.02 to 0.08, and 0.01 to 0.03 for the first version of the flow); the reference's arcs measure about 0.07 to 0.14.
- The beams are thicker, like the reference: a bright thin core inside a wider, brighter pink glow. The pink band is now about 0.0055 of the disc's width across at half its brightness (it was 0.0034 on a big window), the core about twice as wide as before, and the glow is brighter (0.75, was 0.5). On a phone a beam is never thinner than a few pixels.
- The name cards now show for many more items: up to four at once (it was two), one every 0.3 seconds in a long list (it was 0.7), each living about 2 seconds (it was 2.6). They stand in four places round the core (upper left and right, lower left and right), inside the ring the rim names stay outside of, so a card never covers another card, the core or a name. A new card takes the place of the oldest, which also removes the brief overlap of a third card. In a list of 8 items or fewer every item gets a card. On a phone, where the upper places do not fit, two show (the lower pair).
- Reduced motion and the smooth frame rate are unchanged: the names are drawn from cached text each frame, and the disc is still painted once per size.

## Visualizer: filler items are not counted (2026-11-14)

- Items that mean nothing on their own are no longer counted in the Visualizer: "meow", "nowww", "test", "asdf", "lol", "ok", "stuff", "untitled", a single letter, or text with no letters at all ("1", "!!!", a check mark). Time words such as "today" and "now" were already skipped; stretched spellings ("todayyy") and short forms ("tmrw", "2day", "rn") are skipped too.
- Real short tasks still count: "gym", "eat", "run", "tax", "vet". Only the whole text is checked, so "Test the smoke alarm" counts.
- As before, a skipped item's ticked sub-items still count, and Sort with AI never sends a skipped item. Other screens' counts do not change.
- Ticked items at every level count, middle levels as well as the lowest.

## Visualizer: always full motion, with a Calm button (2026-11-13)

- The Visualizer now ignores the system's "reduce motion" setting and always plays the full animation, on a computer and on a phone. A new **Calm** button beside the switches turns on the quiet drawing instead; it is remembered on this device and off by default.
- Beams drop and sparks fly about twice as slowly. Beams and sparks are 1.5 times thicker, and the fountains arc 1.5 times higher (never off the top of the canvas).
- The core glow is toned down so a crowd of arrivals never blows out to white, and it now gives a quick soft pulse each time a beam lands. Calm has no pulse.
- Many more beams come in together (waves of about a third of the list, up to 16 at once, 60 milliseconds apart).
- Name cards are 1.4 times bigger and the names round the rim 1.3 times bigger.
- On a phone the ring takes about 70% of the screen, the switches are slim rows and the counts sit in one row. The × stays in reach.
- The rest of the app still follows the system's reduce-motion setting.
- The ripples round each landing spot open 1.5 times wider with slightly thicker lines, and the sparks glow about 1.4 times brighter.
- The incoming beams are about 1.4 times brighter (the pillar is unchanged).
- The name cards glow brighter: a soft green glow round a brighter border, and slightly brighter text.

## Visualizer: the names round the ring read in full (2026-11-12)

- The group names round the Visualizer's ring now show in full whenever they fit. The ring is a little smaller so the longest name fits beside it, and the names stand outside the dashed ring with the left and right ones aligned away from the edge, so none is clipped.
- When space is tight (a phone), a name is cut from the end but always keeps at least its first word. A name is never empty or just "…".

## Visualizer: a new look and motion (2026-11-12)

- The Visualizer is now a dark violet disc seen at a steep tilt, on a near-black purple background: thin track rings, radial divisions, a dim cell grid, a dashed outer ring and a dark hub in the middle that names the group that landed last. The group names run evenly round the rim in small capitals.
- Each finished item now arrives as a thin angled beam of light from above the screen. It lands with a bright dot and a small ring on its cell, which lights up as a short magenta arc.
- Then a burst of five small glowing particles with short tails fans out from that cell and arcs into the core. The first one is green-tinted, the rest white and pink.
- The core is a big soft white-to-magenta glow that stays bright between arrivals, with a thin bright pillar of light running from the top of the screen through it to the middle of the disc.
- Your own categories, boards and counts are unchanged. With reduced motion there are still no beams, particles or pulses; the lit cells, pillar and core are a still picture. Nothing is saved or changed on your boards.

## Visualizer and calendar fixes (2026-11-15)

- Calm mode in the Visualizer now draws its picture once and stops, instead of redrawing the whole screen about 60 times a second. It draws again only if the window changes size.
- A calendar event marked "tentative" no longer counts as done in the Visualizer. Only confirmed events do.
- If a calendar is so full that the Visualizer cannot read all of it, it now keeps the newest events and leaves out the oldest, instead of the other way round.
- After signing out and signing in again in the same tab, the Visualizer no longer opens by itself.

## Visualizer: slower trips, more at once (2026-11-13)

- Each beam and its sparks now take about 4 seconds instead of 2.7, so the motion is calmer.
- A new one still launches all the time, now about five times a second, so about 20 are in the air together instead of 10. It stays one continuous stream.
- Every fountain keeps its ten sparks. Calm still stops all motion.

## Calmer Visualizer name cards (2026-11-13)

- The name cards that pop up when a spark lands are subtler: a little smaller (about 1.15 times the first size instead of 1.4), with a softer green glow, a lighter fill and border, and lighter text.
- They now ease in instead of popping.
- Speed, beams, sparks, ripples, the core, the rim names and Calm are unchanged. Your boards are not touched.

## Visualizer: bigger shooting-star sparks (2026-11-13)

- The five sparks that fly from a landed cell into the core are now clearly bigger: each has a bright white-hot head in a soft glow, and a long tapering tail that follows its curved path.
- The faster a spark goes, the longer its tail, so the burst reads like a small cluster of shooting stars rising to the core. The first spark is still tinted green.
- The sparks start a little more staggered, so the cluster fans out slightly. Timing of the beam, ring, flare and the rest of the trip is unchanged, and so is the reduced-motion version.

## Visualizer: sub-items get their own beams (2026-11-13)

- A finished item that had completed sub-items no longer shows as one beam for the parent. Each completed sub-item (nested ones too) is now its own item: its own beam and sparks, its own place in the feed and name cards, and the Visualizer's numbers count it. The parent is not counted there. An item with no completed sub-items works as before. Other screens' counts are unchanged.
- A sub-item takes the category of the item it sat under when that is descriptive (for example "Clean the garage" puts all its sub-items in Home & chores, even over a Sort with AI label). A parent like "Today" or "Now" gives nothing, so each sub-item goes by its own words, then the list title.
- Items that are only a time word ("Today", "Now", "Daily", "Tonight", a weekday and so on) are no longer shown in the Visualizer at all. "Daily stretch" still is. Their completed sub-items still count.

## Visualizer and Feedback swap places (2026-11-13)

- The Visualizer now has its own button on the toolbar, right after File, where Feedback used to be. Feedback is now a row in the ⋯ More menu (still only when signed in), right below Completed.
- On a phone it is the same swap: Feedback is the full-width row under the tiles at the top of the ⋯ sheet, and Visualizer is the row just above About BusyAnts.
- In a narrower window, where File folds into ⋯, the two rows trade places there too.

## Weekly review data, no screen yet (2026-11-11)
- Behind the scenes only: the app can now work out a weekly review (what you ticked this week, each habit's days this week, next week's calendar by day, and how many days you wrote in the Journal). Nothing on screen changes yet; a later step adds the Week panel.
- Habits show the days ticked this week, with no streak counter.
- Nothing about saved boards changed; no new data is stored.

## Small fixes to the Word-style checklist highlight (2026-11-02)

- Typing "!" over a highlighted stretch of words now replaces it, like any other character, instead of zooming the board to fit the screen. Shift+1 still fits the board when no words are highlighted.
- Ctrl+C and Ctrl+X on an empty highlight (nothing actually highlighted) no longer replace your earlier copy with a blank item, and change nothing.
- While a container's "Delete …?" question is open, Tab moves between its two buttons, Escape closes it, and Tab and Ctrl+V no longer change the checklist items behind it.
- Highlighting from the very start of the first item to the very end of the last and pressing Delete now removes the last item too, instead of leaving one blank item behind.

## The About page's demo clip and pictures show the app as it is now (2026-10-22)
- The demo video and the board pictures on the About page were taken before the latest changes. They are recorded again from the current app: no Hand or Select tools, card titles in the button row, the new checklist rows, the folded toolbar. Same story as before: tick an item, fold a container, drag a card, type a new item. File sizes are about the same.
- Behind the scenes: a browser test that measures the sign-in page's links on a phone now waits for the fonts to load first, so it no longer fails by one pixel now and then.

## Steadier automatic tests on GitHub (2026-10-22)

- Fixed the automatic tests getting stuck for half an hour while installing the test browsers' system packages (the download mirror is sometimes very slow), which cancelled the run and held back the automatic publish. The browsers and those packages are now kept between runs, a stalled download gives up and retries quickly, and each install try is capped at 6 minutes with a second try.

## Tidy-up in the saving, sync and connector code (2026-10-23)

- The Claude connector's "permission denied" message no longer mentions an invite list (there isn't one: any Google account can sign in). It now asks whether this is the Google account that has these boards; a refused save also says nothing was changed.
- Small wording fixes in the connector's instructions (`mcp/README.md`): "authorized", this project keeps Claude Code out of the sign-in folder on Windows and Mac alike (with the setting to add elsewhere for both), and two files it didn't list.
- Removed a store function only tests used (`replaceBoard`); those four tests now go through the path the app really takes when the online copy arrives. Removed names that were shared between files but only used inside their own, and a stale comment about the Hand tool.
- Nothing changes in how the app works or saves.

## The Claude connector no longer lets a share lock your own boards (2026-10-23)

- Someone you share with could add a board carrying one of your own boards' ids (for example your Home) to a shared board, and Claude would then refuse to change that board of yours ("Home is a shared board"). Now your own boards win, the same way the app already decides, so Claude can change them as before.
- Boards really shared with you, and the boards you shared yourself, stay read-only to Claude.

## The offline copy stops growing (2026-10-22)
- The saved offline copy of the site used to keep every built file of every version it had seen, adding about 1 MB with each publish. When a new version of the page loads online, the old version's built files are now removed (fonts and the page itself stay), so storage on the device no longer fills up over time. Opening the site without internet works as before.

## Interface review fixes (2026-10-22)
- Keys pressed in the File, Boards, Arrange, Appearance, Color or ⋯ menus, the Share panel or on the Undo message no longer move, delete or deselect the card behind them.
- Escape in the text format bar goes back to the text and no longer closes the Focus timer, Version history or another side panel.
- The File, Appearance and Boards menus and the Share panel now open on top of an open side panel instead of underneath it.
- The File and Boards menus work with the arrow keys (up, down, Home, End).
- Pressing Undo on the Undo message from the keyboard moves focus to Redo instead of back to the top of the page; closing the Share panel, Send feedback or the shortcuts list gives focus back to the button that opened it.
- A board card no longer counts the hidden Completed record in its "N cards".
- A question left open when the app goes away (signed out in another tab) is answered "no" rather than asked again after signing in.
- A lost finger on a phone can no longer leave the board ignoring touches until reload.
- Screen readers: the container card count, the zoom button ("Reset zoom (100%)") and the checklist item grip are named or skipped properly.

## Roomier checklists and shorter cards (2026-10-22)
- A checklist item's text now gets almost the whole row. Only the trash can and the drag grip keep a small strip at the right end (46px, down from 92px), so "Book the flights" stays on one line on a new card.
- Move up and Move down moved into a small pill that appears over the right end of the row above when you point at an item (or tab to one). It never covers any words. The first item of a list gets its pill just below it.
- The title of a checklist, link card or board card now shares its line with the card's buttons. The empty band above every title is gone, so these cards are about 30px shorter. Colored cards tint that one line, into the rounded corners, as before.
- Notes keep their button row (they have no title); containers already had their title beside their buttons.
- The buttons still grow with the A− / A+ text size, and phones and touch screens work as before.

## Drag the board with the mouse buttons (2026-10-22)
- The Hand and Select choice is gone, from the toolbar, the phone ⋯ sheet and the keyboard (H and V). The board always works as Select: dragging empty space with the left button draws a selection box.
- To move the board, hold the middle mouse button, or the left and right buttons together (either one first), and move. It works anywhere on the board, over cards, containers, links and pictures too, and never opens a link or a menu.
- The cursor is the normal arrow, and a closed glove only while the board is being dragged this way.
- Scrolling, trackpad swiping and moving the board by finger work as before. On a phone, a finger that rests for a moment and then moves now draws a selection box (a plain swipe still moves the board).
- The Keyboard shortcuts list explains the new way to move the board, and no longer lists the tool keys. Saved custom keys from before are still read.

## The Google Play screenshots show the app as it is now (2026-10-23)
- The Play Store pictures in `docs/play-store/screenshots/` are retaken from the current app: no Hand or Select tools, card titles on the button row, the new checklist rows, and the Weekend in Lisbon example opened from the template tiles.
- New pictures: a comment thread on a phone, the Habits panel with the Weight card, the habits ledger, the template tiles, and the Habits panel on both tablet sizes. There are now 8 phone pictures (the most Play allows) and 3 for each tablet size. Sizes and the old file names are unchanged.
- The script that takes them (`scripts/play-screenshots.mjs`) now uses the real app instead of a hand-made board, and `PLAY_ONLY=name` retakes just some of them.

## Reload prompts after an update, and a Try again button (2026-10-22)
- If BusyAnts was updated while a page was open, saving the board as a picture or PDF, or importing a PDF, now says "BusyAnts was updated. Reload the page to use this." with a Reload button, instead of "Couldn’t make the picture" or "can’t read that file".
- The "Your board couldn’t be loaded" screen has a Try again button that reloads the page.

## Saving and sharing fixes from review 181, part A (2026-10-22)

- If deleting your account stops part-way on one device (the tab is closed while it says "Deleting…"), your other pages hold their changes for a while. They now say so plainly: "Your account is being deleted on another device; changes here aren’t saved yet" instead of "Saving…".
- Changes made while held back are no longer lost when you close or reload the page: this device remembers them, and the next time the app opens on the same boards it keeps your copy and saves it as soon as it may. If the boards online were changed since on another device, those win, as before.
- On a shared board, the person who shared it is marked "Owner" in People (it said "Shared it") and beside each of their comments, so nobody can pass for them.
- The online rules now accept only your own Google name and photo in your record on a shared board (so nobody can take the owner's name or photo), and a photo only from Google's photo server, which also keeps other servers from seeing who opens a comment thread or the Share panel. The app shows no photo from anywhere else.
- A comment can't be added from another device while your account is being deleted, so none outlives it.
- A browser tab still holding the last account's boards after someone else signed in on another tab no longer saves them over the new account's boards on this device.
- Boards already saved are unchanged. The new rules need pasting into Firebase (see the pull request); until then the app works as before.

## Pasting no longer pushes neighbors straight down (2026-10-22)

- When you paste (or duplicate) blocks and the copy lands on top of another block, that block now moves to the nearest free spot, as the spec always said, instead of being pushed straight down below the copy. Blocks that grow (expanding a card, typing, a container filling up) still push what is below them straight down.
- Boards already saved are unchanged. Only where a block settles after a paste differs; nothing about saving, sync or undo changed.

## Board-logic fixes from the review (2026-10-22)

- Resizing a card from a top corner no longer throws a taller neighbor beside it up off the board; it slides sideways like the left or right edge does.
- A board that somehow holds two Completed records (two devices cleaned up before syncing) now shows, searches and restores the items of both; the next Clean up or restore folds them into one.
- An open item can no longer end up under a ticked one: Tab (one item or several) or a drag that nests it there unticks the items it is under, so Clean up never sweeps away something you never ticked.
- Tab, Shift+Tab and bold on a thousand selected items are now instant (they took over a second each), and a big pile of blocks tidies itself in a fraction of the time.
- Turning Snap on moves a block that lands on another to the nearest free spot instead of dropping it a row down, and it is one Ctrl+Z; collapsed heights snap too.
- Collapsing a block can no longer send two pushed blocks to the same spot.
- Importing a web page that holds a bare address with brackets in it keeps the address whole.
- Importing a file while an old version is shown puts the old version away and adds the cards, instead of saying it worked and doing nothing.
- Clean up or restore into a container that is gone no longer leaves a broken card.
- The resize label keeps "same height as 2 blocks" after a left or top edge snaps.
- Removing the last weight from a Weight card that holds other text, then saving a weight, uses that card again instead of making a second one.
- Template containers sit on the grid, 20px apart instead of 24.
- An event of zero length at exactly midnight now shows on its day.
- Download as text keeps a multi-line item inside its item and escapes "[" and "]" in a link title.
- A card you drag before it has been drawn shows a card-sized landing outline, not a container-sized one.
- Boards already saved are unchanged. Nothing about how saving, sync or undo work was touched.

## Habits first visit, the phone ⋯ sheet and the website's feature points (2026-10-22)

- Habits, first visit: one main button. With no weight yet the Weight card is one line ("Weight", "None saved this week") plus the entry strip, with no empty chart box. Save is a plain button until you type a weight, then it takes the accent color. With no habits there is a single "Add a habit" button; pressing it swaps in the box for the first habit (the cursor goes with it to the list when the habit is added). The Ledger design and the Weight card layout are unchanged otherwise.
- The Completed panel's empty text now explains the two meanings of "Completed": "Ticked items stay in their list. Press Clean up (in a list or the toolbar) to move them here, grouped by day."
- Phone ⋯ sheet: the eight panel tiles sit four across in two full rows (no empty tile), "Arrange" is now "Board", Hand and Select show their words, the Focus timer tile says "Timer", and a small grab handle marks it as a sheet. Its scrolling no longer drags the page behind it.
- Website: "Your boards are safe" and "Works well on a phone" are now a ticked done list in two columns (one on a phone), with thin lines instead of boxes with a honey stripe.
- Boards already saved are unchanged: nothing here touches how boards are saved, synced, undone or deleted. The About page's demo video still shows the older toolbar; it is to be re-recorded after the checklist-row work.

- Every Claude Code session on this project, in the cloud or on the owner's computer, now loads the owner's plugins (Impeccable, frontend-design, claude-code-setup, security-guidance) from the project settings.

## Weight card: read first, then one place to write (2026-10-22)

- The Weight card now reads top to bottom: the latest weight (big) with how it changed this week, month or year, then the chart, then one input strip, then a History list.
- The input strip holds a day button, the weight box (with "kg" inside it) and a clear honey Save button. The day button shows dates the way the rest of the app does ("Today", "Mon 19 Oct") instead of the browser's 10/19/2026; tapping it opens the date picker.
- History replaces the Entries list. It is read-only (day, weight, and the change from the weight before it, such as −0.2). Tap a day to put it in the strip, then Save to change it, Remove to delete it, or Cancel. Choosing a day that already has a weight in the day button does the same. The "Latest" line and the row of × buttons are gone.
- After a save or a removal, one line inside the strip says what happened ("Mon 19 Oct: 73.0 → 72.9 kg") with an Undo link, so a phone can take it back too (Ctrl+Z still works). The line never wraps and never moves the number or chart; Undo goes away as soon as anything else changes. Today's first weight now gets a line too.
- Chart: today is marked with a dotted line and "Today", the weights are labeled on the right so the line starts at the left edge, the dots are smaller, and the latest no longer has a ring cutting the line.
- With no weight yet, the card says "No weight this week" and "Save one and it shows here as a line."
- Boards already saved are unchanged: the weights are stored exactly as before.

## Weight for earlier days (2026-10-22)

- The Weight card has a date beside the weight box. It starts at today, goes back to 2000 and never forward, so a day you missed can be entered later.
- One weight per day: entering a day that already has one replaces it, and a line under the box says so ("Replaced 73.0 kg with 73.5 kg for Mon 19 Oct."). A new weight for an earlier day says "Saved ...". A later day shows "Pick today or an earlier day." and saves nothing.
- A weight for a day outside the week, month or year shown takes the panel to that period, so you see it on the chart. The chart is in date order whatever order the weights were entered in.
- A folded "Entries" list under the chart shows the period's weights, newest first. Type over any weight (Enter or leaving the box keeps it, Escape drops it) or press its × to remove it. Each change is one Ctrl+Z.
- Boards already saved are unchanged: the weights are stored exactly as before.

- The Privacy page, the Delete account page and the Delete account panel now say that deleting your account removes your comments on shared boards you're still on; comments on a board you already left stay until its owner deletes them.

## Comments on cards (2026-10-22)

- On a shared board, a card can have a conversation. A small speech-bubble chip on the card's header shows how many comments it has; a dot on it means someone else wrote since you last looked, on this device.
- Click the chip (or "Add comment" on a card without comments) to open the thread beside the card; on a phone it slides up from the bottom. Type a comment (up to 1,000 characters) and press Comment or Ctrl+Enter.
- People who can edit or comment can write; people with a view link can read comments but not write.
- "Resolve" marks a thread done and hides its chip ("Show resolved" brings it back, "Reopen" or a reply opens it again). Editors can resolve any thread, commenters only one they started.
- You can delete your own comments; the person who shared the board can delete any. Deleting asks first, since it can't be undone.
- Comments are not part of the board: Undo doesn't touch them and they aren't in Version history. If a card is deleted its comments are hidden, and they come back with the card.
- Fixed: when your boards are too big for Version history, the "your last change wasn't saved" note no longer claims the change is kept there.

## View-only and comment links, part 2: roles in the Share panel (2026-10-22)

- The Share panel has one link per role: **Can edit**, **Can comment** or **Can view**, picked in a small menu beside "Anyone with this link", each with Copy link. A link that isn't there yet has a button to make it ("Make a comment link").
- Making the first comment or view link changes the edit link once (the panel says so before the click); people already on the board aren't affected.
- **Turn links off** turns all three off; "Make an edit link" (or any other) turns one on again with a new address.
- Opening a link gives its role. Opening a lower-role link never lowers anyone; a viewer who opens the edit link becomes an editor.
- People shows everyone's role. The person who shared the board can change anyone's role from the menu beside their name, where Remove now is too. Lowering someone asks first, since the links above their new role change.
- Removing someone changes every link that is on (edit, comment and view).
- Viewers and commenters can't yet be stopped from editing on their own screen (next step); their changes are refused online and never reach anyone else.

## View-only and comment links, part 3: read-only boards (2026-10-22)

- Someone a board is shared with as **Can view** or **Can comment** can't change it any more, on their own screen either: typing, adding, deleting, ticking, moving, resizing, colors, formatting, paste, keys, undo, Clean up and importing are all refused, and nothing they do is sent. Their own boards are untouched.
- Beside the board's name a badge says **View only** (an eye) or **Can comment** (a speech bubble). The first time, a note says "You can view this board. Ask Sam if you need to change something." until closed.
- The buttons that change a board are gone there: tools, Undo, Redo, Add, Color, Arrange, a card's collapse and trash buttons, resize handles and item grips (and Undo, Redo and + on a phone). Text can still be selected and copied; tick boxes show their state. Dragging a card moves the board instead.
- A change of role takes effect at once, both ways.
- Someone lowered to viewer while typing: their last change isn't sent again and again. It is put back as the others have it, kept in Version history first, and they're told plainly: "Your last change to “Trip” wasn’t saved: you can only view it now."
- Comments on cards come in the next step.

## Bigger buttons at the top right of each card (2026-10-22)

- **The collapse arrow and trash can on every card and container are bigger:** 32px buttons (were 28px) with a 16px icon (were 12 and 14px), a little more space between them, on a computer and on a phone.
- **They grow with A+ like the buttons on a checklist item**, up to 56px at the biggest text; the card header grows with them.
- On a touch screen the press area is still at least 44px. Nothing overlaps the title or the resize edges, even on the smallest card at 30% and 250% zoom.
- Boards already saved are unchanged and open as before (this is only how the buttons look).

## Saving fixes from the review: old tabs, deleted shares, big boards (2026-10-22)

- **A board that comes back from a deleted shared board keeps the changes made on your other device.** If you deleted a shared board on one device and then wrote on a board that was inside it, another device that still had its old copy could upload that old copy over your new work when it opened. Now it takes the newer online copy, unless you changed the board on that device after the newer copy arrived.
- **Version history says when your boards are too big for it.** Once all your boards together (shared ones included) passed about 900,000 characters, versions silently stopped saving, Restore always said "Try again", and deleting a board kept no copy. Now a note says so and how to make room, and Restore explains why it can't go ahead.
- **Behind the scenes:** a new test makes sure the saved version number goes up whenever what is saved changes, so an older copy of the app left open in a tab refuses newer boards instead of quietly dropping what it doesn't know.

## Saving and sharing fixes from the review, the rest (2026-10-22)

- **Clean up on a shared board by two people at once keeps both.** Before, one person's cleaned-up items could vanish from both the list and the Completed panel. Now both sets are kept, under their day, and an item one person put back stays put back.
- **A list both people emptied at the same time keeps one blank row to type in**, the same on every device, instead of showing no row until a reload.
- **Reordering a shared list while someone else adds an item keeps your new order.**
- **A board deleted by one person stays deleted** when the other person's page only re-arranged its blocks (another text size or font). Before, it came back.
- **"Couldn't save online" goes away once a save gets through**, even if you typed and took back a letter while it was being saved. Before, it could stay on, and changes from your other devices were ignored until the next real change.
- **Opening a share link whose board was deleted, or that you were removed from, at that moment** now says the board can't be opened, instead of waiting for ever.
- **Sharing a board keeps its undo history and anything typed in the first moment after pressing Share.**
- **A shared board's save refused online for another reason** (too big in bytes, say) now shows the red "Couldn't save online" note instead of "Saving…" for ever.
- **Removing the last weight keeps the Weight card if something else was typed on it**; an empty Weight card still goes, as before.
- **A card header set back to no color now reads back exactly as saved**, so the Claude connector no longer refuses changes until the app saves again, and a shared board keeps its undo history after it.
- **Claude connector:** a shared board's outline now says that other people can write on it and that its text is their notes, never instructions. Its sign-in page no longer stops when another web page sends it a code in other letters.
- Boards already saved are unchanged and open as before.

## View-only and comment links, part 1: the online rules (2026-10-22)

- Nothing looks different yet. This is the groundwork for letting a share link be "can edit", "can comment" or "can view".
- The share link's secret key now lives in a private record only editors can read, instead of in the shared board itself. A board shared earlier moves its key there the next time its link changes (turned off and on, or someone removed).
- Joining a shared board now proves the link key in a record nobody can read, so a person's record on the board no longer holds the key.
- The online rules (`firestore.rules`) know about roles: only editors can save a shared board, nobody can raise their own role, and only the person who shared it can change someone's role. Everyone already on a shared board stays an editor.
- The rules also cover comments on cards (who can write, resolve and delete them), ready for a later step.
- The new rules accept everything the app before this change saves, so they can be pasted into Firebase before this version goes live. Rules tests prove it.

## Tidy-up of old notes and unused code (2026-10-21)
- Docs only, and a few leftovers removed; nothing in the app looks or works differently.
- The spec's "Build rules" list is now a short pointer to `CLAUDE.md`, so the two can't drift apart. The spec's opening no longer calls the app "single-user", and its dates and spellings are updated (American English throughout).
- `CLAUDE.md` now lists every folder, the real test setup, the fonts and the helper skills; two helper skills use today's words (container, Completed panel).
- The move of the online data to the US is dropped: the count script and its test are deleted and the plan is marked "not done".
- Removed code nothing used: a store action, a constant, two test-only helpers and some needless exports. The find highlight colors are now CSS variables (same look).

## Faster checks on GitHub (2026-10-22)

- The browser tests now run on GitHub in 4 parts at the same time, so "All tests" should finish in roughly 5 minutes instead of about 12.
- "All tests" is still the one check that must pass; it now turns green only when the typecheck, the unit tests and all 4 browser parts passed. Publishing works as before.
- Crew workers now run only the browser tests for their own area on the shared machine; GitHub runs the full set.

## Deleting your account with another device or tab open (2026-10-22)

- Deleting your account now first marks your boards online as "being deleted". While they are marked, your other phones, computers and tabs can't save your boards, a version or a new shared board back online. Before, one of them could put your boards back just after they were deleted.
- Those other devices keep your boards on screen and hold any changes while it deletes. If deleting fails, they carry on syncing and their changes are saved. Once it is done, they sign out with "Your account and data were deleted.".
- Another tab of the same browser no longer signs out the tab doing the deleting part-way through.
- If only the last step failed (deleting the sign-in), you can run Delete account again from any page to finish.
- A small marker that the account was deleted stays online. It holds no boards, name or email. The Privacy policy and the Delete your account page now say so.
- The online rules now also check the type and size of a few fields that had no check: when someone joined a shared board, and a version's counts and fingerprint (job 173).
- The owner pastes the new firestore.rules into the Firebase console before this version is published. The rules accept everything older copies of the app save.

## "Couldn't save online" no longer follows you to the next account (2026-10-22)

- Fixed: if a save was refused for one account, the red "Couldn't save online" note kept showing after signing out and signing in with another account on the same computer. It now clears whenever someone signs out or another account signs in, and the gray note says "Saved" for the new account.
- An upload from the earlier account that finishes or fails after the switch is no longer shown to the new account either.
- No change to what is saved: boards, kept-aside boards and anything still being sent are untouched.

## Interface fixes from the review, the rest (2026-10-21)

- The welcome tour now really covers the board: keys (Delete, Ctrl+A, Ctrl+D, H, V, Ctrl+F) and paste pressed while it is up no longer change the board or open the search behind it.
- The "Looking at an earlier version" bar keeps clear of Version history when you widen the panel.
- "Couldn't restore it" now stays with the version it failed on, instead of showing on the next version you look at.
- The Boards menu closes with Escape (and leaves a side panel open behind it). Escape with the keyboard on a Search bar button closes the Search bar and not the panel behind it.
- Zoom keys (Ctrl and +, -, 0) typed in the Search box zoom the board, instead of zooming the whole browser page.
- The Search box no longer draws a focus rectangle. Ctrl+F while the keyboard shortcuts list is open (for example while recording a key) no longer opens the search behind it.
- The Share panel says "Copied" only for the link that was copied, and only if the copy worked.
- A container with one card is read out as "1 card" by screen readers.
- Small tidy-ups: the format bar sets up its listeners once, a phone's pending timer is cleared, one phone-size rule and a misplaced comment were fixed.
- New browser tests for all of the above, plus guards for dark mode of the panels, Tab focus rings, the Hand tool after a reload and the always-visible card buttons on a tablet.

## More safety-net tests (2026-10-21)
- Tests only; nothing in the app looks or works differently.
- Signing in and out is now tested end to end (opening your boards, the 5-second wait for shared boards, signing out, an account deleted on another device, deleting your own account, the page being hidden, going offline and the "Saved" note).
- The online side of sharing is tested too (removing someone changes the link in the same step, saves to a deleted share are refused, deleting a share removes its people, the shared-boards list from the offline copy).
- Also covered: a random mix of edits merged from two people (now with deleted items, changed text and Completed groups), Version history day headings across Sydney's clock changes, deleting a board that cards on other boards open, and letting go of a resize on a block that is gone.
- In the browser: the side panels in dark mode, the focus ring on buttons (and none on text fields), the welcome tour keeping Tab inside its card, the Focus timer following another tab, a share link opened offline, card buttons on a tablet, a double-click on a board card, and a deleted board coming back from Version history.

## More safety tests (2026-10-21)

- **No change to how the app works.** About 80 new automated tests that pin down behavior which already works but had no test: layout when snapping is off, moving checklist items when the target was deleted on another device, importing and "Download as text" edge cases, backup and restore, the order in which the board tidies itself, undo depth, and that every saved field survives a save and reload.
- Two browser checks: a note typed or a board renamed just before a reload is kept, and undo stays on its own board. A third checks that a backup of two boards holds both and restores both.

## A save that can't be read is never lost (2026-10-21)

- If the boards saved in this browser are damaged when the page opens, a copy of them is now kept on this device before the page starts on a fresh board. Before, the first change on the fresh board wrote over them and they were gone. A note in the usual banner says "Your saved boards couldn’t be read, so this is a fresh board. A copy was kept on this device."
- If they were saved by a newer version of the app (an old copy of the page still open or cached), they are now left as they are for the updated app to open, and the note says to reload the page. Changes made on that old page aren't saved on this device.
- If there's no room to keep the copy, the damaged save is left as it is and that page's changes aren't saved on this device (the note says so).
- Deleting your account also clears any such copy from the device.

## Keyboard reach for the format bar and the shortcuts list (2026-10-22)

- **The text format bar works from the keyboard.** Highlight some text, press Alt+F10, and the keyboard moves into the bar (Bold first). Left and Right walk along it, Tab goes round it, Enter presses a button, and Enter on Font opens the typeface list (Up and Down choose, Enter picks, Escape closes just the list). Escape goes back to your text with the highlight still there. The key is listed in the ? panel under Text.
- **The Keyboard shortcuts list now covers the board**, like Send feedback does: Delete and the other board keys do nothing behind it, the keyboard moves into it when it opens, Tab stays in it, and Escape (or the ? key, or ×) closes it and puts the keyboard back where it was.
- Nothing about saving or boards changed.

## Tests for the online rules (2026-10-21)

- **No change to how the app works, and the online rules themselves are unchanged.** 38 new automated tests check what `firestore.rules` lets each person read and write: your own boards and versions only by you, shared boards only by their people, joining only with the current link, only the person who shared a board changing its link, removing people or deleting it, deleting an account, and feedback.
- The tests run on a local copy of Firestore (Google's emulator) with a made-up project, so they never touch the real online data. Run them with `npm run test:rules`; GitHub runs them too, as part of "All tests".

## The sign-in screen downloads less (2026-10-22)

- The sign-in screen now downloads only Firebase's sign-in code. Its database code comes down once you are signed in, while "Opening your board…" shows. The sign-in screen's scripts went from about 1,000 KB to about 470 KB (about 307 KB to 154 KB compressed), so it opens faster, most of all on a phone. Signing in, syncing, sharing links and saved boards work exactly as before.
- Removed an old file the app no longer used.

## Start from a template (2026-10-22)

- **An empty board now offers six ready-made boards:** Weekly plan, Project plan, Trip plan, Reading list, Mood board and Study plan, each with a small picture of its containers. Click one and it fills the empty board (Ctrl+Z gives the empty board back). Under them, "Weekend in Lisbon" is a finished example you can open to look around in; it opens as a board of its own.
- **Boards menu → New from a template…** opens the same picks in a "Start a board" window (a sheet from the bottom on a phone). On a board that already has cards, a pick makes a new board and leaves yours alone.
- Nothing about how boards are saved changed: a template is an ordinary board, with its own cards, saved and backed up like any other.

## Questions in the app, and Undo after deleting (2026-10-22)

- **No more browser pop-ups.** Deleting a board, restoring a backup, removing someone from a shared board and leaving one now ask in a BusyAnts card ("Delete “Trip”?" · Keep board · Delete board), a sheet at the bottom on a phone. Escape or a click beside it keeps things as they are. Notes like "That file isn’t a BusyAnts backup" show in the banner under the toolbar.
- **Undo after deleting.** Delete cards, containers, checklist items or a habit and a dark message at the bottom says what went, with an **Undo** button (the same as Ctrl+Z). It goes after 6 seconds or as soon as you change something else.
- **Fewer questions.** An empty container, and a habit, are deleted without asking, since Undo brings them back. A container with cards still asks.
- Nothing in your saved boards changed.

## A nicer sign-in screen (2026-10-22)

- The sign-in screen is now a centered card with the BusyAnts logo, a one-line pitch ("Free, with no limits. Your notes stay safe."), Google's standard "Sign in with Google" button (its dark version in dark mode), the short note about your board being private, and About, Privacy and Terms links. It works on a phone too. Signing in works exactly as before, and saved boards are unchanged.

## Fewer merge conflicts on pull requests (2026-10-21)

- Pull requests no longer edit `CHANGELOG.md` or `docs/decisions.md` directly. Each one adds its own small file under `changes/`, so two open pull requests can't clash on those files and GitHub stops showing "merge conflicts". A new script, `node scripts/fold-changes.mjs`, which the coordinator runs when you say "publish", folds those files into the two logs.
- Nothing in the app, in saving or in saved boards changed.

## A tidy toolbar in medium windows (2026-10-22)

- In windows narrower than 1180px (an upright iPad, a small laptop), Arrange, File, Feedback, Appearance and Sign out now fold into a **⋯** button at the right end, so nothing runs off the edge any more. Share stays on the toolbar. The ⋯ menu has the same rows as on a phone. At 880px and below, Note, Checklist, Container and Color show only their icons (hover for the name). Wider windows look exactly as before. Saved boards are unchanged.

## Share from the home board (2026-10-22)

- On your home board, the Share panel now has one button, **Make a board to share**. It adds an empty board inside home, opens it and leaves the panel open with **Share this board**, so you share in two clicks instead of hunting for how. Nothing is shared until you press Share this board, and your saved boards are unchanged.

## Shared boards can't take your own boards on a new device (2026-10-21)

- **A shared board can no longer swap in for one of your own boards when you sign in on a new device or browser.** Before, someone you share a board with could add a board with the id of one of yours to it, and on a new device it replaced yours there and its next save removed yours from your online boards. Now, once your own boards arrive, yours wins and theirs is left out.
- **Copying a board card from one shared board onto another no longer moves that board to the other board's people.** The board stays in the shared board it was made in.
- Boards already saved are unchanged; see the pull request for details.
## Opening an old copy no longer overwrites newer work (2026-10-22)

- **Fixed a way to lose another device's edits with nobody typing anything.** Opening the app on a device whose offline copy was out of date, with a different text size or fonts, could tidy a few blocks and send that old copy over the newer one online. Now only changes you make count as newer; the app's own tidying never does, and it waits until the server's copy has come.
- A tidy-up that was about to run no longer re-arranges a board that has just been opened or has just arrived from another device.
- Boards already saved are unchanged.
## Habits and Journal, polished (2026-10-22)

- **Habits is now a Ledger.** The weekdays are written once at the top of one sheet, today's column has a soft band, and each habit is a row with its tick circles. A line under the title says how today is going ("Wednesday · 2 of 6 done"), and each row says how many days you did it ("3 of 7 this week").
- **Each habit has its own color** (the 8 bold colors, or the usual green): use the ⋯ on its row, which also has Rename and Delete habit. Delete is no longer a bin on every row.
- **"+ New habit" is the last row**, and the box stays ready after you add one. Month calendars use filled circles, and the Weight card shows your latest weight big, how it changed, and a chart with room around the line.
- **The Journal's today is a page**: its date as the heading, the week number, a word count and a quiet "Saved". Your earlier days are a tidy timeline: a big date and the first two lines, and a click opens the day to edit. Earlier days now start folded; today starts open. This year no longer has its own header.
- **The four drop-down boxes are now one "Aa" menu** with labeled buttons (Style, Size, Font, Highlight), plus a highlighter button. A new empty day says "Write about today…".
- Everything you wrote and ticked is unchanged. Nothing about saving, sync or undo changed; a habit's color is saved with the habit.
## The website leads with what people care about (2026-10-22)

- **The About page has a new headline:** "Free, with no limits. Your notes stay safe." Under it, the four things people told us matter: free with no limits, boards that are safe, no AI pushed on you, and a good phone experience.
- **Three new sections** say it plainly: "Your boards are safe" (undo, 100 saved versions, backups you can download, offline), "Works well on a phone" and "No AI pushed on you". The AI section is honest that there is an optional Claude connector, which you set up yourself.
- **The FAQ has a new question,** "Does BusyAnts use AI?".
- **The comparison table only says what we could confirm.** Notion's "1,000 blocks" became "Limited once shared", and two offline answers we couldn't check became dashes.
- Nothing in the app or in saved boards changed. The spec no longer says "no tracking"; it says visits are counted privately, as the About page already did.
## Helper sessions work in the cloud (2026-10-22)

- The crew, finish-step and check-pr instructions now work in cloud sessions, where `gh pr` commands are blocked: they use GitHub's other route (`gh api` or the GitHub tools) to open, check and merge pull requests, and wait for the tests without `--watch`. A new spec-check skill lets a background helper run the spec check itself; when a helper can't run the code review, it says so and the coordinator reviews the pull request before it merges. A few stale lines were fixed. Nothing in the app changed.

## Save a board as a picture or PDF (2026-10-22)

- **File → Download as picture (PNG)** and **Download as PDF** save the whole open board, every card and container and not just what is on screen, as it looks now (your color theme and dark mode included), to send or print. The PDF is one page the size of the board. On an iPhone home-screen app they open the Share sheet, like the backup. A big board shows "Preparing…" while it is drawn.
- A picture from another site that the browser won't let us copy is left as a blank panel. Nothing about saved boards changed.

## Keys in side panels, screen readers, faster sign-in (2026-10-22)

- **Delete and Backspace no longer delete a note behind a side panel.** With a note selected, pressing Delete while the Focus timer's buttons or a Completed tick box had the keyboard deleted the note without any sign. Now no side panel passes board keys through (undo, redo and zoom still work).
- **Screen readers:** every checklist tick box is named for its item ("Done: Buy milk"), and a hidden live region now says what was only seen before: deletes, undo and redo, items moving to Completed, and a failed online save.
- **The sign-in screen opens faster.** It no longer waits for the board's code or for four fonts it doesn't show. It looks the same.
- Nothing about saved boards changed.

## Safety rails for the helper sessions (2026-10-21)

- Parallel pull requests no longer clash on `CHANGELOG.md` and `docs/decisions.md`: git now keeps both sides when they each add an entry.
- A new check before every command a Claude session runs refuses stopping every Playwright or node process on the computer (`pkill`/`killall`), force-pushing to `main` or `build/v1`, and pushing onto them from anyone but the crew coordinator.
- Notes the project never commits (mockups, design notes, worktrees) are now ignored by git.
- Nothing in the app changed.

## More connector tests (2026-10-21)

- Added automated checks for the Claude connector (nothing you see changes): boards the app makes stay editable by it, its safe-delete and sign-in edge cases, its fixed rules (never delete documents, only the owner's command can switch deleting on), and that the built connector starts.

## More calendar, journal and habits tests (2026-10-21)

- More calendar, journal and habits tests. Nothing in the app changed.

## Touch and keyboard fixes (2026-10-21)

- **Pinching while a checklist item is lifted on a phone** now puts the item back. Before, the lift stayed stuck and your next swipe moved the item to a new card.
- **Resizing a collapsed card with the keyboard** (arrow keys on its corner) no longer makes it jump to its open height.
- **After resizing something by finger on a tablet**, right-click and long-press menus (spell-check, copy link) keep working. Before, they stayed blocked until you reloaded.
- **On a tablet, resting a finger on a checklist item inside several selected blocks** now moves the whole selection, as it does on a note, instead of only that checklist.
- Nothing about saved boards changed.

## Import and small checklist fixes from the code review (2026-10-21)

- **Importing a big or odd file no longer freezes the page.** A .txt with a very long run of blank lines, or a Markdown file with one huge line of stray `**`, `__`, `~~`, `[` or `<` marks, took minutes to read. It now reads in well under a second, and ordinary files read exactly as before.
- Collapse all no longer counts the hidden Completed history after Clean up, so the button says Expand all when every card you can see is collapsed, and no longer makes an undo step that does nothing.
- Backspace in the last open blank item of a list is now refused, instead of sending the cursor to a ticked item that may be hidden.
- Expand all gives the old layout back even if you picked the same cards in a different order.
- Opening an old version in History right after ticking an item no longer loses the tick.
- Dragging an item while items in several lists are selected now does nothing, as the spec says.
- A format change that changes nothing (the size or font it already has) no longer makes an undo step.
- The focus timer keeps running and chimes even when the device's storage is full.
- Download as text puts the Completed history after your cards, not before them.
- Nothing about saved boards changed.

## Shared computers keep each account's boards apart (2026-10-21)

- **Fixed:** on a computer used by more than one person, someone signing in with a new Google account could be given the boards of the person who used it before, private Journal included, and those boards were saved into the new account. Now the computer remembers whose boards it holds. When someone else signs in, the earlier person's boards are put aside on the computer, never shown or saved into the new account, and the new person starts from their own boards (or an empty board until theirs arrive).
- When the earlier person signs in on that computer again, their boards come back, the same as reopening the page.
- The same goes for boards someone else shared with the earlier person, and for other open tabs.
- Boards already saved on a computer stay with the first account that signs in after this update.

## Fix: version preview during a drag, and Escape (2026-10-21)

- **No more white screen:** picking an earlier version in Version history while you were holding a card or container mid-drag could crash the whole app. Any drag or resize in progress now simply ends when a version is shown.
- **A version that was still loading** no longer shows up late after you click Current version, close the history or press Escape.
- **Escape now only closes a panel when it is meant for it.** With the Focus timer, Calendar, Journal, Habits, Completed or Version history open, Escape used to close the panel as well when you were closing a toolbar or Color menu, leaving a text box, closing the keyboard shortcuts list or canceling a "Delete ...?" question. Now that Escape only does the one thing, and a second Escape closes the panel.
- Nothing already saved changed.

## Hover colors and the drop glide work again (2026-10-21)

- **Buttons react to the mouse again on a computer.** Thirteen hover effects had stopped working (the toolbar buttons, the zoom and text size buttons, the small buttons on cards and in panels, Completed, Uncheck all, the formatting bar, Version history rows, the ? and coffee buttons, and the calendar's events, days and chips). They still do nothing on a phone or tablet, so a tap never leaves a button tinted.
- **A dropped block glides into its grid spot again.** It used to jump, because the block was rebuilt when you picked it up and again when you let go. It is now the same block throughout, so it also no longer restarts a playing video when moved.
- Nothing about saved boards changed.

## Version history keeps your work before another device's changes replace it (2026-10-21)

- If a phone saved an old copy while offline and sends it hours later, it replaces every board on your computer. Now, if you had edited on this page, every board as it was just before is saved in Version history first, marked "Before changes from another device", so you can restore your work.
- It is saved at most once every 10 minutes, so using two devices at the same time doesn't fill the history, and never because someone else changed a shared board or a shared board arrived. If it can't be saved, the incoming change still goes ahead as before.
- On the published site the online rules need the update in `firestore.rules` (pasted into the Firebase console) for this kind of version to be saved. Nothing already saved changes.

## Resizing from the edges: neighbors move the right way (2026-10-21)

- Dragging a top corner (top left or top right) no longer throws a shorter card beside it up the board; it slides sideways out of the way and keeps its height.
- Dragging the bottom edge (or a bottom corner) down over the card below it now pushes that card straight down instead of shoving it sideways.
- Matching another block's size no longer breaks the size limits, and dragging the top edge never makes a card shorter than its text just because another block is almost that height.
- Nothing about saved boards changed.

## Resize cards from any side (2026-10-21)

- **Cards can now be resized from all four edges and all four corners**, not only the bottom right. This works for open and collapsed cards. Containers resize from their left and right edges and every corner (these set the width; an empty container's corners also set its height, and a container with cards stays as tall as its cards).
- The opposite edge stays where it is, so dragging the left or top edge moves the card too. Like before, it eases to the grid when you let go, and one undo takes it back.
- When you let go, blocks it now covers move out of the way: dragging the left edge out slides neighbors in its row to the left, and dragging the top edge up moves the blocks above it up. Nothing moves while you are still dragging.
- The mouse pointer turns into a resize arrow only on the edge and corner areas; everywhere else on a card it stays the normal arrow. On a touch screen (phone or tablet) the thin edge areas are left off, since a finger is too big for them; the older bottom-right handle and right-edge strip work there as before.
- Nothing about saved boards changed.

## Journal: fold a day's note (2026-10-21)

- In the Journal panel, each day's date is now a button, like the Year, Month and Week headings. Click it (or press Enter or Space) to fold that day's note. A folded day shows its date and, after it, the first line of the note in gray (cut with … if it is long). Click again to open it and keep writing.
- Every day is open when you open the panel, today's too, and today's note can be folded. Folding is only for looking: it never changes what you wrote, and it isn't remembered or saved.
- If you fold the day you are typing in, the cursor moves to that day's heading. On a phone the headings are at least 44px tall.
- Nothing already saved changed.

## Card look fixes (2026-10-21)

- The checklist item buttons (Move up, Move down, trash and drag grip) now grow with the text size (A+ / A−), along with their icons and the room kept free for them, so they match bigger text. At Small and Normal they look as before; the phone layout is unchanged.
- Checkboxes now sit exactly in the middle of their item's first line, for items and sub-items, at every text size, in light and dark mode.
- A card with a color that is collapsed is now colored all the way from top to bottom, into its rounded corners, instead of showing a colored band with plain strips above and below.
- Nothing about saved boards changed.


## Calendar: full names, normal time, and quicker add and edit (2026-10-21)

- **Month view shows full names.** Each event's name now wraps onto as many lines as it needs instead of being cut with "…", and the day's row grows taller to fit. The list under the grid shows full names too. The Week view looks the same as before.
- **Normal time, not military time.** The calendar panel now writes times like Google Calendar: "10am", "10:30am", "10 – 11am", "11:30am – 1pm", "10am Dentist". The edit form's time boxes still follow your browser.
- **Click the picked day to add an event.** In the Month view, clicking a day that is already picked opens the new-event form for it, like its + does.
- **Click an open event to edit it.** Clicking an event whose card is already open opens its edit form, like the pencil. For an event you can't change, the card just stays open.
- Nothing about saved boards changed.

## Bottom bar fits beside a side panel (2026-10-21)

- With a side panel open, every control in the bottom-right bar (Search, Completed, History, Timer, Calendar, Journal, Habits, ?, coffee cup, A− / A+ and zoom) now stays fully visible and clickable, even when the panel is dragged nearly as wide as it goes.
- When space is short, the buttons in the pill drop their words and show icons only (hover one to see its name). If icons alone don't fit, the bar wraps into rows with the pill on top.
- Nothing changes with a wide window, with no panel open, or on a phone. Saved boards are untouched.

## Calendar: press Delete twice to delete an event (2026-10-21)

- With an event's card open, Delete (or Backspace) asks "Delete “Dentist”?" as before. Pressing Delete or Backspace again now answers it: the event is deleted. For a repeating event it deletes **all events in the series**.
- If the event has guests, the next question, "Send update emails to guests?", still needs a click (or Enter); the Delete key does nothing there.
- Holding the key down never answers the question; it has to be a second, separate press. Escape still keeps the event.
- There is still no undo for calendar events. Nothing about saved boards changed.

## Habits: a Weight card (2026-10-21)

- The Habits panel now has a **Weight** card above your habits. Type today's weight in kilograms (like 72.4, a comma works too) and press Enter or Save. Typing it again the same day replaces it. Anything outside 20.0 to 400.0 shows a short note and isn't saved.
- A small line chart shows your weights for the week, month or year the panel is on, and moves with the ‹ › arrows. A × next to the latest one removes it, and Ctrl+Z brings it back.
- Weights are kept on the same hidden Habits board as your habits, so they are saved, synced, undone and restored from Version history the same way. They don't show up as a habit, and the Habits board still stays out of the Boards menu.
- Nothing already saved changed: the Weight card is only made when you enter your first weight.

## Habits: Month and Year views, no streak (2026-10-20)

- At the top of the Habits panel there is now a **Week | Month | Year** switch with ‹ and › arrows. A Today button shows up when you've moved away from today. The bar stays in view while you scroll your habits. The panel still opens on this week.
- **Month** shows a small calendar for each habit; tap any day to tick or untick it, the same as in Week (Ctrl+Z undoes it the same way). When you make the panel wide enough, two habits sit side by side.
- **Year** shows twelve rows of tiny squares for each habit, one square per day, so you can see the whole year at a glance. It is for looking only. Click a month's name to open that month.
- The streak counter is gone from every habit.
- Nothing about how habits are saved changed, so your boards and habits already saved are untouched. The view you pick is not remembered, so the panel opens on this week each time.

## Every side panel can be resized (2026-10-20)

- Version history, Completed, the Focus timer, the Journal and Habits now have the same thin strip on their left edge as the calendar. Drag it to make the panel wider or narrower, or click it and use the left and right arrow keys; double-click it to put the usual width back.
- A panel is never narrower than 300px, and 300px of board always stays visible. The zoom buttons and the Find bar move over with the panel.
- Each panel remembers its own width on this device only. It is not synced or undoable, and your boards are not changed. The calendar's saved widths work as before. A phone is unchanged: panels still fill the screen.

## Journal days fold away by year, month and week (2026-10-19)

- The Journal panel now groups your days under Year, then Month, then Week (Monday to Sunday). Click a heading to open or shut it. A week that runs across two months is split, with each month listing its own days.
- When you open the Journal, this year, this month and this week are open and today's note is there to type in. Older weeks, months and years are shut.
- Which ones you open or shut is remembered on this device only. It is not synced or undoable, and your boards are not changed.
- The Journal panel is now as wide as the Calendar panel.
- Today comes first: today's year, month and week are always the first ones at their level, and today's note is first in its week, even when you have written days ahead (a later date). Those later days come after, in their own groups, and everything else stays newest first.

## Pictures, videos and web addresses (2026-10-19)

- Paste a web address onto the board (Ctrl+V, not while typing in a text field) or drag one in from another browser tab, and it becomes a link card. A picture or link dragged from a web page works too.
- If the address is a picture (.jpg, .png, .gif, .webp, .avif, .svg), the card shows the picture. A YouTube or Vimeo address shows the video player, and an .mp4 or .webm address shows a video with controls. Anything else stays an ordinary link card, and a picture or video that can't load falls back to the ordinary card.
- Nothing is uploaded. The picture or video is loaded from its own website each time, and the privacy page now says so. A picture or file from your computer can't be added yet: the board says so and suggests pasting a web address.
- The newest copy wins: copy a card and then a web address somewhere else, and Ctrl+V makes the link card; copy a card after an address and Ctrl+V pastes the card (it used to keep pasting the old card until you reloaded).
- A click on a video on a card that isn't selected selects the card first, so cards still drag and select as usual. Only http and https addresses are ever used. Nothing about saving, sync or undo changed. A link card already on a board (or shared with you, or imported) whose address is a picture or video now shows it too.

## Widening a card no longer throws its row neighbours around (2026-10-19)

- Fix: when you dragged a card's resize corner wider so it covered the next card, the blocks to its left in the row (such as the card at its far left) jumped to the right of it, so the row came out in the wrong order. Now the card you resize keeps its place, blocks to its left stay exactly where they were, and only the blocks it now covers slide right, in their old order.
- This is the same for the corner, the width strip, the keyboard arrows and a finger. Dragging blocks is unchanged. Your boards and their saving are not touched.

## Find zooms in less (2026-10-19)

- When the board is zoomed out below 60%, Find now zooms in to 60% on the match instead of 100%, so it no longer jumps in so far. At 60% or more the zoom is left as it is.

## The Privacy page explains the Claude connector (2026-10-19)

- The Privacy policy has a new short section, "The Claude connector (optional)". It says the connector runs only on your own computer, signs in with your own Google account, keeps that sign-in in a file on that computer, touches your boards only when you ask Claude to, has deleting switched off, and sends what Claude reads to Claude under Anthropic's privacy policy. BusyAnts stores nothing new because of it.
- Anthropic is now listed with the other services the page names.
- Claude Code is also kept from reading the connector's sign-in folder on a Mac or Linux computer, as it already was on Windows.
- The app, your boards and their saving are not touched.

## The Claude connector in one file, with sign-in from Claude (2026-10-19)

- The BusyAnts connector for Claude can now be made into one file, `busyants.mcpb` (`npm run mcp:pack`). Anyone with Claude Desktop on a Mac or Windows computer opens that file to install it: no Node, no project folder, no settings to edit.
- Claude can sign you in: ask it to "sign in to BusyAnts" and a sign-in page opens in your web browser, where you pick your own Google account. "Sign out of BusyAnts" deletes the saved sign-in. Neither changes anything on your boards.
- The connector's instructions (`mcp/README.md`) are now written for anyone, with Mac and Windows steps.
- Your boards, how they save and the website are not changed. An existing sign-in keeps working, and deleting stays off unless you switch it on as before.

## Rich text in the Journal (2026-10-19)

- Journal notes can now be formatted. A Formatting bar at the top of the Journal panel has Bold, Italic, Underline, Strikethrough, Bulleted list and Numbered list, and menus for Style (Normal, Heading 1, Heading 2), Text size, Font and Highlight (yellow, green, blue or pink).
- Select some words and press a button, or press it first and then type. Keys: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X (strikethrough), Ctrl+Shift+8 (bullets), Ctrl+Shift+7 (numbers).
- In a list, Enter adds the next item, Enter on an empty item ends the list, and Tab / Shift+Tab indent and outdent.
- Only the Journal has this. Everywhere else (other notes, search, export, copying, the note's card on the Journal board) the words show as plain text, with lists as "•" and "1.".
- The formatting is saved, synced, kept in backups, exports and Version history, and each change is one Ctrl+Z step. Journal notes you already have open exactly as before. Formatting that is loaded or imported is checked, and it can never run as code.
- When two edits of the same note are combined, its formatting always comes with the words that are kept. (On your own devices the latest save wins, words and formatting together, as with every board.)

## Calendar events open in a small card (2026-10-19)

- Clicking an event in the calendar panel now opens a small card next to it, like Google Calendar's, instead of replacing the whole panel. The list stays in view. On a phone the card slides up from the bottom.
- The card shows the title, the date and time, and the guests. Its top has a pencil (opens the full edit form), a trash can (deletes the event) and × (closes).
- Pressing Delete or Backspace while the card is open deletes the event too. It asks first, exactly like the trash can and the form's Delete button ("Delete “Dentist”?" · Keep · Delete). Calendar events can't be undone, so that question is the safeguard. It doesn't fire while you're typing in a text box.
- Events you can only change in Google Calendar show the same card without pencil and trash, with the Open in Google Calendar link.
- Escape, × or a click anywhere else closes the card; the next Escape closes the panel.
- The card follows the panel's edge when you drag the panel wider or narrower (it stays open) or resize the window. In a narrow window with a wide panel, where there is no room beside the panel, it sits inside the panel instead of being partly hidden. While a delete is on its way to Google, clicking another event or week waits, so a "didn't reach Google Calendar" note is still shown.
- Your boards and their saving are not touched.

## A flaky phone test made reliable (2026-10-19)

- One browser test (an item far off to the side is brought back on a phone) sometimes failed on GitHub for no real reason: the app was doing its job, bringing the item back on screen, a moment before the test looked. The test now waits for that first move to finish before sliding the board.
- The app itself and your boards are not changed.

## Dragging and resizing keep rows together (2026-10-19)

- Drag a block along a row and the blocks in that row now slide sideways out of its way and keep their left-to-right order, instead of jumping above or below the row. Drop a block onto its neighbour and they swap places.
- Blocks only make room for where the dragged block is now: once it has moved past them, they spring back to their own spots.
- Widening a card or container does the same when you let go: its neighbours in the row slide sideways, not down. Blocks still never overlap. Your saved boards are not changed until you move something.

## Habits (2026-10-19)

- A new **Habits** button sits next to Journal in the panel pill by the zoom control (on a phone: ⋯ → Habits). It opens a Habits panel at the side; the board you are on stays open.
- Type a habit in "New habit" and press Enter or Add. Each habit shows this week's seven days, Monday to Sunday, today outlined. Tap a day to tick it, tap again to untick it; a day is ticked at most once.
- Under each habit is its streak: the days in a row you ticked, up to today. Not having ticked today yet doesn't break a streak that ran through yesterday.
- Rename a habit by typing over its name. The bin deletes it after asking first; Ctrl+Z in the panel, or Version history, brings it back with its ticks.
- Habits are kept on a hidden board called "Habits", like the Journal, so they save, sync to your Google account when signed in, and stay on the device when not.
- Your boards and journal already saved load exactly as before. Nothing new is saved until you add your first habit.
- Restoring a version in Version history also puts your habits back as they were then, like the Journal.
- On a phone the keyboard doesn't pop up by itself when the panel opens, so it doesn't cover the day boxes. Screen readers say each day box with its habit ("Read, Mon 19 Oct").

## Phone: press and hold to move a list item (2026-10-19)

- On a phone, rest your finger on a checklist item for about half a second, then move it: the item lifts, with a shadow under it, and its label follows your finger. The other items slide aside to open a gap where it will land, and let go to drop it there. It can go into another list or onto the board, the same as dragging by the grip.
- A quick tap still lets you type, a swipe still moves the board, and resting on the list's title or the card's empty space still picks up the whole card. The grip still drags at once.
- With your phone set to reduce motion, the items jump instead of sliding. Computers and tablets are unchanged. Your boards are not touched: dropping is the same undoable move as before.

## Privacy-friendly visit counts (2026-10-19)

- The published site now counts page visits (the app and the About, FAQ, Terms, Privacy and Delete your account pages) with GoatCounter, a counter with no cookies. It is the owner's account, busyants.goatcounter.com.
- Nothing from your boards is sent. It only runs on the published site: not in `npm run dev`, not in the browser tests, not on localhost.
- The Privacy page has a new "Counting visits" section saying so, and the About page's "no analytics" line now says "only a privacy-friendly count of page visits".

## Claude can make boards, checklists and containers, and delete safely (2026-10-19)

- The Claude connector can now add a checklist, add an empty container (column), and make a new board, either inside one of your boards (with a card that opens it) or on its own.
- Claude can also delete items, cards, containers and boards inside a board, but only if you switch it on, on your computer: `npm run mcp:delete-on` (`npm run mcp:delete-off` switches it off again). It is off to begin with.
- Deleting always takes two steps: Claude shows you exactly what would go, and deletes only after you say yes. A copy of your boards is saved in Version history just before, so it can be put back.
- Claude never deletes your home board, a top-level board, the Completed card or anything on a shared board, and at most 20 things at a time.

## Phone: the line you are typing in always stays in view (2026-10-19)

- On a phone, the note, title or item you are typing in now always slides into view above the keyboard, also after Enter adds an item and after the buttons above the keyboard (Tick, Delete, Undo, Move up and down, Indent, Outdent) move the cursor.
- It also stays clear of the top bar and the sides of the screen, not only the bottom. When the phone scrolls the page so part of it is out of sight, the line is kept out of that part too.
- Nothing else changed: computers and tablets are the same, and your boards are not touched.

## Lists fill the screen on a phone (2026-10-19)

- On a phone, a new note, checklist or link is made almost as wide as the screen (a small margin each side) instead of the small desktop size.
- When you start typing in a card or container on a phone, the board zooms and moves so that card fills the screen's width. The line you tapped stays where it was. Moving between the boxes of the same list doesn't move the board again, and you can still pinch and pan as you like while typing.
- On a phone, the collapse arrow and the trash can now show only on the card (or container) you have selected, not on every card. Tap a card to select it, then use its buttons. A tap that only selects a card can no longer press a button that appears under your finger.
- Computers and tablets are unchanged. Nothing about your saved boards changes; the zoom is not saved or undone.

## Phone: the keyboard stays up while you tick and delete items (2026-10-19)

- On a phone, ticking an item in the bar above the keyboard moves the cursor to the next open item, and deleting one moves it to the item above. The keyboard no longer closes after each tap.
- The bar has two new buttons: Undo (at the left) and Done (at the right, which puts the keyboard away). Undo goes back one step at a time and keeps you typing.
- The Indent and Outdent icons are clearer: like the ones in a text editor, with an arrow showing which way the item moves.
- Checklist items on a phone no longer have a small trash can on each row; Delete is in the bar above the keyboard. Computers and tablets are unchanged.
- Your boards are not touched: only what the buttons do while you are typing changed.

## Custom hotkeys (2026-10-19)

- You can now change the keys for the Hand tool, the Select tool, Select all, Copy, Paste, Duplicate and Delete. Open the Keyboard shortcuts list (the ? button or the ? key), click a key, and press the new one. Escape cancels, and a "Reset to defaults" button puts every key back.
- If the key is taken, the list says what uses it (for example "V is already used by Select tool.") and nothing changes. Undo, redo, zoom, the arrows and the keys inside checklists stay as they are.
- The Hand and Select buttons, and the list, show your keys. They are remembered on this device only, like dark mode: not part of your board, not synced, not undone. Your boards are not touched, and a missing or broken setting just means the usual keys.
- Small change: the match is exact now, so Shift+H no longer picks the Hand tool and Ctrl+Shift+D no longer duplicates.

## Color themes (2026-10-19)

- The moon button in the toolbar is now an Appearance button (a half-filled circle). It opens a small menu with the Dark mode switch and six color themes: Honey (the look you have today, still the default), Ocean, Forest, Lavender, Rose and Slate.
- A theme changes the accent color (the pressed tool, the Share button, switches, the New container button) and the tint of the board and the toolbar. Cards stay white, and dark mode still has its own dark version of every theme.
- Your pick is remembered on this device only, like dark mode. It is not part of your board, is not synced and is not undone by Undo.
- On a phone it is the Appearance row in the ⋯ menu (it replaces the Dark mode row and opens inside the menu).
- Every theme was checked for readable contrast (WCAG AA) by an automatic test. Your boards are not touched: the pick is one small setting kept on this device, and a missing or broken one just means Honey.

## Google Calendar remembered for the hour (2026-10-19)

- Closing the tab or the browser and opening the site again within about an hour no longer flashes Google's window: the calendar opens straight away. Another tab works the same way.
- Google's quick window still shows about once an hour, when the access runs out, and on another device.
- The access is dropped when you sign out (in any tab), when someone else signs in, when Google refuses it, after about an hour, and when you delete your account. It is never in a backup.
- If you're already connected, you aren't asked again because of this change.
- The Privacy policy says so.

## Text size can go even bigger (2026-10-19)

- A+ by the zoom control now has two more steps after Larger: Huge (150%) and Largest (175%). A+ fades at Largest; A− steps back down. The same buttons in the phone's ⋯ panel work the same way.
- Your saved text size still loads as before. The sizes you set on a single note or title (Ctrl+Shift+>) are unchanged.

## Bigger item buttons on a computer (2026-10-19)

- On a computer, the Move up, Move down, trash and drag buttons that show when you point at a checklist item are bigger: arrows 16px to 22px wide, trash 24px to 28px, grip 14px to 18px, with their icons scaled to match.
- They still sit at the right end of the item's first line and never cover the text, and the text doesn't move when you point at it. This holds at every A- / A+ size, inside containers and on sub-items.
- Phones and touch screens are unchanged. Nothing about saving or your boards is touched.

## Google Calendar stays connected across a reload (2026-10-19)

- Reloading the page within about an hour of connecting no longer flashes Google's window: the calendar opens straight away with your events.
- The calendar access is kept only for this browser tab and is dropped when you sign out, when someone else signs in, when Google refuses it, or after about an hour. A new tab, the next day or another device still shows Google's quick window once (a duplicated or reopened tab may carry it over).
- The Privacy policy says so (effective October 19, 2026).

## Press shrink works with reduced motion too (2026-10-19)

- A button you press now shrinks a little (3%, for a tenth of a second) for everyone, even when Windows has "Animation effects" turned off or the computer is set to reduce motion. The website's Start and Open buttons do the same.
- Only that one thing changed. Menus and panels opening, the fold arrows turning, the tick fade and the block glide still stay off when reduce motion is on.
- Nothing about saving or your boards is touched.

## Search all boards (2026-10-19)

- The search bar has a new switch under the box: **This board** / **All boards**. It always opens on This board, exactly as before, and goes back to it whenever you close the bar (Escape or ×).
- **All boards** looks in every board you have, sub-boards included. Matches on the board you are on come first, then the other boards in the Boards menu order. When the current match is on a board that isn't open, the count says so, like "3 of 12 · Garage".
- Enter (or the arrows) takes you to the next match; if it is on another board, that board opens, then the board moves to the match and marks it, as for a match on the same board.
- Searching only looks: it never changes or saves a board. Your saved boards are untouched.
- On a phone the two options are 44px tall, under the search box.

## Design polish: motion and phone feel (2026-10-19)

- Buttons now give a little feedback when pressed: they shrink a touch and spring back (the faded ones stay still). The big Start and Open buttons on the website do the same.
- Menus and panels (File, Arrange, Boards, Share, the shortcuts and the phone's + and ⋯ sheets, the side panels, Search) now fade in and grow from the button you pressed, over about a tenth of a second, instead of popping in. Closing them is still instant. The Color menu only fades.
- Nothing moves when the keyboard did it: arrow-key moves, undo, Enter on a button, Ctrl+F, `?`, and Ctrl+Enter on a checklist item (which now ticks at once instead of fading out first). Ticking with the mouse or a finger still eases out as before. With the computer set to reduce motion, none of the new motion plays.
- A fold's arrow on the website turns over instead of jumping; the ease curves of the existing slides and glides are a little punchier (same lengths).
- On a phone: no grey flash or tint left on a button after a tap (hover looks now apply only where a mouse can hover), buttons respond to a tap without waiting for a possible double-tap, a long press no longer selects a button's label, the pressed bottom-bar button shows at once, and tall panels fit the visible screen (not the height with the address bar hidden).
- The full list of what was changed, held back and left alone, with the reasons, is in `docs/design-polish-review.md`. Nothing about saving, undo or deleting changed, and your boards are untouched.

## Emil Kowalski's design skills (2026-10-19)

- Added five design, motion and phone-feel skills by Emil Kowalski (MIT licence, credit and licence kept in `.claude/skills/EMIL-KOWALSKI-LICENSE.md`): design engineering, review animations, improve animations, animation performance and mobile native. From now on, any UI or motion work, on the computer and on the phone layout, follows them alongside Impeccable. `SPEC.md` and your recorded decisions come first, then Impeccable for the look, then these for motion and feel. The cursor and focus-ring rules are unchanged, and the end-of-step routine now runs a light design check on UI changes.
- Nothing in the app changes in this step; the polish fixes to the current app come in a separate pull request. Your boards are untouched.

## Journal opens in a side panel (2026-10-18)

- The **Journal** button now opens a Journal panel at the right, in the same spot as the Focus timer, History, Completed and Calendar (full screen on a phone). The board you are on stays open behind it. Escape, × or the button again closes it.
- Today's note is at the top, with the cursor ready to type; earlier days are listed below it, newest first, and can be edited too. What you write is saved as before, on the board called Journal.
- Ctrl+Z / Ctrl+Y in the panel undo and redo your journal writing only, never the board behind it.
- Other keys pressed in the panel (Delete, arrows and so on), even after clicking its heading or blank space, never touch the board behind it. Opening the panel unselects whatever was selected on the board.
- Restoring a version from Version history also brings back your journal writing as it was then.
- A new Journal board no longer gets a card on home and is not listed in the Boards menu. A Journal board you already have, with its card on home, is left exactly as it is and still opens as a normal board.

## Up and down arrows on checklist items (2026-10-18)

- Hover a checklist item on a computer and two small arrows show by its trash can and grip: Move up and Move down. They do the same as Ctrl+Shift+Up / Down and the phone's Move up / Move down: the item moves past the one above or below it at the same level, with its sub-items, in one undo step, and the cursor stays in it.
- At the top or bottom of its level an arrow is faded and does nothing. On a phone or tablet the arrows don't show (the phone already has its row of buttons above the keyboard).
- On a computer the space kept free at the right end of each item is a little wider (it holds four buttons now), so checklist text wraps slightly earlier than before. On a phone it is unchanged. Your boards are untouched.

## Daily journal (2026-10-18)

- New **Journal** button, last in the row of buttons by the zoom control (on a phone: ⋯, then the Journal tile). It opens a board called Journal, with a note headed with today's date (like "Sun 18 Oct 2026") at the top and the cursor in it, ready to type. Press it again the same day and it takes you back to that note instead of adding another. Each new day adds a new note above the older ones.
- The first time, the Journal board is made for you inside your home board (a card on home opens it, placed where a new sub-board would go on home). Ctrl+Z on the Journal board takes today's note away; pressing Journal puts it back. Ctrl+Z on home takes the card away, as after Add a sub-board; the Journal board stays and Journal still opens it.
- If today's note is inside a collapsed container, Journal selects the container.
- Your boards are untouched: nothing changes until you press Journal, and a board you already named Journal is used as it is.

## Broken shared boards no longer keep newcomers on them (2026-10-18)

- A shared board whose saved data is damaged, in the old format or from an older version of the app is now handled like one missing its main board: it is skipped, its link says it doesn't work, and someone opening the link for the first time is taken off it again (before, they stayed on it without seeing it, and couldn't leave it).
- Only a shared board saved by a newer version of the app is still kept on everyone's list, so an updated app opens it.
- Someone who was already on such a shared board and opens its link on a new device stays on it (before, they could be taken off it, and lost it on their other devices too).
- Shared boards already on your device and your own boards are untouched.

## Unsent changes too big to save online now say so (2026-10-18)

- Signed in, if the app opened on changes this device hadn't sent yet and they made your boards too big to save online (over 900,000 characters), the internet refused them, the older online copy came back and the note said "Saved". Now the red "Couldn't save online. Changes are on this device only." banner shows as soon as the board opens, and your changes stay on screen.
- Your next change tries to save again, those changes included; the banner goes once a save succeeds. While the banner shows, changes from your other devices are ignored, and your next successful save from this device replaces them, as with any refused save.
- Boards already saved are untouched, and boards under the limit work as before. If unsent changes are refused for another reason, the older online copy still comes back, as before.

## About page demo always plays (2026-10-18)

- The demo clip on the About page now starts by itself and loops over and over on every device, with no Pause button. Before, a computer or phone with "Reduce motion" on showed only a still picture and no button.
- People who turned on "Reduce motion" will now see this one moving clip, and cannot pause it. If a browser blocks autoplay (low-power mode, say), the still picture stays.
- Nothing in the app changes, and your boards are untouched.

## Phone: double tap to zoom in, long tap to zoom out; selected blocks move together (2026-10-18)

- On a phone or tablet, on the empty board: double tap zooms in one step and a long tap (resting a finger about half a second, then lifting) zooms out one step, each around your finger, the same step as the computer's zoom buttons. Cards and containers are unchanged, and swiping still pans the board or draws the selection box.
- Fixed: with several cards and containers selected, pressing and holding one and then moving it moved only that one. All the selected blocks now move together, as with a mouse.
- Your boards are untouched; nothing new is saved.

## Restoring a version while offline (2026-10-17)

- Pressing "Restore this version" while offline could leave the button waiting until the connection came back, then put the old version over whatever board was open by then. Now the safety copy (every board as it is now, kept in Version history) is started the moment you press Restore, before the old version is even read, so offline it is already waiting on this device, kept even if you close or reload the page, and saved once you're back online. The restore waits for the old version to be read and at most 3 seconds for that save, then goes ahead.
- If, while it waits, you press Back to current, pick another version, or another board opens, the restore is dropped and nothing on your boards changes.
- If the safety copy is refused before the restore happens (within those 3 seconds, or while the old version is still being read), the restore stops and says "Couldn't restore it", as before. If it is refused later, after the restore went ahead, a note says "The boards from before your restore couldn't be saved in Version history."
- Deleting a board, restoring a backup and losing a shared board also start their safety copy at once now, instead of first reading the version list (which, just after the connection drops, can itself take a while). A safety copy the same as the version before it is removed again once its save answers (if the page is still open then), so the history doesn't fill up with repeats.
- Boards already saved are untouched.

## Shared board from a newer app no longer holds back your boards (2026-10-17)

- If someone shared a board with you that was saved by a newer version of the app, and this device had never opened it, boards you made on this device could stay unsent and be lost on the next reload. Now that shared board is simply skipped (its link says it doesn't work), and your own boards save online as usual.
- Opening the link of such a board, or of your own shared board, no longer takes you off it; you stay on it, so the link works once your app is updated.
- Shared boards already on your device and your saved boards are untouched.

## Opening your board offline with unsent changes (2026-10-17)

- Signed in, if you closed the app before your last changes reached the internet and then opened it again without internet, it stayed on "Opening your board…". It now opens on the copy saved on this device, those last changes included, and they are sent once you are back online.
- Reopening straight after a change, online, now also opens a moment sooner, without waiting for that change to arrive. Either way the note says "Saving…" until those changes are online, then "Saved".
- Your boards are untouched: boards already saved online are not changed, and nothing extra is sent. As before, if the internet refuses those last changes (a board too big to save online, say), the online copy comes back; if there is no online copy yet, the board is kept here and sent again, with the red "Couldn't save online" banner if that is refused too.

## Sharing files now hold back auto-publish (2026-10-17)

- Changes to the sharing, account and board-merging code (`src/store/sharing.ts`, `src/store/account.ts`, `src/model/sharing.ts`, `src/model/merge.ts`) now wait for your "publish" instead of going live on their own, like the other saving and sync files.
- Nothing in the app changes, and your boards are untouched.

## Google Calendar: "All events" from an event moved on its own (2026-10-17)

- Changing the time of a whole series with "All events in the series", from an event that had been changed on its own, could say "That change didn’t reach Google Calendar" even though the series had changed, and trying again kept failing until the page was reloaded. The event's own change is now sent first, so this no longer happens.
- If the event's own change goes through but the series' doesn't, it now says "Only this event changed: the rest of the series didn’t reach Google Calendar. Try again later." Save again to send the rest.
- Your boards are untouched.

## Google Calendar: "All events" changes only what you edited (2026-10-17)

- When one event of a repeating series had been moved on its own (say to 10:00 in a 09:00 series), changing just its title with "All events in the series" moved the whole series to 10:00. Now only what you changed in the form goes to the series; its time, title and guests otherwise stay as they were.
- The same goes for guests (only those you added or removed change for the series) and for the end time (a new end alone keeps the series' own start time).
- If that one event was made all-day (or timed) on its own, "All events" now says to change the series in Google Calendar instead of giving the series wrong times.
- Deleting with "All events in the series" still deletes every event of it, including ones changed on their own, as Google Calendar does.
- Your boards are untouched.

## Phone touch fixes (2026-10-17)

- Text boxes are 16px on a phone (notes, list and container titles, checklist items, the Timer's minutes), so iPhone Safari no longer zooms the page in when you tap one. Page zoom is still allowed. On a phone the smaller text size stops at 16px.
- A pinch on the top bar or the bottom bars no longer zooms the whole page.
- While you type on a phone, the line you are typing stays above the keyboard as the note grows, not only when you first tap it.
- Easier to press: checklist tick boxes (wider press area), the Completed buttons (taller, spaced out), the welcome tour's buttons, History and Timer close buttons, Timer Start / Reset / Skip, Search's arrows and close (and a wider Search box), the Boards and File menu rows, the color swatches (44px each, as many to a row as fit) and Default / Auto-color, and the spacing of Hand / Select and A- / A+. On a touch screen the small card controls (collapse, trash can, resize corner, width strip, item grip) have bigger invisible press areas that never overlap each other, and the trash can never covers another control. Nothing looks different on a computer.
- The empty-board hint on a phone now says "Tap the Add button (+) below to add a note, a checklist or a container."
- Nothing was changed in saved boards.

## About page: demo video and new sections (2026-10-17)

- The big board picture on the About page is now a short silent demo video (about 14 seconds, loops). It shows ticking an item so it moves to Completed, folding a container, dragging a card so it snaps into place, and typing a new item. It has a light and a dark version, a Pause / Play button you can reach with the keyboard, and the old board picture as its poster. If your computer is set to "reduce motion", the still picture is shown instead and nothing plays.
- New sections, in this order: Try it, How it works (3 steps), Everything on one board (6 tiles), the comparison, What you can count on (free, private by default, works offline, yours to keep or delete), Quick answers (3 questions, with a link to all the questions), and the closing Start button.
- Every claim was checked against the app and the Privacy policy. For example, it does not say "no account needed", because you sign in with Google. No testimonials or user numbers.
- Nothing in the app or in saved boards changed.

## Google Calendar: repeating events and guests (2026-10-16)

- Fixed: renaming one event of a series that was changed on its own, with "All events in the series", now renames that event too (it keeps its own time). Adding a stray space no longer counts as a new title, and an untitled event is no longer saved with "(No title)" as its name.
- Repeating events you organise can now be changed and deleted in the calendar panel. It asks whether you mean only this event or all events in the series.
- You can see, add (by email address) and remove guests on your own events, new ones too. When an event has guests, saving or deleting it asks whether to send update emails to them.
- Events from other people, events with their own reminders and special kinds like Out of office still open in Google Calendar. So does changing every event of a series that Google keeps in another time zone.
- The Privacy policy says that guests' email addresses go to Google Calendar and guests are emailed only when you choose Send.
- Your boards are untouched; calendar events still aren't board data (no undo, not synced).

## Phone menu as tiles (2026-10-16)

- On a phone, the ⋯ menu is tidier and shorter. Search, Share, History, Completed, Focus timer and Calendar are tiles, three across. Below them, Arrange holds the Hand / Select tool, text size, a Snap to grid switch, Color, and one row with Collapse all, Same width and Clean up. Last comes More: File, a Dark mode switch, Feedback, About BusyAnts, Buy me a coffee and Sign out. Everything works as before; items that need sign-in or the published site still only show there. It fits a 320px-wide phone in light and dark mode.

## About page: sharper picture, folding "Try it", new ending (2026-10-16)

- The sample-board picture on the About page is sharp now. It was too small (and reduced to 256 colours), so it looked blurry on most screens. Both the light and the dark picture were retaken at twice the size in full colour (WebP, about 290 KB and 260 KB), and they look the same size on the page.
- "Try it: tick one off" now folds open and shut like the FAQ's questions. It starts open, ticking works as before, and printing shows it open.
- The page now ends with a full-width honey block: "Ready to clear your head?", "Free, no card, no limits. Works offline." and the Start your board, free button (warm brown with honey text in dark mode).
- The "Why I made BusyAnts" section was removed.

## About page: board pictures retaken (2026-10-16)

- The two sample-board pictures on the About page (light and dark) were retaken in the new Honey Workshop look. Same "Weekend in Lisbon" board, same size, still small files (about 30 KB each, down from 72 KB). Nothing else changed.

## Connector/plugin block for Claude Code undone (2026-10-16)

- Undid the change that turned off unused connectors and plugins for Claude Code in this project; the saving was not worth it. Nothing in the app changed.

## Website look: Done List (2026-10-16)

- The website pages have a new look. Titles use a new font (Familjen Grotesk), and everything lines up in one neat column.
- The About page shows the board picture much bigger, overlapping the honey block. The three highlights are a small checklist you can tick: a ticked one slides under "Completed". There is a second Start your board, free button at the end.
- On a phone, the comparison table lists every app with its answer instead of hiding some off the side, and the top bar's links are bigger and easier to tap.
- The FAQ, Terms and Privacy fold each section: tap a heading to open it. A link to one question still opens it. The wording is unchanged.
- The Delete your account steps are numbered with big round badges so they stand out.
- The app and your saved boards are untouched.

## New look: Honey Workshop (2026-10-16)

- The app has a calmer, warmer look in light and dark mode: a cream toolbar, honey-coloured highlights (the pressed Hand or Select tool, the Share button, the selected card's glow) and plain white cards with a bold title. The font stays IBM Plex Sans.
- Cards no longer have a coloured title band. Picking a colour in the Color menu now tints the card's header lightly; containers are coloured as before.
- A card's or container's small buttons (trash, collapse) show while you point at it or when it is selected, and always on a phone.
- Snap to grid, Collapse all, Same width and Clean up are now in a new **Arrange** menu in the toolbar. Escape closes the Arrange and File menus.
- A checklist's Clean up and Uncheck all now sit inside its Completed row and show only while that row is open.
- The buttons at the bottom right (Search, Completed, History, Timer, Calendar) are one labelled strip.
- **Feedback** is now its own button next to File (on a phone, a Feedback row in the ⋯ menu above About BusyAnts) instead of an entry in the File menu. It opens the same feedback form.
- Nothing about saving, shortcuts or how things work has changed; your boards look the same apart from the new style.

## Claude Code loads fewer connectors and plugins (2026-10-16)

- In this project, Claude Code no longer loads the Gmail, Google Calendar, Google Drive, Indeed, Apify and Claude Docs connectors, or the design, marketing, data and operations plugins, to save tokens. Your personal Claude keeps them. GitHub and the impeccable plugin stay on. Nothing in the app changed.

## Crew coordinator uses fewer tokens (2026-10-16)

- The crew instructions now ask the coordinator to suggest a fresh chat after each publish (when no worker is still running), send heavy reading to a scout worker, keep worker reports to about 15 lines, and keep a short hand-off note on the Crew Board (parked items, owner choices not yet recorded, reminders) so a fresh chat picks up where the last one stopped. Nothing in the app changed.

## Arrows between cards removed (2026-10-16)

- The arrows you could draw between cards and containers are gone, as asked: hovering or selecting a card or container no longer shows the little connection dots.
- Boards saved with arrows still open normally with every card, container and item as it was; only the arrows are left out. The next time you change anything, your boards are saved without them, so they are erased for good (from all your boards at once, since they are saved together). This also goes for backup files, shared boards and Version history.
- The arrow keys, the collapse arrows and the normal arrow pointer are something else and work as before.

## Due dates removed (2026-10-16)

- Checklist items no longer have due dates: the calendar button beside an item's trash, the date under an item, the Due button with its red count, and the Due panel are gone (also from the phone's ⋯ menu). Hovering an item shows just the grip and the trash again, and the text doesn't move.
- Due dates you had already set are erased the next time your boards load, wherever they come from (this device, your online copy, a backup file or an old version). Everything else on your boards stays as it was.
- Google Calendar beside the board stays. The AI connector no longer reads or sets due dates, and the About page and Play Store notes no longer mention them (the About page's board picture and the Play Store screenshots were retaken without them).

## No "Show the tour again" link (2026-10-16)

- The "Show the tour again" link is gone from the ? shortcuts panel and from the phone ⋯ menu, and the tour's last phone step no longer mentions it. The tour still shows by itself the first time you open the board on a device. Your saved boards are untouched.

## Send feedback (2026-10-16)

- Signed in, you can now send the maker a short note: File, then Send feedback… (on a phone: ⋯, then File). Type up to 1000 characters and press Send; you'll see "Thanks — sent." If it can't be sent, a message says so and what you typed stays, so you can try again. Send is off while you're offline. On a slow connection you can close the box while it is still sending; it carries on.
- The note is stored with your email address so the maker can reply. Only the maker can read it (in the Firebase console); no one can read, change or delete it from the app.
- The Privacy policy, the Delete your account page, the FAQ and the delete-account panel say that feedback is kept apart from your account, isn't deleted when you delete your account in the app, and is deleted within 30 days if you email to ask (asking by email to delete your account deletes your feedback too). Wherever they said deleting your account removes "everything", they now say "everything except feedback you sent". The Terms of use say the same (both pages now dated October 16, 2026).
- Fixed along the way: keys like V, H or Delete no longer change the board hidden behind the Delete account or Send feedback panel, even after a click on the panel's text. While either panel is open, Tab and clicks can't reach the board behind it, Ctrl+F does nothing, Escape closes only the panel, and undo / redo only undo typing in the panel's own box (so they can't change the board unseen). After a failed send or delete the cursor goes back into the box. If a note finishes sending while its panel is closed, opening it again shows how it went. If someone else signs in while a note is still sending, they don't see "Sending…" or "Thanks — sent" for it.
- The online database's rules gain a new "feedback" section that only allows sending such a note. The owner must paste the updated `firestore.rules` into the Firebase console before sending works on the live site.

## Delete your account (2026-10-16)

- Signed in, you can now delete your account and everything in it from inside BusyAnts: File, then Delete account… (on a phone: ⋯, then File). A panel says exactly what goes, including how many boards and how many boards you shared (those are deleted for everyone you shared them with; boards others shared with you you just leave). You can download a backup first, then type DELETE and sign in with Google once more to confirm.
- If anything goes wrong (no connection, say) nothing is deleted on your device and you can simply try again. Afterwards you are signed out, with a note saying your account and data were deleted. Other phones or computers you're signed in on are signed out too, but keep the copy saved on them until it's cleared.
- A new "Delete your account" page on the website explains how, and who to email if you can't sign in. The Privacy policy, FAQ and Terms now point to it, and every page's footer links to it.

## Ctrl+arrow keys switch boards (2026-10-16)

- Ctrl+Right and Ctrl+Left open the next and previous board in the Boards menu order (boards inside boards included). Ctrl+Up goes up to the board above, and Ctrl+Down goes into the first board inside the open one. At the ends nothing happens. A short note says which board you switched to, and the keys are in the ? shortcuts list.
- They don't work while you are typing in a text field. On a Mac the system often keeps Control+arrows for itself, so they may not reach the page there. Your saved boards are untouched.

## Play Store screenshots say "container" (2026-10-16)

- The Google Play screenshots were retaken so the toolbar shows "New container" instead of "New column", and the Play kit notes were updated. Nothing in the app changed.

## Wider cards and containers (2026-10-16)

- Cards and containers can now be made up to 1280 pixels wide (they stopped at 640 before). Dragging a corner, the arrow keys on a resize handle, and "Same width" all use the new limit.
- Boards you already saved are not changed: nothing is resized, and saving and loading work as before.

## "Column" is now "container" (2026-10-16)

- Everywhere you read it, a column is now called a container: the New container button, the container title and its tooltips, the delete question, the shortcuts list, the welcome tour, the + menu on a phone, the Version history line, the text copy of a board, the FAQ and the Privacy page.
- Only the words changed. Your saved boards are exactly as they were.

## Crew rules shared by both coordinators (2026-10-16)

- The crew instructions now include the rules the desktop coordinator was already using: workers say whether their tests failed twice and what happens to saved boards, re-check flaky browser tests, use American English, and stop instead of working around a refused merge. Big visual redesigns now show mockups first. Sonnet workers for low-risk jobs are now standard, not a trial. Nothing in the app changed.

## Google Play kit (2026-10-16)

- Drafts for the Google Play listing are in `docs/play-store/`: the store text, Data safety and content rating answers, a checklist for Play Console, and screenshots of a demo board. Nothing in the app changed; `scripts/play-screenshots.mjs` retakes the screenshots.

## A shorter, punchier About page (2026-10-16)

- The About page no longer has the giant ant. A small picture of a sample board now sits beside the headline and Start button (under them on a phone), and the big board picture further down is gone.
- The "Why I made BusyAnts" story and the three highlights now sit side by side on a computer, so there is less scrolling.
- The "Also in BusyAnts" list is now a table comparing BusyAnts with Milanote, Notion, Miro and Trello on their free plans, checked against their own help and pricing pages and dated October 2026. Anything we could not confirm shows a dash. On a phone the table scrolls sideways inside its own box.
- The board pictures are smaller files, so the page loads faster. Nothing in the app or in anyone's saved boards changed.

## Tour wording and order (2026-10-16)

- The welcome tour now goes: add a note or checklist, move cards and columns, Share, your boards, keyboard shortcuts. On a phone it stays +, Boards, ⋯.
- The first step says a Note is a blank card for anything, and the column step says a column is a container that holds your notes and checklists. Nothing about saving or your boards changed.

## A short welcome tour (2026-10-16)

- The first time you open the board on a device, a 30-second tour lights up one control at a time (add a note or checklist, move cards into columns, the Boards menu, Share, and the ? shortcuts) with Back, Next, Skip tour and a close button. Escape closes it too.
- It only shows once per device. To see it again, press ? and choose "Show the tour again" (on a phone: ⋯ then "Show the tour again").
- It works in dark mode and on a phone, and changes nothing on your boards or in how they are saved.

## A bolder look for the website (2026-10-16)

- The About, FAQ, Terms and Privacy pages now share one bolder look: a solid honey top slab, big chunky headlines in a new font (Bricolage Grotesque), and the same warm colors as the app. About is the showpiece, with a huge ant, a dotted trail and real pictures of the app; the other three pages keep the same style but stay calm and easy to read.
- The big ant stays fully in view at every computer width, the menu stays on one line on a phone (the ant icon stands in for the name there), and in dark mode the slab is a lighter brown that stands out clearly from the page, with text that is easy to read.
- The board picture on the About page now has a dark version for dark mode. Every word and link is unchanged; nothing in the app or in anyone's saved boards changed.

## Completed moves into a side panel (2026-10-16)

- Cleaned-up items no longer sit in a Completed card on the board. A new round button by the zoom control, right of Due (on a phone: ⋯ → Completed), opens the Completed panel on the right, grouped by date with the newest first.
- Unticking an item in the panel still sends it back to its list, and Ctrl+Z still undoes it.
- Search still finds cleaned-up items: when the panel is shut it rings the Completed button.
- Boards you already saved keep every cleaned-up item. An old Completed card is simply no longer drawn, and nothing else on the board moves.

## About page says "list" not "sub-list" (2026-10-16)

- The second highlight card on the About page now reads "Collapse any card, column or list, or everything at once, and bring it back in one click." Wording only; nothing in the app changed.

## Auto-color moves into the Color menu, and American spelling everywhere (2026-10-16)

- Auto-color is now a button at the bottom of the Color menu, instead of its own button on the toolbar (and in the ⋯ panel on a phone).
- The Color button now opens even when nothing is selected. The color swatches and Default are faded and do nothing then, while Auto-color still works on the whole board.
- Everything you read is now in American English: "color" instead of "colour", plus "neighbor", "center" and the like, in the app, the keyboard shortcuts list, the About and Privacy pages, and the project's notes. Boards you already saved are untouched.

## The calendar panel can be resized, and is roomier (2026-10-16)

- On a computer, drag the left edge of the Google Calendar panel to make it wider or narrower (or focus the edge and use the left and right arrow keys; double-click puts the usual width back). Week and Month remember their own widths on this device. Some board always stays visible.
- The panel now opens wider: 420px for Week (was 300) and 720px for Month (was 560). In the Week view an event's name can wrap onto a second line, so it is easier to read.
- Fixed: clicking "+n more" (or a day) in the Month view looked like it did nothing, because the day's list sits under the grid, out of sight. The panel now scrolls to it.

## Due panel lists every date ahead (2026-10-15)

- The Due panel now lists every unticked item with a due date, not just overdue and today's: **Overdue**, **Today**, **Tomorrow**, then one heading per later day ("Mon 20 Oct"), soonest first. The red count on the Due button still counts only items due today or earlier. A date typed in the date box that isn't a real day (such as a 5-digit year) is no longer saved.

## Why I made BusyAnts on the About page (2026-10-16)

- The About page now opens with the owner's short story of why BusyAnts was made, right under the headline and start button, followed by three highlights (shape it your way, fold away what you're not doing, built for checklists). Below the board picture, an "Also in BusyAnts" list of nine features replaces the old four feature cards and the separate import line. Nothing in the app changed.

## Low-risk crew workers use Sonnet (2026-10-15)

- As a trial to save tokens, crew workers on low-risk jobs now run on the cheaper Sonnet model, at high effort. High-risk jobs (saving, sync, undo, deleting) and pull request checks stay on the stronger default model.

## The toolbar ant opens the website (2026-10-15)

- Clicking the BusyAnts ant at the left of the toolbar now opens the BusyAnts website's About page in a new tab, so you can get to the website from any board while the board stays open. Its tooltip says "BusyAnts website". Works on a phone too.

## Crew Board updates are batched (2026-10-15)

- The crew coordinator now sends all Crew Board changes from one event in a single update, and skips progress-only updates, to use fewer tokens.

## Offline tests also run on a phone and in Safari's engine (2026-10-15)

- The automatic offline tests now also run on a phone-sized Chrome (Android) and in WebKit, the engine Safari and iPhones use, both on a computer and on GitHub. In WebKit they check that the offline copy installs and saves the app, and that a new version clears the old copy. The test tool can't switch off the internet for WebKit past the offline copy, so opening with no internet is still only tested in Chrome. Setup on a computer now needs `npx playwright install chromium webkit` once.

## Bold colors (2026-10-15)

- The Color menu has a third row of 8 bold, clearly different colors: Tomato, Tangerine, Sunflower, Grass, Emerald, Ocean, Violet and Magenta. The 16 soft colors stay as they were. Dark mode has a deep shade of each.
- On a bold column or title band, the card count, icons and empty-title hint use a dark shade of the color instead of gray, so they stay readable.
- Auto-color now hands out the bold colors first, then the soft ones, so columns only repeat a color beyond 24.
- An older copy of the app (say, a tab left open from before this update) shows a bold color as its usual color, and if it saves that board, the column goes back to that color.

## Browser tests use at most 4 browsers on a computer (2026-10-15)

- Running the browser tests on a computer now opens at most 4 hidden Chrome windows at a time instead of half the processor's threads, so several crew workers testing at once no longer max out the CPU. Tests on GitHub are unchanged.

## Wider calendar panel for the Month view (2026-10-15)

- While the Google Calendar panel shows the Month view, it is wider (560px instead of 300px), so each day has room for event names with their start times ("10:00 Dentist") and up to three lines. Switching to Week brings it back to the usual width. In a small window it shrinks so some board stays visible. Other panels and the phone layout are unchanged.

## Calendar month shows event names (2026-10-15)

- In the Google Calendar panel's Month view, each day now shows its events by name, like Google Calendar's own month: all-day events first as small filled chips, then timed ones. Where a day has more than fit, the last line says "+2 more"; clicking it (or the day) lists all its events under the grid. Clicking a name opens that event.
- In the narrow side panel a day shows two lines, names only; on a wider phone screen it shows three, with start times ("10:00 Dentist").

## The crew works from the cloud too (2026-10-15)

- Claude's crew coordinator can now run on this computer or in a Claude Code cloud session, whichever one you are talking to, and picks up where the other left off. Its job list lives on the private Crew Board page instead of a file here. Nothing in the app changes.

## Calendar week starts today; clearer Connect button (2026-10-15)

- The Google Calendar panel's Week view now shows today and the next six days, so days already gone this week are left out. ‹ still goes back seven days if you want them, and Today comes back.
- If Google's permission window was blocked or closed, or calendar access wasn't given, the panel now says so and shows a **Connect Google Calendar** button that asks again.

## Ctrl+Enter ticks a checklist item (2026-10-15)

- While typing in a checklist item, Ctrl+Enter (⌘+Enter on a Mac) ticks it, just like clicking its box, and the cursor moves on to the next open item so you can keep going. On a ticked item it unticks it. Ctrl+Z undoes it. It is listed in the keyboard shortcuts panel (press ?).

## Google Calendar is connected on the live site (2026-10-15)

- The calendar panel now uses the site's Google sign-in key, so it can show and change your Google Calendar instead of saying it "isn't connected yet".

## Restoring is safe for shared boards from the first moment (2026-10-08)

- Right after the page opens, the shared boards this device already knows are protected from a restore straight away. If it isn't known yet which boards are shared with you, a restore waits: nothing changes, and a note says "Your shared boards are still loading, so nothing was restored. Try again in a moment."

## Restoring leaves boards shared with you alone (2026-10-06)

- If someone shared a board with you, restoring an old version or a backup file no longer changes it, for you or for them. Your own boards are restored as before, and a note says which shared board was left as it is. Only the person who shared a board can restore it.

## Claude can change your boards (2026-10-07)

- The Claude connector can now add checklist items, change their text and due dates, tick and untick them, move them between lists on the same board, and add notes, on your own boards. Shared boards stay read-only, and notes can only be added.
- Every change is checked with the app's own rules before it is saved, and never saves over something you changed since Claude read the board. Before Claude's first change (and after 10 quiet minutes) the boards as they were are saved in version history, so you can always go back. At most 50 changes at a time.
- If BusyAnts is open and saves over Claude's change a moment later, the connector puts it back once and tells Claude. Every change is listed in `%APPDATA%\busyants-mcp\activity.log`. Run `npm run mcp:build` once and restart Claude to get it.

## Moving online data to the US: the checking tool (2026-10-07)

- Nothing changes in BusyAnts yet. This adds a small read-only tool, run in Google Cloud Shell, that counts every saved board, version and shared board in the online database and checks that a copy has exactly the same contents. It is used to prove the copy is complete before and after moving the online data from Sydney to the United States.
- The step-by-step plan for the move, with the owner's choices, is in docs/plans/firestore-us-move-plan.md.

## Privacy policy: where the data is stored (2026-10-07)

- The Privacy policy now says boards and account details are stored in Sydney, Australia (Cloud Firestore australia-southeast1), not the United States, and that your data may be processed outside your own country. Nothing about the app changes.

## Import PDFs (2026-10-07)

- File → Import file… now also takes PDF files. Their text comes in as cards: big lines become list titles (or the first line of a note), bulleted and checkbox lines become checklist items (ticked boxes ticked, indented ones as sub-items), and other text becomes notes, a new note for each page. Layout, pictures and tables are not brought in.
- A PDF with no text (a scanned page) adds nothing and says so. As with every import: added and selected, one Ctrl+Z removes it, the same size limits, and all text is kept as plain text.
- The PDF reader is only downloaded the first time a PDF is imported, so BusyAnts opens as fast as before.

## Import from Trello and Google Keep (2026-10-07)

- File → Import file… now also takes JSON files from Trello and Google Keep.
- A Trello board export: each open list becomes a checklist, its cards become items (ticked when marked complete), and a card's checklists become sub-items with their ticks. A card's description becomes a note next to its list. Archived cards and lists are left out.
- A Google Keep note (from Google Takeout): a list note becomes a checklist with its ticks, a text note becomes a note (titled on its first line), and a note that is only a web address becomes a link card. Notes in the bin are left out.
- Any other JSON file adds nothing and says "BusyAnts can only import JSON files from Trello or Google Keep." As with every import: added and selected, one Ctrl+Z removes it, the same size limits, and all text is kept as plain text.

## A small website for BusyAnts (2026-10-06)

- New pages beside the app: About (what BusyAnts is, with a picture of a board and a big "Start your board, free" button), FAQ, Terms of use and Privacy policy. They are at about/, faq/, terms/ and privacy/ on the site; the app stays where it is, so installed apps and share links keep working.
- Terms and Privacy are filled in (2026-10-07): run by BusyAnts in the United States, effective October 6, 2026, Maryland law, data kept in the US (Firestore us-central), account deletion within 30 days of an email to ezhang43@gmail.com, and how to ask to see, correct, delete or get a copy of your data. The Privacy policy also says what the Google Calendar panel does with your calendar (reads and changes events only when you use it, keeps no copy). The FAQ's "delete my account" answer gives the same email.
- In the app, the ? panel ends with links to the pages, and on a phone ⋯ has About BusyAnts.
- Opening one of the pages no longer replaces the app's offline copy.

## Ticking tests made steady; Clean up right after ticking (2026-10-06)

- Clean up in the toolbar is no longer faded (and ignored) for the moment a just-ticked item is easing out to Completed: clicking it straight away now moves that item too.
- The browser tests of the tick animation now control the page's clock, so they no longer fail now and then when the computer is busy.

## Import files from other apps (2026-10-06)

- File → "Import from Milanote…" is now "Import file…". It takes Markdown (.md: Milanote, Obsidian, Notion, Bear…), plain text (.txt) and web pages (.html: Evernote or Google Keep exports, saved pages), and works out which it is.
- Milanote exports come in as before. In any Markdown file, plain bullet lists right under a heading now also become checklist items. A text file with no Markdown becomes one note per paragraph. In a web page, headings become list titles, lists become items (nesting and ticked boxes kept), paragraphs become notes and a link on its own becomes a link card; its scripts never run and nothing is loaded.
- As before: the cards are added (nothing else changes), selected, and one Ctrl+Z removes them all. A file it can't read says "BusyAnts can’t read that file yet."; files over 5 MB are refused; at most 300 cards and 2,000 items come in from one file.

## Claude can read your boards (2026-10-06)

- A new connector for Claude Desktop and Claude Code (in the `mcp` folder): after a one-time Google sign-in on your computer (`npm run mcp:login`), Claude can list your boards and read one as an outline (columns, cards, checklist items with ticks, due dates and Completed, notes, links). It can't change anything yet. Boards shared with you are shown as read-only.
- `npm run mcp:check` shows whether it can reach your boards, and `npm run mcp:logout` removes the sign-in (Claude stops reading straight away). Setup steps are in `mcp/README.md`. The website itself is unchanged.

## Trash can on cards and columns (2026-10-06)

- The delete button at the top right of cards and columns is now a small trash can, the same as on checklist items, instead of an ×. It works exactly as before: a card goes at once (Ctrl+Z brings it back), a column asks first. Other × buttons (closing panels, deleting a board in the Boards menu, removing an arrow) stay as they were.

## Checklists pour into each other (2026-10-06)

- Drag a whole checklist onto another loose checklist (over its title or items): the other list gets a dashed amber outline, and letting go moves every item across, sub-items and ticks included (ticked ones go to its Completed section). The dragged list, and its title, are gone. Ctrl+Z puts it back.
- Drag every item out of a list into another list (or onto the board): the emptied list now disappears instead of keeping one blank item.
- Drop items on a collapsed checklist: they go into it (it stays collapsed and shows the dashed outline while you hover). Drop items on a collapsed column: they become a new checklist at the end of that column.

## Google Calendar beside the board (2026-10-06)

- Signed in, a new calendar button by the zoom control (bottom right, right of the focus timer; on a phone in ⋯) opens your Google Calendar in the panel at the right: a week (each day with its events) or a month (a grid of days; pick one to see its events), with back / forward and Today.
- The first time, Google asks you to let BusyAnts see and change your calendar events. You can add an event (the + on a day), and click a simple event to rename it, change its day or time, or delete it (it asks first: Keep / Delete). Repeating events, events with guests and events with their own reminders are shown but open in Google Calendar to change.
- Calendar events aren't part of your boards: Ctrl+Z doesn't undo calendar changes and they aren't in Version history. If Google Calendar can't be reached, the panel says "Google Calendar isn’t connected yet. Try again later." and everything else works as before.
- Locally, `npm run dev` with `?demo-user=Alice` shows a pretend calendar to try it with.

## The crew checks risky pull requests by itself (2026-10-06)

- When a worker finishes a high-risk pull request (saving, sync, undo or deleting), the main session now runs the full check on it straight away (combine with the latest build/v1, all tests, review, spec check) and brings the owner its verdict. The owner still decides every high-risk merge and every publish.

## Fix: a board just shared no longer vanishes (2026-10-06)

- On the published site, sharing a board could make it disappear a few seconds later with "“X” is no longer shared with you". Right after sharing (or joining by link), the server could briefly refuse to show the board because the share hadn't fully reached it yet, and the app took that as being removed. Now a refusal only counts if it happens again once this device's saves have reached the server.

## Focus timer (2026-10-06)

- A new focus timer (Pomodoro): a stopwatch button by the zoom control (bottom right, beside Version history; on a phone in ⋯) opens it in a panel at the right. 25 minutes of focus, a 5-minute break, and a 15-minute long break after every 4 focus rounds, with Start / Pause, Reset and Skip.
- It keeps running when the panel is closed (the button then shows the time left, like 18:42), and after a page reload.
- When a round ends a soft chime plays (it can be switched off in the panel), and, if the tab is behind another, a notification shows, once you allow them (asked on the first Start). The next round waits for Start.
- The lengths can be changed in the panel and are remembered on this device. None of it is part of a board: not undone by Ctrl+Z, not synced.

## Delete completed items in one go (2026-10-06)

- Ctrl+Shift+Backspace (Control+Shift+Backspace on a Mac too) deletes every item in the Completed sections of the lists on the open board. It asks first ("Delete 12 completed items?" · Keep · Delete), and Ctrl+Z brings them all back. Other boards are left alone.
- With nothing completed it says "No completed items on this board" and changes nothing. It's listed in the Keyboard shortcuts panel (?).

## Sharing permissions in one place (2026-10-06)

- Behind the scenes: who may rename, delete or restore a shared board is now decided in one place, and deleting a board always saves Version history first by the same route. The Restore button also updates straight away if a board stops being shared while you look at an old version. Nothing else changes for you.

## Slower scrolling (2026-10-06)

- Scrolling with a mouse wheel or swiping on a trackpad now moves the board half as far as before, so it is easier to control. Zooming (Ctrl + scroll or pinch) is unchanged.

## Sharing, tidied (2026-10-06)

- If leaving a shared board fails, the Share panel now stays open and says so (it used to close and show nothing).
- Behind the scenes: the rules for which boards might be shared, while the app is still finding out, now live in one place. Nothing else changes for you.

## Sharing, checked again (2026-10-06)

- Pasting or moving a card for one of your own boards onto a shared board no longer shares that board: the card just opens it, for you only. A sub-board made on a shared board is still shared, as before.
- When a shared board goes from your screen (you leave, you are removed, or it is deleted), all your boards are saved in Version history first, so it can be brought back from there.
- A change you make while a drag is going on is no longer lost when another device saved at the same moment, and "Saving…" no longer gets stuck or flickers.
- On a device that doesn't know yet which boards are shared, those boards are left alone until it does (they used to vanish, or be copied into your own boards).
- Leaving a shared board now works fully or not at all; if it fails, the panel says so and nothing changes.
- The Share panel button reads "Turn link on".

## Sharing made safe (2026-10-06)

- A share link can no longer touch your own boards: whatever someone saves in a board they share with you, it can't take in, overwrite or delete any of your other boards. A link that tries to is refused.
- Removing someone from a shared board changes its link in the same step, so the old link never lets them back in.
- Shared boards are recognized the moment the page opens, so a slow connection can't make the app treat them as yours, and a page can never send everyone a version with the shared board missing.
- When a shared board is deleted, the record of who had it goes too.

## Editing together, step 2: sharing a board by link (2026-10-05)

- A new Share button (two people, next to Sign out; on a phone in ⋯) shares the open board with a link. Anyone who opens the link and signs in with Google can see and edit that board and every board inside it, at the same time as you. Each person’s changes show on everyone’s screen within a second or two, and changes made at the same moment are all kept.
- The Share panel shows who has the board. Whoever shared it can turn the link off, remove people, rename or delete the board, and restore old versions of it; everyone else can leave it.
- Your home board can’t be shared, and your other boards stay private: only the boards you share are seen by anyone else.
- Before this works on the live site, the new online rules in `firestore.rules` need pasting into the Firebase console.

## Editing together, step 1: combining edits (2026-10-05)

- Groundwork for several people editing one board at once: when two people change a board at the same time, all their changes to different things are kept, and only a change to the very same thing goes to the later one. Nothing you can see changes yet: sharing comes in the next step.

## Ant hill removed (2026-10-06)

- The ant climbing a hill at the top of the board is gone. Clean up and the Completed card work exactly as before, and your saved boards open as they were.

## Crew: a "Needs you" list (2026-10-06)

- No change to the app. The crew log now keeps a short "Needs you" list: only questions waiting for your answer and next steps only you can do (like pasting Firestore rules or saying "publish"). Each line comes off as soon as it is answered or done. Your work board's "Needs me" shows exactly this list.

## Asking first on big decisions (2026-10-06)

- No change to the app. Claude still goes ahead with the recommended choice by default, but now asks you first (with its recommendation) when it is unsure what you would want, or when a choice is high-impact: it could lose or expose your data, is hard to undo, changes saving, sync, sharing or security, needs something only you can do (like the Firebase console), or changes what you see in a way the spec doesn't settle. Crew workers stop and report such questions instead of guessing.

## Crew: one coordinator at a time (2026-10-06)

- No change to the app. The crew log now names its one coordinator, and a new coordinator checks that the old one's helpers have really stopped (asking the old session, looking at the job's folder, or asking you) before restarting their jobs, so two helpers never end up editing the same folder.

## Ant hill moved onto the board (2026-10-05)

- The ant hill is no longer inside the Completed card. It now sits at the top middle of the board and stays there while you move or zoom the board. It can't be clicked or moved; clicks go straight through to anything under it. It shows from the start, even before your first Clean up. Each board has its own hill.

## Simplest code that works (2026-10-06)

- No change to the app. Claude now follows a "simplest code that works" rule while it writes: reuse what the app already has, use what the browser and React already do, add no new packages for small jobs, and write no extra layers or options nobody asked for. Smaller changes mean fewer tokens spent writing and reviewing them. It never cuts features in the spec, the tests, or anything that protects your saved boards.

## Reports sized to the change (2026-10-05)

- No change to the app. Claude's report after each step now matches the size of the change: a few lines for a tiny fix or a wording change, the full report for a normal feature, and the full report plus what happens to your saved boards for anything touching saving, sync, undo or deleting.

## Crew coordinator for Claude (2026-10-05)

- No change to the app. One Claude session can now run the others: type `/crew` and a request, and it splits the request into jobs, starts a helper for each in its own copy of the code (up to 3 at once), keeps a log of where every job is (working, pull request open, waiting for you, merged), and `/crew` on its own gives you one plain-English status. Browser tests in each copy now use their own ports, so helpers testing at the same time can't test each other's work by mistake.

## Helpers for Claude (2026-10-05)

- No change to the app. Claude now has a few helpers while it builds: a warning to itself before it edits a file where a bug could lose your data, a type check after every code edit, a `/finish-step` routine so every step ends the same way (tests, review, a security check whenever sign-in, sync, sharing, imports or links change, spec check, changelog, your report), a `/check-pr` routine for checking another session's pull request, and a spec checker that compares each change with SPEC.md.

## Quieter arrow dots (2026-10-05)

- The dots for drawing arrows are smaller and soft gray, and fade in after a moment instead of popping up on every card the pointer passes. The one under the pointer turns amber.
- A dot that would sit on top of another card or a column's title is no longer shown, so dots don't cover text. Cards in a column still have their left and right dots, and any dot draws the same arrow. A card hemmed in on every side keeps one dot, so you can always draw an arrow from it.

## Ant hill on the Completed card (2026-10-05)

- The Completed card now has a little hill with the BusyAnts ant on it. Every item Clean up sends into Completed moves the ant one step higher, and it walks up slowly. The first hill takes 10 items, the next 20, then 30, and so on; reaching the flag says "Top of hill 1!". Sending an item back to its list (or undoing) moves the ant back down.

## Owner requests: Sign out, Checklist, Miro-style arrows, Clean up per list (2026-10-05)

- Sign out is no longer cut off at the right of the toolbar. It is now a small icon (an arrow leaving a door) at the far right, and the whole toolbar fits windows from 1280px wide, also inside a sub-board.
- "To-do list" is now called "Checklist" everywhere: the toolbar button, the phone's + menu and the empty-board hint. Your lists are unchanged.
- Arrows work like Miro: hover a card or column and a small dot shows on each side. Drag a dot onto another card or column to join them. Arrows are now smooth curves that meet each card in the middle of the side facing the other.
- Each checklist has its own Clean up button, next to Uncheck all, that moves just that list's ticked items into the Completed card.

## Auto-publish for low-risk changes (2026-10-05)

- Small, low-risk changes now go live by themselves a few minutes after they are merged and pass their tests. Anything touching saving, sync, undo or deleting, or labeled `high-risk`, still waits for you to say "publish".

## Owner requests: icon, no Link button, sub-boards, Alt + arrows (2026-10-05)

- The icon files have new names, so the installed app, the browser tab and phone home screens pick up the ant instead of an old saved picture. iPhones and iPads now get the ant on the home screen too.
- The toolbar (and the phone's + menu) no longer has Link: you add notes and to-do lists. Link cards already on your boards still work.
- In the Boards menu, "Add a board here" now reads "Add a sub-board here" (on a phone: + → Sub-board).
- Alt + arrow keys now go the way the arrow points: → only goes to something to the right, ↓ only to something below, and a card level with you wins over one off to the side. Columns are stops too, at their title: ↑ from a column's top card goes to the column title, and empty or collapsed columns can be reached.

## Buy me a coffee (2026-10-05)

- A small coffee-cup button in the bottom-right corner, next to ?, opens the BusyAnts Buy Me a Coffee page in a new tab. On a phone it is in the ⋯ menu.

## Housekeeping: decisions list moved (2026-10-05)

- No change to the app. The long list of past decisions moved out of `CLAUDE.md` into its own file, `docs/decisions.md`, so each new Claude session starts with shorter instructions. Claude reads the list when it needs it.

## Fix: boards with unusual card ids (2026-10-05)

- A board loaded from an old save or a backup whose cards or items have ids with quotes or brackets in them no longer breaks search, Shift+click on checklist items, Alt + arrows or the Color menu.

## Arrows between cards (2026-10-05)

- Select a card or column and drag the small round handle on its right edge onto another card or column to draw an arrow between them. The arrow follows the cards as you move them.
- Click an arrow to select it, then press Delete (or click its ×) to remove it. Ctrl+Z undoes either.

## Due dates (2026-10-05)

- Point at a checklist item and click the new calendar button to give it a due date: Today, Tomorrow, Next week or any day. A small chip under the item shows when it is due, amber for today and red when overdue. Click the chip to change or remove the date.
- The calendar button by the zoom control shows how many items are due today or overdue, on all your boards. Click it for the list, and click an item to jump straight to it.

## Several boards, and boards inside boards (2026-10-05)

- A new **Boards** button (left end of the toolbar) lists all your boards. **New board** makes a fresh board; **Add a board here** puts a board card on this board that opens a new board inside it.
- Inside a board, the boards above it show before its name ("Home ›"), so you can click back out.
- Each board has its own undo. Deleting a board (× in the Boards menu) asks first and keeps a copy in Version history.
- Backups and Version history now cover every board. Search, Clean up and the other board tools work on the open board.

## Open to everyone (2026-10-05)

- Anyone with a Google account can now sign in and gets their own private board; no one else can see it. The sign-in screen says so.
- Each board (and each saved version) is capped at 900,000 characters, far bigger than a real board, so no one can fill up the storage. (This takes effect once the new rules in `firestore.rules` are pasted into the Firebase console.)

## Uncheck all, Fit to screen, and links in notes (2026-10-05)

- **Uncheck all** next to a list's "Completed" heading unticks everything, so you can reuse a list like groceries.
- **Fit to screen** (the corners button by the zoom, or Shift+1) shows every card and column at once.
- Web addresses in a note now appear as links under it. Ctrl+click an address in a note or checklist item to open it.

## Backup: download and restore your board (2026-10-05)

- A new **File** button (in place of Import) downloads your board as a backup file, or as readable text, and restores a backup. Restoring keeps the board you had in Version history, and Ctrl+Z brings it back. Import from Milanote moved into the same menu.

## Alignment guides when dragging several cards (2026-10-05)

- Dragging several selected cards or columns together now lines them up with other blocks too, with the same guide lines as a single card. They line up as one group: the outer edges and middle of the space they cover together.

## Invite-only sign-in, and publishing only when you say so (2026-10-05)

- BusyAnts can now be used by invited Google accounts, each with its own private board: for now you and erikazhu95@gmail.com. Anyone else who signs in is told it's invite-only. (This takes effect once the new rules in `firestore.rules` are pasted into the Firebase console.)
- The live site now only changes when you say "publish". Work still lands on `build/v1` and is tested there first.

## Version history: lighter and more reliable (2026-10-05)

- Typing no longer checks the version list online at every letter (it could have used up the free daily allowance and stopped syncing).
- A version is saved when you start editing after 10 minutes away (and once an hour during long stretches), not every 10 minutes regardless. Undo counts as an edit; cards re-arranging themselves doesn't.
- If a version can't be saved (offline, say), it's tried again a minute later.
- Dragging or resizing while looking at an old version no longer leaves its outline stuck on screen.

## Honey look, to match the app icon (2026-10-05)

- The toolbar is now soft honey yellow with the BusyAnts ant at its left, the board a warm cream, and the teal highlights (selection outlines, title bands, New column, pressed buttons) are amber instead, so the app and its icon feel like one thing. Dark mode gets matching warm, darker tones. The window's title bar takes the toolbar color too.

## Fix: selection box away from the pointer (2026-10-05)

- With the Select tool, the selection box could start well above the pointer. Typing near the bottom of the screen made the browser scroll the board area by itself, which shifted everything drawn on it. That scroll now becomes an ordinary move of the board, so you still see what you type and the box starts right at the pointer.

## Better test debugging (2026-10-05)

- A browser test that fails is tried once more, and its step-by-step trace, screenshot and video are kept. `npm run test:e2e:report` opens the report; `npm run test:e2e:ui` opens Playwright's window to run and watch tests one at a time.

## Search the board (2026-10-04)

- Press Ctrl+F (or the magnifier by ? in the corner, or ⋯ → Search on a phone) and type: every match is marked in yellow, and the board moves to the first one, marked in orange. Enter goes to the next, Shift+Enter to the previous. A match inside a collapsed card or column rings that card instead. Escape closes the search.

## Version history, like Google Docs (2026-10-04)

- BusyAnts now keeps earlier versions of your board. Open it from the clock button by ? (bottom right), or from ⋯ on a phone. Pick a version to see it, then Restore it or go Back to current. Restoring keeps your current board as a version too, and Undo takes a restore back.
- A version is saved by itself whenever you start editing after 10 minutes away; the newest 100 are kept. On the website they are saved with your board online, so your phone and computer share the same history.

## The board opens centered on your cards; on a phone, swiping moves around (2026-10-04)

- Opening BusyAnts (computer or phone) now shows all your cards and columns in the middle of the screen, zooming out a little if they don't fit (never below 50%).
- On a phone or tablet, a quick finger swipe over a card, a column or a resize corner now moves around the board. To move a card or column, or to resize one, rest your finger on it for about half a second first.

## Collapsed cards as tall as collapsed columns (2026-10-04)

- A collapsed loose card (to-do list, note, link, Completed) is now the same height as a collapsed column, so a row of collapsed blocks lines up. A collapsed card you made taller or shorter by hand keeps that height.

## Phone and tablet: press and hold to move a card (2026-10-04)

- On a touch screen, press and hold anywhere on a card for about half a second, then move your finger to drag it. Before, only a thin strip at the top of a card could be dragged, so cards seemed stuck (columns were fine).

## Phone and tablet, part 4: easier to tap, and the keyboard never hides what you type (2026-10-04)

- On a touch screen, the small buttons on cards (collapse, ×, an item's grip and trash, the resize corner) are easier to hit: a press just outside them still counts.
- On a phone, when the keyboard comes up over the text you are typing, the board moves up so you can still see it.

## Phone and tablet, part 3: item buttons above the keyboard (2026-10-04)

- On a phone, while you type in a checklist item, a row of buttons appears just above the keyboard: outdent, indent, move up, move down, tick and delete. The keyboard stays up while you use them.

## Phone and tablet, part 2: a phone layout (2026-10-04)

- On a phone, the top bar shows just the board name, and a new bar along the bottom holds Undo, Redo, a big + (Note, To-do list, Link, Column) and ⋯ for everything else (Hand / Select, text size, Snap, Color, Collapse all, Dark mode, Import, Sign out…).
- The zoom buttons and ? are hidden on a phone: pinch with two fingers to zoom.

## Phone and tablet, part 1: touch controls for checklist items (2026-10-04)

- On a touch screen, tap into a checklist item to show its grip and trash. Only that item shows them, and the hidden ones on other items can no longer be tapped by accident. Tapping the trash deletes the item; the grip drags it with your finger.

## Clearer outline when dragging an item into another list (2026-10-04)

- When you drag a checklist item onto another list to add it at the end, the whole card now gets a dashed outline, top included. Before, the top of the outline was hidden under the list's title band, so it was hard to tell where the item would go.

## Fix: alignment guide lines no longer stay on the board (2026-10-04)

- When a dragged card lined up with two cards at once, some guide lines could be left behind on the board after the drag. They now always go away.

## Checklist text is never covered by the grip and trash (2026-10-04)

- Every checklist item now keeps a narrow empty strip on its right where the grip and trash appear on hover, so they never cover the text. Long items wrap a little earlier than before, but nothing moves when you hover.

## Collapsing one card or column closes the space below too (2026-10-04)

- Collapsing a single card or column with its arrow now pulls whatever is below it straight up, so no empty space is left, the same as Collapse all.

## Fix: blocks no longer move by themselves after Collapse all (2026-10-04)

- With BusyAnts open in more than one place (the app and a browser tab, say), the other copy could push your collapsed blocks back apart using out-of-date sizes and send that back a few seconds later. A board arriving from another device is now left exactly as it was sent.

## Collapse all: closes the gaps, and works on a selection (2026-10-04)

- Collapse all now pulls the blocks below straight up, so collapsed cards and columns sit right under one another with the same spacing as before, instead of leaving big empty gaps. Expand all puts them back.
- With cards or columns selected, Collapse all / Expand all only act on those. With nothing selected, they act on everything.

## Text formatting (2026-10-04)

- Any text box (a card title, a note, a checklist item, a column title) can be made Small / Normal / Large, bold, italic, and set in one of five fonts: Plex Sans, Serif, Rounded, Handwritten or Typewriter. The whole box changes, not single words.
- Highlight some text and a small bar appears above it with B, I, the three sizes and a Font menu. Select several checklist items and the bar formats all of them.
- Shortcuts: Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+> larger, Ctrl+Shift+< smaller. With whole cards selected they format every text box in those cards.
- Formatting is saved, syncs, undoes with Ctrl+Z, and stays when you copy, split an item with Enter, or clean items up into the Completed card.

## Fix: Expand all opens everything (2026-10-04)

- Expand all now opens every card and column, including ones that were already collapsed before you pressed Collapse all. Blocks still go back to their places, and anything they grow into moves straight down.

## Accessibility and wording fixes (2026-10-04)

- Keyboard: tick boxes now show the teal ring when you reach them with Tab; a resize handle reached with Tab resizes with the arrow keys (Shift for big steps); Ctrl+Shift+Up / Down move a checklist item up or down.
- Touch: tick boxes, resize handles and the item grip are easier to hit (the drawn handles look the same).
- Screen readers now hear each card's and column's title, and "Untitled" when there is none.
- Clearer wording: deleting a column says how many cards go with it ("Keep column" instead of "Cancel"); "Add an item"; "Paste a link address"; "Drop to make a new list"; the empty-board hint mentions the ? shortcuts list; the save-failed and wrong-account messages say what happens or what to do next.

## BusyAnts, part 7: pinch zoom on touch screens (2026-10-03)

- On a touch screen (a tablet, or a touch laptop), put two fingers on the board and spread or pinch them to zoom; move them together to move the board. It works over cards too, and never drags the card you started on.

## BusyAnts, part 6: selecting items across lists (2026-10-03)

- Press Ctrl+A again and again in a checklist item to select more each time: the item's text, the whole list, every list in the same column, then every item on the board (only ones you can see). Escape clears.
- Press on an item and drag down into the next cards of the same column to select across them.
- With items in several lists selected, Delete, ticking and Ctrl+C work on all of them. The copied text puts each list's title on its own line with its items under it.

## BusyAnts, part 5: the board follows you to the edge (2026-10-03)

- When you drag a card, drag checklist items, select items or draw a selection box and hold the pointer near the edge of the screen, the board keeps moving that way, and keeps selecting or carrying what you are dragging.

## BusyAnts, part 4: alignment guides (2026-10-03)

- When you drag a card or column near another one, it snaps into line with that block's edge or middle, and a thin teal line shows where they line up, like in Google Slides.

## BusyAnts, part 3: Same width, and Expand all keeps your layout (2026-10-03)

- New Same width button (next to Collapse all): select two or more cards or columns, press it, and they all become as wide as the first one you selected.
- Collapse all then Expand all now gives you back exactly the layout you had: cards that were already collapsed stay collapsed, and everything goes back to its place.
- The ant icon is simpler and rounder (no face), as asked.

## BusyAnts, part 2: text size, glove cursor, save status (2026-10-03)

- A− / A+ at the bottom right make the text on cards and columns smaller or bigger (4 sizes). Each device remembers its own choice.
- With the Hand tool, the cursor is a glove over empty board, and closes into a fist while you drag the board.
- On the published site, a small note at the bottom right says "Saving…", "Saved", or that you are offline and it will save when you are back.
- The site's offline copy now refreshes with each new version, so returning visitors see the new ant icon.

## BusyAnts, part 1: name, icon and a friendlier start (2026-10-03)

- The app is now called BusyAnts, with a friendly ant on yellow as its icon (browser tab, installed app and sign-in screen). The website address is unchanged.
- An empty board shows a short hint on how to start.
- New to-do lists and columns start untitled (with a gray "List title" / "Column title" placeholder) instead of rows of "New list" and "New column". A new list puts your cursor in its title; press Enter to move on to its first item.

## Bigger color chips and a shortcuts list (2026-10-03)

- The Color menu has bigger chips, and if it opens over the card or column you are coloring, the board moves down so you can still see it.
- New ? button at the bottom right (or press ?) opens a list of every keyboard shortcut. Escape closes it.

## Design fixes 6: from the second Impeccable review (2026-10-03)

- A long board name no longer pushes buttons off the toolbar: the name shrinks first and ends in "…".
- "Open link" is faded until the link has an address.
- The soft fade behind a hovered item's grip and trash is wider, so the text under them no longer shows through.
- Splitting an item with Enter at a space no longer leaves the new item starting with a space.

## Collapsed cards can be made taller (2026-10-02)

- A collapsed card on the board now has a corner handle too: drag it to make the collapsed card taller (or wider). Expanding the card gives back its normal size, and collapsing it again gives back the collapsed size you chose.

## Enter in checklists works like a text editor (2026-10-02)

- Enter in the middle of an item splits it: the rest of the text moves into a new item just below.
- Enter at the very start of an item adds a blank item above it; your cursor stays with the text.
- Enter at the end of an item always adds the new item directly below it: as its first sub-item when it has sub-items.

## Design fixes 5: checklist text uses the whole card (2026-10-02)

- Checklist items no longer wrap early: the text uses the full width of the card. The grip and trash still appear when you hover an item, now over the end of its first line with a soft fade behind them.

## Design fixes 4: clearer buttons and colors (2026-10-02)

- Hovering a card's or column's collapse arrow or × now says what it does. The card's × reminds you that Ctrl+Z brings the card back.
- In the Color menu, each swatch has a clearer ring in its own color, and the name of the color under the pointer shows below the swatches, since some of them look alike.

## Design fixes 3: a calmer toolbar (2026-10-02)

- Thin dividers now group the toolbar: tools and undo · editing (Snap, Color, Auto-color, Collapse all) · adding · board (Import, Clean up, dark mode).
- Add Note, To-do list and Link are plain buttons now. Their yellow, green and blue matched old card colors that no longer exist.
- Auto-color, Collapse all, Import and Clean up are quieter (no border until you hover), so the everyday buttons stand out.
- The board name never shrinks below 140px in narrower windows.

## Design fixes 2: easier to read (2026-10-02)

- The dark-mode button now looks pressed while dark mode is on, like Snap to grid.
- Placeholder text ("Title", "Write something…", "Paste a URL") is darker, so it is easier to read.
- Faded toolbar buttons are a little easier to see in dark mode.
- Cards in an uncolored column now have the usual soft teal title band instead of a dull khaki one.

## Design fixes 1: typing goes into the block you just added (2026-10-02)

- After adding a note, link or column, you can start typing straight away: the text goes into the new note, the link's title, or the column's title (replacing "New column"). Before, it went into whatever card you were last typing in.

## Restructure 5: the store split into smaller files (2026-10-02)

- Behind the scenes only. The store, one 1,029-line file, is now: `core.ts` (state, saving, undo, overlap clean-up), `types.ts`, `env.ts` (browser helpers), and three action files by topic in `src/store/actions/` (blocks, gestures, checklist). The largest file is now 322 lines.

## Restructure 4: shared lookups and one Completed-card rule (2026-10-02)

- Behind the scenes only. "Find this card or column" and "which block on the board holds this card" are now one helper each, and the rule that the Completed card can never be deleted or copied lives in one place (`isPermanent`).

## Restructure 3: checklist drop rules in the model (2026-10-02)

- Behind the scenes only. Where dragged checklist items land (before, after or nested under an item, and never past 6 levels) is now decided by `dropOnRow` in `src/model/checklist.ts`, with its own tests; the screen code only reports where the pointer is.

## Restructure 2: placement rules in one module (2026-10-02)

- Behind the scenes only. The rules for where a dragged block lands, which blocks it pushes aside, and putting pushed blocks back when a block collapses now live together in `src/model/placement.ts`, with their own tests.

## Restructure 1: one place for the waiting tick (2026-10-02)

- Behind the scenes only. Every change now works from the board as it is at that moment, so a tick that is still animating can never be lost by a new action again.

## Tidy-up and speed (2026-10-02)

Nothing should look or work differently; this makes big boards smoother and the code simpler.

- The board is saved a moment (0.15s) after you stop changing it, instead of on every key press. It is also saved straight away when the window is hidden or closed.
- Dragging a block works out where everything goes only when it reaches a new grid spot, not on every mouse movement.
- Panning and zooming no longer redraw every card and checklist item.
- All colors in the stylesheet are now named color settings, defined once.
- Removed unused code and merged repeated helpers (copying items, snapping, refilling an emptied list).

## Paste, import and keyboard fixes from the code review (2026-10-02)

- Pasting checklist items never makes them deeper than 6 levels: if there is no room, they go after the nearest item higher up.
- Unticking an item in the Completed card unticks the item it goes back under, so it never hides inside a ticked item.
- A card copied from a column that has since been deleted is pasted where the column was, not far away at the top-left of the board.
- Importing from Milanote keeps a # that is part of a heading ("Learn C#"), and a heading with no text becomes an empty list.
- Ctrl+Z, Ctrl+C and the other shortcuts work with a non-Latin keyboard layout (for example Russian) switched on.
- Turning Snap to grid back on never makes a card narrower than the minimum card width.

## Ticking, dragging and selecting fixes from the code review (2026-10-02)

- Ticking an item and then quickly deleting, pasting, dropping a block, pressing Backspace or pressing Clean up no longer un-ticks the item.
- A tick that is still animating no longer undoes a change from another device that arrives at the same moment.
- Pressing Delete while dragging a card or column does nothing (it used to break the drag).
- Ctrl+A, or a selection box with Ctrl held, now drops any highlighted checklist items, so Delete and Ctrl+C act on the selected blocks.

## Sync fixes from the code review (2026-10-02)

- Typing or other changes not yet sent online are no longer thrown away when another device saves at the same moment: your change is kept and sent.
- A card or column you drop no longer jumps back if another device saved while you were dragging.
- Devices no longer send each other's changes back and forth (this could undo newer typing and clear Ctrl+Z history).
- If the online board can't be read (damaged, or saved by a newer version of the app), it is left untouched and the page says the board couldn't be loaded, instead of showing an empty board and saving that over everything.
- If saving online fails (for example the board is too big), a small red note at the bottom says "Couldn't save online. Changes are on this device only." Your next change tries again, and the note disappears once it works.
- Changes are sent online the moment you minimize or switch away from the window, so closing the app right after typing no longer loses that text.

## Dark mode (2026-10-02)

- New moon button at the right end of the toolbar switches between light and dark mode.
- The first time you open the app on a device, it matches your computer's light / dark setting. After you press the button, that device remembers your choice. Each device keeps its own, and Ctrl+Z doesn't change it.
- In dark mode the board, toolbar and cards turn dark gray with light text, and each column color becomes a deep shade of itself, so columns still look clearly different.

## Tests first (2026-10-02)

- New working rule: for every change, the tests are written first and seen to fail, then the change is built until they pass.

## Arrow keys move blocks; centered titles on collapsed cards (2026-10-02)

- With a card or column selected (or several), the arrow keys move them one grid square at a time; hold Shift to move five. A card inside a column moves up or down its column instead. Ctrl+Z undoes a quick run of presses in one go.
- While typing in a card, the arrows still move through the text. Press Escape to leave the text (the card stays selected), then use the arrows to move it.
- A collapsed loose card now shows its title in the middle of the card.

## Collapse all, and resizing collapsed blocks (2026-10-02)

- New **Collapse all** button (next to Auto-color): collapses every card and column at once. When everything is collapsed it becomes **Expand all**. Ctrl+Z undoes it.
- Collapsed columns can now be resized too: drag the right edge. On collapsed cards and columns the right edge lights up when you hover, so the handle is easy to find.

## Color for cards' title bands (2026-10-02)

- With a card selected, **Color** now colors the card's title band (the card itself stays white). A note gets the color across the strip at its top. **Default** at the bottom of the color menu puts the usual band back (or a column back to gray).

## Easier-to-see title bands (2026-10-02)

- Inside a column, a card's title band is now a slightly deeper shade of the column's color, so it stands out from the column instead of blending into it.

## Fixes: selecting, copying and Tab (2026-10-02)

- Copy and cut now take exactly the items you highlighted. Before, highlighting an item copied everything under it too. The copied text keeps the items' levels relative to each other. Cut leaves any sub-item you didn't highlight in the list.
- Shift+click now selects from the item you're typing in to the one you click. Before, it only extended a selection you had already made, so Tab then moved just one item.

## Copy items as text (2026-10-02)

- Copying several selected checklist items (Ctrl+C or Ctrl+X) now also copies their text, one item per line (sub-items indented), so you can paste them into an email, a document or another app.

## Titles stand out (2026-10-02)

- To-do lists and links now have a soft tinted band behind their title at the top of the card: teal when loose, the column's color inside a column.
- Column titles are centered.

## Gentler completing (2026-10-02)

- Ticking the last open sub-item of a list item now ticks the item too, so it moves into Completed. Unticking a sub-item brings its item back.
- An item that's ticked no longer just vanishes: it eases out of the list and gently fades into the Completed section (not when your computer is set to reduce motion).
- The Completed section's header no longer shows a count.

## Tidier columns and pushing (2026-10-02)

- A column is now always exactly as tall as the cards in it, so collapsing cards inside shrinks it instead of leaving blank space. Its corner handle sets the width (and the height of an empty column).
- A collapsed card can still be made wider or narrower: drag its right edge.
- When something grows (expanding a card, typing, a column filling up), the blocks below it are pushed straight down instead of off to the side.

## Fix: Tab on selected items (2026-10-02)

- Tab on several selected items now works when the selection starts at the first item of a list: the first item stays and the others move in under it. Before, nothing happened.

## Clean up (2026-10-02)

- New **Clean up** button at the end of the toolbar: it moves every ticked item on the board (with anything under it) into a **Completed** card, grouped under today's date. The first time, it makes the Completed card in the middle of the screen.
- The Completed card can't be deleted (it has no ×, and the Delete key leaves it alone). Each item shows which list it came from.
- Untick an item in the Completed card to send it back to its list. If the list has been deleted, a new list with the same name is made next to the Completed card.
- The toolbar is a little more compact so all its buttons fit on a laptop screen.

## Collapse puts things back (2026-10-02)

- When expanding a card or column pushes other blocks out of the way, collapsing it again moves them back to where they were. A block you've moved yourself in the meantime stays where you put it.

## Checklist keys (2026-10-02)

- Pressing Delete at the end of a checklist item pulls the item below up into it (like joining two lines). The cursor stays where the two were joined; the pulled-up item's sub-items move up a level.
- With several items selected, Tab moves them all in one level together and Shift+Tab moves them all out. They stay selected, so you can press Tab again.

## More colors and Auto-color (2026-10-02)

- The color menu now has 16 colors (new: Sand, Coral, Orchid, Periwinkle, Aqua, Sage, Lime, Slate), in two rows.
- New **Auto-color** button next to Color: one click gives every column its own, different color (neighboring columns get clearly different ones). Ctrl+Z undoes it.

## Cleaner cards (2026-10-02)

- Notes, to-do lists and links are now always white, loose or inside a column. Columns keep their color.
- The Color button now recolors columns only, and is faded unless a column is selected.
- To-do lists no longer show "3/6 done" in their header (a collapsed list shows just its title).
- A column's collapse arrow has moved to the top right, next to its ×.

## Import from Milanote (2026-10-02)

- New **Import** button at the end of the toolbar: pick a Milanote board exported as Markdown (.md) and its cards are added to your board. Nothing already on the board is changed.
- Each heading becomes a to-do list with that title (an empty heading gives an empty list); items keep their sub-items and ticks; a blank line between items starts a new untitled list; other text becomes a note, and a lone web address becomes a link card.
- Milanote's export has no positions or colors, so the cards come in tidy lanes at the top of the screen in default colors, all selected so you can drag them somewhere as a group. One Ctrl+Z removes the whole import.

## Install as an app (2026-10-02)

- The published board can be installed as an app from Edge or Chrome: it gets its own window (no address bar), a Note Board icon in the Start menu and taskbar, and opens offline. Sign-in and sync work exactly as on the website, and the app updates itself whenever the site does.
- The browser tab now shows the Note Board icon too.

## Spec brought up to date (2026-10-02)

- `SPEC.md` now describes the app as it is: sign-in, sync and offline use on the published site, dragging new blocks from the toolbar, keyboard navigation between cards, smoother snapping, the dragged block taking priority, and the checklist changes. Accounts and cloud sync are no longer listed as "not in version 1".
- From now on the spec is updated together with every new feature or decision.

## Hosting (2026-10-01)

- The board is published at https://ezhang43.github.io/note-board/. Every push to `build/v1` runs the unit tests, builds the site and publishes it.
- The published board now needs a Google sign-in and is saved to your account (Firebase), so the same board shows on your phone and laptop. Changes reach the other device within a second or two; if both are edited at once, the most recent save wins. Signing in is remembered on each device. Anyone else sees only the sign-in screen; another Google account gets "This Google account can't open this board". A Sign out button sits at the right of the toolbar.
- Works offline: once visited online, the page opens without internet, edits are kept on the device and uploaded when the connection returns.
- `npm run dev` and the tests still use the local-only board with no sign-in.

## Owner additions (2026-10-01)

- The block you drag now takes priority: it lands on the grid spot where you let go, and anything in the way slides aside to the nearest free spot (shown live while dragging). Blocks still never overlap. A dragged card never pushes a column (dropping a card on a column puts it inside); where it would cover one, the card lands beside it. Dragged columns and groups push everything.
- Smoother snapping: a dragged block now follows the pointer exactly (no 20px jumps), the dashed outline shows the grid spot it will land on, and on release it glides there. Resizing works the same way: the edge follows the pointer and eases to the grid size on release (the size label shows the final size; matching another block's size still clicks into place). Blocks pushed aside also glide. Gliding is off when the computer is set to reduce motion.
- Drag a new Note, To-do list or Link straight from the toolbar: press the Add button and drag onto the board. A dashed outline shows where the card will appear (never on top of another block); over a column it goes into the column at the pointer. A plain click still adds as before; letting go off the board adds nothing.
- Every checklist item now shows a trash can on hover, not just completed ones.
- Up / Down arrows move between checklist items, as if the list were one long text: Up goes to the end of the item above, Down to the start of the item below. Inside a multi-line item the arrows move line by line first. Items hidden in a collapsed Completed section are skipped.
- Up / Down arrows now move through every text field of a card (note text, list title and items, link title and address), and within a column carry on into the card above or below, selecting it. Collapsed cards are skipped.
- Alt + arrow keys jump to the nearest card in that direction (loose or in a column), select it and put the cursor in its first field, panning the board if the card is off-screen. Works while typing in a card or with a card selected. Ctrl + arrows keep moving word by word in text. Alt + ← / → never make the browser go back or forward a page.
- New column can be dragged from the toolbar too. It lands at the nearest free spot (never inside another column).
- Deleting a checklist item with no text (trash, Backspace or Delete) keeps its sub-items if any of them has text: they move up one level into its place, with their text and ticks. Items with text still delete everything under them, and Ctrl+X still cuts sub-items along with their parent.

## Step 5 — Checklists (2026-10-01)

- Enter adds a new item below at the same level; Tab nests an item under the one above (up to 6 levels); Shift+Tab moves it out a level; Backspace on an empty item deletes it (not the list's last item).
- Ticking a top-level item moves it, with its sub-items, into "Completed · N" at the bottom; the header collapses and expands the section. Ticking a sub-item only strikes it through.
- On hover each item shows a drag grip; completed items also show a trash can, which deletes the item and everything under it. An emptied list gets a blank item.
- Drag an item by its grip (it takes its sub-items): before or after another item (teal line), nested under one (drop slightly to the right; teal tint), into another list, or onto empty list space to add it at the end. Dropping on empty board (or a note, link or column) makes a new "New list" there in the source list's color.
- Select several items by holding the mouse on one and dragging over others, or with Shift+click. Selected items are highlighted. Then Delete/Backspace removes them all, ticking one ticks them all, trash deletes them all, dragging one moves them all in order, Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste them after the selection, and Escape clears.
- Everything here can be undone.

## Step 4 — Selection, clipboard, delete, undo/redo (2026-10-01)

- Ctrl + click (or Shift + click) adds or removes a block from the selection. ⌘ works instead of Ctrl on a Mac.
- Select tool (V): drag a box on empty board; everything it touches is selected as you drag. Hold Ctrl to add to the current selection.
- Ctrl + A selects every column and loose card. Escape clears the selection and closes menus.
- Dragging a selected block moves the whole selection together. Color recolors every selected block.
- Delete / Backspace deletes the selection; if it includes a column, the same "Delete '…'?" confirmation appears first.
- Ctrl + C then Ctrl + V pastes copies 40px further each time (a column copies with its cards, titled "… copy"). Ctrl + D duplicates.
- Ctrl + Z undoes, up to 100 steps, even while typing; a burst of typing is one step. Ctrl + Y redoes; Ctrl + Shift + Z does nothing. Undo and Redo buttons fade when there is nothing to undo or redo.
- Block shortcuts don't fire while typing in a text field (undo, redo and zoom still do).

## Step 3 — No overlap, resizing, size matching, snap realignment (2026-10-01)

- No overlap, ever: loose cards and columns always keep at least 10px apart.
  - While dragging over another block, a dashed teal outline shows the nearest free landing spot; the block lands there.
  - When a note grows as you type, a column gains cards, or a block is resized, anything it would cover moves to the nearest free spot.
  - Boards saved with overlapping blocks are tidied when they load.
- Resize loose cards from the bottom-right corner (width and minimum height; longer content still grows the card).
- Resize columns from the corner (width and minimum height) or the right-edge strip (width only). Cards inside follow the column width. Cards inside a column have no resize handle.
- Size matching: within 8px of another block's width or height, the size snaps to match; matched blocks get a dashed teal outline and a label shows e.g. "240 × 180 · same width as 2 blocks". Otherwise sizes land on the 20px grid when snapping is on.
- Turning Snap to grid back on moves every block's position and resized size to the nearest grid point.

## Step 2 — Cards and columns (2026-10-01)

- Add Note (butter), To-do list (mint), Link (sky) and New column from the toolbar. New blocks appear in the middle of the screen, never on top of other blocks, and are selected.
- With a column selected, a new card goes at the end of it; with a card inside a column selected, directly below that card.
- Notes grow as you type. Links have a title, an address and an "Open <domain>" button that opens a new tab. A new to-do list is titled "New list" with one blank item, cursor in it; items can be typed and ticked, and the header shows "1/3 done".
- Click a block to select it (teal outline); click empty board or press Escape to clear.
- Drag any blank part of a card or column to move it (starts after a 5px nudge). Drop a card on a column to put it there at the pointer; the column opens if collapsed. Drag a card out of a column to make it loose. Moves land on the 20px grid when snapping is on.
- Collapse arrow on cards (one-line preview) and columns (hides cards).
- Color button recolors the selected block from 8 swatches; faded when nothing is selected. Card text stays black whatever the color.
- Card × deletes it. Column × asks "Delete '…'?" first, then deletes the column and its cards.
- Everything is saved in the browser; boards saved by step 1 are kept.
- Not yet: blocks you drop yourself can still overlap (step 3), resizing (step 3), multi-select / Delete key / copy-paste / undo (step 4), full checklist editing (step 5).

## Step 1 — Canvas, toolbar, pan and zoom, grid, saving (2026-10-01)

- Project set up: TypeScript + React + Vite, Vitest unit tests, Playwright browser tests.
- Full toolbar in spec order. Board name is editable and its box fits the text.
- Hand / Select tool toggle (buttons, H and V keys). Select's rectangle comes in step 4.
- Endless dotted 20px grid. Dots fade when Snap to grid is off (block realignment comes in step 3).
- Pan: drag empty space with Hand, or scroll / swipe with either tool.
- Zoom 30–250%: Ctrl+scroll or pinch at the cursor, Ctrl+= / Ctrl+− / Ctrl+0, and the − · % · + control. Reset keeps the middle of the screen in place.
- Board name and snap setting save instantly; pan and zoom save a moment after you stop. Damaged saved data starts a fresh board.
- Not working yet, by design: Undo, Redo and Color (shown faded), and the Add buttons (step 2).
