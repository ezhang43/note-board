# BusyAnts connector for Claude (read only)

A small program on your computer that lets Claude (Claude Desktop or Claude Code) read your BusyAnts boards. In this version it can only **list** your boards and **read** one; it never changes anything. Boards shared with you (or by you) are shown and marked read-only.

It signs in as you, so Google's rules for your boards (`firestore.rules`) apply exactly as in the app. Your sign-in is kept in `%APPDATA%\busyants-mcp\token.json`, outside the project. Claude Code is told not to read that file (`.claude/settings.json`).

## Setup (once)

Run these in the project folder (`C:\Users\ezhan\Projects\note-board`).

1. `npm install`, then `npm run mcp:build`.
2. `npm run mcp:login`. A browser tab opens: click **Sign in with Google** and pick the account you use for BusyAnts. The tab says "Done, you can close this tab".
3. `npm run mcp:check`. It should show your account, your board count and "Safe to edit: yes".
4. **Claude Desktop:** Settings → Developer → Edit Config, and add (inside the outer `{ }`, keeping anything already there):
   ```json
   "mcpServers": {
     "busyants": { "command": "node", "args": ["C:\\Users\\ezhan\\Projects\\note-board\\mcp\\dist\\server.js"] }
   }
   ```
   Save, quit Claude Desktop from the tray (right-click its icon → Quit) and open it again. Ask: "List my BusyAnts boards."
5. **Claude Code:** `claude mcp add --scope user busyants -- node C:\Users\ezhan\Projects\note-board\mcp\dist\server.js`, then `claude mcp list` should show `busyants` connected.
6. When Claude asks to use a tool: "Always allow" is fine for `list_boards` and `read_board` (they only read).

## If something goes wrong

- **"Not signed in"**: run `npm run mcp:login`.
- **"The sign-in has expired or was revoked"**: run `npm run mcp:login` again.
- **"Google refused the app's web key here: it is restricted to the site's address"**: the app's web key only works from the BusyAnts site. In [Google Cloud console](https://console.cloud.google.com/apis/credentials?project=note-board-a672a) → APIs & Services → Credentials, click **Create credentials → API key**, then edit it: under "API restrictions" choose "Restrict key" and tick **Identity Toolkit API**, **Token Service API** and **Cloud Firestore API**; leave "Application restrictions" at None. Then sign in again with it: `npm run mcp:login -- --key <the new key>`.
- **"Firestore refused (permission denied)"**: the Google account you signed in with isn't on the invite list. Sign in again with the right one.
- **The sign-in popup says the domain isn't authorised**: in the Firebase console → Authentication → Settings → Authorized domains, make sure `localhost` is listed.
- **"Safe to edit: no"**: reading still works. It means your saved boards hold something this connector doesn't understand (for example, saved by a newer version of the app). A later version that can change boards will refuse to change them until it is updated.

## To stop

`npm run mcp:logout` deletes the saved sign-in. Then remove `busyants` from Claude Desktop's config, and run `claude mcp remove busyants` for Claude Code.

## For developers

- `mcp/server.ts`: the tools. `mcp/boards.ts`: board list, outline and the "safe to edit" check (pure). `mcp/firestore.ts`: reading Firestore over REST. `mcp/auth.ts`: the saved sign-in and id tokens. `mcp/login/`: the sign-in helper page. `mcp/main.ts`: the commands.
- Tests: `npm test` (the `mcp/*.test.ts` files). The plan for this connector, and for the later version that can change boards, is in `docs/plans/mcp-connector-plan.md`.
- Logs go to stderr only (stdout belongs to Claude).
