# Plan: moving BusyAnts' online data from Sydney to the US

Job #37 (scout, plan only). Written 2026-10-07 from `origin/build/v1` at 41035b3. Copied into the repo by job #40 with the owner's answers and the count script's commands.

## Owner's decisions (2026-10-07)

All the recommended answers in section 7 were approved:

1. **Blaze** with a **$5** budget alert: yes.
2. Location **nam5** (United States multi-region): yes.
3. A **~40-minute no-saving window** this month, on an evening before the Nov 17 soft launch: yes (testers told a day ahead).
4. **Route C** (delete and recreate `(default)` in nam5, from a full export, after a rehearsal into `us-check`): yes.
5. **Daily backups** of Sydney for two weeks around the move: yes.
6. The **owner pastes the Cloud Shell commands one at a time**; the crew reads the output and runs the comparison.

The counting in steps 7, 11 and 15 uses `scripts/firestore-counts.mjs` (read only; see "Using the count script" at the end of section 6).

## In short

- **A Firestore database can't be moved.** Its location is fixed when it is made. "Moving" means: copy everything out, make a new database in the US, copy everything in.
- **Recommended:** keep the same database name, `(default)`, and recreate it in the US. Steps: turn on Blaze billing with a $5 budget alert, take a full Google export, test that export in a throwaway US database, then in one quiet ~40-minute window delete the Sydney database, make a new `(default)` in **nam5 (United States)** and import the export into it.
- **No app code change is needed** with this route, because the app, the Claude connector and the rules all talk to `(default)`. Only wording changes: the Privacy page, SPEC.md and decisions. That means no high-risk code pull request. But the move itself touches where every saved board lives, so it is high risk and needs the owner's OK. The owner does the console steps.
- **Cost:** a few cents at most. The free quota stays (one free database per project, and the new `(default)` becomes the free one).
- **Do it soon, before the Nov 17 soft launch,** while almost nobody but the owner has boards saved.

---

## 1. Facts (checked against Google's docs, 2026-10-07)

