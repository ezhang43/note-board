# BusyAnts connector for Claude

A small program on your computer that lets Claude (Claude Desktop or Claude Code) read your BusyAnts boards, and make small changes to your own ones: add, edit, tick and move checklist items, and add notes. Boards shared with you (or by you) are shown and marked read-only: Claude can't change them. Notes can only be added, never edited, and nothing is ever deleted.

It signs in as you, so Google's rules for your boards (`firestore.rules`) apply exactly as in the app. Your sign-in is kept in `%APPDATA%\busyants-mcp\token.json`, outside the project. Claude Code is told not to read that folder (`.claude/settings.json`).

## What Claude can do

| Tool | What it does |
| --- | --- |
| `list_boards` | Lists your boards (read only) |
| `read_board` | Reads one board as an outline, with ids (read only) |
| `add_items` | Adds items to a checklist: at the end, after an item, or under an item |
| `edit_items` | Changes items' text or due dates (or removes a due date) |
| `set_items_done` | Ticks or unticks items |
| `move_items` | Moves items (with their sub-items) to a place in a checklist on the same board |
| `add_note` | Adds a note: at the end of a column, near a card, or loose on the board |

Each change is one save of at most 50 changes, and Claude's answer lists exactly what changed.

**Safety:**
- Before Claude's first change (and again after 10 quiet minutes), your boards as they were are saved in version history: open BusyAnts → Version history (the clock button, bottom right) to go back.
- A change is never saved over something you changed after Claude read the board: it is made again on top of your change instead.
- If BusyAnts is open and saves over Claude's change a moment later, the connector puts it back once and says so. If that happens twice, Claude is told the change isn't on the board.
- Every change is written, with the time, to `%APPDATA%\busyants-mcp\activity.log` (open it in Notepad).

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
6. **Allow prompts:** when Claude asks to use a tool, "Always allow" is fine for `list_boards` and `read_board` (they only read). For the tools that change boards (`add_items`, `edit_items`, `set_items_done`, `move_items`, `add_note`) click plain **Allow** each time, after reading what Claude is about to do. Text on a board (yours, or pasted from elsewhere) could ask Claude to change things; the prompt is where you catch that.

**After an update** (a new version of the connector): run `npm run mcp:build` again, then restart Claude Desktop (quit from the tray) or start a new Claude Code session.

## If something goes wrong

- **"Not signed in"**: run `npm run mcp:login`.
- **"The sign-in has expired or was revoked"**: run `npm run mcp:login` again.
- **"Google refused the app's web key here: it is restricted to the site's address"**: the app's web key only works from the BusyAnts site. In [Google Cloud console](https://console.cloud.google.com/apis/credentials?project=note-board-a672a) → APIs & Services → Credentials, click **Create credentials → API key**, then edit it: under "API restrictions" choose "Restrict key" and tick **Identity Toolkit API**, **Token Service API** and **Cloud Firestore API**; leave "Application restrictions" at None. Then sign in again with it: `npm run mcp:login -- --key <the new key>`.
- **"Firestore refused (permission denied)"**: the Google account you signed in with isn't on the invite list. Sign in again with the right one.
- **The sign-in popup says the domain isn't authorised**: in the Firebase console → Authentication → Settings → Authorized domains, make sure `localhost` is listed.
- **"Safe to edit: no"** (or a change refused with the same reason): reading still works, but Claude won't change anything. Your saved boards hold something this connector doesn't understand (for example, saved by a newer version of the app): update the project (`git pull`, `npm run mcp:build`). For "saved by an older version of the app", open BusyAnts once.
- **"The boards kept changing while saving"**: BusyAnts was saving at the same moment, four times in a row. Ask Claude to try again.
- **Claude's change disappeared**: if you were typing in BusyAnts at the same moment, the app may have saved over it ("most recent wins"). The connector puts it back once; look in the activity log, and ask Claude to read the board and try again.
- **Undo a change**: in BusyAnts, open Version history and restore the version from just before (it was saved before Claude's first change).

## To stop

`npm run mcp:logout` deletes the saved sign-in. Then remove `busyants` from Claude Desktop's config, and run `claude mcp remove busyants` for Claude Code.

## For developers

- `mcp/server.ts`: the tools and their limits. `mcp/edits.ts`: each change, made with `src/model/` (pure). `mcp/save.ts`: saving a change (checks, retries, safety version, put-back, activity log). `mcp/boards.ts`: board list, outline and the "safe to edit" check (pure). `mcp/firestore.ts`: reading and writing Firestore over REST (never the Admin SDK). `mcp/auth.ts`: the saved sign-in and id tokens. `mcp/login/`: the sign-in helper page. `mcp/main.ts`: the commands.
- Tests: `npm test` (the `mcp/*.test.ts` files; `mcp/fakeFirestore.ts` is a pretend Firestore with the same save conditions). The plan is in `docs/plans/mcp-connector-plan.md`.
- Logs go to stderr only (stdout belongs to Claude).
