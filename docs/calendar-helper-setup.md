# Setting up the calendar helper

The calendar helper (`calendar-helper/`) keeps the Google Calendar connected, so Google's window shows
once per account instead of about once an hour (owner decision 2026-11-20). Until these steps are done
the site works exactly as before: the helper is off unless the site is built with its address.

You do these steps yourself, once, on your Windows computer. Nothing here goes into the repository:
the two secret values live only in Cloudflare, and the KV namespace id Wrangler writes into
`calendar-helper/wrangler.toml` must not be committed (a test fails if it is).

Steps marked **(not checked)** could not be tried from a cloud session; if a screen looks different,
stop and ask.

## 1. A free Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up>, sign up with your email and a password, and confirm the email.
2. Pick the **Free** plan if asked. No card is needed for Workers on the free plan. **(not checked)**

## 2. Sign Wrangler in

Open **PowerShell** (Start menu, type PowerShell, Enter), then:

```powershell
cd C:\Users\ezhan\Projects\note-board\calendar-helper
npm ci
npx wrangler login
```

A browser tab opens: click **Allow**. PowerShell then says you are logged in.

## 3. The storage (Workers KV)

Nothing to do by hand: the first deploy (step 5) creates the KV namespace for the `TOKENS` binding
and writes its id into `wrangler.toml` (Wrangler 4.45 or later does this). **(not checked)**

After the deploy, run `git checkout calendar-helper/wrangler.toml` from the `note-board` folder so the
id isn't committed. Wrangler finds the namespace again by name on later deploys. **(not checked)** If a
later deploy instead says the binding has no id, ask: the fix is to keep the id in a file that isn't
committed.

## 4. The two secrets

Both are typed into PowerShell when Wrangler asks; they never appear on screen, in the repository,
in a chat or in GitHub.

**GOOGLE_CLIENT_SECRET** (from Google Cloud, step 6.1 below, do that first):

```powershell
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Paste the client secret and press Enter.

**TOKEN_KEY** (the key that encrypts the stored Google permissions). Make a random one:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard
```

That puts it on the clipboard without showing it. Then:

```powershell
npx wrangler secret put TOKEN_KEY
```

Paste and press Enter. Don't keep a copy anywhere else, and don't change it later: if it is changed,
everyone sees Google's window once more, and the permissions kept with the old key can no longer be
cancelled by Disconnect calendar or deleting the account (each person would have to remove BusyAnts in
their Google account's settings).

(If Wrangler asks whether to create the Worker first, say yes.)

## 5. Deploy

```powershell
npx wrangler deploy
```

At the end it prints the helper's address, like `https://busyants-calendar-helper.<your-name>.workers.dev`.
Keep that address for step 7. To check it is up, open that address in the browser with `/access` on
the end: it should show `{"error":"origin"}` (it answers only the BusyAnts site).

The light per-account limit uses Cloudflare's rate limiting binding (`[[ratelimits]]` in
`wrangler.toml`). **(not checked)** whether the free plan allows it: if the deploy refuses it, ask.

## 6. Google Cloud console

Open <https://console.cloud.google.com/>, pick the BusyAnts project (the one with the calendar's OAuth client).

1. **Client secret.** APIs & Services → Credentials → under OAuth 2.0 Client IDs click the web client
   the site uses (its ID is `VITE_GOOGLE_CLIENT_ID` in `.env.production`). Copy the **Client secret**
   (or click **Add secret** if none is shown), and use it in step 4.
2. **Authorized JavaScript origins.** On the same page, check `https://ezhang43.github.io` is listed
   (it already is for the calendar). Nothing else is needed: the popup uses no redirect address of its
   own. **(not checked)** The helper sends `postmessage` as the redirect address, which is how Google's
   popup code flow has worked; if connecting fails with "redirect_uri_mismatch", ask (the setting is
   `CODE_REDIRECT_URI` in `wrangler.toml`).
3. **Consent screen "In production".** APIs & Services → OAuth consent screen (or Google Auth Platform →
   Audience) → **Publish app** → Confirm. While it says "Testing", Google ends every connection after 7
   days. Unverified is fine for now: people see a "Google hasn't verified this app" screen and click
   Advanced → Go to BusyAnts. **(not checked)**

## 7. Tell the site the helper's address

On GitHub: the note-board repository → **Settings** → **Secrets and variables** → **Actions** →
**Variables** tab → **New repository variable**:

- Name: `CALENDAR_HELPER_URL`
- Value: the address from step 5 (no `/` at the end)

It is a variable, not a secret: the address is public. The next publish builds the site with it
(`deploy.yml` passes it as `VITE_CALENDAR_HELPER_URL`). To turn the helper off again, delete the
variable and publish.

## 8. Check it

On the live site, signed in:

1. Open Google Calendar from the corner. Google's window shows once: pick your account, allow.
2. Reload the page, then close and reopen the browser: the calendar opens with no window.
3. Next day (after the hour runs out), or on your phone: still no window.
4. Click **Disconnect calendar** at the bottom of the panel: it says the calendar is disconnected.
   **Connect Google Calendar** shows Google's window again.
5. In your Google account → Security → Third-party connections, BusyAnts disappears after Disconnect.

## Where things are

- `calendar-helper/src/handler.ts`: what the helper does (`/connect`, `/access`, `/disconnect`).
- `calendar-helper/wrangler.toml`: its settings (no account id, no secrets).
- `src/calendar/google.ts` and `src/calendar/helper.ts`: the site's side.
