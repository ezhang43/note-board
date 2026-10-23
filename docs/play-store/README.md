# Google Play kit for BusyAnts (drafts)

Everything here is a draft for the owner to paste into Google Play Console. Nothing is submitted by itself.

| File | What it is |
| --- | --- |
| `listing.md` | App name, short and full description (with character counts), category, contact, privacy URL |
| `data-safety.md` | Suggested answers for the Data safety form, with the files they came from and OWNER CHECK items |
| `content-rating.md` | Suggested answers for the content rating questionnaire and the likely result |
| `screenshots/` | Phone (1080 x 1920), 7-inch tablet (1200 x 1920) and 10-inch tablet (2560 x 1600) screenshots, and `feature-graphic-1024x500.png` |
| App icon | Use `public/busyants-512.png` (512 x 512) as it is |

## Regenerating the screenshots

```
npm ci
node scripts/play-screenshots.mjs
```

The script starts the app itself and uses it the way a person would: the "Weekend in Lisbon" example from the empty board's template tiles (made up, no personal data, tour dismissed), the Habits panel with five made-up habits and three weights (the clock is fixed to Wednesday 21 October 2026, so the week always reads the same), and a comment thread between two demo people through the pretend server in `npm run dev` ("Sam" shares the board, "Alice" answers on a phone). It writes the PNGs to `docs/play-store/screenshots/`. `PLAY_ONLY=phone-6 node scripts/play-screenshots.mjs` retakes just the files whose name starts with that. If the sandbox's Chromium does not match Playwright's, run it with `PW_CHROMIUM=/path/to/chromium node scripts/play-screenshots.mjs`. It is not part of `npm test` or `npm run test:e2e`. Stop any `npm run dev` on this folder's port first, so the script starts a fresh pretend server.

Phone shots (8, the most Play allows): `phone-1-board`, `phone-2-checklist` (a checklist with its title in the button row and the item bar), `phone-3-saturday` (the comment thread), `phone-4-dark`, `phone-5-menu`, `phone-6-habits` (the Weight card), `phone-7-ledger` (the habits ledger), `phone-8-templates`. Tablets: board, dark and Habits panel for the 7-inch and 10-inch.

The screenshots were retaken on 2026-10-23 so they show the app as it is now: no Hand or Select tools, card titles on the button row, the new checklist rows, templates, comments, and the Habits ledger with the Weight card. Retake them again whenever the app's look or wording changes.

## Owner checklist for Play Console

Steps marked **(waits on domain move / app packaging)** or **(waits on #63)** cannot be finished yet.

1. **Create a Google Play developer account** (https://play.google.com/console). One-time registration fee; Google asks for ID verification, and a new personal account may need a closed test with testers for a while before the app can go to production. Read what Play says for your account type.
2. **Create the app** in Play Console: name BusyAnts, language English (United States), App (not game), Free. Accept the declarations.
3. **Package the app as an Android app (waits on Trusted Web Activity packaging, a separate future job)**: Play needs an app bundle (.aab). Until that job is done there is nothing to upload under Release; steps 4 to 11 can still be prepared.
4. **Paste the listing** from `listing.md`: app name, short description, full description, category (Productivity), contact email, website.
5. **Upload graphics**: icon `public/busyants-512.png`, feature graphic `screenshots/feature-graphic-1024x500.png`, phone screenshots `screenshots/phone-*.png` (at least 2 required, 8 maximum; there are 8), 7-inch and 10-inch tablet screenshots `screenshots/tablet-*.png`. Regenerate first if the app's look has changed since 2026-10-23 (see above).
6. **Privacy policy URL**: https://ezhang43.github.io/note-board/privacy/ **(will change when the site moves to busyants.work; update it then)**. App content > Privacy policy.
7. **Data safety**: fill in the form from `data-safety.md`; read every OWNER CHECK item first. The answer about deletion **waits on #63** (in-app Delete account and the website "Delete your account" page).
8. **Account deletion URL**: Play requires an in-app way to delete the account and a web link for it, because the app lets people create an account through sign-in. Enter the website "Delete your account" page URL **(waits on #63 and, for the final address, on the domain move)**. Do not submit this step until the page exists.
9. **Content rating**: do the questionnaire from `content-rating.md`.
10. **Target audience and content**: choose 13 and over (see `content-rating.md`); answer "No" to ads; say the app is not a news app, not a government app, and has no health features.
11. **App access (for Google's reviewers)**: the app opens on a Google sign-in screen, so reviewers cannot get in without help. In App content > App access choose "All or some functionality is restricted" and give instructions plus a test Google account (a throwaway account made for this, with its own password and no 2-step verification, or a note on how reviewers can sign in). OWNER CHECK: do not use your personal account and do not put the password in this repo (the repo is public); type it into Play Console only.
12. **Finish the other App content forms**: ads (none), government apps (no), financial features (none), health (none), news (no), data safety (step 7).
13. **Release (waits on packaging and the domain move)**: upload the .aab, set the website link and deep links to the final domain, run an internal or closed test, then roll out to production. Fix anything Play flags, then submit for review.

## What waits on what

- **Waits on job #63 (Delete account)**: the Data safety deletion answers and the account deletion URL (steps 7 and 8).
- **Waits on the move to busyants.work**: the final privacy policy URL and deletion URL, and the website link (steps 6, 8 and 13).
- **Waits on Trusted Web Activity packaging (a separate future job)**: the app bundle and the release itself (steps 3 and 13).
- **Can be done now**: the listing text, graphics, content rating, target audience and app access note.
