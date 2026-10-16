# Play Console: Data safety form (draft answers)

Worked out from the code and `SPEC.md` on 2026-10-16. Paste or tick these in Play Console under App content > Data safety. Anything marked **OWNER CHECK** is a judgment call that Google's own definitions leave open, so please read it before you submit. This is not legal advice. The answers must match the privacy policy (https://ezhang43.github.io/note-board/privacy/); if what the app stores changes, update both.

Files checked:
- `src/sync/firebase.ts` (Google sign-in with Firebase Authentication, Cloud Firestore, offline cache)
- `src/store/collab.ts` (what other people see when a board is shared: Google name and photo address, never the email)
- `src/store/sync.ts`, `src/store/versions.ts` (what is saved online: boards and version history)
- `firestore.rules` (only the owner reads their boards; shared boards only by the people who have them)
- `src/calendar/google.ts`, `src/store/calendar.ts` (Google Calendar: scope `calendar.events`, access kept in memory only)
- `public/sw.js`, `src/model/persist.ts` (copies kept on the device)
- `package.json` and a search of `src/` and `index.html` (no analytics, advertising, crash-reporting or tracking library)
- `privacy/index.html` (what the policy promises)
- `mcp/` (the Claude connector; see below, it is not part of the app)

## Summary answers

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (everything goes over HTTPS: Firebase, Google sign-in, the website) |
| Do you provide a way for users to request that their data is deleted? | Yes. Say so once job #63 is live: the in-app Delete account button and the website "Delete your account" page. Until then the policy says "email ezhang43@gmail.com, deleted within 30 days". |
| Data shared with third parties? | No (see "Sharing" below). OWNER CHECK. |
| Independent security review / "Committed to Play Families policy" | Leave "No" / not applicable. The app is not designed for children (privacy policy: not meant for children under 13). |

## Data types collected

For each type: Collected = yes. Shared = no. Processed ephemerally = no. Required (not optional), because sign-in is needed to use the online app. Purposes: App functionality and Account management (nothing else: no analytics, advertising, personalization or fraud prevention).

| Play category | Data type | Collected? | Why / where it comes from | Purposes |
| --- | --- | --- | --- | --- |
| Personal info | Name | Yes | Google account name, kept by Firebase Authentication; shown to people you share a board with | App functionality, Account management |
| Personal info | Email address | Yes | Google account email, kept by Firebase Authentication; only used to sign in, never shown to others | Account management |
| Personal info | User IDs | Yes | The Firebase / Google account number, used to store your boards and to tell who has a shared board | App functionality, Account management |
| Photos and videos | Photos | OWNER CHECK, recommended: tick "Photos" | Only the web address of the Google profile picture is stored and shown to people you share a board with; the app does not read your photo library or camera. Google's form has no "profile picture" type. Ticking Photos is the cautious, honest choice. | App functionality |
| App activity | Other user-generated content | Yes | Everything on the boards: names, notes, checklist items, links, colors, positions, plus version history and shared-board lists | App functionality |
| Calendar | Calendar events | No (OWNER CHECK) | If the person connects Google Calendar, events go from Google straight to the device and are kept in memory only; BusyAnts keeps no copy and nothing is sent to BusyAnts's own storage. Google counts data as "collected" when it is sent off the device to you or a third party, so this is likely "not collected". If you want to be extra cautious, tick Calendar events as collected, optional, App functionality, not shared. | (App functionality, if ticked) |

Types that are **not** collected (as far as the code shows): approximate or precise location, physical address, phone number, race, political or religious beliefs, financial info, health and fitness, messages (emails, SMS), contacts, audio or video files, files and docs other than the boards, web browsing history, installed apps, app interactions / analytics, crash logs, diagnostics, device or other IDs (advertising ID). The app has no analytics or crash-reporting library.

OWNER CHECK: servers like Firebase and GitHub Pages receive an IP address whenever the app loads, as any web server does, and Google Fonts also receives it. Google's guidance says that data logged only transiently for serving the request does not need to be declared, but if you want to be very cautious you can tick "Device or other IDs" or note the IP in your policy. The privacy policy already mentions the IP address.

## Sharing with third parties

Recommended answer: **No data is shared.** Reasoning, using Google's definitions:
- Google Firebase (Authentication and Cloud Firestore) stores the data on BusyAnts's behalf. Google says that transferring data to a "service provider" that processes it on the developer's behalf is not "sharing". Firebase is that kind of processor, so it is declared as collected but not shared.
- GitHub Pages only serves the site's files.
- Google Fonts and Google Calendar are Google services used directly by the person's device.
- Sharing a board with another person is an action the user takes themselves, and Google says transfers the user starts in the app (with a clear prompt) are not "sharing" either. The panel shows the people who have it.

OWNER CHECK: if you read it more strictly, you could answer "Yes" for Name and Photos (shown to people the user shares a board with). The recommended answer stays "No" because it is user-initiated and in-app. Pick the one you are comfortable with, and keep it the same as the privacy policy.

## Security practices

- Encrypted in transit: Yes.
- Data deletion: Yes. In-app Delete account (job #63) and the website "Delete your account" page: mark both "once #63 is live". Before then, deletion by email only; do not tick the in-app option until it ships.
- Data deleted when requested: everything stored online (account details, boards, version history, shared-board lists) within 30 days at the latest; the policy says so. Note that a board you shared with others is deleted for everyone when its owner deletes it (SPEC "Sharing").
- Encrypted at rest: not asked by the form. Firebase encrypts at rest by default, but this is Google's setting, not something the code does.

## The Claude connector and other items asked about

- Claude connector (`mcp/`): a local tool the owner runs on their own computer, for Claude Desktop or Claude Code. It is not part of the Android app and sends nothing to BusyAnts's own servers other than the same Firestore reads and writes the signed-in person's own account makes. It does not affect the Data safety form for the app.
- Analytics: none (checked above).
- Backups: "Download backup" saves a file on the person's device; BusyAnts never receives it.
- Version history: stored online with the boards (newest 100); covered by "Other user-generated content".
- Sign-in: Google sign-in only (OWNER CHECK: Google's form may ask whether the app lets people sign in with an account created outside the app, which is the "account creation" question. Answer: sign-in uses a Google account; account creation is Google's).
- Ads: the app has no ads. In "App content > Ads" answer: No ads.
- Buy me a coffee: a link that opens a separate website; no data is sent by the app.

## When the Trusted Web Activity wrapper exists

Because the Android app will be the same website inside a wrapper, the answers above stay the same as long as the wrapper adds no analytics or other library. Re-check this form when the wrapper is built (a separate future job). OWNER CHECK.
