# Changelog

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