| Question | Answer | Source |
|---|---|---|
| Can a database's location be changed? | **No.** "once you provision a database instance, you cannot change its location setting." | [Firestore locations](https://firebase.google.com/docs/firestore/locations) |
| Several databases in one project? | Yes, up to 100 ("named databases"). The app must name the database when it connects (`initializeFirestore(app, settings, 'name')`). Rules are set separately for each database. | [Manage databases](https://firebase.google.com/docs/firestore/manage-databases), [Quotas](https://firebase.google.com/docs/firestore/quotas) |
| Do named databases need Blaze? | **Yes.** On Firebase pricing, "Multiple databases per project" is "Not supported" on Spark. | [Firebase pricing](https://firebase.google.com/pricing) |
| Free quota | "Cloud Firestore allows exactly one free database per project." The first one made gets it. "If you delete that database, the next database you create becomes the new database eligible for the free quota." A second (named) database made while Sydney still exists would **not** be free. | [Firestore billing](https://firebase.google.com/docs/firestore/pricing) |
| Delete `(default)` and make it again? | Allowed. "After you delete a database, you can't re-use its ID for about 5 minutes." Delete protection, if it is on, must be turned off first. | [Manage databases](https://docs.cloud.google.com/firestore/native/docs/manage-databases) |
| Managed export / import | Needs **Blaze** and a Cloud Storage bucket. Costs one document read per document exported. An import **overwrites** documents with the same ID, can go into a database in a **different location**, and **ignores security rules** (it runs as an administrator). Live listeners do see imported documents. | [Export and import](https://firebase.google.com/docs/firestore/manage-data/export-import) |
| Backups (scheduled) | Need Blaze. They are kept in the database's own location (Sydney), are restored only into a *new* database, and stay even after the database is deleted. A useful extra safety net, but they can't do the move themselves. | [Backups](https://firebase.google.com/docs/firestore/backups) |
| Free Cloud Storage | Free storage only for buckets in `us-central1`, `us-west1` or `us-east1`. So put the export bucket in `us-central1`. | [Firebase pricing](https://firebase.google.com/pricing) |

### Which US location: recommend **nam5 (United States)**

| | nam5 (multi-region: Iowa + Oklahoma) | us-central1 (Iowa only) | us-east1 / us-east4 (East coast only) |
|---|---|---|---|
| Uptime promise | 99.999% (keeps working if one region goes down) | 99.99% | 99.99% |
| Price beyond free quota | about double regional (regional: $0.03 per 100k reads, $0.09 per 100k writes) | cheapest | cheapest |
| Free quota | same | same | same |
| Speed for US users | central: good for both coasts | central | best for the East, slower for the West |

At BusyAnts' size everything stays inside the free quota (50,000 reads and 20,000 writes a day, 1 GiB), so the higher price doesn't matter yet. nam5 is also Firebase's own suggested US choice. Pick **us-central1** instead only if the owner wants the lowest bill once past the free quota. Like the move itself, this choice is permanent. (Price comparison from [Google Cloud's Firestore pricing](https://cloud.google.com/firestore/pricing); check the exact numbers there.)

---

## 2. What in the code points at the database

| File | What it does now | Change needed with the **recommended** route (same name `(default)`) | Change needed with a **named** database (route A or B) |
|---|---|---|---|
| `src/sync/firebase.ts` | `initializeFirestore(app, { localCache: persistentLocalCache(...) })` with no database name, so it uses `(default)`. Every save and load goes through `db`. | **None** | Add the database name as the third argument. Note: the device's offline copy (IndexedDB) is kept separately for each database, so changes waiting offline in the old one would be stranded (see section 4). High-risk file. |
| `firestore.rules` | Rules for `/databases/{database}/documents`, which already fits any database. The owner pastes them into the console. | **None to the file.** The owner pastes it again into the new database's Rules tab (a new database starts with its own rules). | Same, pasted into the named database's Rules tab. |
| `mcp/firestore.ts` | REST address `.../projects/note-board-a672a/databases/(default)/documents/` | **None** | Change `(default)` to the new name, plus its test `mcp/firestore.test.ts`. |
| `src/sync/firebase.test.ts`, `src/sync/firebase-share.test.ts` | Fake `firebase/firestore` (`initializeFirestore: () => ({})`) | None | Probably none (the fake ignores arguments). A test that the name is passed would be added. |
| `src/sync/devServer.ts`, `src/sync/demo.ts`, `src/store/collab.ts` `memoryServer` | Pretend servers for `npm run dev` and the e2e tests. They never touch Firestore. | None | None |
| `privacy/index.html` line 65 | Already says data is kept "in us-central (United States)". **Today that's wrong: the data is in Sydney.** (Job #36 privacy-location is handling this wording.) | Say "United States (nam5 multi-region: Iowa and Oklahoma)" once the move is done. Until then it must say Australia. | Same |
| `SPEC.md` lines 248, 261, 383 | Line 383 says "data kept in Firestore us-central (United States)". 248 and 261 describe documents and rules pasted in the console. | Line 383: the real location. Add a sentence that the database is `(default)` in nam5. | Same, plus the database name. |
| `docs/decisions.md` | No location decision recorded | Add the decision (date, location, why) | Same |
| `CHANGELOG.md` | | One plain line: "Your boards are now stored in the United States." | Same |
| `mcp/README.md` | Mentions Cloud Firestore API, no location | None | None |
| `scripts/publish-rules.mjs` | `src/sync/` and `firestore.rules` are on the risky list | None | A code change to `firebase.ts` would be held for the owner's "publish". |

There is no `firebase.json` or `.firebaserc` in the repo. Rules are only ever pasted in the console.

---

## 3. What data must move (all of it, unchanged)

Everything is in one database. The export / import copies every collection and sub-collection, so nothing has to be listed by hand. This list is for checking counts afterwards.

| Path | What it is | Notes |
|---|---|---|
| `boards/{uid}` | Each person's own boards, as one document (`data`, `client`, `updatedAt`) | The owner's real boards are here |
| `boards/{uid}/versions/{id}` | Version history list (`savedAt`, `cards`, `columns`, `boards`, `hash`) | |
| `boards/{uid}/versionData/{id}` | Each version's board (`data`) | Must arrive together with `versions`, or a version shows with no board |
| `boards/{uid}/shared/{sid}` | Each person's list of shared boards they have (`joinedAt`) | If this list arrives without `shared/{sid}`, devices drop shared boards (see section 4) |
| `shared/{sid}` | A shared board (`owner`, `root`, `link`, `data`, `client`, `rev`, `updatedAt`) | `rev` must stay the same, or pages that remember the old rev conflict |
| `shared/{sid}/members/{uid}` | Who has it (`name`, `photo`, `key`, `joinedAt`) | Needed by the rules (`exists(memberPath)`), or members are refused |

Not in Firestore, so unaffected: Google sign-in accounts (Firebase Authentication isn't tied to a database location; user IDs stay the same, so `boards/{uid}` still matches), the website on GitHub Pages, and each device's `localStorage` copy (`note-board:v1`, `note-board:share-base:*`, `note-board:shares:*`, `note-board:versions:v1`).

---

## 4. How devices behave during a move (from `src/store/sync.ts`, `src/store/sharing.ts`, `src/sync/session.ts`)

These behaviours decide how risky each route is:

1. **Own boards: on first load, the online copy wins** (`startSync`): "The first online version wins over this device's board; if there is no online copy yet, this device's board is uploaded."
   - If a device opens while the new database is **empty**, it uploads its own copy. An import done after that **overwrites it** with the export, which may be older. So **the app must not be able to reach an empty new database.**
   - Changes made on a device that never reached the server are lost when that device next loads an online copy, unless they are still waiting in Firestore's offline queue for the *same* database.
2. **Offline queue:** Firestore keeps unsent changes in the browser (IndexedDB), separately for each project and **database name**. With the same name `(default)`, waiting changes are sent to the new database once it opens. They are newer, so that is good. With a new named database, they are stranded and never sent.
3. **Shared boards** (`sharing.ts`):
   - If the server's own list `boards/{uid}/shared` lacks a share the device has, `gone(s, 'left')` removes those boards from the device.
   - If reading `shared/{id}` is refused twice, `gone(s, 'removed')` removes them, saying "... is no longer shared with you."
   - A safety version is saved first, and the boards come back once the server shows the share again. But for the person who shared it, the boards inside become their own boards in the meantime, which can leave **duplicates**.
   - So a **half-copied or locked database seen by an open page causes mess**, even though nothing on the server is lost.
4. **Locked database (all access refused):** own-board sync stops with `no-access` (it doesn't delete anything); shared boards go through point 3.
5. **Old pages still open** after a switch to a *named* database keep writing to Sydney. Those writes would be lost unless Sydney is made read-only.

**Conclusion: every BusyAnts page and app (computer tabs, phone home-screen app, testers) must be closed during the window, and the new database must stay locked until the import has finished.**

---

## 5. Three ways to do it

### A. New named US database, managed export / import, app switched by code
1. Blaze. Make a database `us` in nam5 (locked). Export Sydney to a bucket and import into `us`.
2. A high-risk pull request changes `firebase.ts` (and the MCP address) to `us`. The owner publishes it.
3. Sydney's rules become read-only so old pages can't save there. Delete Sydney later.

- **Cost:** cents for the move. But `us` is **not** the free database while Sydney exists, so every read and write is billed. Probably still cents a month, but no longer free. After Sydney is deleted, `us` likely still isn't the free one (the docs say the *next database created* gets the free quota).
- **Owner steps:** Blaze, bucket, export/import commands, rules ×2, publish.
- **Downtime:** short, but the switch moment depends on when each device loads the new code (cached service worker), so old and new pages overlap.
- **Offline devices:** changes waiting offline are **stranded** in the old database's queue. That is real loss for anyone who edited offline just before.
- **Rollback:** easiest of the three, because Sydney stays untouched. Publish the old code back.
- **Data-loss risk:** low on the server, medium on devices (stranded offline changes, writes landing in Sydney after the export).

### B. The app copies each person's data on their next sign-in
New code reads Sydney and writes the US database for each signed-in person, then uses the US one.

- **Cost:** needs a second database, so **still needs Blaze**. There's no free version of this.
- **Effort:** a lot of new code in the riskiest area: two databases live at once, a "have I moved yet" flag, versions, and shares. A share belongs to several people, so who copies it, and what if a member signs in before the owner? Point 3 of section 4 would drop shared boards for members until then.
- **Downtime:** none. But people who never sign in again stay in Sydney forever, so Sydney can never be deleted.
- **Rollback:** hard (data split across two databases).
- **Data-loss risk:** highest of the three (complex code, race conditions). **Not recommended.**

### C. Delete `(default)` and recreate it in the US, from a full export (recommended)
1. Blaze with a budget alert.
2. Export Sydney.
3. **Rehearse:** import that export into a throwaway named database in the US and compare counts. This proves the export is complete before anything is deleted.
4. In a quiet window: make Sydney read-only, close every page, take a final export, delete Sydney, wait 5 minutes, create `(default)` in nam5 **locked**, import, check counts, paste the rules, reopen the app.

- **Cost:** a few cents (one read per document exported, twice, plus a tiny bucket in a free-storage US region). **The free quota carries over** to the new `(default)`.
- **Owner steps:** all in the console and Cloud Shell (no installs). Listed in section 6.
- **Code:** none. Only wording in Privacy, SPEC, decisions and changelog. Normal pull request, low review level (wording only).
- **Downtime:** about 20–40 minutes, while nobody uses the app.
- **Offline devices:** the name stays `(default)`, so changes waiting offline are sent to the new database when that device comes back online. They are newer, so they win. The only loss is edits on a page that was open *during* the window; avoid that by closing every page.
- **Rollback:** the Sydney database itself can't come back once deleted. Rollback = recreate `(default)` (anywhere) and import the same export again. That's why step 3 (the rehearsal) and keeping the export files for 90 days matter. Optional extra: turn on a Firestore **backup** of Sydney the day before; backups survive the database's deletion.
- **Data-loss risk:** low, *if* the rehearsal counts match and every page is closed. The one unproven point: how a device's offline copy reacts to its database being replaced under the same name. The SDK should notice and download afresh, but this is checked in the verification steps below.

### Comparison

| | A named DB | B copy on sign-in | **C recreate (default)** |
|---|---|---|---|
| Needs Blaze | yes | yes | yes (for export/import) |
| Monthly cost after | billed from the first read | billed | **free quota kept** |
| App code change | yes (high-risk PR) | yes, large | **no** |
| Downtime | overlap period | none | 20–40 min, planned |
| Offline changes waiting on devices | stranded | complicated | **delivered** |
| Rollback | easy | hard | re-import the export |
| Overall data-loss risk | low–medium | high | **low** |

---

## 6. Recommended runbook (route C)

Who does what: **Owner** = clicks in Firebase / Google Cloud. **Crew** = code, docs, checks. Nothing here is done without the owner's OK. Since this concerns saving and sync, it's treated as **high risk** (review level `high` if any code ends up changing).

### Day before: preparation (about 30 minutes, nothing is deleted)

1. **Owner: backup in the app.** On the computer, open BusyAnts, signed in. **File → Download backup.** Save the file (it holds every board). Do the same on any other account that matters (testers can do their own).
2. **Owner: turn on Blaze with a budget alert.**
   1. Go to <https://console.firebase.google.com/project/note-board-a672a/usage/details>. Click **Modify plan**, pick **Blaze**, and follow the steps to add or choose a billing account (a card is needed).
   2. Go to <https://console.cloud.google.com/billing/budgets?project=note-board-a672a>. Click **Create budget**, name it `BusyAnts`, scope: this project. Click **Next**, set the amount to **$5** (alerts at 50%, 90%, 100%), and click **Finish**. A budget only *warns*; it doesn't stop spending. At this size the real bill should be $0.00–$0.10.
3. **Owner: make the export bucket.**
   1. Go to <https://console.cloud.google.com/storage/create-bucket?project=note-board-a672a>.
   2. Name: `note-board-a672a-moves`. Location type: **Region** → **us-central1**. Storage class **Standard**. Leave **Prevent public access** on. Click **Create**.
4. **Owner: check delete protection.** Go to <https://console.cloud.google.com/firestore/databases?project=note-board-a672a>. Click `(default)` and note the location (should say `australia-southeast1`). If **Delete protection** is on, leave it on for now.
5. **Owner: turn on daily backups of Sydney** (owner said yes: two weeks around the move). Open Cloud Shell (the `>_` icon top right of the Google Cloud console) and paste:
   ```
   gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d --project=note-board-a672a
   ```
   The next day there is a backup that survives the database's deletion.
6. **Owner: rehearsal export and import (proves the copy is complete).** In Cloud Shell, paste one line at a time:
   ```
   gcloud config set project note-board-a672a
   gcloud firestore export gs://note-board-a672a-moves/rehearsal --database='(default)'
   gcloud firestore databases create --database=us-check --location=nam5 --type=firestore-native
   gcloud firestore import gs://note-board-a672a-moves/rehearsal --database=us-check
   ```
   Each command waits until done (a minute or two for a small database). If a command asks to enable an API, answer `y`.
   Don't change any board in BusyAnts from the export until step 7 is done, or step 7 shows that board as changed.
7. **Owner runs the count script on both databases; crew reads the output.** In Cloud Shell, one line at a time (the first line fetches the script, see "Using the count script" below):
   ```
   curl -fsSO https://raw.githubusercontent.com/ezhang43/note-board/build/v1/scripts/firestore-counts.mjs
   node firestore-counts.mjs '(default)' | tee sydney-rehearsal.txt
   node firestore-counts.mjs us-check | tee us-check.txt
   node firestore-counts.mjs --compare sydney-rehearsal.txt us-check.txt
   ```
   The last line must say **MATCH**. If it says DIFFERENT, paste its output to the crew and stop. If it says MATCH, delete the rehearsal database:
   ```
   gcloud firestore databases delete --database=us-check
   ```

### Move day (the window: about 30–40 minutes, at a quiet time)

8. **Owner: close every BusyAnts page:** all browser tabs on every computer, the phone's home-screen app (swipe it away), and ask testers to do the same. Pages left open are the main way edits get lost.
9. **Owner: make Sydney read-only** (so nothing changes after the final export). Firebase console → **Firestore Database** → **Rules**, replace everything with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read: if request.auth != null;
         allow write: if false;
       }
     }
   }
   ```
   Click **Publish**.
10. **Owner: final export** (Cloud Shell):
    ```
    gcloud firestore export gs://note-board-a672a-moves/final --database='(default)'
    ```
    Wait for it to finish. In <https://console.cloud.google.com/storage/browser/note-board-a672a-moves> check that a `final` folder exists with files in it.
11. **Owner: count Sydney again** (the "before" numbers), and paste the output to the crew:
    ```
    node firestore-counts.mjs '(default)' | tee before.txt
    ```
12. **Owner: delete Sydney.** If delete protection is on, turn it off first: `gcloud firestore databases update --database='(default)' --no-delete-protection`. Then:
    ```
    gcloud firestore databases delete --database='(default)'
    ```
    Type `y` to confirm. **Then wait 6 minutes** (the name can't be reused for about 5).
13. **Owner: create the new US `(default)`, locked.**
    ```
    gcloud firestore databases create --database='(default)' --location=nam5 --type=firestore-native --delete-protection
    ```
    A new database starts with rules that refuse everyone, which is what we want until the import is done. In the Firebase console → Firestore → **Rules**, check it says `allow read, write: if false;`. If not, paste that and publish.
14. **Owner: import** (Cloud Shell):
    ```
    gcloud firestore import gs://note-board-a672a-moves/final --database='(default)'
    ```
15. **Owner: count the new database and compare** (its locked rules don't stop this: the script reads as the project's owner, not as an app user):
    ```
    node firestore-counts.mjs '(default)' | tee after.txt
    node firestore-counts.mjs --compare before.txt after.txt
    ```
    It must say **MATCH**. **If it says DIFFERENT, stop here and don't open the rules.** Paste the output to the crew. See the rollback plan.
16. **Owner: paste the real rules.** Open `firestore.rules` from the project (the crew pastes it in chat). Firebase console → Firestore → **Rules** → replace everything → **Publish**.
17. **Owner: check in the app** (the "click-through"):
    - [ ] Open BusyAnts on the computer and sign in. Every board is there, with the same cards as the backup from step 1.
    - [ ] Move a card. The note by the zoom control says "Saving…" then "Saved". Reload: the change is still there.
    - [ ] **Version history** lists the old versions, and opening one shows its board.
    - [ ] Each **shared board** opens. Its Share panel lists the same people. Ask one tester to open it and make a change, and check it appears.
    - [ ] Open on the phone (home-screen app): boards are there and a change saves.
    - [ ] Firebase console → Firestore → **Data**: the location shown is `nam5`.
    - [ ] Claude connector (if used): `list_boards` still works (same `(default)` address).
18. **Crew: wording pull request** (normal PR into `build/v1`, wording only): Privacy page location, SPEC.md (line 383, plus "database `(default)` in nam5"), `docs/decisions.md` entry, CHANGELOG line. Only after step 17 passes, so the Privacy page never claims something untrue.

### Using the count script

`scripts/firestore-counts.mjs` (job #40) only reads: it counts and reads documents, never writes. It runs in Google Cloud Shell, which already has Node and the owner's Google sign-in, so nothing needs installing.

- **Get it:** `curl -fsSO https://raw.githubusercontent.com/ezhang43/note-board/build/v1/scripts/firestore-counts.mjs` (files in Cloud Shell's home folder stay between sessions, so once is enough).
- **Count one database:** `node firestore-counts.mjs '(default)' | tee name.txt` (or `us-check`). It prints, and `tee` also saves:
  - `count boards 3`, `count versions 40`, … for `boards`, `versions`, `versionData`, `boards/*/shared`, `shared` and `members`;
  - one `doc` line per `boards/{uid}` and `shared/{id}` document: its path, the length of its board text, and a hash of all its fields (save times are left out, since an import changes them). Two copies with the same hash have the same contents.
- **Compare two saved outputs:** `node firestore-counts.mjs --compare before.txt after.txt` prints **MATCH**, or **DIFFERENT** followed by each difference in plain words (`versions: 40 before, 39 after`, `boards/abc: contents changed`, `shared/xyz: missing after`).
- It signs in with `gcloud auth print-access-token` and only puts that token in its requests to Google; it never prints or saves it. A count costs about one read per 1,000 documents counted, and each `doc` line one read.
- The `doc` lines show account ids (the `uid` in `boards/{uid}`), not names or board contents.

### After

19. **Owner:** keep the bucket and the `final` export for **90 days**, then delete them. Remove the backup schedule from step 5 (`gcloud firestore backups schedules list` / `delete`). Old Sydney backups expire on their own after 14 days.
20. **Owner:** the budget alert stays on. If staying on Blaze is unwanted, **downgrading to Spark** is possible once the bucket is deleted (Spark has no export).

### Rollback plan

- **Before step 12 (delete):** nothing is lost. Paste the real rules back into Sydney (step 16's text) and everything works as before.
- **After step 12, counts wrong or the app misbehaves:** keep the new database locked (rules `if false`). Look at what is missing. Import `final` again (an import overwrites same-name documents, so running it twice is safe). If the new database is beyond repair, delete it, wait 6 minutes, recreate `(default)`, and import again. If the export itself is bad, restore the Sydney **backup** from step 5 into a new database (`gcloud firestore databases restore ...`), export that, and import it.
- **Last resort for one person:** **File → Restore from backup…** with the file from step 1.

---

## 7. Questions for the owner (with recommended answers)

1. **Is it OK to turn on Blaze (pay-as-you-go) with a $5 budget alert?** Every safe route needs it.
   *Recommended: yes. The expected bill is under $0.10, and the free quota still applies.*
2. **Which US location?** It's permanent.
   *Recommended: nam5 (United States multi-region). us-central1 only if lowest future cost matters more than uptime.*
3. **Is a ~40-minute window when BusyAnts can't save OK, and when?**
   *Recommended: yes, on a weekday evening this month, well before the Nov 17 soft launch, after telling testers a day ahead.*
4. **Route C (delete and recreate `(default)`) rather than route A (new named database plus a code change)?** C has no code change, keeps the free quota and delivers offline changes. Its trade-off is that the Sydney database is gone after step 12, so safety rests on the rehearsal and the export.
   *Recommended: C, with the rehearsal and the optional backup.*
5. **Turn on daily backups (step 5) during the move?** Costs a few cents.
   *Recommended: yes, for the two weeks around the move.*
6. **Who runs the Cloud Shell commands?** Claude can't click in the owner's Google console.
   *Recommended: the owner pastes the commands, one at a time, from this plan. The crew stands by to read the output and run the counts.*
7. **Privacy page:** it currently says the data is in "us-central (United States)", which isn't true yet (job #36).
   *Recommended: say Australia now, and switch to the United States in step 18, after the move is verified.*
8. **Stay on Blaze afterwards?**
   *Recommended: yes, with the alert. It allows backups and exports later, and the cost is zero while inside the free quota.*

## Crew jobs this creates (after the owner says yes)

- **Job #40: Firestore count script** (done): `scripts/firestore-counts.mjs`, read only, with unit tests in `scripts/firestore-counts.test.ts`.
- **Job: wording after the move.** Privacy, SPEC, decisions, changelog (step 18). Wording only, after verification.
- No app code change. If the owner prefers route A instead, a separate **high-risk** job changes `src/sync/firebase.ts` and `mcp/firestore.ts` (labelled `high-risk`, waits for the owner's OK and "publish").
