## Saving and sharing fixes from review 181, part A (2026-10-22)

- If deleting your account stops part-way on one device (the tab is closed while it says "Deleting…"), your other pages hold their changes for a while. They now say so plainly: "Your account is being deleted on another device; changes here aren’t saved yet" instead of "Saving…".
- Changes made while held back are no longer lost when you close or reload the page: this device remembers them, and the next time the app opens on the same boards it keeps your copy and saves it as soon as it may. If the boards online were changed since on another device, those win, as before.
- On a shared board, the person who shared it is marked "Owner" in People (it said "Shared it") and beside each of their comments, so nobody can pass for them.
- The online rules now accept only your own Google name and photo in your record on a shared board (so nobody can take the owner's name or photo), and a photo only from Google's photo server, which also keeps other servers from seeing who opens a comment thread or the Share panel. The app shows no photo from anywhere else.
- A comment can't be added from another device while your account is being deleted, so none outlives it.
- A browser tab still holding the last account's boards after someone else signed in on another tab no longer saves them over the new account's boards on this device.
- Boards already saved are unchanged. The new rules need pasting into Firebase (see the pull request); until then the app works as before.
