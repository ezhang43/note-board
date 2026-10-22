## View-only and comment links, part 1: the online rules (2026-10-22)

- Nothing looks different yet. This is the groundwork for letting a share link be "can edit", "can comment" or "can view".
- The share link's secret key now lives in a private record only editors can read, instead of in the shared board itself. A board shared earlier moves its key there the next time its link changes (turned off and on, or someone removed).
- Joining a shared board now proves the link key in a record nobody can read, so a person's record on the board no longer holds the key.
- The online rules (`firestore.rules`) know about roles: only editors can save a shared board, nobody can raise their own role, and only the person who shared it can change someone's role. Everyone already on a shared board stays an editor.
- The rules also cover comments on cards (who can write, resolve and delete them), ready for a later step.
- The new rules accept everything the app before this change saves, so they can be pasted into Firebase before this version goes live. Rules tests prove it.
