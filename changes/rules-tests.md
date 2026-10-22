## Tests for the online rules (2026-10-21)

- **No change to how the app works, and the online rules themselves are unchanged.** 38 new automated tests check what `firestore.rules` lets each person read and write: your own boards and versions only by you, shared boards only by their people, joining only with the current link, only the person who shared a board changing its link, removing people or deleting it, deleting an account, and feedback.
- The tests run on a local copy of Firestore (Google's emulator) with a made-up project, so they never touch the real online data. Run them with `npm run test:rules`; GitHub runs them too, as part of "All tests".
