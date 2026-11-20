## Google Calendar stays connected (2026-11-20)

- Google's window for the calendar can now show just once per account, instead of about once an hour. A small helper on Cloudflare (free plan) keeps a long-lived permission from Google, encrypted, and hands the page a fresh hour's access whenever it needs one, on any device, with no window. It lasts until you click the new **Disconnect calendar** link at the bottom of the calendar panel, take the permission back in your Google account, or delete your account.
- Signing out on one device forgets only that device's access; your other devices stay connected.
- Deleting your account now also cancels the calendar connection at Google and deletes the helper's copy.
- It is off until the owner sets the helper up (docs/calendar-helper-setup.md) and adds its address as the `CALENDAR_HELPER_URL` repository variable. Until then, or whenever the helper can't be reached, the calendar works exactly as before.
- The Privacy policy (now effective November 20, 2026) and the Delete your account page say what the helper keeps and where. The site's security policy allows the helper's address only when it is set.
- Saved boards are unchanged: nothing here touches board data.
