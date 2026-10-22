## Deleting your account with another device or tab open (2026-10-22)

- Deleting your account now first marks your boards online as "being deleted". While they are marked, your other phones, computers and tabs can't save your boards, a version or a new shared board back online. Before, one of them could put your boards back just after they were deleted.
- Those other devices keep your boards on screen and hold any changes while it deletes. If deleting fails, they carry on syncing and their changes are saved. Once it is done, they sign out with "Your account and data were deleted.".
- Another tab of the same browser no longer signs out the tab doing the deleting part-way through.
- If only the last step failed (deleting the sign-in), you can run Delete account again from any page to finish.
- A small marker that the account was deleted stays online. It holds no boards, name or email. The Privacy policy and the Delete your account page now say so.
- The online rules now also check the type and size of a few fields that had no check: when someone joined a shared board, and a version's counts and fingerprint (job 173).
- The owner pastes the new firestore.rules into the Firebase console before this version is published. The rules accept everything older copies of the app save.
